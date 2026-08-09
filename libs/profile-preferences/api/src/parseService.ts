import { z } from "zod";
import { generateStructured, AIProviderError } from "@jz92/ai-provider";
import { preferenceRetriever, preferencesQualityGate, getStoreOptions } from './rag/retriever';

// ── Preference Whitelists ─────────────────────────────────────────────────
//
// Fixed lists of valid preference items for each category.
// These are the ONLY values that will be accepted after parsing.
//
// See Principle 3: Refuse hacks; fix root causes —
// By having a fixed whitelist, we prevent hallucinated values from being saved.

const VALID_PREFERENCES = {
  dietary:    ["Vegetarian", "Vegan", "Gluten-free", "Organic", "Keto", "Dairy-free"],
  style:      ["Minimalist", "Casual", "Formal", "Sporty", "Vintage", "Boho", "Modern", "Classic"],
  events:     ["Christmas", "Boxing Day", "Black Friday", "Easter", "Summer Sale", "New Year", "Mother's Day", "Father's Day"],
  brands:     ["Nike", "Adidas", "Puma", "Tommy Hilfiger", "H&M", "Zara", "Gucci", "Calvin Klein"],
  categories: ["Fashion", "Home", "Electronics", "Beauty", "Sports", "Books", "Toys", "Food & Grocery"],
} as const;

// ── Zod Schema for Structured Output ────────────────────────────────────
//
// Defines the expected output format from the LLM.
// Using Zod ensures type safety and runtime validation.

const PreferenceItemSchema = z.object({
  name:      z.string(),      // Preference name (e.g., "Nike", "Vegetarian")
  optedIn:   z.boolean(),     // true = like/want, false = dislike/avoid
  confident: z.boolean().default(true),  // Whether the model is confident in this extraction
});

export const PreferencesSchema = z.object({
  categories: z.array(PreferenceItemSchema).default([]),
  dietary:    z.array(PreferenceItemSchema).default([]),
  events:     z.array(PreferenceItemSchema).default([]),
  style:      z.array(PreferenceItemSchema).default([]),
  brands:     z.array(PreferenceItemSchema).default([]),
});

export type ParsedPreferences = z.infer<typeof PreferencesSchema>;

// ── Output-quality metadata ────────────────────────────────────────────────
// Surfaces what happened after extraction so the route (and the UI) can act.
export type ParseQuality = {
  // Items the model was uncertain about — returned to the consumer so the UI
  // can highlight them for user confirmation rather than silently applying them.
  lowConfidenceItems: Array<{ category: string; name: string }>;
  // True when every category is empty after normalisation — either the input
  // had no recognisable preferences, or extraction found nothing valid.
  // The UI should prompt the user to rephrase rather than saving empty prefs.
  isEmpty: boolean;
};

// ── System Prompt ─────────────────────────────────────────────────────────
//
// Instructions for the LLM on how to extract preferences.
// Key rules:
//   - ONLY extract explicitly mentioned items
//   - Match against the whitelist
//   - Positive mentions → optedIn: true
//   - Explicit dislikes → optedIn: false
//   - Unsure matches → confident: false
//   - Never infer rejections
//   - Title Case for all names
//   - Empty arrays if no matches
//   - NEVER invent new preference names
//
// See Principle 1: Lead with the "why" before the "how" —
// The prompt explains WHY each rule exists, helping the model understand intent.
const SYSTEM_PROMPT = `You are a preference extraction assistant for a retail customer database.

Extract customer preferences from the natural language input and return valid JSON only.
Do not include any explanation, markdown, or preamble — just the JSON object.

Rules:
- ONLY extract items the user explicitly mentioned or directly stated
- Match mentioned items against the common preferences list below
- Set optedIn to true for positive mentions (like, love, prefer, want)
- Set optedIn to false ONLY for explicit dislikes (don't like, dislike, hate, avoid)
- Set confident to false if you are unsure about the match
- Never infer category rejections - only extract items actually mentioned
- Use Title Case for preference names
- Return empty arrays if no matches found for a category
- ONLY use preference names from the exact list below - do not invent new ones

Common preferences:
  * Dietary: Vegetarian, Vegan, Gluten-free, Organic, Keto, Dairy-free
  * Style: Minimalist, Casual, Formal, Sporty, Vintage, Boho, Modern, Classic
  * Events: Christmas, Boxing Day, Black Friday, Easter, Summer Sale, New Year, Mother's Day, Father's Day
  * Brands: Nike, Adidas, Puma, Tommy Hilfiger, H&M, Zara, Gucci, Calvin Klein
  * Categories: Fashion, Home, Electronics, Beauty, Sports, Books, Toys, Food & Grocery`;

// ── Normalization ────────────────────────────────────────────────────────
//
// Filters the raw LLM output to only include valid whitelist items.
// Hallucinated items are dropped and logged.
//
// See Principle 3: Refuse hacks; fix root causes —
// We catch hallucinations at the boundary rather than letting them
// propagate to the database.

/**
 * Filter parsed preferences to only valid whitelist items.
 * 
 * @param raw - The raw parsed preferences from the LLM
 * @returns Filtered preferences with only valid items
 * 
 * Invalid items are logged as warnings for monitoring.
 */
export const normalise = (raw: ParsedPreferences): ParsedPreferences => {
  const dropped: string[] = [];

  const filterCategory = <K extends keyof typeof VALID_PREFERENCES>(
    items: typeof raw[K],
    key: K
  ) =>
    items.filter((i) => {
      const valid = (VALID_PREFERENCES[key] as readonly string[]).includes(i.name);
      if (!valid) dropped.push(`${key}:${i.name}`);
      return valid;
    });

  const result: ParsedPreferences = {
    categories: filterCategory(raw.categories, "categories"),
    dietary:    filterCategory(raw.dietary,    "dietary"),
    events:     filterCategory(raw.events,     "events"),
    style:      filterCategory(raw.style,      "style"),
    brands:     filterCategory(raw.brands,     "brands"),
  };

  if (dropped.length > 0) {
    console.warn("[parsePreferences] Dropped hallucinated preferences:", dropped);
  }

  return result;
};

// ── Quality Assessment ────────────────────────────────────────────────────

/**
 * Assess the quality of parsed preferences.
 * 
 * @param prefs - The parsed and normalized preferences
 * @returns Quality metrics (low confidence items, isEmpty flag)
 * 
 * Low confidence items should be highlighted to the user for confirmation.
 * Empty results mean nothing was extracted (user should rephrase).
 */
export const getQuality = (prefs: ParsedPreferences): ParseQuality => {
  const lowConfidenceItems: ParseQuality["lowConfidenceItems"] = [];

  for (const [category, items] of Object.entries(prefs) as [keyof ParsedPreferences, typeof prefs[keyof ParsedPreferences]][]) {
    for (const item of items) {
      if (!item.confident) {
        lowConfidenceItems.push({ category, name: item.name });
      }
    }
  }

  const isEmpty = Object.values(prefs).every((items) => items.length === 0);

  return { lowConfidenceItems, isEmpty };
};

// ── Return Types ────────────────────────────────────────────────────────
//
// Success/failure types that propagate through the call stack.
// errorCode allows the route handler to return appropriate HTTP status codes.
export type ParseResult =
  | { success: true;  preferences: ParsedPreferences; quality: ParseQuality }
  | { success: false; errorCode: string; errorMessage: string };

// ── Main Parsing Function ─────────────────────────────────────────────────

/**
 * Parse natural language input into structured preferences.
 * 
 * @param input - The natural language input to parse
 * @param context - Optional tracing/context information
 * @returns ParseResult with preferences or error
 * 
 * Pipeline:
 *   1. RAG: Retrieve similar past inputs as few-shot examples
 *   2. LLM: Extract preferences with structured output
 *   3. Normalize: Filter to valid whitelist items
 *   4. Quality: Check for empty/low-confidence results
 *   5. RAG: Store good results for future use
 *   6. Return: Parsed preferences with quality metadata
 */
export const inferPreferences = async (
  input: string,
  context?: { traceId?: string; userId?: string }
): Promise<ParseResult> => {
  try {
    // ── Step 1: RAG Retrieval ─────────────────────────────────────────
    // Find similar past inputs to use as few-shot examples.
    const { fewShotText } = await preferenceRetriever.retrieve(input, context?.traceId)

    // Enrich the system prompt with few-shot examples if available
    const systemPromptWithExamples = fewShotText
      ? `${SYSTEM_PROMPT}\n${fewShotText}`
      : SYSTEM_PROMPT

    // ── Step 2: LLM Extraction ────────────────────────────────────────
    // Call the LLM with structured output to extract preferences.
    const result = await generateStructured({
      systemPrompt:   systemPromptWithExamples,
      prompt:         input,
      schema:         PreferencesSchema,
      cacheKey:       `preferences:${input}`,
      maxInputTokens: 4000,  // ~16000 characters max
      traceId:        context?.traceId ?? '',
      userId:         context?.userId,
    })

    // ── Step 3: Normalization & Quality Check ──────────────────────────
    // Filter to valid items and assess quality.
    const normalised = normalise(result.data)
    const quality    = getQuality(normalised)

    // ── Step 4: RAG Storage ─────────────────────────────────────────
    // Store good results for future retrieval.
    // Fire-and-forget to avoid blocking the response.
    if (preferencesQualityGate(normalised)) {
      preferenceRetriever
        .store(input, normalised, preferencesQualityGate, getStoreOptions(), context?.traceId)
        .catch(() => {})   // fire-and-forget, but store() already never throws internally
    }

    // ── Step 5: Return Results ───────────────────────────────────────
    return { success: true, preferences: normalised, quality }

  } catch (err) {
    // ── Error Handling ──────────────────────────────────────────────
    // Propagate AIProviderError codes for appropriate HTTP responses.
    // Wrap unexpected errors with UNKNOWN code.
    if (err instanceof AIProviderError) {
      console.error(`[parsePreferences] ${err.code}:`, err.message)
      return { success: false, errorCode: err.code, errorMessage: err.message }
    }
    console.error("[parsePreferences] Unexpected error:", err)
    return { success: false, errorCode: "UNKNOWN", errorMessage: String(err) }
  }
};
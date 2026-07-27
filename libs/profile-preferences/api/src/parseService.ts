import { z } from "zod";
import { generateStructured, AIProviderError } from "@jz92/ai-provider";
import { preferenceRetriever, preferencesQualityGate, getStoreOptions } from './rag/retriever';


const VALID_PREFERENCES = {
  dietary:    ["Vegetarian", "Vegan", "Gluten-free", "Organic", "Keto", "Dairy-free"],
  style:      ["Minimalist", "Casual", "Formal", "Sporty", "Vintage", "Boho", "Modern", "Classic"],
  events:     ["Christmas", "Boxing Day", "Black Friday", "Easter", "Summer Sale", "New Year", "Mother's Day", "Father's Day"],
  brands:     ["Nike", "Adidas", "Puma", "Tommy Hilfiger", "H&M", "Zara", "Gucci", "Calvin Klein"],
  categories: ["Fashion", "Home", "Electronics", "Beauty", "Sports", "Books", "Toys", "Food & Grocery"],
} as const;

const PreferenceItemSchema = z.object({
  name:      z.string(),
  optedIn:   z.boolean(),
  confident: z.boolean().default(true),
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

// ── Success / failure return types ─────────────────────────────────────────
// errorCode travels up to the route so it can map to the right HTTP status
// and message — without the route needing to re-catch or re-inspect errors.
export type ParseResult =
  | { success: true;  preferences: ParsedPreferences; quality: ParseQuality }
  | { success: false; errorCode: string; errorMessage: string };

export const inferPreferences = async (
  input: string,
  context?: { traceId?: string; userId?: string }
): Promise<ParseResult> => {
  try {
    // ── RAG: retrieve similar past extractions ─────────────────────────────
    const { fewShotText } = await preferenceRetriever.retrieve(input, context?.traceId)

    const systemPromptWithExamples = fewShotText
      ? `${SYSTEM_PROMPT}\n${fewShotText}`
      : SYSTEM_PROMPT

    const result = await generateStructured({
      systemPrompt:   systemPromptWithExamples,
      prompt:         input,
      schema:         PreferencesSchema,
      cacheKey:       `preferences:${input}`,
      maxInputTokens: 4000,
      traceId:        context?.traceId ?? '',
      userId:         context?.userId,
    })

    const normalised = normalise(result.data)
    const quality    = getQuality(normalised)

    // ── RAG: store good results for future retrieval ───────────────────────
    if (preferencesQualityGate(normalised)) {
      preferenceRetriever
        .store(input, normalised, preferencesQualityGate, getStoreOptions(), context?.traceId)
        .catch(() => {})   // fire-and-forget, but store() already never throws internally
    }

    return { success: true, preferences: normalised, quality }

  } catch (err) {
    if (err instanceof AIProviderError) {
      console.error(`[parsePreferences] ${err.code}:`, err.message)
      return { success: false, errorCode: err.code, errorMessage: err.message }
    }
    console.error("[parsePreferences] Unexpected error:", err)
    return { success: false, errorCode: "UNKNOWN", errorMessage: String(err) }
  }
}
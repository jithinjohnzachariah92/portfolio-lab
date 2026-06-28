import { z } from "zod";
import { generateStructured, AIProviderError } from "@jz92/ai-provider";

// ---- Vocabulary whitelist ----
const VALID_PREFERENCES = {
  dietary:    ["Vegetarian", "Vegan", "Gluten-free", "Organic", "Keto", "Dairy-free"],
  style:      ["Minimalist", "Casual", "Formal", "Sporty", "Vintage", "Boho", "Modern", "Classic"],
  events:     ["Christmas", "Boxing Day", "Black Friday", "Easter", "Summer Sale", "New Year", "Mother's Day", "Father's Day"],
  brands:     ["Nike", "Adidas", "Puma", "Tommy Hilfiger", "H&M", "Zara", "Gucci", "Calvin Klein"],
  categories: ["Fashion", "Home", "Electronics", "Beauty", "Sports", "Books", "Toys", "Food & Grocery"],
} as const;

// ---- Zod schema (unchanged) ----
const PreferenceItemSchema = z.object({
  name:      z.string(),
  optedIn:   z.boolean(),
  confident: z.boolean().default(true),
});

const PreferencesSchema = z.object({
  categories: z.array(PreferenceItemSchema).default([]),
  dietary:    z.array(PreferenceItemSchema).default([]),
  events:     z.array(PreferenceItemSchema).default([]),
  style:      z.array(PreferenceItemSchema).default([]),
  brands:     z.array(PreferenceItemSchema).default([]),
});

export type ParsedPreferences = z.infer<typeof PreferencesSchema>;

// ---- Stable system prompt ----
// This is the cached prefix — identical on every call.
// In production Anthropic caches this server-side, reducing input costs by ~90%.
// Locally it loads into the Ollama model context once per session.
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

// ---- Whitelist normaliser (unchanged) ----
function normalise(raw: ParsedPreferences): ParsedPreferences {
  const dropped: string[] = [];

  const result = {
    categories: raw.categories.filter(i => {
      const valid = (VALID_PREFERENCES.categories as readonly string[]).includes(i.name);
      if (!valid) dropped.push(`categories:${i.name}`);
      return valid;
    }),
    dietary: raw.dietary.filter(i => {
      const valid = (VALID_PREFERENCES.dietary as readonly string[]).includes(i.name);
      if (!valid) dropped.push(`dietary:${i.name}`);
      return valid;
    }),
    events: raw.events.filter(i => {
      const valid = (VALID_PREFERENCES.events as readonly string[]).includes(i.name);
      if (!valid) dropped.push(`events:${i.name}`);
      return valid;
    }),
    style: raw.style.filter(i => {
      const valid = (VALID_PREFERENCES.style as readonly string[]).includes(i.name);
      if (!valid) dropped.push(`style:${i.name}`);
      return valid;
    }),
    brands: raw.brands.filter(i => {
      const valid = (VALID_PREFERENCES.brands as readonly string[]).includes(i.name);
      if (!valid) dropped.push(`brands:${i.name}`);
      return valid;
    }),
  };

  if (dropped.length > 0) {
    console.warn("[parsePreferences] Dropped hallucinated preferences:", dropped);
  }

  return result;
}

// ---- Main export ----
//
// What changed vs the original:
//   REMOVED  — Anthropic client instantiation
//   REMOVED  — manual retry loop (gateway handles transient errors automatically)
//   REMOVED  — cache_control header (gateway sets this in production automatically)
//   REMOVED  — tool_use boilerplate (generateStructured uses generateText+Output internally)
//   ADDED    — cacheKey: repeat identical inputs skip the API entirely
//   ADDED    — AIProviderError typed catch with error code surfacing
//
// What did NOT change:
//   — Zod schema (identical)
//   — SYSTEM_PROMPT content (identical)
//   — normalise() function (identical)
//   — Return type { preferences, fallback } (identical — nothing else in the app breaks)
//
// Works locally via Ollama ($0), production via configured cloud provider.

export async function parsePreferencesWithClaude(
  input: string
): Promise<{ preferences: ParsedPreferences; fallback: false } | { preferences: null; fallback: true }> {
  try {
    const result = await generateStructured({
      systemPrompt: SYSTEM_PROMPT,
      prompt: input,
      schema: PreferencesSchema,
      cacheKey: `preferences:${input}`,  // repeat identical inputs skip the API
      maxInputTokens: 4000,
    });

    const normalised = normalise(result.data);
    return { preferences: normalised, fallback: false };

  } catch (err) {
    if (err instanceof AIProviderError) {
      console.error(`[parsePreferences] ${err.code}:`, err.message);
    } else {
      console.error("[parsePreferences] Unexpected error:", err);
    }
    return { preferences: null, fallback: true };
  }
}
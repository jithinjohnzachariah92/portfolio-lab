import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ---- Vocabulary whitelist ----
const VALID_PREFERENCES = {
  dietary: ["Vegetarian", "Vegan", "Gluten-free", "Organic", "Keto", "Dairy-free"],
  style: ["Minimalist", "Casual", "Formal", "Sporty", "Vintage", "Boho", "Modern", "Classic"],
  events: ["Christmas", "Boxing Day", "Black Friday", "Easter", "Summer Sale", "New Year", "Mother's Day", "Father's Day"],
  brands: ["Nike", "Adidas", "Puma", "Tommy Hilfiger", "H&M", "Zara", "Gucci", "Calvin Klein"],
  categories: ["Fashion", "Home", "Electronics", "Beauty", "Sports", "Books", "Toys", "Food & Grocery"],
} as const;

// ---- Zod schema ----
const PreferenceItemSchema = z.object({
  name: z.string(),
  optedIn: z.boolean(),
  confident: z.boolean().default(true),
});

const PreferencesSchema = z.object({
  categories: z.array(PreferenceItemSchema).default([]),
  dietary: z.array(PreferenceItemSchema).default([]),
  events: z.array(PreferenceItemSchema).default([]),
  style: z.array(PreferenceItemSchema).default([]),
  brands: z.array(PreferenceItemSchema).default([]),
});

export type ParsedPreferences = z.infer<typeof PreferencesSchema>;

// ---- Prompt ----
const SYSTEM_PROMPT = `You are a preference extraction assistant for a retail customer database.

Extract customer preferences from the natural language input. You must call the extract_preferences tool with the results.

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

// ---- Anthropic client ----
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---- Whitelist normaliser ----
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

// ---- Core Claude call using tool_use ----
async function callClaude(input: string): Promise<ParsedPreferences> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    cache_control: { type: "ephemeral" },
    tools: [
      {
        name: "extract_preferences",
        description: "Extract structured customer preferences from natural language input",
        input_schema: {
          type: "object" as const,
          properties: {
            categories: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  optedIn: { type: "boolean" },
                  confident: { type: "boolean" },
                },
                required: ["name", "optedIn", "confident"],
              },
            },
            dietary: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  optedIn: { type: "boolean" },
                  confident: { type: "boolean" },
                },
                required: ["name", "optedIn", "confident"],
              },
            },
            events: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  optedIn: { type: "boolean" },
                  confident: { type: "boolean" },
                },
                required: ["name", "optedIn", "confident"],
              },
            },
            style: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  optedIn: { type: "boolean" },
                  confident: { type: "boolean" },
                },
                required: ["name", "optedIn", "confident"],
              },
            },
            brands: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  optedIn: { type: "boolean" },
                  confident: { type: "boolean" },
                },
                required: ["name", "optedIn", "confident"],
              },
            },
          },
          required: ["categories", "dietary", "events", "style", "brands"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_preferences" },
    messages: [{ role: "user", content: input }],
  });

  const toolUseBlock = response.content.find(b => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("No tool_use block in response");
  }

  const parsed = PreferencesSchema.parse(toolUseBlock.input);
  return normalise(parsed);
}

// ---- Retry wrapper ----
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function parsePreferencesWithClaude(
  input: string
): Promise<{ preferences: ParsedPreferences; fallback: false } | { preferences: null; fallback: true }> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const preferences = await callClaude(input);
      return { preferences, fallback: false };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[parsePreferences] Attempt ${attempt + 1} failed:`, lastError.message);
      if (attempt < 2) await sleep(200 * Math.pow(2, attempt)); // 200ms, 400ms
    }
  }

  console.error("[parsePreferences] All attempts failed, returning fallback:", lastError.message);
  return { preferences: null, fallback: true };
}
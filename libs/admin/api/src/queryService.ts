import { z } from "zod";
import { generateStructured } from "@jz92/ai-provider";
import { connectDB } from "@shared/db";
import { Customer } from "@shared/models";
import {
  nl2mongoRetriever,
  nl2mongoQualityGate,
  getStoreOptions,
} from "./rag/retriever"

export const SCHEMA_CONTEXT = `
You are a MongoDB query analyzer for an M&S customer database.
The collection is called "customers" and has this schema:

{
  name: String,
  email: String,
  accountCreatedAt: Date,
  sparksMember: Boolean,
  profileComplete: Boolean,
  lastLogin: Date,
  totalOrders: Number,
  totalSpend: Number,
  preferences: {
    sizes: [{ type: String, value: String }],
    categories: [{ name: String, optedIn: Boolean }],
    dietary: [{ name: String, optedIn: Boolean }],
    events: [{ name: String, optedIn: Boolean }],
    style: [{ name: String, optedIn: Boolean }],
    brands: [{ name: String, optedIn: Boolean }],
  }
}

Given a natural language question, extract a list of query conditions.
Do NOT construct MongoDB syntax yourself — just identify each condition as one
of these four types:

  "equality"   — a top-level field must equal a specific value
                 e.g. sparksMember is true -> { type: "equality", field: "sparksMember", value: true }
                 IMPORTANT: value must match the field's real type —
                 sparksMember/profileComplete are Boolean (true/false),
                 totalOrders/totalSpend are Number, name/email are String.

  "elemMatch"  — a preference array contains an item with a given name and
                 optedIn value
                 e.g. likes Nike -> { type: "elemMatch", field: "preferences.brands", name: "Nike", optedIn: true }

  "comparison" — a numeric/date field compared with an operator
                 e.g. more than 0 orders -> { type: "comparison", field: "totalOrders", operator: "$gt", value: 0 }

  "absence"    — a preference array does NOT contain an item with a given name
                 e.g. never expressed an opinion on Nike ->
                 { type: "absence", field: "preferences.brands", name: "Nike" }

Field values are case sensitive. Always use Title Case for preference names
e.g. "Vegetarian" not "vegetarian", "Christmas" not "christmas".

Use array field paths exactly as shown: "preferences.brands", "preferences.dietary",
"preferences.events", "preferences.style", "preferences.categories".

If the user wants ALL matching results with no specific cap, use limit 100 —
never invent an extremely large number.

For questions asking about ANY preference in a category (without naming a
specific item), use elemMatch with only optedIn set, no name:
  e.g. "any dietary preference" ->
  { type: "elemMatch", field: "preferences.dietary", optedIn: true }

For elemMatch conditions:
- If the question names a SPECIFIC item (e.g. "Nike", "Christmas"), you MUST
  include that name in the condition:
    "dislikes Nike" -> { type: "elemMatch", field: "preferences.brands", name: "Nike", optedIn: false }

- ONLY omit 'name' when the question asks about ANY item in the category
  generically, with no specific item mentioned at all:
    "any dietary preference" -> { type: "elemMatch", field: "preferences.dietary", optedIn: true }

Never omit 'name' when a specific brand, style, event, or dietary term is
mentioned in the question. 

Two different kinds of "negative" questions — do not confuse them:

- "dislikes Nike" / "opted out of Nike" -> the item WAS mentioned, but rejected:
    { type: "elemMatch", field: "preferences.brands", name: "Nike", optedIn: false }

- "never expressed an opinion about Nike" / "no preference recorded for Nike" ->
  the item was NEVER mentioned at all, use absence:
    { type: "absence", field: "preferences.brands", name: "Nike" }
`;

// ── Single unified condition schema ───────────────────────────────────────────
// One array, one flat object shape, discriminated by `type` — this is the
// pattern confirmed to work reliably on Ollama's structured-output mode.
// Earlier attempts (union-inside-record, then four parallel arrays) both
// caused the model to collapse to an empty/near-empty result more often
// than this single-array design.

const conditionSchema = z.object({
  type: z.enum(["equality", "elemMatch", "comparison", "absence"]),
  field: z.string(), // top-level field OR array path
  name: z.string().optional(), // for elemMatch / absence
  optedIn: z.boolean().optional(), // for elemMatch
  operator: z.enum(["$gt", "$lt", "$gte", "$lte"]).optional(), // for comparison
  value: z.union([z.string(), z.number(), z.boolean()]).optional(), // for equality / comparison
});

const generatedQuerySchema = z.object({
  conditions: z.array(conditionSchema).default([]),
  combineWith: z.enum(["$and", "$or"]).default("$and"),
  // Hard-capped — prevents the model inventing absurd values like
  // 1000000000000000 when it means "no specific limit."
  limit: z.number().int().min(1).max(100).default(10),
});

export type ExtractedQuery = z.infer<typeof generatedQuerySchema>;

export interface GeneratedQuery {
  filter: Record<string, unknown>;
  projection: Record<string, unknown>;
  sort: Record<string, unknown>;
  limit: number;
}

export interface NaturalLanguageQueryResult {
  question: string;
  generatedQuery: GeneratedQuery;
  results: unknown[];
  count: number;
}

// ── Fields with known real types on the Customer schema ──────────────────────
// Used to coerce/validate equality/comparison values before they reach Mongo,
// so a model mistake (e.g. sending 1000 for a Boolean field) is corrected or
// dropped here instead of crashing Mongoose with a CastError.

const BOOLEAN_FIELDS = new Set(["sparksMember", "profileComplete"]);
const NUMBER_FIELDS = new Set(["totalOrders", "totalSpend"]);

const coerceValue = (
  field: string,
  value: string | number | boolean | undefined,
): unknown => {
  if (value === undefined) return undefined;

  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof value === "boolean") return value;
    // Model sent the wrong type for a boolean field — treat any non-zero
    // number or truthy string as an invalid condition rather than guessing.
    return undefined;
  }

  if (NUMBER_FIELDS.has(field)) {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isNaN(num) ? undefined : num;
  }

  return value;
};

// ── buildMongoFilter — deterministic assembly, never done by the LLM ────────

const buildMongoFilter = (parsed: ExtractedQuery): Record<string, unknown> => {
  const conditions: Record<string, unknown>[] = [];

  for (const c of parsed.conditions) {
    switch (c.type) {
      case "equality": {
        const value = coerceValue(c.field, c.value);
        if (value !== undefined) conditions.push({ [c.field]: value });
        break;
      }
      case "elemMatch": {
        const matchClause: Record<string, unknown> = {};
        if (c.name !== undefined) matchClause.name = c.name;
        if (c.optedIn !== undefined) matchClause.optedIn = c.optedIn;
        if (Object.keys(matchClause).length > 0) {
          conditions.push({ [c.field]: { $elemMatch: matchClause } });
        }
        break;
      }
      case "comparison": {
        const value = coerceValue(c.field, c.value);
        if (value !== undefined && c.operator) {
          conditions.push({ [c.field]: { [c.operator]: value } });
        }
        break;
      }
      case "absence": {
        if (c.name !== undefined) {
          conditions.push({
            [c.field]: { $not: { $elemMatch: { name: c.name } } },
          });
        }
        break;
      }
    }
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { [parsed.combineWith]: conditions };
};

// ── Main export ────────────────────────────────────────────────────────────

export const runNaturalLanguageQuery = async (
  question: string,
  context?: { traceId?: string; userId?: string },
): Promise<NaturalLanguageQueryResult> => {
  // ── RAG: retrieve similar past extractions ─────────────────────────────
  const { fewShotText } = await nl2mongoRetriever.retrieve(
    question,
    context?.traceId,
  );

  const enrichedSchemaContext = fewShotText
    ? `${SCHEMA_CONTEXT}\n${fewShotText}`
    : SCHEMA_CONTEXT;

  const { data: extracted } = await generateStructured({
    systemPrompt: enrichedSchemaContext,
    prompt: `Question: ${question}`,
    schema: generatedQuerySchema,
    cacheKey: `nl2mongo:${question}`,
    traceId: context?.traceId ?? "",
    userId: context?.userId,
  });

  // ── RAG: store good extractions for future retrieval ───────────────────
  if (nl2mongoQualityGate(extracted)) {
    nl2mongoRetriever
      .store(
        question,
        extracted,
        nl2mongoQualityGate,
        getStoreOptions(),
        context?.traceId,
      )
      .catch(() => {});
  }

  const filter = buildMongoFilter(extracted);

  const generatedQuery: GeneratedQuery = {
    filter,
    projection: {},
    sort: {},
    limit: extracted.limit,
  };

  console.log("Generated MongoDB Query:", generatedQuery);

  await connectDB();
  const results = await Customer.find(generatedQuery.filter)
    .sort(generatedQuery.sort as Record<string, 1 | -1>)
    .limit(generatedQuery.limit);

  return {
    question,
    generatedQuery,
    results,
    count: results.length,
  };
};

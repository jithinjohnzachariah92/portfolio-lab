import { z } from "zod";
import { generateStructured } from "@jz92/ai-provider";
import { connectDB } from "@shared/db";
import { Customer } from "@shared/models";
import {
  nl2mongoRetriever,
  nl2mongoQualityGate,
  getStoreOptions,
} from "./rag/retriever"

// ── Schema Context for LLM ────────────────────────────────────────────────
//
// This is the system prompt that teaches the LLM how to extract MongoDB
// conditions from natural language. It includes:
//
// 1. The Customer schema (so the LLM knows what fields exist)
// 2. Condition type definitions (equality, elemMatch, comparison, absence)
// 3. Type requirements for each field (Boolean, Number, String)
// 4. Case sensitivity rules (Title Case for preference names)
// 5. Field path conventions (preferences.brands, etc.)
// 6. Rules for when to include/omit 'name' in elemMatch conditions
// 7. Distinction between explicit dislike vs absence
//
// See Principle 1: Lead with the "why" before the "how" —
// this prompt explains WHY each rule exists, not just WHAT the rule is.
// This helps the LLM understand intent and apply rules correctly.
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

// ── Zod Schemas ────────────────────────────────────────────────────────
//
// Using Zod for runtime validation of LLM outputs ensures type safety
// and provides clear error messages when the model produces invalid output.
//
// See Principle 6: Bake in invisible qualities —
// validation is an invisible quality that prevents subtle bugs.

// ── Condition Schema ──────────────────────────────────────────────
//
// Single unified schema for all condition types, discriminated by `type` field.
// This pattern works reliably with structured output mode.
//
// Earlier attempts that failed:
// 1. Union-inside-record: Model collapsed to empty result
// 2. Four parallel arrays: Model also collapsed to empty result
//
// The single-array-with-discriminator pattern is the most reliable.
const conditionSchema = z.object({
  // Condition type - determines how to interpret other fields
  type: z.enum(["equality", "elemMatch", "comparison", "absence"]),
  // Field path - either top-level (e.g., "sparksMember") or nested (e.g., "preferences.brands")
  field: z.string(), // top-level field OR array path
  // For elemMatch and absence: the preference item name (e.g., "Nike")
  name: z.string().optional(), // for elemMatch / absence
  // For elemMatch: whether the preference is opted in (true = like, false = dislike)
  optedIn: z.boolean().optional(), // for elemMatch
  // For comparison: MongoDB comparison operator
  operator: z.enum(["$gt", "$lt", "$gte", "$lte"]).optional(), // for comparison
  // For equality and comparison: the value to compare against
  value: z.union([z.string(), z.number(), z.boolean()]).optional(), // for equality / comparison
});

// ── Generated Query Schema ──────────────────────────────────────────
//
// The complete extraction output from the LLM.
const generatedQuerySchema = z.object({
  // Array of condition objects (can be empty if no conditions extracted)
  conditions: z.array(conditionSchema).default([]),
  // How to combine multiple conditions ($and or $or)
  combineWith: z.enum(["$and", "$or"]).default("$and"),
  // Result limit - hard capped to prevent model from inventing absurd values
  // Principle 5: Right-size the engineering to the stage
  // We don't need "infinite" results, and 100 is plenty for most use cases.
  limit: z.number().int().min(1).max(100).default(10),
});

export type ExtractedQuery = z.infer<typeof generatedQuerySchema>;

// ── Generated Query Interface ────────────────────────────────────────
//
// The final query structure passed to MongoDB.
// Separated from ExtractedQuery to allow for future transformations.
export interface GeneratedQuery {
  filter: Record<string, unknown>;    // MongoDB filter object
  projection: Record<string, unknown>; // Fields to include/exclude
  sort: Record<string, unknown>;      // Sort criteria
  limit: number;                       // Result limit
}

// ── Result Interface ───────────────────────────────────────────────
//
// The complete result returned to the caller.
export interface NaturalLanguageQueryResult {
  question: string;                    // Original question
  generatedQuery: GeneratedQuery;      // The query that was executed
  results: unknown[];                 // Query results (Customer documents)
  count: number;                       // Number of results
}

// ── Field Type Coercion ──────────────────────────────────────────────
//
// Used to coerce/validate equality/comparison values before they reach MongoDB.
// This prevents model mistakes from causing runtime errors.
//
// See Principle 3: Refuse hacks; fix root causes —
// Instead of letting bad data reach MongoDB and cause CastError,
// we validate and coerce at the boundary.

const BOOLEAN_FIELDS = new Set(["sparksMember", "profileComplete"]);
const NUMBER_FIELDS = new Set(["totalOrders", "totalSpend"]);

/**
 * Coerce a value to the correct type for its field.
 * 
 * @param field - The MongoDB field name
 * @param value - The value extracted by the LLM
 * @returns The coerced value, or undefined if coercion fails
 * 
 * For boolean fields: accept only boolean values, reject numbers/strings
 * For number fields: coerce strings to numbers, reject NaN
 * For string fields: pass through as-is
 */
const coerceValue = (
  field: string,
  value: string | number | boolean | undefined,
): unknown => {
  if (value === undefined) return undefined;

  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof value === "boolean") return value;
    // Model sent the wrong type for a boolean field — treat any non-zero
    // number or truthy string as an invalid condition rather than guessing.
    // This prevents silent bugs where we incorrectly filter data.
    return undefined;
  }

  if (NUMBER_FIELDS.has(field)) {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isNaN(num) ? undefined : num;
  }

  return value;
};

// ── MongoDB Filter Builder ────────────────────────────────────────────
//
// Deterministic filter assembly from extracted conditions.
// 
// CRITICAL: The LLM only extracts conditions, NEVER builds MongoDB syntax directly.
// This function is the single source of truth for MongoDB filter construction.
//
// See Principle 3: Refuse hacks; fix root causes —
// By keeping filter building deterministic and separate from the LLM,
// we ensure:
//   - Correct MongoDB syntax (no injection vulnerabilities)
//   - Consistent behavior across runs
//   - Easy to test and debug
//   - Safe to evolve the schema without breaking existing queries

/**
 * Build a MongoDB filter object from extracted conditions.
 * 
 * @param parsed - The extracted query with conditions array
 * @returns A MongoDB filter object, or empty object if no valid conditions
 * 
 * Handles all four condition types:
 *   - equality: { field: value }
 *   - elemMatch: { field: { $elemMatch: { name, optedIn } } }
 *   - comparison: { field: { [operator]: value } }
 *   - absence: { field: { $not: { $elemMatch: { name } } } }
 * 
 * Invalid conditions (failed coercion) are silently dropped.
 */
const buildMongoFilter = (parsed: ExtractedQuery): Record<string, unknown> => {
  const conditions: Record<string, unknown>[] = [];

  for (const c of parsed.conditions) {
    switch (c.type) {
      case "equality": {
        const value = coerceValue(c.field, c.value);
        // Only add if coercion succeeded (not undefined)
        if (value !== undefined) conditions.push({ [c.field]: value });
        break;
      }
      case "elemMatch": {
        const matchClause: Record<string, unknown> = {};
        if (c.name !== undefined) matchClause.name = c.name;
        if (c.optedIn !== undefined) matchClause.optedIn = c.optedIn;
        // Only add if we have at least one property in the match clause
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
          // $not + $elemMatch = array does NOT contain element with this name
          conditions.push({
            [c.field]: { $not: { $elemMatch: { name: c.name } } },
          });
        }
        break;
      }
    }
  }

  // Optimize: no conditions = match all documents
  if (conditions.length === 0) return {};
  // Optimize: single condition = no need for $and/$or wrapper
  if (conditions.length === 1) return conditions[0];
  // Multiple conditions: combine with the specified operator
  return { [parsed.combineWith]: conditions };
};

// ── Main Export ────────────────────────────────────────────────────────────
//
// This is the primary entry point for NL2Mongo translation.
// It orchestrates the full pipeline: RAG retrieval → LLM extraction →
// filter building → query execution → result formatting.

/**
 * Execute a natural language query against the Customer collection.
 * 
 * @param question - The natural language question to translate
 * @param context - Optional tracing/context information
 * @returns Complete query result including generated query and matching documents
 * 
 * Pipeline:
 *   1. RAG: Retrieve similar past extractions as few-shot examples
 *   2. LLM: Extract structured conditions from the question
 *   3. RAG: Store good extractions for future use
 *   4. Build: Convert conditions to MongoDB filter
 *   5. Execute: Run the query against MongoDB
 *   6. Return: Results with metadata
 */
export const runNaturalLanguageQuery = async (
  question: string,
  context?: { traceId?: string; userId?: string },
): Promise<NaturalLanguageQueryResult> => {
  // ── Step 1: RAG Retrieval ─────────────────────────────────────────────
  //
  // Find similar past questions and their extracted conditions.
  // These are used as few-shot examples to guide the LLM.
  //
  // See Principle 2: Think in systems, not features —
  // RAG is a system-level improvement that benefits all queries.
  const { fewShotText } = await nl2mongoRetriever.retrieve(
    question,
    context?.traceId,
  );

  // Enrich the schema context with few-shot examples if available
  const enrichedSchemaContext = fewShotText
    ? `${SCHEMA_CONTEXT}\n${fewShotText}`
    : SCHEMA_CONTEXT;

  // ── Step 2: LLM Extraction ────────────────────────────────────────────
  //
  // Call the LLM with structured output to extract conditions.
  // The schema ensures we get valid, typed output.
  const { data: extracted } = await generateStructured({
    systemPrompt: enrichedSchemaContext,
    prompt: `Question: ${question}`,
    schema: generatedQuerySchema,
    cacheKey: `nl2mongo:${question}`,
    traceId: context?.traceId ?? "",
    userId: context?.userId,
  });

  // ── Step 3: RAG Storage ───────────────────────────────────────────────
  //
  // Store good extractions for future retrieval.
  // Quality gate ensures we only store useful examples (with at least one condition).
  //
  // Fire-and-forget: we don't await the store promise to avoid blocking the response.
  // Errors are silently caught to avoid failing the query due to storage issues.
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

  // ── Step 4: Filter Building ───────────────────────────────────────────
  //
  // Convert extracted conditions to MongoDB filter.
  // Invalid conditions (failed coercion) are dropped.
  const filter = buildMongoFilter(extracted);

  // ── Step 5: Query Execution ─────────────────────────────────────────
  //
  // Build the complete query object and execute against MongoDB.
  const generatedQuery: GeneratedQuery = {
    filter,
    projection: {},
    sort: {},
    limit: extracted.limit,
  };

  // Log the generated query for debugging/transparency
  console.log("Generated MongoDB Query:", generatedQuery);

  // Connect to database and execute query
  await connectDB();
  const results = await Customer.find(generatedQuery.filter)
    .sort(generatedQuery.sort as Record<string, 1 | -1>)
    .limit(generatedQuery.limit);

  // ── Step 6: Return Results ──────────────────────────────────────────
  return {
    question,
    generatedQuery,
    results,
    count: results.length,
  };
};

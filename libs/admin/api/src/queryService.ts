import { z } from "zod";
import { generateStructured } from "@jz92/ai-provider";
import { connectDB } from "@shared/db";
import { Customer } from "@shared/models";

const SCHEMA_CONTEXT = `
You are a MongoDB query generator for an M&S customer database.
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

Given a natural language question, return a JSON object with this structure:
{
  "filter": {},
  "projection": {},
  "sort": {},
  "limit": 10
}

Always return an empty projection {} so all fields are included in results.
Important: field values are case sensitive. Always use Title Case for preference names e.g. "Vegetarian" not "vegetarian", "Christmas" not "christmas".
`;

// Zod schema mirrors GeneratedQuery exactly — this is what makes the output
// structurally guaranteed instead of hand-parsed from free text.
const generatedQuerySchema = z.object({
  filter: z.record(z.string(), z.unknown()).optional(),
  projection: z.record(z.string(), z.unknown()).optional(),
  sort: z.record(z.string(), z.union([z.literal(1), z.literal(-1)])).optional(),
  limit: z.number().optional(),
});

export type GeneratedQuery = z.infer<typeof generatedQuerySchema>;

export interface NaturalLanguageQueryResult {
  question: string;
  generatedQuery: GeneratedQuery;
  results: unknown[];
  count: number;
}

export const runNaturalLanguageQuery = async (
  question: string,
): Promise<NaturalLanguageQueryResult> => {
  // Step 1: Ask the model to generate a MongoDB query — structured, not free text.
  // Zod validates the shape; no more manual JSON.parse or markdown-fence stripping.
  // cacheKey means an identical question within the TTL skips the model entirely.
  const { data: parsedQuery } = await generateStructured({
    systemPrompt: SCHEMA_CONTEXT,
    prompt: `Question: ${question}`,
    schema: generatedQuerySchema,
    cacheKey: `nl2mongo:${question}`,
  });

  console.log("Generated MongoDB Query:", parsedQuery);

  // Step 2: Execute against MongoDB
  await connectDB();
  const results = await Customer.find(parsedQuery.filter ?? {})
    .sort(parsedQuery.sort ?? {})
    .limit(parsedQuery.limit ?? 10);

  return {
    question,
    generatedQuery: parsedQuery,
    results,
    count: results.length,
  };
};

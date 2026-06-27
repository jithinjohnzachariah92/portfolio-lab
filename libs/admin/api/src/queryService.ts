import Anthropic from "@anthropic-ai/sdk";
import { connectDB } from "@shared/db";
import { Customer } from "@shared/models";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

Given a natural language question, return ONLY a valid JSON object with this structure:
{
  "filter": {},
  "projection": {},
  "sort": {},
  "limit": 10
}

No explanation. No markdown. No code blocks. Just the raw JSON object.
Always return an empty projection {} so all fields are included in results.
Important: field values are case sensitive. Always use Title Case for preference names e.g. "Vegetarian" not "vegetarian", "Christmas" not "christmas".
`;

export interface GeneratedQuery {
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
}

export interface NaturalLanguageQueryResult {
  question: string;
  generatedQuery: GeneratedQuery;
  results: unknown[];
  count: number;
}

/**
 * Translate a natural-language question into a MongoDB query with Claude,
 * execute it against the customers collection, and return the results.
 *
 * Throws if Claude returns something that isn't valid JSON.
 */
export async function runNaturalLanguageQuery(
  question: string
): Promise<NaturalLanguageQueryResult> {
  // Step 1: Ask Claude to generate a MongoDB query
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `${SCHEMA_CONTEXT}\n\nQuestion: ${question}`,
      },
    ],
  });

  const rawQuery =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Step 2: Parse the query
  let parsedQuery: GeneratedQuery;
  try {
    parsedQuery = JSON.parse(rawQuery);
  } catch {
    throw new Error(`Failed to parse query from Claude: ${rawQuery}`);
  }

  console.log("Generated MongoDB Query:", parsedQuery);

  // Step 3: Execute against MongoDB
  await connectDB();
  const results = await Customer.find(parsedQuery.filter || {})
    .sort(parsedQuery.sort || {})
    .limit(parsedQuery.limit || 10);

  return {
    question,
    generatedQuery: parsedQuery,
    results,
    count: results.length,
  };
}

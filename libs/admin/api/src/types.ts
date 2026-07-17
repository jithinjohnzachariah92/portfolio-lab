import { z } from 'zod'

// ── Shared types — extracted here specifically to avoid a circular import
// between queryService.ts and rag/retriever.ts (queryService needs the
// retriever, the retriever needs these types — if both lived only in
// queryService.ts, that's a cycle).

export const conditionSchema = z.object({
  type: z.enum(["equality", "elemMatch", "comparison", "absence"]),
  field: z.string(),
  name: z.string().optional(),
  optedIn: z.boolean().optional(),
  operator: z.enum(["$gt", "$lt", "$gte", "$lte"]).optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
})

export const generatedQuerySchema = z.object({
  conditions: z.array(conditionSchema).default([]),
  combineWith: z.enum(["$and", "$or"]).default("$and"),
  limit: z.number().int().min(1).max(100).default(10),
})

export type ExtractedQuery = z.infer<typeof generatedQuerySchema>

export interface GeneratedQuery {
  filter: Record<string, unknown>
  projection: Record<string, unknown>
  sort: Record<string, unknown>
  limit: number
}

export interface NaturalLanguageQueryResult {
  question: string
  generatedQuery: GeneratedQuery
  results: unknown[]
  count: number
}
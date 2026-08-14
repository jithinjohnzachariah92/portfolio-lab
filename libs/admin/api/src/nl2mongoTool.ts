import { z } from 'zod'
import type { RegisteredTool } from '@jz92/tools'
import { runNaturalLanguageQuery } from './queryService'

export const nl2mongoTool: RegisteredTool = {
  capability: {
    name: 'nl2mongo-query',
    description: 'Answer questions about customers and their preferences by querying the customer database. Use this for any question about customer data, preferences, brands, dietary needs, or shopping behavior.',
    domain: 'admin',
    invocationKind: 'function',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.object({ count: z.number(), results: z.array(z.unknown()) }),
  },
  handler: async (input) => {
    const { question } = input as { question: string }
    const result = await runNaturalLanguageQuery(question)
    return { count: result.count, results: result.results }
  },
}
import { generateEmbedding } from '@jz92/ai-provider'
import {
  getPreferenceExamplesCollection,
  VECTOR_INDEX_NAME,
  TOP_K,
} from './db'

// ── retrieveExamples ──────────────────────────────────────────────────────────
// Embeds the input query and searches Atlas Vector Search for the most similar
// past preference extractions. Returns them formatted as few-shot examples
// ready to inject into the system prompt.
//
// inputType: 'query' — we're searching, not storing. Voyage prepends a
// retrieval-optimised prompt internally, improving match quality vs 'document'.

export const retrieveExamples = async (
  input: string,
  traceId?: string
): Promise<string> => {
  try {
    // Embed the query
    const { embedding } = await generateEmbedding(input, {
      inputType: 'query',
      cacheKey:  `retrieve:${input}`,
      traceId,
    })

    const collection = await getPreferenceExamplesCollection()

    // Atlas $vectorSearch aggregation
    const results = await collection.aggregate<{
      input:  string
      output: string
      score:  number
    }>([
      {
        $vectorSearch: {
          index:         VECTOR_INDEX_NAME,
          path:          'embedding',
          queryVector:   embedding,
          numCandidates: TOP_K * 4,  // search wider, return narrower
          limit:         TOP_K,
        },
      },
      {
        $project: {
          input:  1,
          output: 1,
          score:  { $meta: 'vectorSearchScore' },
          _id:    0,
        },
      },
    ]).toArray()

    // No examples yet — store is empty or nothing similar found
    if (results.length === 0) return ''

    // Format as few-shot examples for the system prompt
    const examples = results
      .map((r, i) =>
        `Example ${i + 1}:\nInput: "${r.input}"\nOutput: ${r.output}`
      )
      .join('\n\n')

    console.log(`[rag/retrieve] Found ${results.length} similar examples (top score: ${results[0].score.toFixed(3)})`)

    return `\nHere are some examples of similar inputs and their correct extractions:\n\n${examples}\n\nUse these as reference for the extraction below.`

  } catch (err) {
    // Never let retrieval failure block a parse — fall back to no examples
    console.error('[rag/retrieve] Retrieval failed, continuing without examples:', err)
    return ''
  }
}
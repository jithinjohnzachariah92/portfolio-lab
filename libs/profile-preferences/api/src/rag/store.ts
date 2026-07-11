import { generateEmbedding } from '@jz92/ai-provider'
import { getPreferenceExamplesCollection, EMBEDDING_DIMENSIONS } from './db'
import type { ParsedPreferences } from '../parseService'

// ── storeExample ──────────────────────────────────────────────────────────────
// Called after a successful, validated preference parse.
// Embeds the input and writes {embedding, input, output} to Atlas so future
// similar inputs can retrieve this as a few-shot example.
//
// Quality gate: only called when:
//   - Zod validation passed
//   - isEmpty is false (at least one preference extracted)
//   - no low-confidence items (or they were confirmed)
// Never store failed or empty extractions — that's what makes the store
// self-improving rather than self-corrupting.

export const storeExample = async (
  input: string,
  preferences: ParsedPreferences,
  traceId?: string
): Promise<void> => {
  try {
    // Embed with inputType: 'document' — we're storing, not querying
    const { embedding, model, dimensions } = await generateEmbedding(input, {
      inputType: 'document',
      cacheKey:  `store:${input}`,
      traceId,
    })

    // Dimension safety check before writing
    if (dimensions !== EMBEDDING_DIMENSIONS) {
      console.warn(
        `[rag/store] Dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${dimensions}. ` +
        `Skipping store — re-embed with correct model.`
      )
      return
    }

    const collection = await getPreferenceExamplesCollection()

    await collection.insertOne({
      embedding,
      input,
      output:       JSON.stringify(preferences),
      model,
      modelVersion: model,   // same for now; separate if model aliases diverge
      createdAt:    new Date(),
    })

    console.log(`[rag/store] Stored example for input: "${input.slice(0, 50)}..."`)

  } catch (err) {
    // Never let a store failure break the parse response — log and continue
    console.error('[rag/store] Failed to store example:', err)
  }
}
import mongoose from 'mongoose'
import { connectDB } from '@shared/db'
import { generateEmbedding } from '@jz92/ai-provider'
import { createAtlasVectorStore } from '@jz92/vector'
import { createRetriever } from '@jz92/retrieval'
import type { ExtractedQuery } from '../types.js'

// ── Wiring @jz92/vector + @jz92/retrieval for the NL2Mongo domain ─────────────
// Same pattern as the Preference Parser's rag/retriever.ts — everything
// domain-specific (collection name, formatExample, quality gate) lives here;
// the platform packages themselves know nothing about Mongo query generation.

const VECTOR_INDEX_NAME = 'nl2mongo_examples_vector_idx'
const TOP_K = 3

const getCollection = async () => {
  await connectDB()
  const db = mongoose.connection.db
  if (!db) throw new Error('[nl2mongo-rag] MongoDB connection not ready after connectDB()')
  return db.collection('nl2mongo_examples')
}

const vectorStore = createAtlasVectorStore({
  getCollection,
  vectorIndexName: VECTOR_INDEX_NAME,
})

// The output we retrieve/store is the EXTRACTED query (conditions array),
// not the assembled Mongo filter — this is deliberate. Few-shot examples
// showing "this question -> these conditions" teach the model the extraction
// pattern directly, matching what generateStructured actually produces.
// buildMongoFilter() still runs the same way afterward regardless.

export const nl2mongoRetriever = createRetriever<ExtractedQuery>({
  vectorStore,
  embed: (text, inputType, traceId) =>
    generateEmbedding(text, { inputType, traceId }),
  topK: TOP_K,
  formatExample: (input, output) =>
    `Question: "${input}"\nConditions: ${JSON.stringify(output)}`,
  parseOutput: (raw) => JSON.parse(raw) as ExtractedQuery,
})

// Quality gate: only store if the model actually extracted at least one
// condition — this directly targets the empty-filter collapse bug we just
// fixed. An extraction with zero conditions is exactly the failure mode
// that shouldn't become a future few-shot example.
export const nl2mongoQualityGate = (extracted: ExtractedQuery): boolean =>
  extracted.conditions.length > 0

export const getStoreOptions = () => ({
  model: 'voyage-4-lite',   // matches ai-provider's resolveEmbeddingProvider default
  modelVersion: 'voyage-4-lite',
})
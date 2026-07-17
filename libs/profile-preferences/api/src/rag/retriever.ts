import mongoose from 'mongoose'
import { connectDB } from '@shared/db'
import { generateEmbedding, resolveEmbeddingProvider } from '@jz92/ai-provider'
import { createAtlasVectorStore } from '@jz92/vector'
import { createRetriever } from '@jz92/retrieval'
import type { ParsedPreferences, ParseQuality } from '../parseService'
import { getQuality } from '../parseService'

// ── Wiring @jz92/vector + @jz92/retrieval for the Preference Parser domain ────
// This file replaces the old rag/db.ts + rag/store.ts + rag/retrieve.ts —
// same behaviour, now backed by the generic platform packages instead of
// inline code. Everything domain-specific (collection name, formatExample,
// quality gate) lives here; the packages themselves know nothing about
// preferences.

const VECTOR_INDEX_NAME = 'preference_examples_vector_idx'
const TOP_K = 3

const getCollection = async () => {
  await connectDB()
  const db = mongoose.connection.db
  if (!db) throw new Error('[rag] MongoDB connection not ready after connectDB()')
  return db.collection('preference_examples')
}

const vectorStore = createAtlasVectorStore({
  getCollection,
  vectorIndexName: VECTOR_INDEX_NAME,
})

export const preferenceRetriever = createRetriever<ParsedPreferences>({
  domain: 'preference-parser',
  vectorStore,
  embed: (text, inputType, traceId) =>
    generateEmbedding(text, { inputType, traceId }),
  topK: TOP_K,
  formatExample: (input, output) =>
    `Input: "${input}"\nOutput: ${JSON.stringify(output)}`,
  parseOutput: (raw) => JSON.parse(raw) as ParsedPreferences,
})

// The quality gate — same logic that was inline in parseService.ts before:
// only store if not empty AND no low-confidence items.
export const preferencesQualityGate = (prefs: ParsedPreferences): boolean => {
  const quality: ParseQuality = getQuality(prefs)
  return !quality.isEmpty && quality.lowConfidenceItems.length === 0
}

// The active embedding model — used as StoreOptions.model/modelVersion.
// Resolved once per call rather than cached, so it stays correct if
// AI_EMBED_MODEL changes without a redeploy (e.g. local env var edit).
export const getStoreOptions = () => {
  const config = resolveEmbeddingProvider()
  return { model: config.model, modelVersion: config.model }
}
import mongoose from "mongoose";
import { connectDB } from "@shared/db";
import { generateEmbedding } from "@jz92/ai-provider";
import { createAtlasVectorStore } from "@jz92/vector";
import { createRetriever } from "@jz92/retrieval";
import type { ExtractedQuery } from "../types.js";

// ── NL2Mongo RAG Configuration ────────────────────────────────────────────
//
// This file wires up the platform-level RAG packages (@jz92/vector, @jz92/retrieval)
// with NL2Mongo-specific configuration.
//
// See Principle 2: Think in systems, not features —
// Everything domain-specific (collection name, formatExample, quality gate)
// lives here. The platform packages know nothing about Mongo query generation.
//
// This pattern is reused in profile-preferences/api/src/rag/retriever.ts
// with different domain-specific configuration.

// ── Vector Store Configuration ──────────────────────────────────────────

const VECTOR_INDEX_NAME = "nl2mongo_examples_vector_idx";
const TOP_K = 3; // Number of similar examples to retrieve

/**
 * Get the MongoDB collection for storing NL2Mongo examples.
 * Establishes database connection if not already connected.
 */
const getCollection = async () => {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db)
    throw new Error(
      "[nl2mongo-rag] MongoDB connection not ready after connectDB()",
    );
  return db.collection("nl2mongo_examples");
};

// Create the vector store using MongoDB Atlas as the backend
const vectorStore = createAtlasVectorStore({
  getCollection,
  vectorIndexName: VECTOR_INDEX_NAME,
});

// ── Retriever Configuration ─────────────────────────────────────────────
//
// The retriever handles:
//   - Retrieving similar past questions and their extractions
//   - Formatting examples for the LLM prompt
//   - Storing new examples after successful extraction

// CRITICAL: We store the EXTRACTED query (conditions array), NOT the
// assembled MongoDB filter. This is deliberate because:
//
// 1. Few-shot examples showing "question -> conditions" teach the model
//    the extraction pattern directly
// 2. The extraction schema matches what generateStructured produces
// 3. buildMongoFilter() runs the same way regardless of what we store
// 4. This keeps the examples focused on the extraction task

export const nl2mongoRetriever = createRetriever<ExtractedQuery>({
  // Domain identifier for metrics/tracing
  domain: "nl2mongo",
  
  // Vector store for semantic search
  vectorStore,
  
  // Embedding function using the configured provider
  embed: (text, inputType, traceId) =>
    generateEmbedding(text, { inputType, traceId }),
  
  // Number of similar examples to retrieve
  topK: TOP_K,
  
  // Format for few-shot examples in the prompt
  // Show the question and the extracted conditions
  formatExample: (input, output) =>
    `Question: "${input}"\nConditions: ${JSON.stringify(output)}`,
  
  // Parse stored examples back to ExtractedQuery type
  parseOutput: (raw) => JSON.parse(raw) as ExtractedQuery,
});

// ── Quality Gate ─────────────────────────────────────────────────────────
//
// Only store extractions that meet quality criteria.
// This prevents the vector store from being polluted with bad examples.

/**
 * Determines whether an extraction is good enough to store.
 * 
 * @param extracted - The extracted query from the LLM
 * @returns true if the extraction should be stored, false otherwise
 * 
 * Currently: only store if at least one condition was extracted.
 * This directly targets the "empty-filter collapse bug" where the model
 * returns zero conditions — we don't want these to become future examples.
 */
export const nl2mongoQualityGate = (extracted: ExtractedQuery): boolean =>
  extracted.conditions.length > 0;

// ── Store Options ────────────────────────────────────────────────────────
//
// Configuration for storing examples in the vector store.

/**
 * Get options for storing examples.
 * Resolved dynamically so it stays correct if the embedding model changes.
 */
export const getStoreOptions = () => ({
  // Use voyage-4-lite embedding model (matches ai-provider's default)
  model: "voyage-4-lite",
  modelVersion: "voyage-4-lite",
});

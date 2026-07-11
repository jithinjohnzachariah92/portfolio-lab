import { connectDB } from "@shared/db"; // adjust to your actual import path
import mongoose from "mongoose";

// ── preference_examples collection ───────────────────────────────────────────
// Stores validated preference extractions as vectors for RAG retrieval.
// Uses the existing MongoDB connection via the shared connectDB utility.
//
// Document shape matches VectorEntry from @jz92/ai-core:
//   embedding:    number[]  — 1024-dim Voyage vector
//   input:        string    — the original user text
//   output:       string    — the validated parsed preferences (JSON string)
//   model:        string    — embedding model that produced the vector
//   modelVersion: string    — for future migration safety
//   createdAt:    Date

export type PreferenceExample = {
  _id?: string;
  embedding: number[];
  input: string;
  output: string; // JSON.stringify(ParsedPreferences)
  model: string;
  modelVersion: string;
  createdAt: Date;
};

// Index name must match exactly what was created in Atlas
export const VECTOR_INDEX_NAME = "preference_examples_vector_idx";
export const EMBEDDING_DIMENSIONS = 1024;
export const TOP_K = 3; // how many examples to retrieve per query

// Returns the raw MongoDB collection — no Mongoose schema needed for vector
// search (we use the $vectorSearch aggregation pipeline directly)
export const getPreferenceExamplesCollection = async () => {
  await connectDB(); // reuses cached connection if already open
  const db = mongoose.connection.db;
  if (!db)
    throw new Error("[rag] MongoDB connection not ready after connectDB()");
  return db.collection<PreferenceExample>("preference_examples");
};

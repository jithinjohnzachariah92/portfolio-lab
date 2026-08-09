import mongoose from "mongoose";

// ── Configuration ────────────────────────────────────────────────────────────
// Fail fast if the required environment variable is missing.
// This ensures connection errors surface immediately rather than at runtime.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set");
}
const uri: string = MONGODB_URI;

// ── Connection Cache ──────────────────────────────────────────────────────────
// Use globalThis to cache the connection across module reloads (Next.js hot reload).
// This is the standard pattern for MongoDB connection management in serverless environments.
//
// The cache object holds:
//   - conn: The active mongoose connection (once established)
//   - promise: The pending connection promise (while connecting)
//
// Using globalThis (instead of global) ensures compatibility with both Node.js
// and edge runtimes that may have different global objects.
const g = globalThis as typeof globalThis & {
  _mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
};

// Initialize cache if it doesn't exist. This survives across module reloads
// in development but is reset in production deployments.
const cached = g._mongoose ?? (g._mongoose = { conn: null, promise: null });

// ── Connection Manager ────────────────────────────────────────────────────────
//
// Singleton connection function that:
// 1. Returns cached connection if already established
// 2. Returns pending promise if connection is in flight
// 3. Creates new connection promise if neither exists
// 4. Clears cached promise on error to allow retry
//
// bufferCommands: false - Don't buffer model operations while connecting.
//   This ensures we fail fast if the connection fails rather than silently
//   queuing operations that will fail later.
async function connectDB() {
  // Fast path: connection already established
  if (cached.conn) return cached.conn;

  // Connection in flight: wait for it
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { bufferCommands: false })
      .catch((err) => {
        // Clear the cached promise on error so subsequent calls can retry
        cached.promise = null;
        throw err;
      });
  }

  // Wait for the promise and cache the connection
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
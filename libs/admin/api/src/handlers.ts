import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { printTraceSummary } from "@jz92/telemetry";

import { runNaturalLanguageQuery } from "./queryService";

// ── Request Handler ─────────────────────────────────────────────────────────

/**
 * HTTP handler for POST /api/query
 * 
 * Validates the incoming request, executes the NL2Mongo query,
 * and returns the results as JSON.
 * 
 * See Principle 4: Design for the consumer, not yourself —
 * This handler provides a clean, simple interface for clients.
 * All complexity (RAG, LLM, MongoDB) is hidden behind this endpoint.
 */
export async function handleQuery(req: NextRequest) {
  try {
    // ── Input Validation ─────────────────────────────────────────────
    // Fail fast with clear error messages for invalid input.
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "Question is required" },
        { status: 400 }
      );
    }

    // ── Query Execution ──────────────────────────────────────────────
    // Generate a trace ID for distributed tracing across services.
    const traceId = randomUUID();
    const data = await runNaturalLanguageQuery(question, { traceId });
    
    // Print trace summary for observability (Principle 6: Bake in invisible qualities)
    printTraceSummary(traceId);

    // ── Response ────────────────────────────────────────────────────
    // Return success with complete query results.
    return NextResponse.json({ success: true, data });
  } catch (error) {
    // ── Error Handling ──────────────────────────────────────────────
    // Log the full error for debugging, but return a clean message to the client.
    console.error("[handleQuery] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Query failed",
      },
      { status: 500 }
    );
  }
}
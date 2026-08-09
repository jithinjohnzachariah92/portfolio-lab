import { NextResponse } from "next/server";
import { runToyTaskDemo } from "./demoService";

// ── Request Handler ────────────────────────────────────────────────────────

/**
 * HTTP handler for POST /api/runAgentDemo
 * 
 * This is a simple wrapper around runToyTaskDemo() that:
 *   - Executes the demo service
 *   - Handles errors gracefully
 *   - Returns appropriate HTTP responses
 * 
 * No request body is required (the task is hardcoded in demoService).
 * 
 * See Principle 4: Design for the consumer, not yourself —
 * This handler provides a clean, simple interface. All complexity is hidden.
 */
export async function handleRunAgentDemo() {
  try {
    // Execute the demo and return the results
    const result = await runToyTaskDemo();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // Handle errors gracefully
    // Log the full error for debugging, return clean message to client
    console.error("[handleRunAgentDemo] error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Agent run failed" 
      },
      { status: 500 }
    );
  }
}
import { randomUUID } from "crypto";
import { runAgent } from "@jz92/agents";

// ── Toy Task Definition ──────────────────────────────────────────────────
//
// A classic constraint satisfaction problem that demonstrates the agent's
// reasoning capabilities.
//
// Constraints:
//   - Total items: exactly 12
//   - Budget: at most $150
//   - Item types: nails ($2), screws ($3), bolts ($5)
//   - Minimum: at least 2 of each type
//   - Objective: get as close to $150 as possible
//
// This task requires:
//   - Understanding multiple constraints simultaneously
//   - Mathematical reasoning (cost calculations)
//   - Iterative improvement (try, evaluate, adjust)
//   - Optimization (maximize value within budget)
const TOY_TASK = `You have $150. You need to buy exactly 12 items from a
hardware store. Nails cost $2 each, screws cost $3 each, and bolts cost $5
each. You must buy at least 2 of each type, and you want to spend as close
to $150 as possible without going over. What should you buy?`;

// ── Demo Service ─────────────────────────────────────────────────────────

/**
 * Run the agent loop demo with the toy task.
 * 
 * @returns Complete loop trace and results
 * 
 * This is the main entry point for the agent demo. It:
 *   1. Creates a unique trace ID for this run
 *   2. Calls runAgent() with the toy task
 *   3. Returns the complete results for display
 * 
 * The agent will iterate through the loop (observe → think → act → reflect → critique)
 * up to maxIterations times, or until it finds a solution.
 * 
 * See Principle 1: Lead with the "why" before the "how" —
 * The agent loop shows its reasoning at each step, making the process transparent.
 */
export const runToyTaskDemo = async () => {
  // Generate a unique trace ID for this demo run
  // This allows correlating logs across services
  const traceId = randomUUID();

  // Run the agent with the toy task
  const result = await runAgent({
    task: TOY_TASK,              // The problem to solve
    domain: "toy-task-demo",    // Identifier for tracing/metrics
    maxIterations: 8,           // Prevent infinite loops
    traceId,                    // Pass through for distributed tracing
  });

  // Return the complete results for display
  // The UI will show the loop trace so users can see how the agent reasoned
  return {
    traceId,
    task: TOY_TASK,
    finalAnswer: result.finalAnswer,           // The agent's solution (or null)
    iterationsUsed: result.iterationsUsed,     // How many iterations completed
    maxIterationsExceeded: result.maxIterationsExceeded, // Whether we hit the limit
    messages: result.state.messages,           // Full loop trace for display
  };
};
# @agent-demo

**Agent Loop Demo - Constraint Satisfaction with AI Agents**

## Purpose

Demonstrates a **raw AI agent loop** working through a constraint-satisfaction problem. The agent:

1. Receives a task with constraints
2. Observes the current state
3. Thinks through possible actions
4. Acts on the environment
5. Reflects on the result
6. Critiques its approach
7. Repeats until solution found or iteration limit reached

**Why this exists:** This is a showcase of the `@jz92/agents` package, demonstrating how the agent loop works internally. It's useful for:
- Understanding the agent architecture
- Debugging agent behavior
- Testing new agent configurations
- Demonstrating AI capabilities to stakeholders

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      @agent-demo/api                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  demoService.ts                                                  │
│    └── runToyTaskDemo()                                          │
│          ├── Defines the toy task (purchasing problem)            │
│          ├── Calls runAgent() from @jz92/agents                     │
│          └── Returns complete loop trace                          │
│                                                                   │
│  handlers.ts                                                     │
│    └── handleRunAgentDemo()                                      │
│          └── HTTP handler that calls runToyTaskDemo()            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    @jz92/agents package
                              │
                              ▼
  runAgent() → observe → think → act → reflect → critique → repeat
```

### The Toy Task

A classic constraint satisfaction problem:

> You have $150. You need to buy exactly 12 items from a hardware store. 
> Nails cost $2 each, screws cost $3 each, and bolts cost $5 each. 
> You must buy at least 2 of each type, and you want to spend as close 
> to $150 as possible without going over. What should you buy?

This task is:
- **Non-trivial** - Requires multiple steps of reasoning
- **Constrained** - Multiple constraints must be satisfied simultaneously
- **Measurable** - Solution can be verified (12 items, ≤ $150, at least 2 of each)
- **Optimal** - Multiple valid solutions exist, we want the best one

## API

### Endpoint: `POST /api/runAgentDemo`

**Request:** None (no body required)

**Response (Success):**
```typescript
{
  success: true;
  traceId: string;              // Unique trace identifier
  task: string;                 // The toy task description
  finalAnswer: string | null;   // Agent's final answer (or null if not found)
  iterationsUsed: number;        // How many loop iterations were used
  maxIterationsExceeded: boolean; // Whether the iteration limit was hit
  messages: Array<{             // Complete loop trace
    role: string;               // e.g., "observer", "thinker", "actor"
    content: string;            // The message content
  }>;
}
```

**Response (Error):**
```typescript
{
  success: false;
  error: string;
}
```

## Key Components

### `demoService.ts`

Core service that defines and runs the demo.

**Key Functions:**
- `runToyTaskDemo()` - Main entry point, orchestrates the demo

**Configuration:**
- `TOY_TASK` - The constraint satisfaction problem
- `domain` - Identifier for tracing: "toy-task-demo"
- `maxIterations` - Loop iteration limit: 8

**Returns:**
Complete loop trace including:
- `traceId` - For correlating logs
- `task` - The original task
- `finalAnswer` - The agent's solution (or null)
- `iterationsUsed` - Actual iterations used
- `maxIterationsExceeded` - Whether limit was hit
- `messages` - Full conversation history

### `handlers.ts`

HTTP request handler that wraps the demo service.

**Key Functions:**
- `handleRunAgentDemo()` - Handles POST /api/runAgentDemo

## The Agent Loop

The `@jz92/agents` package implements a loop with these phases:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Loop Phases                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. OBSERVE                                                      │
│     ├── Current state of the world                               │
│     └── Relevant context for the task                             │
│                                                                   │
│  2. THINK                                                        │
│     ├── Analyze the current situation                             │
│     ├── Consider possible actions                                 │
│     └── Evaluate trade-offs                                       │
│                                                                   │
│  3. ACT                                                          │
│     ├── Execute the chosen action                                 │
│     └── Modify the world state                                    │
│                                                                   │
│  4. REFLECT                                                      │
│     ├── Assess the result of the action                           │
│     ├── Check if the goal is closer                               │
│     └── Identify what worked/didn't work                         │
│                                                                   │
│  5. CRITIQUE                                                     │
│     ├── Judge the overall approach                                │
│     ├── Identify mistakes or missed opportunities                │
│     └── Suggest improvements for next iteration                  │
│                                                                   │
│  6. DECIDE                                                       │
│     ├── Should we continue?                                       │
│     └── If yes, loop back to OBSERVE                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

Each phase produces a message that gets added to the loop trace, allowing users to see exactly how the agent reached its conclusion.

## UI Components (`@agent-demo/ui`)

### `AgentDemoPage.tsx`

Main user interface with:
- Task description display
- "Run Agent" button
- Loading states
- Error display
- Results section with:
  - Iterations used counter
  - Final answer display
  - Complete loop trace (all messages from all phases)

**Layout:**
- Header with title and subtitle
- Task card showing the problem statement
- Run button
- Summary card (iterations count)
- Answer card (final solution)
- Loop trace (all messages with role labels)

## Design Decisions

### Why This Specific Task?
The toy task was chosen because it:
- **Demonstrates reasoning** - Requires multiple steps, not a single answer
- **Has constraints** - Multiple constraints must be satisfied simultaneously
- **Is verifiable** - The solution can be checked for correctness
- **Is non-trivial** - Not obvious, but solvable
- **Is bounded** - Limited solution space (12 items, $150 budget)

### Why Show the Full Loop Trace?
**Principle 4: Design for the consumer, not yourself** — The full loop trace lets users:
- Understand how the agent thinks
- Debug issues in the agent's reasoning
- Learn about the agent loop architecture
- See intermediate states and decisions

This is a **demo** feature, so transparency is more important than conciseness.

### Why 8 Iterations Max?
**Principle 5: Right-size the engineering to the stage** — The toy task should be solvable within 8 iterations. This prevents:
- Infinite loops
- Excessive API costs
- User waiting too long

The limit is configurable and can be adjusted based on the task complexity.

### Why Separate API and UI?
Following the **Nx library pattern**, the API and UI are separated into different subdirectories:
- `api/` - Backend logic (handlers, services)
- `ui/` - Frontend components

This allows:
- Independent development and testing
- Clear separation of concerns
- Reuse of API logic by other UIs
- Reuse of UI components with different backends

## Best Practices

### ✅ Do
- Use the demo to understand agent behavior before building production features
- Check the loop trace when the agent produces unexpected results
- Adjust `maxIterations` based on task complexity
- Use meaningful `domain` identifiers for tracing

### ❌ Don't
- Don't use this demo service in production (it's for demonstration only)
- Don't hardcode the toy task in multiple places
- Don't exceed reasonable iteration limits

## Files

| File | Purpose |
|------|---------|
| `api/src/index.ts` | API exports |
| `api/src/handlers.ts` | HTTP request handler |
| `api/src/demoService.ts` | Core demo service with task definition |
| `ui/src/index.ts` | UI exports |
| `ui/src/pages/AgentDemoPage.tsx` | Main UI component |
| `ui/src/pages/AgentDemoPage.module.css` | UI styles |
| `project.json` | Nx library configuration (note: may need to be created) |

## Dependencies

**Internal:**
- None (self-contained demo)

**External:**
- @jz92/agents - Agent loop implementation
- @jz92/telemetry - Trace logging (via runAgent)
- next/server - Next.js request/response types

## Related Libraries

- **@shared/registry** - Feature registration (agent-demo is NOT registered, suggesting it's a hidden/demo feature)
- **@jz92/agents** - The underlying agent package being demonstrated

## Note

This library appears to be missing its `project.json` file (based on the earlier read failure). This may need to be created for proper Nx integration:

```json
{
  "name": "agent-demo",
  "projectType": "library",
  "sourceRoot": "libs/agent-demo",
  "prefix": "lib",
  "tags": ["type:lib", "scope:agent-demo"]
}
```

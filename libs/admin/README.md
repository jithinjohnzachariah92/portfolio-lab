# @admin

**NL2Mongo - Natural Language to MongoDB Query Translator**

## Purpose

Allows users to query customer data using **plain English** instead of MongoDB syntax. The system:

1. Takes a natural language question (e.g., "List customers who like Nike and are Sparks members")
2. Extracts structured conditions using an LLM
3. Translates conditions to a MongoDB query
4. Executes the query and returns results

**Why this exists:** MongoDB queries have a steep learning curve. This feature makes customer data accessible to non-technical users while still providing full query power. It follows **Principle 1: Lead with the "why" before the "how"** — users state what they want, the system figures out how to get it.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         @admin/api                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  handlers.ts                                                     │
│    └── handleQuery(req, res)                                      │
│          └── Validates input                                       │
│          └── Calls runNaturalLanguageQuery()                       │
│          └── Returns JSON results                                  │
│                                                                   │
│  queryService.ts                                                 │
│    └── runNaturalLanguageQuery(question, context)                │
│          ├── Builds system prompt with schema context               │
│          ├── Calls RAG retriever for few-shot examples              │
│          ├── Calls LLM with structured output                       │
│          ├── Validates and coerces extracted values                 │
│          ├── Builds MongoDB filter from conditions                 │
│          ├── Executes query against Customer collection             │
│          └── Stores good extractions for future RAG                 │
│                                                                   │
│  rag/retriever.ts                                                │
│    └── nl2mongoRetriever (using @jz92/vector + @jz92/retrieval)  │
│          └── MongoDB Atlas vector store                            │
│          └── nl2mongo_examples collection                         │
│                                                                   │
│  evals/                                                          │
│    ├── testCases.ts - Fixed test inputs with expected filters      │
│    ├── scoring.ts - Precision/recall scoring logic                  │
│    ├── run.ts - Eval runner with CI gate                            │
│    └── baseline.json - Baseline metrics for regression tests      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    @shared/db (MongoDB)
                              │
                              ▼
                    Customer collection
```

### Request Flow

```
User Question → POST /api/query → handleQuery() → runNaturalLanguageQuery()
    ↓                                  ↓
 [Input Validation]              [RAG: Retrieve similar examples]
    ↓                                  ↓
 [Error Handling]              [LLM: Extract conditions with schema]
    ↓                                  ↓
 Return JSON error              [Quality Gate: Store if good]
                                    ↓
                              [buildMongoFilter()]
                                    ↓
                              [Execute Query]
                                    ↓
                              [Return Results + Generated Query]
```

## API

### Endpoint: `POST /api/query`

**Request:**
```typescript
{
  question: string;  // Natural language question
}
```

**Response (Success):**
```typescript
{
  success: true;
  data: {
    question: string;
    generatedQuery: {
      filter: Record<string, unknown>;
      projection: Record<string, unknown>;
      sort: Record<string, unknown>;
      limit: number;
    };
    results: Customer[];
    count: number;
  }
}
```

**Response (Error):**
```typescript
{
  success: false;
  error: string;
}
```

## Condition Types

The system supports four condition types for flexible querying:

| Type | Description | Example | MongoDB Equivalent |
|------|-------------|---------|-------------------|
| `equality` | Field equals value | "Sparks members" | `{ sparksMember: true }` |
| `elemMatch` | Array contains matching element | "Like Nike" | `{ 'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: true } } }` |
| `comparison` | Numeric/date comparison | "More than 10 orders" | `{ totalOrders: { $gt: 10 } }` |
| `absence` | Array does NOT contain element | "Never expressed opinion on Nike" | `{ 'preferences.brands': { $not: { $elemMatch: { name: 'Nike' } } } }` |

### Combining Conditions

Conditions can be combined with `$and` or `$or` operators, specified in the extraction schema.

## Key Components

### `queryService.ts`

Core logic for NL2Mongo translation.

**Key Functions:**
- `runNaturalLanguageQuery(question, context)` - Main entry point
- `buildMongoFilter(parsed)` - Deterministic filter assembly
- `coerceValue(field, value)` - Type coercion for safety

**Schema Context:**
The system prompt includes:
- Customer schema definition
- Condition type explanations
- Field type requirements (Boolean vs Number vs String)
- Case sensitivity rules (Title Case for preference names)
- Field path conventions (`preferences.brands`, etc.)

### RAG System (`rag/retriever.ts`)

Uses **Retrieval-Augmented Generation** to improve extraction quality:

1. **Retrieve:** Find similar past questions and their extractions
2. **Augment:** Add few-shot examples to the prompt
3. **Generate:** LLM extracts conditions with better accuracy
4. **Store:** Save good extractions for future retrieval

**Configuration:**
- Vector store: MongoDB Atlas (`nl2mongo_examples_vector_idx`)
- Embedding model: voyage-4-lite (from @jz92/ai-provider)
- Top K: 3 similar examples

**Quality Gate:**
Only stores extractions with at least one condition (`extracted.conditions.length > 0`). This prevents empty/useless examples from polluting the vector store.

### Validation & Type Safety

Uses **Zod** for schema validation:

```typescript
const conditionSchema = z.object({
  type: z.enum(["equality", "elemMatch", "comparison", "absence"]),
  field: z.string(),
  name: z.string().optional(),
  optedIn: z.boolean().optional(),
  operator: z.enum(["$gt", "$lt", "$gte", "$lte"]).optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
```

Type coercion ensures model mistakes (e.g., sending a number for a boolean field) are caught before reaching MongoDB.

## UI Components (`@admin/ui`)

### `QueryPage.tsx`

Main user interface with:
- Text input for natural language questions
- Submit button (Ctrl+Enter shortcut)
- Loading states
- Error display
- Results section

### `ResultView.tsx`

Smart result renderer that handles multiple response shapes:
- NL2Mongo envelope → table + count + generated query (collapsible)
- Array of objects → table with union of all keys
- Array of scalars → single-column list
- Single object → key/value table
- Scalar → prominent display
- Empty/null → empty state

**Features:**
- Automatic column detection (handles non-uniform Mongo docs)
- JSON formatting for nested objects
- Row count display
- Generated query preview (expandable)

## Evaluation System

Comprehensive test suite to ensure extraction quality:

### Test Cases (`evals/testCases.ts`)

12 test cases covering:
- Set operations (single condition)
- Empty results
- Negation (explicit: dislikes Nike)
- Negation (absence: never mentioned Nike)
- AND combinations
- OR combinations
- Mixed (equality + elemMatch)

### Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Precision | ≥ 0.75 | Correct results / total results |
| Recall | ≥ 0.75 | Correct results / expected results |
| Empty Handling | ≥ 90% | Correctly returns nothing when expected |

### Running Evaluations

```bash
# Run evals manually
node libs/admin/api/src/evals/run.ts

# Update baseline
node libs/admin/api/src/evals/run.ts --update-baseline

# CI gate (exits 1 if thresholds not met)
node libs/admin/api/src/evals/run.ts --ci
```

### Current Baseline (2026-07-17)
- **12 test cases**
- **100% precision** (avg: 1.0)
- **100% recall** (avg: 1.0)
- **100% empty handling** (3/3 correct)
- **All cases passing**

## Design Decisions

### Why Structured Output?
Using `generateStructured()` with a Zod schema ensures:
- **Type safety** - LLM output matches expected types
- **Validation** - Invalid outputs are rejected before use
- **Consistency** - Same output format every time

### Why RAG?
Few-shot examples in the prompt improve extraction quality significantly. The vector store allows semantic search for similar past questions, even if they use different wording.

### Why Single Array for Conditions?
Earlier attempts used:
1. Union-inside-record → caused model to collapse to empty
2. Four parallel arrays → also caused collapse

The single discriminated array (`type` field) was the most reliable pattern, especially with Ollama's structured-output mode.

### Why Deterministic Filter Building?
**Principle 3: Refuse hacks; fix root causes** — The LLM only extracts conditions, never builds MongoDB syntax directly. The `buildMongoFilter()` function deterministically assembles the filter from conditions, ensuring:
- Correct MongoDB syntax
- No injection vulnerabilities
- Consistent behavior across runs

### Why Coerce Values?
**Principle 6: Bake in invisible qualities** — The model might send wrong types for fields (e.g., number 1000 for a boolean field). Value coercion catches these:
- Boolean fields: accept only `true`/`false`, reject numbers/strings
- Number fields: coerce strings to numbers, reject NaN
- String fields: pass through as-is

## Best Practices

### ✅ Do
- Use Title Case for preference names ("Nike", "Christmas", "Vegetarian")
- Specify `optedIn` for elemMatch conditions (true for likes, false for dislikes)
- Use absence type for "never mentioned" queries
- Include the specific name when a preference item is mentioned
- Omit `name` only for "any preference in category" queries

### ❌ Don't
- Don't use MongoDB syntax in prompts (the system builds it)
- Don't send extremely large limit values (capped at 100)
- Don't confuse explicit dislike with absence (different condition types)

## Files

| File | Purpose |
|------|---------|
| `api/src/index.ts` | API exports |
| `api/src/handlers.ts` | HTTP request handlers |
| `api/src/queryService.ts` | Core NL2Mongo logic |
| `api/src/types.ts` | TypeScript type definitions |
| `api/src/rag/retriever.ts` | RAG configuration |
| `api/src/evals/*.ts` | Evaluation infrastructure |
| `api/src/evals/baseline.json` | Baseline metrics |
| `ui/src/index.ts` | UI exports |
| `ui/src/pages/QueryPage.tsx` | Main UI component |
| `ui/src/pages/ResultView.tsx` | Result renderer |
| `ui/src/pages/index.ts` | UI barrel export |
| `project.json` | Nx library configuration |

## Dependencies

**Internal:**
- @shared/db - MongoDB connection
- @shared/models - Customer model

**External:**
- @jz92/ai-provider - LLM access with structured output
- @jz92/telemetry - Trace logging
- @jz92/vector - Vector store abstraction
- @jz92/retrieval - RAG abstraction
- mongoose - MongoDB ODM
- zod - Schema validation
- next/server - Next.js request/response types

## Related Libraries

- **@shared/db** - Database connection
- **@shared/models** - Customer data model
- **@shared/registry** - Feature registration (admin is registered here)

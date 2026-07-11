# portfolio-lab — AI Engineering Roadmap

> Living task tracker. Edit this directly — this is the source of truth, not any chat session.
> Strategic lane: **TypeScript-native AI product engineering** (routing, caching, RAG, evals, agents) — *not* Python/ML model training.

---

## Already shipped / current state

Factual inventory of what exists *today*, so the roadmap reads as "where things stand → what's next" rather than starting mid-story. (Verify/correct anything below that's drifted.)

### `@jz92/ai-provider` (published npm package, currently v0.6.3)
A TypeScript AI provider gateway — the call layer everything else sits on.
- Environment-aware provider routing via `resolveProvider()` (reads `NODE_ENV`): Ollama in dev, Anthropic Haiku in test, Anthropic Sonnet in prod. Overridable by `AI_PROVIDER` / `AI_MODEL`. Also knows OpenAI, Google, Groq, Mistral defaults.
- `generateStructured()` (Zod-validated structured output via `Output.object`) and `generatePlainText()`.
- Typed, classified errors (`AUTH_ERROR`, `BILLING_ERROR`, `RATE_LIMIT`, `SERVER_ERROR`, `MODEL_NOT_FOUND`, `TOKEN_BUDGET`, `TIMEOUT`) with actionable messages.
- Smart retry — retries only transient errors (429/500), never auth/billing/validation; exponential backoff.
- Bounded in-memory cache (`BoundedCache`) — TTL + max size + **LRU eviction** + hit/miss/eviction/expiration counters + `getStats()` (added v0.6.3).
- Hard timeouts per provider (`AI_TIMEOUT_MS`).
- Token budget guard (pre-call input estimate).
- Observability via `onAIEvent` / `emitEvent` — `request.success/failure/retry`, `cache.hit`; usage split fields (`cacheReadTokens`/`cacheCreationTokens`) wired; dev log box + `app-cache hit` line.
- 48 passing smoke tests (incl. tests proving each app-cache observable state).
- Core provider SDKs bundled as regular deps (simplifies consumer installs).

### `portfolio-lab` (Nx/Next.js monorepo, deployed on Vercel)
- **Preference Parser** — free text → structured profile data (Anthropic `tool_use` + Zod). Migrated off direct Anthropic SDK onto `@jz92/ai-provider`.
- **NL2Mongo** — natural language → MongoDB queries. (Still on direct SDK — migration is task #3.)
- MongoDB Atlas connection working (IP allowlist, `MONGODB_URI` env, DB scope resolved).
- Deployed to Vercel; custom domain `jz92.co.uk` wired (Wix DNS → Vercel A/CNAME, SSL issued).

### Local AI infra
- Ollama on M5 Pro MacBook (24GB): `qwen2.5-coder:14b`, `llama3.1:8b`.
- Cline in VS Code using Ollama as a local agent.

### Docs / knowledge
- `engineering-judgment.skill` — 7 core principles + the "observability isn't done until a test exercises each state" addition.
- `AI-CONCEPTS.md` — interview-prep reference (RAG vs extraction, ai-provider vs LangChain, the landscape map, embeddings design).
- This `ROADMAP.md`.

### Known issue
- Prod prompt caching (`buildMessages`) marks the wrong message part → not actually caching. Documented; fix is task #1.

---

## Sequenced tasks

Re-ordered by prerequisite + value + effort (lower effort first, prerequisites before dependents). Original numbers noted in each header for traceability.

### 1. Fix prompt-cache bug in ai-provider  `[was part of #1 · low effort · real prod cost leak]`
The app-cache half shipped in v0.6.3 (see "Done" below). This is the one open bug from it.

- [!] **KNOWN BUG — prod prompt caching not working (v7 fix now known).** Original bug: `buildMessages` marks the *user prompt* (tiny, per-call) not the *system prefix*. Root cause of the failed fixes: **`ai@7` rejects system-role messages in the `messages` array** (error: "System messages are not allowed... Use the instructions option instead"). The v7-correct approach (from ai-sdk.dev/docs/foundations/prompts): put system content in the top-level **`instructions`** property (not a system message; `system` is a deprecated fallback), and attach `cacheControl` via **message-level or call-level `providerOptions`**. Read path is already correct — v6+ uses `usage.inputTokenDetails.cacheReadTokens` (which `extractUsage` already reads); the `providerMetadata.anthropic.*` path was older. **Reverted to original (cacheControl on user prompt) for a green build** — do NOT ship the system-message version, it breaks all Anthropic calls. Implementing the real fix touches how the gateway passes `system`/`instructions` + where `providerOptions` attaches (more than a one-function edit).
- [ ] Implement v7 caching fix: `instructions` + `providerOptions` cacheControl; flip guarded test to live assertions; verify write-then-read.
- [!] **Structured-output caching caveat:** `generateStructured` uses tool mode (schema as tool def); `ai` does not support cacheControl on tool definitions, and per Anthropic's cache order (tools → system → messages) a changing schema invalidates the prefix. Structured caching is best-effort, not guaranteed (vercel/ai #3820, #3921). `generatePlainText` caches cleanly once the fix lands.
- [ ] Consider: bump cache key to include a schema/prompt version (`extract:v2:${input}`) or hash — deferred, not blocking.

**Done (v0.6.3):** hit/miss/eviction/expiration counters + `getStats()`; `cache.hit` event + `app-cache hit` log line; FIFO→LRU; usage split fields (`cacheReadTokens`/`cacheCreationTokens`) wired correctly through `extractUsage`/`buildResponse`/`logUsageBox`; 48 tests proving each app-cache state.

### 2. NL2Mongo UI → tabular format  `[✅ done · was #3]`
No dependency on anything else. Good momentum builder.

- [x] `ResultView.tsx` — shape-aware rendering: NL2Mongo envelope detection (`{question, generatedQuery, results, count}`) → results as table + match count + collapsible "show generated query"; falls through to array-of-objects (union-of-keys columns), array-of-scalars, single-object, scalar, and empty states for anything else.
- [x] Layout restructured: stacked (input on top, results full-width below) instead of side-by-side grid; input shrunk to a compact search-box feel (52px → 160px max, was 200px fixed).
- [x] Written in arrow-function/`const` style (standing preference now recorded).
- [ ] *(optional polish, not blocking)* drop the `<label>` for a truer search-box look; simplify the now-redundant mobile grid rule.
- [ ] *(carry to #3)* the `list customerids who like H&M` test returned 0 results — worth checking during NL2Mongo hardening whether the generated query (`$elemMatch` on `preferences.brands` + `optedIn: true`) matches the actual schema, or if it's a correct empty result.

### 3. NL2Mongo → ai-provider migration + API hardening  `[migration ✅ · hardening deferred · was #2]`
Same migration already done for the Preference Parser (direct SDK → ai-provider). Inherits #1's observability for free.

- [x] Migrated off direct Anthropic SDK (`anthropic.messages.create` + manual `JSON.parse`) onto `@jz92/ai-provider`'s `generateStructured`
- [x] Zod schema (`generatedQuerySchema`) mirrors the original `GeneratedQuery` type — output shape now structurally guaranteed instead of hand-parsed from free text (removes the markdown-fence/preamble fragility class entirely)
- [x] `GeneratedQuery` type now inferred from the Zod schema (`z.infer`) — one source of truth instead of two
- [x] Added `cacheKey: nl2mongo:${question}` — identical repeat questions now skip the model via the app-cache proven in #1
- [x] Inherited for free: env-aware routing, smart retry, timeouts, full observability events
- [ ] **Hardening — explicitly deferred**, not scoped this pass: input validation · typed errors beyond ai-provider's · timeouts/retries tuning · output-quality guards. Pick up as its own pass.
- [ ] **H&M empty-result carried over from #2** — confirm whether it's a genuine data question (no customer opted into H&M) or a real accuracy issue. Worth checking with a direct DB query (`db.customers.findOne({"preferences.brands.name": "H&M"})`) before assuming either way.

### 4. Preference Parser — harden for better results  `[✅ done · was #5]`
Same category as #3's hardening — done back-to-back while the pattern was fresh.

- [x] **Input validation (route level):** whitespace-only inputs trimmed before length check; `MIN_INPUT_LENGTH=3` / `MAX_INPUT_LENGTH=2000` constants return clean 400s before spending any tokens — over-length inputs no longer fall through to the token-budget guard deep inside `ai-provider`
- [x] **Error typing:** `ParseResult` discriminated union — error code travels from service to route without re-catching; `errorResponse()` maps each `AIProviderError` code to the right HTTP status (`TOKEN_BUDGET`→400, `RATE_LIMIT`→429, `TIMEOUT`→503, `AUTH_ERROR`/`BILLING_ERROR`→500). Previously every failure returned 200 with `fallback: true`.
- [x] **Output-quality guards:** `ParseQuality` type (`lowConfidenceItems`, `isEmpty`) computed post-normalisation; `isEmpty` guard prompts user to rephrase rather than silently saving empty prefs; `lowConfidenceItems` + `hasLowConfidence` surfaced in response for UI-side confirmation flow
- [x] **`handleGetPreferences` hardened too:** `isValidObjectId()` regex guard before `Customer.findById` (malformed ObjectId → clean 400, not a Mongoose CastError propagating to 500); `buildDefaultPreferences()` extracted as named const; consistent `success` field on all error responses; `CastError` distinguished in catch
- [x] `normalise()` refactored to `filterCategory` helper — same logic, no repetition; all functions converted to `const` arrow style
- [ ] *(deferred)* UI-side confirmation flow for `lowConfidenceItems` — the field is surfaced in the response but nothing renders it yet. Pick up when building the preferences UI.
- [ ] *(noted)* Prime candidate for RAG (#6) — few-shot retrieval of similar past extractions will improve consistency of low-confidence extractions.

### 5a. Extract @jz92/ai-core  `[✅ done · v0.1.0 published]`
Published from `ai-platform` Nx monorepo (`packages/ai-core`). Zero runtime dependencies (tslib only). **Full design spec: AI-CONCEPTS.md §12.**

**Shipped:**
- [x] `types.ts` — `AIProviderName`, `EmbeddingProviderName`, `AIEnvironment`, `AIErrorCode`, `TraceContext`, `CacheContext`, `Schema<T>`, `CompletionRequest/Response`, `EmbeddingRequest/BatchRequest/Response/BatchResponse`, `VectorEntry/Query/SearchResult`
- [x] `events.ts` — `PlatformEvent` discriminated union (11 event types across 5 sources); `emit`, `onEvent`, `clearSubscribers` bus
- [x] `security.ts` — `redact` (PII: email, credit card, UK postcode/phone/NHS), `redactFields`, `detectInjection`, `assertSafeInput`, `scrubSecrets`, `scrubObject`
- [x] Published to npm as `@jz92/ai-core@0.1.0`
- [x] `ai-platform` Nx monorepo initialised + pushed to GitHub (`jithinjohnzachariah92/ai-platform`)

**Deferred (designed, slots in cleanly):**
- [ ] `cost.ts` — cost estimation from events
- [ ] `sanitise.ts` — output sanitisation
- [ ] `validation.ts` — shared validation utilities


Extract contracts, event bus, and security utilities into a standalone package. Zero runtime dependencies — pure TypeScript types + a tiny pub/sub array + regex utilities. **Full design spec: AI-CONCEPTS.md §12.**

**Four files, built now:**
- [ ] `types.ts` — all contracts: `CompletionRequest/Response`, `EmbeddingRequest/Response/BatchResponse`, `VectorEntry/Query/SearchResult`, `TraceContext`, `CacheContext`, `AIErrorCode`, `AIProviderName`, `EmbeddingProviderName`, `AIEnvironment`
- [ ] `events.ts` — event bus (`emit`, `onEvent`, `clearEvents`) + full discriminated `PlatformEvent` union covering `ai-provider`, `vector`, `retrieval`, `guardrails`, `agents`. `BaseEvent` carries `traceId`, `correlationId`, `userId`, `sessionId`, `source`, `type`, `timestamp`, `durationMs`, `env`, `cache`, `packageVersion`
- [ ] `security.ts` — `redact()` (PII: email, credit card, UK postcode/phone/NHS); `detectInjection()` + `assertSafeInput()` (prompt injection guard); `scrubSecrets()` (API keys/bearer tokens from event payloads)
- [ ] `index.ts` — re-exports everything

**Three files, deferred (designed, slots in cleanly when needed):**
- [ ] `cost.ts` — estimate cost from `CompletionSuccessEvent`/`EmbeddingSuccessEvent` using provider pricing table. Add when per-user/per-trace cost attribution is needed. Event schema already carries the data.
- [ ] `sanitise.ts` — strip dangerous content from model responses. Add when a domain reports a bad-output class the guardrails don't catch.
- [ ] `validation.ts` — `isValidTraceId`, `isValidUserId`, `assertNonEmpty`. Add when a second package needs the same logic.

**Migration in `ai-provider`:**
- [ ] `types.ts` → import from `@jz92/ai-core`; re-export old names (`AIRequestOptions`, `AIResponse`) for backwards compatibility
- [ ] `observability.ts` → replace `emitEvent`/`onAIEvent` with `emit`/`onEvent` from `ai-core`; re-export `onAIEvent` for backwards compatibility
- [ ] All `generateStructured`/`generatePlainText` calls → accept `TraceContext` fields (`traceId`, `userId`, `sessionId`) alongside existing options
- [ ] Apply `assertSafeInput()` from `ai-core/security` before every model call
- [ ] Apply `scrubSecrets()` before emitting any event

**The test that ai-core is right:**
```bash
cat ai-core/package.json | jq '.dependencies'
# Must return null or {} — any runtime dep means something leaked
```

- [ ] Publish `@jz92/ai-core@1.0.0` to npm before starting #5b

### 5b. Embeddings in @jz92/ai-provider  `[✅ done · v0.7.0 published · was #5]`
Migrated from standalone repo into `ai-platform` Nx monorepo (`packages/ai-provider`). Wired to `@jz92/ai-core`. **Full architecture: AI-CONCEPTS.md §9 + §11.**

- [x] Migrated into `packages/ai-provider` in `ai-platform` Nx workspace
- [x] `types.ts` — replaced local type definitions with imports from `@jz92/ai-core`; backwards-compatible re-exports so `portfolio-lab` consumers need no import changes
- [x] `gateway.ts` — wired `assertSafeInput` (prompt injection guard) and `scrubSecrets` (credential scrubbing from error messages) from `@jz92/ai-core/security`
- [x] `errors.ts` — `override` modifier added to `cause` property (strict TypeScript compliance)
- [x] 48 smoke tests passing in Nx workspace
- [x] Published as `@jz92/ai-provider@0.7.0` to npm
- [x] Standalone `ai-provider` repo superseded — archive when ready

### 5c. Embeddings capability in @jz92/ai-provider  `[✅ done · v0.8.0 published]`

- [x] `embeddingProvider.ts` — `resolveEmbeddingProvider()`: Voyage default in ALL envs (dimension consistency), OpenAI + Ollama wired, `AI_EMBED_PROVIDER` / `AI_EMBED_MODEL` to switch. No env-switching unlike completions — one vector space is non-negotiable.
- [x] `embeddingClient.ts` — `buildEmbeddingModel()`: Voyage via `@ai-sdk/voyage`, OpenAI via `@ai-sdk/openai`, Ollama via OpenAI-compatible endpoint at localhost. `inputType: 'query' | 'document'` passed via `providerOptions.voyage`.
- [x] `embeddingGateway.ts` — `generateEmbedding()` + `generateEmbeddingBatch()`: cache key includes provider + model (`embed:${provider}:${model}:${text}`), dimension validation after every call, `assertSafeInput` injection guard, `embedding.success` / `embedding.failure` / `cache.hit` events emitted via `@jz92/ai-core`
- [x] `@jz92/ai-core@0.1.1` — `traceId` made optional in `TraceContext` (non-breaking fix); `SCHEMA_VALIDATION` added to `AIErrorCode`
- [x] 53 smoke tests passing (4 new embedding tests + guarded Voyage live-call test)
- [x] Published `@jz92/ai-core@0.1.1` + `@jz92/ai-provider@0.8.0`
- [x] Voyage live-call test guarded behind `VOYAGE_API_KEY` — run in CI to fully close

**This unblocks:** `@jz92/vector` (P1), RAG (#6), and the self-evolving store.



Prerequisite for ALL RAG work. Needs `ai-core` (#5a) done first. **Full architecture: AI-CONCEPTS.md §9 + §11.**

- [ ] Add `generateEmbedding()` + `generateEmbeddingBatch()` behind `ai-core` interfaces
- [ ] `resolveEmbeddingProvider()` — config-routed (`AI_EMBED_PROVIDER`, `AI_EMBED_MODEL`); Voyage default, OpenAI + Ollama wired. Switching providers = one env var change.
- [ ] Decide Voyage integration approach for `ai@7`: community SDK vs direct REST vs OpenAI-compatible endpoint (search before building — same discipline as the cache-control syntax lesson)
- [ ] Cache key includes provider + model + text: `embed:${provider}:${model}:${text}` — prevents a cached Voyage vector being returned when caller expects an OpenAI vector
- [ ] Route through `execute()` spine for retry/timeout/events — embedding-aware usage shape (`inputTokens`, `dimensions`, `modelVersion` — no `outputTokens`)
- [ ] Tests proving observable states (provider resolution, cache hit on repeat embed, batch, dimension field present)
- [ ] Publish as `@jz92/ai-provider@0.7.0` (minor bump — new capability)

**Key design decisions (see AI-CONCEPTS.md §7):**
- **Voyage in BOTH dev and prod** — dimension consistency; the ONE capability that deliberately breaks env-aware routing, and correctly so.
- **Baked in + config-routed** — not plug-your-own-embedder. Consumers are own apps with one provider; premature abstraction otherwise.
- **`model` + `dimensions` in response** — written to pgvector alongside each vector; catches mismatches before they corrupt the store.

### 6. RAG + eval layer + self-evolving store  `[was #6 · HIGH effort · HIGH value · the big one]`
**Not "build our own models."** Retrieval + prompting + evals; model stays Anthropic/Ollama. Needs #5 done first. **Full architecture: AI-CONCEPTS.md §9.**

Build order (dependencies dictate it):
- [ ] Stand up pgvector — one shared Postgres instance, **per-domain tables** (`preference_examples`, `nl2mongo_examples`). Row shape: `{embedding, input, output, model, model_version, created_at}` — model/version columns are the cheap Option-C upgrade path.
- [ ] Build the retrieval flow for the Preference Parser domain (`rag/preferences`): embed input (via gateway) → search own table → assemble few-shot → generate (via gateway) → quality-gated write-back. Start here — RAG's value (consistency) is clearest. Write the `embed → search → format` plumbing inline first.
- [ ] Build the **eval harness** for that domain — fixed test set + scoring script, runs in CI, never in the request path. Turn "I think this is better" into "scored X% higher". This is what makes the write-back loop safe to run.
- [ ] Extract the shared retrieval helper (`lib/retrieval`, configured per domain: table, top-k) — only when the second domain needs it, not before.
- [ ] NL2Mongo domain (`rag/nl2mongo`) — **only if evals show it beats good few-shot** for query generation.
- [ ] **Skip** LangChain / LlamaIndex — hand-build (keeps the "I understand the plumbing" story).

**Boundary test that the layering is right:** if adding a third domain ever requires editing `ai-provider`, the boundary has leaked. Gateway = capabilities; domains = knowledge; the seam = two function calls.

**Layer placement:** embeddings → in `ai-provider` (#5); RAG wiring → in the app using it; evals → standalone harness. Rule: reusable-across-apps → package; app-specific → app.

**The real goal — "self-evolving parsing" (learns from usage, no training):**
```
user interacts → parser produces validated output
  → embed input, store {embedding, input, GOOD output} in pgvector
next similar input → retrieve closest past examples → inject as few-shot
  → model (unchanged) generates grounded in accumulated experience
  → store this too → store grows → retrieval keeps improving
```
- Memory lives in pgvector, NOT model weights. This is RAG, not fine-tuning.
- **Critical caveat — quality gate on what enters the store.** Only store *good* interactions (Zod passed AND confirmed good). Blindly storing everything → retrieves past mistakes → "self-corrupting" not "self-evolving".
- **This is why evals are non-negotiable** — the safety mechanism proving the growing store improves, not degrades, parsing.
- **Honest limit:** improves consistency on inputs *similar to past ones*; does NOT make the model better at genuinely novel inputs (that needs real fine-tuning).
- **Portfolio narrative:** "a learning system that improves from real usage without training."

### 7. Receipt scan → orders → inferred preferences  `[was #8 · HIGH effort · builds on #5+#6; adds vision]`
Upload/scan a receipt → parsed into orders collection against the user → on profile-preferences load, show preferences *inferred* from past shopping.

- [ ] **Vision/OCR:** receipt image → structured order data. New capability for `ai-provider` (multimodal input). Reuses env-aware routing.
- [ ] Persist parsed orders to the orders collection, keyed to the user.
- [ ] **Preference inference:** order history → likely preferences (always buys plant-based → probable vegetarian). Fuzzy-pattern LLM inference.
- [ ] Surface inferred preferences on profile-preferences (clearly marked *inferred*, not user-declared — trust matters).
- [ ] Feeds #6's self-evolving store: confirmed inferences become good examples.

### 8. Product direction: CRM / campaign / email  `[was #4 · HIGH effort · product pivot · scope before building on it]`
Reframes NL2Mongo's *purpose*. Moved later: the low-effort NL2Mongo work (#2, #3) is valuable regardless of the pivot, and the migration is plumbing (survives a schema change). Scope this only when ready for the high-effort product work.

- [ ] Scoping conversation: what does the CRM/campaign use case actually need?
- [ ] Decide target schema (email-centric) before hardening APIs around it
- [ ] The "nudge users who buy food but have no dietary prefs" case is a concrete instance — bring it here.

### 9. NL2Mongo, rebuilt agentically  `[was #7+#9 merged · HIGHEST effort · closes agent gap #2]`
Rebuild NL2Mongo as a multi-step agent rather than a single RAG/extraction call.

**Justification (the defensible one):** closes skill gap #2 (real multi-step agent architecture) with a *genuine* use case. Natural agentic loop: generate query → run → if zero results, reformulate → if too many, ask to narrow → summarise. Real branching + state = what agents are for.

- [ ] Build the agentic loop (hand-built on `ai-provider`, or LangGraph on top — compose, don't ditch: wrap `ai-provider` underneath, keep routing/caching/observability)
- [ ] Only adopt LangChain/LangGraph's default wrappers if a team is already standardized on that stack (consistency > my layer's rigor)

> **On the original reasoning ("wider context windows will absorb RAG/orchestration, so build agents to prepare") — shaky, don't let it drive architecture:** (a) Wider context ≠ RAG obsolete — retrieval is about *relevance*, not just *fit*. (b) "Agents instead of RAG" is a category error — RAG gets context *in*; agents handle *flow*. (c) "Plumbing gets absorbed" taken seriously argues against `ai-provider` existing — contradicts the strategy. **Build agentically to close gap #2 — NOT because RAG is becoming obsolete.** An interviewer who knows the space will challenge the obsolescence claim.

---

## Platform roadmap — @jz92/* packages

The long-shot vision: a composable TypeScript AI platform where each package is independently useful, independently versioned, and publishable. **Full vision + dependency rules: AI-CONCEPTS.md §11.**

Build order is strictly downward — each package only depends on packages above it in this list.

### P1. @jz92/vector  `[after #5b · provider-agnostic vector stores]`
- [ ] `VectorStore` interface in `ai-core` (insert, search, delete)
- [ ] pgvector implementation (right-sized first — no new managed service)
- [ ] Row shape: `{embedding, input, output, model, model_version, created_at}` — model/version cols are the dimension-consistency insurance
- [ ] Per-domain table isolation (no cross-domain vector reads)
- [ ] Pinecone / Weaviate adapters deferred until scale demands it

### P2. @jz92/retrieval  `[after P1 · chunking, retrieval, reranking]`
- [ ] Chunking strategies (fixed-size, sentence, semantic)
- [ ] Similarity search (top-k, threshold filtering)
- [ ] Quality-gated write-back (only good outputs enter the store — the self-evolving store mechanism)
- [ ] Reranking (cross-encoder or LLM-as-judge) — deferred, add when retrieval quality plateaus
- [ ] `lib/retrieval` written in-app first, extracted here when second domain needs it (right-sizing)

### P3. @jz92/prompts  `[after P2 · prompt registry]`
- [ ] Named, versioned prompt templates
- [ ] Variable interpolation
- [ ] Few-shot example injection (consumed by `retrieval` for RAG prompt assembly)
- [ ] Prompt diffing — compare two versions of a prompt against the eval dataset

### P4. @jz92/evals  `[parallel to P2 · golden tests + benchmarks]`
- [ ] Golden test dataset format (input, expected output, scoring strategy)
- [ ] Scoring strategies: exact_match, partial_credit, semantic_similarity, LLM-as-judge
- [ ] CI runner — fails build if score drops below baseline
- [ ] Regression test for every real bug found (e.g. "test you meat preference" → expected: isEmpty)
- [ ] Benchmark across prompt versions and model changes

### P5. @jz92/tools  `[before agents · tool registry]`
- [ ] Tool definition interface (name, description, schema, handler)
- [ ] Tool registry with lookup
- [ ] MCP adapter (wraps an MCP server as a tool — reuses Jira MCP work)

### P6. @jz92/agents  `[after P2+P3+P5 · agent runtime]`
- [ ] ReAct loop (reason → act → observe → repeat)
- [ ] Planner (decompose a goal into steps)
- [ ] Supervisor (multi-agent coordination)
- [ ] NL2Mongo agentic rebuild is the first consumer (milestone #9)
- [ ] Hand-built first; LangGraph wrapping as an option if the complexity genuinely warrants it

---

## Prioritised skill gaps (from career strategy)
1. **RAG with vector search / pgvector** — largest gap → tasks #5 (embeddings) + #6 (RAG)
2. **Real multi-step agent architecture** — LangGraph *concepts*, hand-built → task #9
3. **Evals / observability** — tasks #1 (observability, done) + #6 (evals)

---

## The AI landscape — where I sit

Split for interviews: "deep" vs "conversant." Being able to say *why* you're conversant-not-deep on the ML tools is itself a strong signal.

### Deep / hands-on (my lane — product/application layer)
| Tool / concept | What it is |
|---|---|
| **RAG** (pattern) | Retrieve relevant context → inject into prompt → generate. A technique, not a library. |
| **pgvector** | Postgres extension for vector similarity search. Right-sized vector store — no new service. |
| **Vercel AI SDK** | Lightweight, TS-idiomatic orchestration. The framework to reach for *if* one is needed. |
| **Evals** | Test harness scoring output quality against a fixed set. Turns vibes into numbers. |
| **LangGraph** (concepts) | Stateful multi-step agent workflows as graphs (loops, branching, human-in-loop). Understand it; build small versions myself. |

### Conversant / recognise (ML-engineer layer — deliberately not chasing)
| Tool | What it is | My line |
|---|---|---|
| **LangChain** | Heavy general-purpose LLM orchestration framework (Python-first, JS port). | "Understand what it abstracts; hand-built my own routing/caching/RAG to show I get it." |
| **LlamaIndex** | RAG-specialist framework — indexing + retrieval over your data. | "It implements RAG for you; I build that layer with pgvector." |
| **AutoGen / CrewAI** | Multi-agent frameworks — several role-playing agents collaborating. Newer, buzzy, often overkill. | "Know the pattern; reach for it only when a task genuinely needs multiple agents." |
| **Pinecone** | Managed hosted vector DB. The 'easy button' for production RAG at scale. | "Where I'd graduate from pgvector at scale." |
| **Weaviate** | Open-source vector DB, more built-in features (hybrid search). | "Alternative to Pinecone; self-host or cloud." |
| **Transformers** (HF lib) | Python lib to load/run/fine-tune actual models. | "ML-engineer territory — I'm on the application layer." |
| **Hugging Face** | The 'GitHub of ML models' — hub of models/datasets/demos. | "I *use* it to pick open models; I don't train." |
| **MLflow** | Experiment tracking / model lifecycle for ML teams. | "Experiment tracking for training — adjacent to my focus." |

### Two flows (the mental model)
- **Flow A** (input → structured): RAG + prompt + Zod. Already have prompt+Zod; RAG is the upgrade.
- **Flow B** (results → plain English): just a second optional LLM call. No framework needed.
- **Frameworks**: LlamaIndex would do Flow A's RAG for you; LangGraph only matters once flows become multi-step loops. Skipping both for now.
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

### 6. RAG + eval layer + self-evolving store  `[✅ done · was #6]`
**Not "build our own models."** Retrieval + prompting + evals; model stays Anthropic/Ollama. **Full architecture: AI-CONCEPTS.md §9.**

**Done:**
- [x] Atlas Vector Search index created (`preference_examples_vector_idx`, 1024 dims, cosine similarity)
- [x] `rag/db.ts` — collection accessor using shared `connectDB()`, `VectorEntry` shape, constants
- [x] `rag/store.ts` — quality-gated write: embed with `inputType: 'document'`, dimension validation, fire-and-forget (never blocks the parse response)
- [x] `rag/retrieve.ts` — embed with `inputType: 'query'`, `$vectorSearch` aggregation, formats top-K as few-shot examples for the system prompt
- [x] `parseService.ts` — retrieve before model call (enriched system prompt), store after good result (quality gate: `!isEmpty && lowConfidenceItems.length === 0`)
- [x] **Eval harness built and run:**
  - `evals/testCases.ts` — 10 fixed cases covering positive/negative/ambiguous/multi-category/edge
  - `evals/scoring.ts` — 4 metrics: accuracy, consistency, hallucination rate, empty rate
  - `evals/run.ts` — manual + CI gate modes, baseline comparison, threshold enforcement
  - `npm run evals` / `evals:update-baseline` / `evals:ci`
- [x] **RAG improvement measured and proven:**
  - Baseline (zero-shot, small store): accuracy 0.733, consistency 0.667
  - With RAG (store seeded by eval run): accuracy 1.000, consistency 1.000
  - App-cache hit rate grew 6.5% → 47.3% during consistency runs
- [x] **`tc-07` finding** — "I like comfortable clothes" → model extracted Casual (score 0.629, weakly related examples injected). Confirms score threshold guardrail is needed. Evals doing their job.

**Confirmed working:**
```
[rag/retrieve] Found 3 similar examples (top score: 0.901)
tokens in: 532  ← few-shot examples injected into system prompt
```

**Still to build:**
- [ ] **Eval harness** — the safety mechanism. Fixed test set + scoring to prove RAG improves consistency rather than degrading it. Without this, "better" is a vibe not a fact.
- [ ] NL2Mongo RAG — only if evals show it beats good few-shot for query generation
- [ ] Extract `rag/` into `@jz92/retrieval` (P2) when a second domain needs the same pattern

**Deferred hardening (implement after current milestones — see AI-CONCEPTS.md §14):**
- [ ] Score threshold in `retrieve.ts` — only inject examples above `MIN_SCORE` (e.g. 0.7); novel inputs get zero-shot treatment
- [ ] Token-budget the injected examples — `MAX_EXAMPLE_TOKENS` ceiling so example size growth doesn't silently raise token overhead
- [ ] Store deduplication in `store.ts` — check similarity before insert (`DEDUP_THRESHOLD: 0.95`); keeps store diverse, retrieval quality high

**Long-shot future (significant optimisations, not blocking):**
- [ ] **Semantic cache** — if Atlas returns score ≥ 0.95, return stored output directly without calling the LLM at all. Treat the vector store as a semantic cache on top of the model. Hit rate grows as the store fills with real user data. Four layers: exact cache (BoundedCache) → semantic cache (0.95+) → few-shot RAG (0.7-0.95) → zero-shot (<0.7).
- [ ] **Embedding cache TTL tuning** — embeddings are stable (vector for "I love Nike" doesn't change unless you change the model). Consider longer TTL (`AI_EMBED_CACHE_TTL_MS=3600000`, 1hr) vs completions (5 mins). Also fix `inputType` in cache key (`embed:${provider}:${model}:${inputType}:${text}`) — current key doesn't distinguish query vs document vectors for same text.
- [ ] **Redis/Upstash for cross-session embedding cache** — `BoundedCache` is in-memory, resets on deploy. Popular embedding inputs (common preference phrases) would benefit from a persistent cross-session cache. Upgrade path already designed in `cache.ts` comments.

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

### P1. @jz92/vector  `[✅ done · v0.1.0 published]`
Infrastructure-agnostic — never imports `@shared/db` or knows about MongoDB specifically. Accepts a `getCollection()` function from the caller; operates on whatever collection it's handed.

- [x] `VectorStore` interface in `ai-core` (insert, search, delete) — generic over output type `T`
- [x] Atlas implementation (`createAtlasVectorStore`) — right-sized, no new managed service
- [x] Row shape: `{embedding, input, output, model, model_version, created_at}` — model/version cols are the dimension-consistency insurance
- [x] Per-domain collection isolation (caller supplies collection name, package never hardcodes one)
- [x] **Full entry/exit observability:** `insert.success/failure`, `search.success/empty/failure`, `delete.success/failure` — every event carries `durationMs`, `traceId`, result metadata
- [x] 15 smoke tests — fake `AtlasCollection`, no real DB needed; covers success/failure paths, score threshold filtering
- [x] Pinecone / Weaviate adapters deferred until scale demands it — same package, new sibling file, no breaking change

### P2. @jz92/retrieval  `[✅ done · v0.1.0 published]`
Domain-agnostic retrieval engine. Takes a `VectorStore`, an injected `embed` function, a `formatExample` callback, a `qualityGate` predicate, and a `topK` — everything domain-specific is injected, nothing is hardcoded.

- [x] `retrieve(input, traceId)` — embed (injected `embed` fn) → search (via `@jz92/vector`) → format as few-shot text. Emits `retrieved` with composite durationMs
- [x] `store(input, output, qualityGate, options, traceId)` — check gate → embed (document) → insert. Emits `quality.gate.passed/failed` and `store.success/failure`
- [x] **`embed` injected, not hard-imported from `ai-provider`** — zero dependency on `ai-provider`, fully testable in isolation with a fake embedder
- [x] Guardrails included from day one, defaulted to no-op: `minScore` (score threshold), `maxExampleTokens` (token budget) — config change to tune, not a code change
- [x] Config shape validated against Preference Parser (`ParsedPreferences`) AND NL2Mongo (`GeneratedQuery`) output types before finalizing the interface
- [x] Text-only for now — image/multimodal input (#7 receipt scanning) is an explicit future extension
- [x] 19 smoke tests — fake `embed` + fake `VectorStore`; covers both guardrails, quality gate pass/fail, fire-and-forget failure handling
- [x] Reranking (cross-encoder or LLM-as-judge) — deferred, add when retrieval quality plateaus

**Migration completed and proven:**
- [x] `portfolio-lab`'s inline `rag/db.ts` + `rag/store.ts` + `rag/retrieve.ts` replaced with `rag/retriever.ts` wiring `@jz92/vector` + `@jz92/retrieval`
- [x] **Eval parity confirmed against real Atlas + real Voyage** (not just smoke test fakes): accuracy 1.000, consistency 1.000, hallucination 0.000, empty rate 0.000 — identical to pre-migration baseline. `tc-07` fails identically (known gap, unrelated to migration).
- [x] `ai-core` extended along the way: `VectorStore` interface, `VectorSearchFailureEvent`/`VectorInsertFailureEvent`/`VectorDeleteEvent`, `RetrievalStoreEvent` — all following the entry/exit discipline from AI-CONCEPTS.md §16

**Consumers landing on this package next:**
1. ~~Preference Parser~~ — done, migrated, proven
2. NL2Mongo (once RAG is justified by evals — #6 note)
3. Receipt scanning (#7 — needs the image-input extension first)

### P2.5. Live observability streaming page  `[after all 3 consumers integrated · long-shot]`
A webpage showing the architecture diagram with real-time pulses traversing each functional box as live requests flow through the system — plus a log stream. Opens in a separate tab from the Preference Parser page; watching one triggers visible activity in the other.

**What must exist first (in place by P1/P2):** every package (`ai-provider`, `vector`, `retrieval`) emits entry/exit events with `traceId`, `durationMs`, and enough detail to reconstruct the full request waterfall — this is the data source. No new instrumentation needed by the time this milestone starts, assuming P1/P2 hold the observability discipline.

**What's actually new here (the real build):**
- [ ] **A relay subscriber** — a long-lived process/module that calls `onEvent()` once and forwards every event out of the Node.js process (today's event bus is in-process only; a browser tab cannot subscribe to it directly)
- [ ] **A transport** — Server-Sent Events (SSE) from a `/api/events/stream` route; simplest fit for one-directional server→browser push. WebSockets are the alternative if bidirectional ever matters
- [ ] **The visualizer page** — renders the architecture (gateway, vector, retrieval, quality gate, etc. as boxes), animates a brief pulse on the matching box for each incoming event using `event.source`/`event.type`; a single `traceId` can be followed lighting up boxes in sequence, showing one request's real path end to end
- [ ] **A log panel** alongside the diagram — raw event stream, human-readable, filterable by `traceId`/`source`
- [ ] **Revisit `ai-provider`'s current observability** before this milestone starts — confirm its `AIEvent` type has fully migrated to `ai-core`'s `PlatformEvent` schema (traceId, durationMs, consistent `source`/`type` naming) so the visualizer doesn't need special-case handling for one package's events looking different from the others

**Why this is genuinely achievable, not just aspirational:** the event schema already carries everything needed (`timestamp` for ordering, `traceId` for request-path reconstruction, `durationMs` for pulse duration/intensity). This milestone is purely additive infrastructure on top of P1/P2 — no redesign of `ai-core`, `ai-provider`, `vector`, or `retrieval` required if the observability discipline holds through those builds.

### ai-core + ai-provider bug fixes — event bus + traceId propagation  `[✅ done, verified end-to-end]`

**Bug 1 — `ai-core` event bus module-instance isolation.** `emit`/`onEvent` used a plain module-level `subscribers` array. Next.js (Turbopack/webpack) can load `ai-core` in separate bundle contexts for different parts of the app (e.g. `instrumentation.ts`'s runtime vs an API route) — each getting its own module instance with its own empty `subscribers` array. Proven concretely: a manual `emit()` call from inside an API route never reached the subscriber registered in `instrumentation.ts`, even though both imported the same published package.

**Fix:** `subscribers` moved to `globalThis` (keyed `__jz92AiCoreSubscribers__`), same defensive pattern `ai-provider`'s `onAIEvent` already used for exactly this class of bug. Every bundle context shares one process-wide `globalThis`, guaranteeing a true singleton bus regardless of how the bundler splits modules.

**Bug 2 — `ai-provider` gateway reading the wrong field.** Found while verifying bug 1's fix: `gateway.ts`'s `generateStructured`/`generatePlainText` read `options.correlationId` for events, but every caller (including `parseService.ts`) passes `traceId`. Since nothing ever populated `correlationId`, completion events emitted with an empty trace — breaking the unified trace exactly at the LLM-call step.

**Fix:** `gateway.ts` now reads `options.traceId` at both call sites, threaded through `execute()` (param renamed for clarity). `AIEvent.correlationId` field itself unchanged — only the value flowing into it corrected.

- [x] `ai-core/events.ts` — rewritten to use `globalThis`; 21 tests pass unchanged
- [x] `ai-provider/gateway.ts` — reads `traceId` correctly; 53 tests updated + passing
- [x] Bumped and published: `ai-core@0.1.6`, `ai-provider@0.8.3`
- [x] Pulled into `vector`, `retrieval`, `portfolio-lab`
- [x] **Verified end-to-end in production dev server:** one complete request trace, every layer sharing the same `traceId` — `ai-provider.embedding.success` (604ms, dims:1024) → `vector.search.success` (151ms, score:1.000) → `retrieval.retrieved` (755ms, count:3) → `ai-provider.completion.success` (4394ms) → `retrieval.quality.gate.passed` → `ai-provider.cache.hit` → `vector.insert.success` (47ms) → `retrieval.store.success` (47ms)

**Known tradeoffs of the `globalThis` fix (accepted deliberately, not blindly):**
- Doesn't fix the root cause (bundler creating multiple module instances) — targeted workaround for this one piece of state, same as `ai-provider` already accepted for `onAIEvent`
- Reintroduces global-mutable-state hazards: collision risk with other code writing the same key (mitigated by a namespaced key), and any code in-process can mutate subscribers directly, bypassing `emit`/`onEvent`
- Test parallelization caveat: if tests ever run concurrently within one process, `clearSubscribers()` in one test could wipe another's subscribers mid-run (not an issue today — smoke tests run sequentially)
- Does NOT provide cross-invocation persistence in serverless — `globalThis` only survives within one running process; Vercel functions can still cold-start fresh between requests

**Deferred enhancement — named/identified subscribers:** currently `onEvent(subscriber)` takes an anonymous function; multiple subscribers coexist correctly (array, not single-slot — deliberate, since `ai-provider`'s single-slot `onAIEvent` silently replaces any previous handler, a real pre-existing limitation there). Future improvement: `onEvent(id: string, subscriber)` so subscribers carry identity — useful for debugging ("who's currently subscribed?") and replacing a specific subscriber by name. Not needed today.



### @jz92/telemetry  `[✅ done · v0.1.2 published · new platform package]`
Built during the observability debugging session — a consumer of `ai-core`'s event bus that formats a per-request trace summary, replacing what would otherwise be ad-hoc console logging duplicated in every app.

- [x] `attachTraceSummary(config?)` — subscribes to `ai-core`'s `onEvent` once, buffers events by `traceId` (`globalThis`-backed, same singleton pattern as `ai-core`'s own fix — applied proactively this time, not discovered the hard way)
- [x] `printTraceSummary(traceId)` — prints a formatted box: total wall time + per-stage breakdown, composite events (`retrieval.retrieved`, `retrieval.store.success`) shown with their known sub-components (`embed text`, `vector search`, `vector insert`) as nested/indented rows
- [x] Percentage math computed only over top-level (non-composite-child) rows — avoids the double-counting bug where a naive flat sum would exceed 100% because a parent's duration already includes its children's
- [x] `STAGE_HIERARCHY` covers all current platform event types; extensible via `labels` config for future event sources (e.g. `@jz92/agents`) without forking the package
- [x] Stale-buffer pruning (default 5min) — traces that never get `printTraceSummary`'d (e.g. an error path) don't leak memory
- [x] Double-attach guard — calling `attachTraceSummary()` twice doesn't duplicate the subscription
- [x] 13 smoke tests — buffering, cleanup, double-attach, unknown-traceId safety, custom labels, and specifically the nested-grouping + percentage-isolation math
- [x] Wired into `portfolio-lab`: `instrumentation.ts` calls `attachTraceSummary()` once; the parse route calls `printTraceSummary(traceId)` after `inferPreferences` resolves
- [x] **Verified in production logs** — nested box correctly showing `retrieval` (1492ms, 28%) with `embed text`/`vector search` children, `llm completion` (3750ms, 72%), summing to 100% at the top level

**Where this sits in the platform stack:** a fifth package alongside `ai-core`/`ai-provider`/`vector`/`retrieval` — not a P-numbered milestone since it emerged from the observability debugging work rather than the original planned sequence, but genuinely reusable across any app in the monorepo going forward.


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
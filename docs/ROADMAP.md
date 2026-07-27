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
- [x] **H&M empty-result carried over from #2 — resolved.** Confirmed via eval work below: not a data bug, was part of the broader empty-filter collapse fixed alongside the eval baseline work.

**NL2Mongo eval harness built + a real production bug found and fixed (2026-07-16 session):**
- [x] `evals/testCases.ts` — 12 cases against live 14-doc `customers` collection: baseline positives, empty-set (Sparks members / totalOrders>0 — both genuinely 0 in seed data), explicit negation (`optedIn:false`), absence negation (item never mentioned), AND/OR combinations, mixed field-type conditions (top-level bool + nested elemMatch)
- [x] `evals/scoring.ts` — precision/recall computed **live** against real DB at eval time (LLM's filter with its own limit vs. ground-truth filter unlimited) — drift-proof by construction, never needs updating as data changes
- [x] `evals/run.ts` — same manual/CI-gate/baseline-diff pattern as Preference Parser's harness

**Bug found: `generateStructured` was returning `{filter: {}}` on almost every query — a total, previously-invisible failure, not a minor inaccuracy.** Root-caused methodically:
  1. Ruled out "local model too weak" — Claude Sonnet in production produced the *identical* empty filter
  2. Ruled out "prompt doesn't teach the task" — `generatePlainText` with the real `SCHEMA_CONTEXT` produced a perfect filter in free text
  3. Isolated to: **`z.union([...])` nested inside `z.record(...)`** breaks Ollama's structured-output mode specifically — confirmed via a minimal flat-schema diagnostic that succeeded where the union-in-record schema failed
  4. First restructure (flat conditions, but split across 4 parallel arrays by type) — partial improvement, still too much structural surface, model left arrays empty inconsistently
  5. **Final fix: single unified `conditions` array, one flat object shape, discriminated by a `type` field** (`equality`/`elemMatch`/`comparison`/`absence`) — this is the shape that finally worked reliably. Filter assembly moved into deterministic code (`buildMongoFilter()`), not left to the LLM to produce Mongo syntax directly.
  6. Added `coerceValue()` — validates equality/comparison values match the target field's real type (e.g. `sparksMember` must be boolean); prevents a Mongoose `CastError` crash when the model sends a mismatched type instead of silently breaking the request
  7. Capped `limit` at `z.number().int().min(1).max(100)` — model was inventing absurd values (`1000000000000000`) trying to express "no limit"

**Baseline progression (same live-scored eval set throughout):**
```
Original (broken, empty-filter collapse):  precision 0.283 / recall 0.485 / empty-handling 0/3
After single-array restructure + prompt fixes:  precision 1.000 / recall 1.000 / empty-handling 3/3 — ALL 12 CASES PASS
```
- [x] Two real prompt-tuning regressions caught and fixed along the way (fixing the "any preference, no name" case briefly broke `nlm-07`/`nlm-08`'s negation handling — caught immediately by the eval re-run, fixed with an explicit contrastive example distinguishing `elemMatch`+`optedIn:false` from `absence`)
- [x] **Caveat worth remembering:** `nlm-08` briefly *appeared* to be an unfixable model-capability ceiling (identical wrong output across two consecutive eval runs, even after the contrastive prompt fix was confirmed present in `SCHEMA_CONTEXT`). Root cause of that false read: `generateStructured`'s `cacheKey: nl2mongo:${question}` — the completion cache served the stale pre-fix response for that exact question string, since prompt changes don't invalidate an existing cache entry. **When iterating on prompts during eval runs, the completion cache can mask whether a fix actually worked** — a cleared cache (or a temporarily varied `cacheKey`) is needed to get a true read on each prompt iteration.
- [x] Baseline locked at **1.000 / 1.000 / 3-3 — all 12 cases passing**

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

**Parked enhancement — gate storage on user acceptance, not just model confidence (two related issues, one fix each):**

*Issue A — store writes fire before the user ever sees the result.* Today: `parsePreferences` → automated quality gate (`!isEmpty && !lowConfidence`) → store → *then* return to the user. `savePreference` (the user's actual confirm/edit action) is a separate call that never touches the RAG store. So "good" is entirely self-reported by the model — never human-confirmed. `tc-07` is proof this isn't hypothetical: the model was confident about extracting `Casual` from "comfortable clothes," passed the automated gate, and would've been stored as a template for future users on a genuinely debatable extraction.
- [ ] Move the `retriever.store(...)` call from `parsePreferences` to `savePreference` — store only fires once a human has actually confirmed the result, not on model self-assessment alone. Requires the original free-text input to travel from parse → save (not currently in `handleSavePreference`'s payload).

*Issue B — even with user acceptance, unrelated manual edits would pollute the store.* If a user parses "I love Nike casual styles," then manually adds `Vegetarian: true` (never mentioned in the text) before saving, storing `(original text → final saved state)` would teach the store a false correlation — the input text said nothing about diet, but the stored example would claim it implied one. Retrieved later for a similar-sounding input, this could cause hallucination in the opposite direction (injecting a fabricated correlation the RAG loop was designed to prevent).
- [ ] **Chosen approach (Option A — strict match):** only call `retriever.store(...)` if the user's final saved output is byte-for-byte identical to what the model proposed. Any edit at all (addition, removal, correction) means don't store — safest floor, given the store is still small and avoiding poison matters more than maximizing volume right now.
- [ ] *(considered, not chosen yet)* Option B — field-level diff, store only the subset of categories/items the user didn't touch. More data captured, meaningfully more complex (needs per-category diffing). Revisit if Option A's strict-match rate turns out too low (few inputs ever qualify, starving the store of new examples) — that'd show up as a flat/slow-growing store size in evals, worth watching for rather than guessing at upfront.
- [ ] *(considered, not chosen)* Option C — per-item provenance tagging (`model` / `user-added` / `user-removed`), only store still-`model`-tagged unedited items. Most precise, most implementation work — likely overkill unless Option B also proves insufficient.

**Long-shot future (significant optimisations, not blocking):**
- [ ] **Semantic cache** — if Atlas returns score ≥ 0.95, return stored output directly without calling the LLM at all. Treat the vector store as a semantic cache on top of the model. Hit rate grows as the store fills with real user data. Four layers: exact cache (BoundedCache) → semantic cache (0.95+) → few-shot RAG (0.7-0.95) → zero-shot (<0.7).
- [ ] **Embedding cache TTL tuning** — embeddings are stable (vector for "I love Nike" doesn't change unless you change the model). Consider longer TTL (`AI_EMBED_CACHE_TTL_MS=3600000`, 1hr) vs completions (5 mins). Also fix `inputType` in cache key (`embed:${provider}:${model}:${inputType}:${text}`) — current key doesn't distinguish query vs document vectors for same text.
- [ ] **Redis/Upstash for cross-session embedding cache** — `BoundedCache` is in-memory, resets on deploy. Popular embedding inputs (common preference phrases) would benefit from a persistent cross-session cache. Upgrade path already designed in `cache.ts` comments.

### 7. Receipt scan → orders → inferred preferences  `[was #8 · HIGH effort · builds on #5+#6; adds vision · IN PROGRESS, 2 of 3 pieces done]`
Upload/scan a receipt → parsed into orders collection against the user → on profile-preferences load, show preferences *inferred* from past shopping.

**Piece 1 — Vision/OCR + orders `[✅ done]`**
- [x] **Vision capability added to `ai-provider`:** `generateStructuredFromImage` + `resolveVisionProvider()` — mirrors `resolveProvider()`'s exact pattern, Ollama+llava for dev / Claude Sonnet for production. Published as `ai-provider@0.9.0`.
- [x] Two real bugs found + fixed during Google/Gemini testing (see AI-CONCEPTS.md §18/§19): `.output` accessed outside `execute()`'s try/catch (cross-provider risk, also affected `generateStructured`), and Gemini's thinking-tokens consuming the entire output budget (`thinkingConfig.thinkingBudget: 0` fix)
- [x] **Vision provider pinned to Anthropic** — empirically proven the only zero-variance option across `llava` (fabricated a wrong retailer entirely), Gemini (residual item-extraction non-determinism even after both bugs fixed), and Claude (perfect on every test)
- [x] `Order`/`IOrderItem` Mongoose model (`libs/shared/models/src/Order.ts`), following the existing `_id: String` convention — confirmed no `Customer` document creation exists anywhere in the codebase (customers are client-only via `getClientId()`/localStorage, no auth), so `Order.customerId` deliberately has no FK-style constraint
- [x] **Flow split into extract → confirm → save** (not extract+save combined) per explicit product requirement — nothing persists until the user confirms the extraction in a modal popup. Three routes: `/api/extractReceipt`, `/api/saveOrder`, `/api/orders` (history fetch)
- [x] `libs/receipt-scanner/` — new lib (api + ui), own page, own route, UI styled to match the Preferences page's card/button language
- [x] Verified end-to-end with real receipts (M&S, Sainsbury's) — scan → confirm modal → save → correctly rendering in order history

**Deliberately deferred — RAG for vision extraction `[considered, scoped out for now — not an oversight]`**
Two real obstacles, not just "haven't gotten to it":
1. **No image-embedding capability exists in the platform.** `@jz92/retrieval`'s whole mechanism needs to embed the *input* to find similar past examples — but `resolveEmbeddingProvider()`/Voyage is text-only. Real image-similarity retrieval needs a multimodal embedding model (CLIP-style), a genuinely new platform capability, not a wiring exercise like NL2Mongo was.
2. **Even if solved, unclear it would help.** For text tasks, similar past *inputs* teach phrasing/structure patterns that generalize. For receipts, every receipt's actual content (items, prices) differs — a similar-looking past M&S receipt doesn't help read *this week's* specific items. The few-shot value RAG provides elsewhere doesn't map cleanly onto "here's a different picture of different groceries."
- **If pursued later:** static multi-image few-shot (2-3 canonical receipt→JSON example pairs included directly in every vision prompt) would likely capture most of the real benefit — teaching extraction *format*, not content — without needing image embeddings at all. Worth trying before building real image-embedding infrastructure.
- **Why not urgent:** Claude is already at 100% accuracy on every real test this session — no current gap for RAG to close, unlike NL2Mongo where it was added for architectural validation despite already being at 100%, since reuse there was trivial. Reuse here isn't trivial.

**Piece 2 — Preference inference `[✅ done, built, debugged, and verified end-to-end in the browser]`**
- [x] `inferenceService.ts` — reads a customer's `Order` history (last 20, sorted recent-first), calls `generateStructured` with the exact same `PreferencesSchema`/`normalise`/`getQuality` as text parsing (reused, not duplicated) — same `ParsedPreferences` shape flows through both paths
- [x] `handleGetPreferences` returns TWO separate objects: `preferences` (user-declared, unchanged) and `inferredPreferences` (computed from orders, `null` when no order history or nothing survives the quality gate) — computed on-the-fly per request, per explicit decision
- [x] Frontend: reused the existing generic `PreferenceModal` (built for text-parse confirmation) for the inferred-preferences popup too — no second modal component needed, just a second set of `panels` built from non-empty inferred categories
- [x] Threaded through `usePreferencesManager`/`preferencesService.fetchPreferences` — popup shows automatically once loading finishes, if `inferredPreferences` is non-null

**Two real prompt bugs found via actual testing against real scanned receipts (M&S, Sainsbury's) — not hypothetical, both confirmed in logs:**

1. **Retailer-name-as-brand confusion.** The model tried to infer `brands: "Sainsbury's"` / `brands: "M&S"` — treating the grocery retailer itself as a fashion-brand preference. `normalise()`'s whitelist correctly caught and dropped these (the guardrail worked exactly as designed), but the *result* was an empty inference every time, since nothing redirected the signal to where it actually belonged. **Fix:** explicit prompt instruction — retailer name is never a brand; a grocery retailer instead supports `categories: "Food & Grocery"`.

2. **Requested but deliberately NOT implemented — inferring dietary *absence* from ordinary purchases** (e.g., "receipt has chicken → infer `Vegetarian: optedIn: false`"). **Why this was scoped out, not just missed:** (a) buying meat once doesn't mean a customer wants to be flagged as explicitly anti-vegetarian in their profile — that's a much stronger, more presumptuous claim than the purchase supports; (b) this is the identical trap as NL2Mongo's `absence`-vs-`elemMatch` negation distinction — inferring a *negative* from the *absence* of a positive signal is a known hallucination-risk pattern, not a new one. **Decision: dietary inference is positive-signal-only** — only an item explicitly labeled with a dietary term (e.g. "Gluten Free Bread") supports an inference, and only as `optedIn: true`. Ordinary items never affect dietary preferences either direction. Same "omit rather than guess" philosophy as the receipt scanner and the original preference parser's hallucination guardrails — applied consistently a third time now.

- [x] **Verified end-to-end in the browser (2026-07-27):** scanned a real Sainsbury's receipt → saved to order history → loaded the Preferences page → popup correctly appeared showing exactly one panel ("Categories") with "Food & Grocery" pre-checked, matching the API response precisely — `dietary`/`events`/`style`/`brands` all correctly empty, no hallucinated brand or retailer names, no risky negative dietary inference. Full chain (scan → confirm → save → infer → confirm → save) proven working, not just unit-tested in isolation.
- [ ] Feeds #6's self-evolving store: confirmed inferences become good examples (deferred until inference is confirmed stable in real use)


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

### 10. Preference correlation discovery + marketing insight  `[new · parked · a genuinely different capability from NL2Mongo]`
**The idea:** discover non-obvious correlations across preference data — e.g. "customers who opted into Books are unusually likely to also opt into Mother's Day" — then use that to drive targeted marketing timing/segments. Surfaced while scoping NL2Mongo RAG; explicitly NOT built as part of that work, since it's a different problem needing a different architecture.

**The key realization — this is NOT an LLM task at its core.** NL2Mongo translates one sentence into one query; it cannot discover a correlation nobody thought to ask about. Finding "Books buyers → Mother's Day" is **association-rule mining** (the "customers who bought X also bought Y" technique) — pure statistics over the preference arrays, computed once across the whole dataset. No model needs to "read" the data to find this.

**Where the LLM's role actually, defensibly fits — three spots, all downstream of the stats:**
1. **Explaining a computed correlation in plain English** — turn `lift(Books, Mother's Day) = 2.3, confidence = 71%` into a human-readable insight + suggested action. Low-risk, genuinely good use of a completion call.
2. **Generating campaign copy** once a segment is identified — "write a marketing email for book-buying customers ahead of Mother's Day." Classic generative task, LLMs are good at this.
3. **An NL2Mongo-style query layer ON TOP of a precomputed correlations collection** — "what correlates with Mother's Day?" → same NL→query pattern you already have, just pointed at `preference_correlations` instead of `customers` directly.

**The architecture, if built:**
```
1. Scheduled job (cron) — association-rule mining across all preference
   category pairs → writes to a new `preference_correlations` collection:
   { itemA, itemB, support, confidence, lift, computedAt }
   Pure aggregation/stats. No AI call.

2. NL2Mongo-style layer on the NEW collection — reuses the existing
   generateStructured + Zod pattern, just a different schema/collection target.

3. LLM completion — takes top correlations → plain-English insight
   + campaign suggestion.
```

- [ ] Association-rule mining job — compute support/confidence/lift across all preference-category pairs, write to `preference_correlations`
- [ ] Decide computation trigger: scheduled cron vs on-demand vs triggered on data-volume threshold
- [ ] NL query layer over the correlations collection (reuses existing NL2Mongo pattern, new target schema)
- [ ] LLM summarization call: correlation numbers → plain-English marketing insight
- [ ] Optional: campaign copy generation once a segment is identified

**Explicitly does NOT touch:** `@jz92/vector`, `@jz92/retrieval`, or anything RAG-related — this is a separate data pipeline with an LLM layered on top for explanation/generation, not retrieval. Keep it that way; don't force-fit it into the RAG architecture.

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

**Consumers landing on this package:**
1. ~~Preference Parser~~ — done, migrated, proven
2. ~~NL2Mongo~~ — **done, second consumer validated (2026-07-17)**. Notably wired in *after* prompt engineering alone had already gotten NL2Mongo's eval set to 100% precision/recall — RAG was added deliberately for architectural validation, not because evals demanded it (see #3's eval section for the full prompt-engineering journey that got there first). Result: RAG held at 1.000/1.000/3-3, zero regression, token counts growing as the store fills (856→1042 across the run) confirming real retrieval is happening. **This is the actual proof `@jz92/retrieval`'s generic config shape works** — validated against two structurally different domains (`ParsedPreferences` objects vs. `ExtractedQuery` condition arrays), not just designed on paper against one. One real implementation lesson: had to extract `libs/admin/api/src/types.ts` to break a circular import between `queryService.ts` and `rag/retriever.ts` (queryService needs the retriever, retriever needs queryService's types).
3. Receipt scanning (#7 — needs the image-input extension first)

### P2.5. Live observability streaming page  `[after all 3 consumers integrated · long-shot · 2/3 done]`
A webpage showing the architecture diagram with real-time pulses traversing each functional box as live requests flow through the system — plus a log stream. Opens in a separate tab from the Preference Parser page; watching one triggers visible activity in the other.

**Consumer gate status:** Preference Parser ✅ · NL2Mongo ✅ · Receipt scanning (#7, needs image-input extension) — one remaining.

**What must exist first (in place by P1/P2):** every package (`ai-provider`, `vector`, `retrieval`) emits entry/exit events with `traceId`, `durationMs`, and enough detail to reconstruct the full request waterfall — this is the data source. No new instrumentation needed by the time this milestone starts, assuming P1/P2 hold the observability discipline.

**What's actually new here (the real build):**
- [ ] **A relay subscriber** — a long-lived process/module that calls `onEvent()` once and forwards every event out of the Node.js process (today's event bus is in-process only; a browser tab cannot subscribe to it directly)
- [ ] **A transport** — Server-Sent Events (SSE) from a `/api/events/stream` route; simplest fit for one-directional server→browser push. WebSockets are the alternative if bidirectional ever matters
- [ ] **The visualizer page** — renders the architecture (gateway, vector, retrieval, quality gate, etc. as boxes), animates a brief pulse on the matching box for each incoming event using `event.source`/`event.type`; a single `traceId` can be followed lighting up boxes in sequence, showing one request's real path end to end
- [ ] **A log panel** alongside the diagram — raw event stream, human-readable, filterable by `traceId`/`source`
- [ ] **Revisit `ai-provider`'s current observability** before this milestone starts — confirm its `AIEvent` type has fully migrated to `ai-core`'s `PlatformEvent` schema (traceId, durationMs, consistent `source`/`type` naming) so the visualizer doesn't need special-case handling for one package's events looking different from the others

**Confirmed (2026-07-17): concurrent, multi-domain faceted display is already fully supported by the current data model — no further changes needed before building this.** Worked through the scenario explicitly: two tabs, one triggering NL2Mongo, one triggering Preference Parser, at the same moment.
- **`traceId`** (already threaded through every call, every package) — groups events into one request's pulse animation; two concurrent requests never cross-contaminate since each has its own ID
- **`domain`** on `retrieval.*` events (added this session — see bug-fix log below) + **`table`** on `vector.*` events (already existed, since each domain uses a different Atlas collection) — lets the UI facet/color/label pulses by which domain triggered them
- The visualizer's actual job, given this: subscribe to the stream → bucket incoming events by `traceId` → animate each bucket's boxes in `timestamp` order → color/label using that trace's `domain`/`table` values. Multiple pulses move through the *same* shared diagram simultaneously, independently, correctly attributed — a natural consequence of the existing fields, not new architecture.
- **Open UI decision for whenever this gets built** (not an architecture question, purely a UX one): one shared diagram with color-coded concurrent pulses, vs. entirely separate diagrams per domain side-by-side. The event data supports either equally well.

**Why this is genuinely achievable, not just aspirational:** the event schema already carries everything needed (`timestamp` for ordering, `traceId` for request-path reconstruction, `durationMs` for pulse duration/intensity, `domain`/`table` for faceting). This milestone is purely additive infrastructure on top of P1/P2 — no redesign of `ai-core`, `ai-provider`, `vector`, or `retrieval` required if the observability discipline holds through those builds.

### ai-core + @jz92/retrieval — domain attribution fix  `[✅ done]`

**The gap:** `@jz92/retrieval` is shared by multiple consumers (Preference Parser, NL2Mongo) that emit identically-shaped `retrieval.retrieved`/`store.success` events — nothing distinguished which consumer's call produced a given event. (`@jz92/vector`'s events already avoided this problem via the existing `table` field, since each domain uses a different Atlas collection; `@jz92/ai-provider`'s events don't need it either, since `traceId` correlation back to the originating route already resolves the ambiguity one hop removed — `domain` was added only where a genuine, otherwise-unresolved gap existed, not uniformly across all three packages.)

- [x] `ai-core`: `domain: string` added as a required field to `RetrievalEvent` and `RetrievalStoreEvent` — published as `ai-core@0.2.1`
- [x] `@jz92/retrieval`: `RetrieverConfig<T>` gains a required `domain` field, stamped onto all 7 `emit()` calls in `retrieve()`/`store()` — published as `@jz92/retrieval@0.2.0`
- [x] Both app-level retrievers updated: `preferenceRetriever` → `domain: 'preference-parser'`, `nl2mongoRetriever` → `domain: 'nl2mongo'`

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

### P4. @jz92/evals  `[parallel to P2 · golden tests + benchmarks · scope upgraded]`
**Re-scoped after the vision-provider debugging session (2026-07-2x): must run against every configured provider, not just whichever one `NODE_ENV` currently resolves to.** Concrete proof this matters — the SAME class of bug (structured output breaking) manifested completely differently per provider testing the receipt scanner: Ollama failed on schema *shape* (`z.union` nested in `z.record`), Gemini failed on a *runtime default* (thinking tokens consuming the whole output budget), Claude Sonnet never failed at all. A single-provider eval run structurally cannot catch this class of bug — see AI-CONCEPTS.md §19 for the full reasoning.

- [ ] Golden test dataset format (input, expected output, scoring strategy) — domain-specific, injected, not hardcoded into the harness
- [ ] **`providers: ProviderConfig[]`** — the harness runs the identical test cases against every configured provider, not one. This is the scope change: `EvalConfig<TInput, TOutput>` parameterizes over test cases, schema, AND provider list — all three axes independent and injectable, none hardcoded
- [ ] Scoring strategies: exact_match, partial_credit, semantic_similarity, LLM-as-judge
- [ ] CI runner — fails build if score drops below baseline, **per provider** (a regression on Gemini specifically shouldn't be masked by Claude passing)
- [ ] Regression test for every real bug found this session across every domain: "test you meat preference" (Preference Parser, hallucination), `nlm-08` absence-vs-negation (NL2Mongo), the Gemini thinking-token collapse and Ollama union-in-record collapse (vision) — each becomes a permanent cross-provider regression case
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
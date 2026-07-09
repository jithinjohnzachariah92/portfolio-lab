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

### 3. NL2Mongo → ai-provider migration + API hardening  `[was #2 · med effort · proven playbook]`
Same migration already done for the Preference Parser (direct SDK → ai-provider). Inherits #1's observability for free.

- [ ] Migrate NL2Mongo off direct Anthropic SDK onto `@jz92/ai-provider`
- [ ] Define what "harden" means (pick): input validation · typed errors · timeouts/retries · output-quality guards
- [ ] Wire observability through `instrumentation.ts` (same pattern as Preference Parser)

### 4. Preference Parser — harden for better results  `[was #5 · med effort · do with #3]`
Same category as #3's hardening — do the patterns back-to-back while fresh.

- [ ] Apply same hardening checklist as #3
- [ ] Prime candidate for RAG later (few-shot retrieval of similar past extractions) → feeds #6

### 5. Embeddings in ai-provider  `[was #6 prereq · med effort · HIGH value · the hinge]`
Prerequisite for ALL RAG work. Build the capability immediately before consuming it in #6.

- [ ] Add `generateEmbedding()` + `generateEmbeddingBatch()` as first-class capabilities (baked in, not a plug-in abstraction)
- [ ] Config-routed via `resolveEmbeddingProvider()` (env: `AI_EMBED_PROVIDER`, `AI_EMBED_MODEL`) — switching providers is config, not code
- [ ] Wire providers: Voyage (default), OpenAI, Ollama
- [ ] Route through existing `execute()` for cache/retry/timeout/events — but embedding-aware usage handling (no `outputTokens`; don't jam embedding usage into a completion-shaped object)
- [ ] Tests proving observable states (provider resolution, cache hit on repeat embed, batch)

**Key design decisions (see AI-CONCEPTS.md §7 for full reasoning):**
- **Voyage in BOTH dev and prod** (not Ollama-dev→hosted-prod). Embeddings from different models are incompatible (different dims + geometry); mixing dev/prod vectors = silent garbage. One provider = one vector space. This is the ONE capability that deliberately breaks the env-aware-routing pattern — and that's *correct*, not inconsistent.
- **Baked in + config-routed, NOT plug-your-own-embedder.** Consumers are my own apps with one chosen provider; a plug-in abstraction would be premature. Config-routing gives hassle-free provider switching (`AI_EMBED_PROVIDER=openai`) without a plug-in mechanism. Upgrade path (expose an `Embedder` interface) noted if the package ever goes public.
- Voyage isn't first-party in Vercel AI SDK — check community provider vs direct REST when building (verify against actual ecosystem).

### 6. RAG + eval layer + self-evolving store  `[was #6 · HIGH effort · HIGH value · the big one]`
**Not "build our own models."** Retrieval + prompting + evals; model stays Anthropic/Ollama. Needs #5 done first.

- [ ] Stand up pgvector (right-sized: no new managed service vs Pinecone/Weaviate)
- [ ] Build RAG retrieval for Preference Parser (retrieve similar past extractions) — start here, RAG's value (consistency) is clearest
- [ ] Build RAG retrieval for NL2Mongo (retrieve schema docs / example queries) — only if evals show it beats good few-shot
- [ ] Build an **eval harness** — turn "I think this is better" into "scored X% higher on a test set". Prioritised gap; makes #6 real.
- [ ] **Skip** LangChain / LlamaIndex — hand-build (keeps the "I understand the plumbing" story).

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
# AI Concepts — reference & interview prep

> Conceptual companion to `ROADMAP.md`. This is the "understand it / explain it in an interview" doc — not a task tracker.
> Strategic lane: **TypeScript-native AI product engineering**. Deep on the application layer; conversant on the ML layer.

---

## Contents

### Foundations — understanding the space
1. [What I've built vs what RAG actually is](#1-what-ive-built-vs-what-rag-actually-is)
2. [ai-provider vs LangChain — same layer, different scope](#2-ai-provider-vs-langchain--same-layer-different-scope)
3. [Everything is plumbing around a model call](#3-everything-is-plumbing-around-a-model-call)
4. [Compose, don't ditch — when a requirement names LangChain/LangGraph](#4-compose-dont-ditch--when-a-requirement-names-langchainlanggraph)
5. [The AI landscape — deep vs conversant](#5-the-ai-landscape--deep-vs-conversant)
6. [The two flows (mental model for the apps)](#6-the-two-flows-mental-model-for-the-apps)

### Architecture — how we build it
7. [Embeddings — local vs Voyage, and why they route differently from completions](#7-embeddings--local-vs-voyage-and-why-they-route-differently-from-completions)
8. [Platform vs domain — where AI capabilities live in an org](#8-platform-vs-domain--where-ai-capabilities-live-in-an-org)
9. [The concrete RAG + gateway architecture (execution plan for #5/#6)](#9-the-concrete-rag--gateway-architecture-execution-plan-for-56)
10. [Testing AI systems — the three-layer model](#10-testing-ai-systems--the-three-layer-model)

### Platform vision
11. [The @jz92 platform vision — a composable TypeScript AI platform](#11-the-jz92-platform-vision--a-composable-typescript-ai-platform)
12. [@jz92/ai-core — full design spec](#12-jz92ai-core--full-design-spec)
13. [Token/prompt caching — provider-specific, not universal](#13-tokenprompt-caching--provider-specific-not-universal)

---



**My current pipeline (Preference Parser, NL2Mongo) is structured extraction — NOT RAG:**
```
prompt string → API → LLM call (parser + system caveats) → Zod structures output → return
```
Prompt + LLM + schema validation. No retrieval step. The LLM works only from the prompt + its training knowledge.

**RAG adds the missing "R" (Retrieval)** — a step *before* the LLM call that fetches relevant context from my own store and injects it:
```
prompt string
  → [RETRIEVAL] embed input → vector search (pgvector) → pull top-k relevant examples/docs
  → prompt (system + caveats + RETRIEVED CONTEXT + few-shot)
  → LLM call → Zod → return
```
"Augmented" = the prompt was augmented with retrieved context before generating. **No retrieval step = not RAG, just generation.**

**Example (Preference Parser):**
- *Without RAG:* "I like comfy stuff for winter" → LLM guesses the structured preferences from the prompt alone.
- *With RAG:* embed that → vector-search past examples like `"cosy autumn wear" → {category: knitwear, season: cold, fit: relaxed}` → inject the 3 closest → LLM generates grounded in real examples of how the app maps fuzzy language → more consistent output.

**When RAG earns its place (don't over-apply):**
- (a) answer depends on data the model doesn't have in training, or
- (b) want to ground/steer output with my own examples for *consistency*.
- Preference Parser → value is consistency (b). Pure self-contained single-text extraction → RAG may add little; good few-shot may suffice. The eval harness is what decides where retrieval genuinely beats prompting.

---

## 2. ai-provider vs LangChain — same layer, different scope

Both sit between app and model; neither contains intelligence. But they're plumbing for **different jobs**:

- **`@jz92/ai-provider` = provider abstraction / gateway.** Job = *the call itself*: env-aware routing (Ollama → Haiku → Sonnet), retries on transient errors, timeouts, caching, typed errors, observability via `onAIEvent`. Answers *"how do I make one model call robustly and swap providers by config?"* Deliberately narrow, owns one thing well.
- **LangChain = orchestration framework.** Job = *composing many steps*: chains, agents, memory, document loaders — plus its own (thinner) provider wrappers. Answers *"how do I wire a multi-step workflow of calls, tools, and data?"* Broad scope.

**Analogy:** `ai-provider` is a well-designed HTTP client (retries, timeouts, pooling, swappable base URL). LangChain is a whole web framework (routing, middleware, ORM) that *includes* an HTTP client. Same layer for the one overlapping job; wildly different overall scope.

**Interview answer:**
> "I hand-built the provider/gateway layer — routing, caching, retries, observability — deliberately, rather than adopting LangChain, because I wanted to own and understand those production concerns. If I needed multi-step orchestration or agents, LangChain/LangGraph would sit *above* my provider layer, not replace it."

Stronger than "I built something like LangChain" because it shows I know exactly what each does and where the boundary is.

---

## 3. Everything is plumbing around a model call

Almost all these tools are orchestration/storage — no intelligence of their own. At the generation/embedding step they call a **model**:
- **LangChain / LangGraph** — orchestration; call a model API for the actual LLM work.
- **Pinecone / Weaviate / pgvector** — storage + search; *creating* the vectors (embeddings) is itself a model call. The DB just holds/searches the numbers.
- **RAG** — retrieval (vector store) + generation (model call). Both halves touch a model.

**The model is reached via an API — but that's either a hosted provider (Claude, OpenAI) OR a local runtime (Ollama on the M5 Pro).** Local = still an API call, just to `localhost`, no per-token cost.
- Embeddings can run locally too → RAG retrieval can be fully local (zero API cost), same env-aware routing pattern (`local in dev → hosted in prod`).
- The only time it stops being "just a model call" is *training/fine-tuning my own model* — the ML path I've deliberately not taken.

**`ai-provider` is the piece I own** — the thing that actually makes the call and routes to whichever model. Everything else is plumbing around it.

---

## 4. Compose, don't ditch — when a requirement names LangChain/LangGraph

Not either/or — they compose. Options when orchestration is required:
1. LangChain with its default model wrappers — lose my caching/routing/observability.
2. **LangChain's orchestration wrapping `ai-provider` as the underlying model** — get their chaining/agents/memory *on top of* my robust call layer. Usually best.
3. Hand-build orchestration on top of `ai-provider` — no LangChain; I own the plumbing (good for portfolio pieces).
4. *(worst)* Ditch `ai-provider` entirely — throws away routing/caching/typed-errors/observability, then re-solves them worse inside LangChain.

**Three questions to decide:**
1. Is it genuinely orchestration, or did they just *say* "LangChain"? (Sometimes the tool name is a proxy for "an LLM app that does retrieval + multi-step." Sometimes it's a hard requirement — existing codebase, LangSmith tracing, team standardization.)
2. What does the orchestration actually need? Simple chain → functions over `ai-provider`. Genuinely complex (stateful agent loops, branching, human-in-loop, big integration library) → LangGraph earns its place, layered on top.
3. Who maintains it, how long? Portfolio project → hand-build. Team depends on it long-term → match the team's stack.

**Both cautions:**
- Don't reflexively defend my own code — re-justify, don't defend.
- Don't make `ai-provider` a hammer where every requirement looks like a nail. A team that lives in LangChain → insisting on my custom gateway is the *junior* move dressed as senior. Hold both: "here's the rigorous thing I built, *and* here's when I'd set it aside."

---

## 5. The AI landscape — deep vs conversant

*(mirrors ROADMAP.md; kept here for interview prep)*

### Deep / hands-on (my lane — product/application layer)
- **RAG** (pattern) — retrieve → inject → generate. A technique, not a library.
- **pgvector** — Postgres extension for vector similarity search. Right-sized store, no new service.
- **Vercel AI SDK** — lightweight TS-idiomatic orchestration; the framework to reach for *if* one is needed.
- **Evals** — test harness scoring output quality vs a fixed set. Vibes → numbers.
- **LangGraph** (concepts) — stateful multi-step agent workflows as graphs (loops, branching, human-in-loop). Understand it; build small versions myself.

### Conversant / recognise (ML-engineer layer — deliberately not chasing)
- **LangChain** — heavy general-purpose LLM orchestration (Python-first, JS port). *"Understand what it abstracts; hand-built my own routing/caching/RAG to show I get it."*
- **LlamaIndex** — RAG-specialist framework (indexing + retrieval). *"It implements RAG for you; I build that with pgvector."*
- **AutoGen / CrewAI** — multi-agent frameworks (several role-playing agents collaborating). Newer, buzzy, often overkill. *"Know the pattern; reach for it only when a task genuinely needs multiple agents."*
- **Pinecone** — managed hosted vector DB, the 'easy button' at scale. *"Where I'd graduate from pgvector."*
- **Weaviate** — open-source vector DB, more built-in features (hybrid search). *"Alternative to Pinecone; self-host or cloud."*
- **Transformers** (HF lib) — Python lib to load/run/fine-tune actual models. *"ML-engineer territory — I'm on the application layer."*
- **Hugging Face** — the 'GitHub of ML models' (models/datasets/demos). *"I use it to pick open models; I don't train."*
- **MLflow** — experiment tracking / model lifecycle for ML teams. *"Experiment tracking for training — adjacent to my focus."*

**The positioning move:** being able to say *why* I'm conversant-not-deep on the ML tools ("MLflow is experiment tracking for training, adjacent to my focus — I'm on the application layer") is itself a strong interview signal. It shows I know the whole landscape and deliberately positioned myself. The trap is trying to learn all of them and being shallow on everything.

---

## 6. The two flows (mental model for the apps)

- **Flow A** (input → structured): RAG + prompt + Zod. Already have prompt+Zod; RAG is the upgrade.
- **Flow B** (results → plain English): just a second optional LLM call. No framework needed.
- **Frameworks:** LlamaIndex would do Flow A's RAG for me; LangGraph only matters once flows become multi-step loops (retry, branch, ask-to-narrow). Skipping both for now — right-sized.

---

## 7. Embeddings — local vs Voyage, and why they route differently from completions

**What an embedding is:** a model call that turns text into a vector (array of floats) capturing its meaning, so similar texts sit close together in vector space. It's the retrieval half of RAG. A *different* kind of model call from completions — text in, vector out.

**The critical fact — vectors from different models are NOT comparable.** Each embedding model produces its own dimensions AND its own geometry (learned during training). `nomic-embed-text` (local) = 768 dims; `voyage-3` = 1024 dims. Even if dims matched, the numbers mean different things. You cannot store some local + some Voyage vectors in one pgvector table and search across them — the results are nonsense. This single fact drives every decision below.

**Local (Ollama, e.g. `nomic-embed-text`) vs Voyage — the axes:**

| Axis | Local (Ollama) | Voyage (hosted) |
|---|---|---|
| Vector compatibility | Its own space | Its own space — *incompatible with local* |
| Retrieval quality | Good for size | Top-tier, retrieval-tuned (Anthropic's pick) |
| Cost | Free per call | Cheap per token (fractions of ¢/1k) |
| Infra | Runs on M5 Pro; **can't run on Vercel prod** | Works dev + prod identically, no infra |
| Latency / privacy | No network hop; data stays local | Network round-trip; data goes to Voyage |
| Batching | Limited by machine | Efficient batch endpoint |

**The decision for this project: Voyage in BOTH dev and prod (Option A).**
- Why not mirror the completion routing (Ollama-dev → hosted-prod)? Because completions from different models are interchangeable for output; **embeddings are not.** Ollama-dev → Voyage-prod would make the dev-built vector store incompatible with prod → silent garbage when mixed.
- Option A = one vector space everywhere, always comparable, dev store matches prod. Cost: tiny per-call spend + a Voyage key needed locally. Worth it to kill an entire class of subtle bug.
- Upgrade path if ever needed (Option C): tag every stored vector with its model+version and refuse cross-model comparison. Overkill now.

**The interview-grade insight:** embeddings are the ONE capability in `ai-provider` that *deliberately breaks* the env-aware-routing pattern (same provider both envs). That's not an inconsistency to apologize for — it's a *correct* design response to a constraint completions don't have. Being able to explain *why* embeddings route differently from completions signals you understand the tools deeply enough to know when a pattern shouldn't be applied uniformly.

**Voyage model note:** Anthropic recommends Voyage for embeddings (Anthropic has no embeddings API of its own). `voyage-3` / `voyage-3-lite` are the general-purpose choices; there are domain-tuned variants (code, finance, law) if retrieval on specialised text ever needs it.

---

## 8. Platform vs domain — where AI capabilities live in an org

In a company where engineering is organised into domains, AI capability splits across a **platform layer** and **domain layers** — and RAG itself splits across both.

**Platform layer (one team owns it, every domain uses it):**
- The **LLM gateway** — routing, caching, retries, timeouts, observability, model access. This is exactly what `ai-provider` is, at org scale. Often called an "AI platform" or "LLM gateway" team.
- Org-wide concerns that no single domain should each solve: API-key management, cost attribution per team, rate limiting, audit logging, model-version governance, compliance.
- RAG's *plumbing*: embedding model access (via the gateway, same reasoning as completions), the vector database as managed infra (one pgvector/Pinecone cluster with per-domain isolation, not one DB per domain), and often a shared retrieval *library* (reusable embed → search → assemble-prompt code that domains configure).

**Domain layer (each domain owns its own):**
- The **corpus** — what's in that domain's retrieval store.
- Chunking/indexing strategy and the **quality gate** (what counts as a good example is domain judgement).
- Retrieval tuning: top-k, similarity thresholds, filters.
- Prompt templates for the domain's use cases.
- **Evals** — judging output quality requires domain knowledge, so it can't be centralised.

**The one-liner:** *domains own their RAG; the platform owns what all RAGs stand on.* Generic capability → platform. Knowledge + judgement → domain.

**Known failure mode of "RAG per domain":** knowledge silos. A question spanning two domains ("customers whose *orders* suggest a *preference*" crosses Orders and Preferences) has nowhere to go if every store is an island. Mature answers: federated retrieval (query multiple domain stores) or a deliberately shared corpus for cross-cutting knowledge. Not a day-one problem, but the architecture's known weakness — worth naming before someone else does.

**Caveat:** the exact platform/domain line varies by org — some platform teams offer full "RAG as a service" (domains just upload docs); others provide only the gateway. The stable principle is the split itself, not where precisely the line sits.

**Portfolio mapping (say this in interviews):** `ai-provider` IS the platform layer; the #6 plan (RAG in the app, calling the provider; evals alongside) IS the domain layer. The portfolio rehearses the org-scale architecture at portfolio scale — same boundaries, same reasoning, smaller blast radius.

---

## 9. The concrete RAG + gateway architecture (execution plan for #5/#6)

Four layers, bottom-up (which is also the build order):

**Model layer:** Anthropic / Ollama for completions (env-routed); Voyage for embeddings in BOTH envs (one vector space — see §7).

**Platform layer — `@jz92/ai-provider` (the gateway):**
- Two capabilities: completions (exists) + embeddings (#5: `generateEmbedding()` / `generateEmbeddingBatch()`, config-routed via `resolveEmbeddingProvider()`, `AI_EMBED_PROVIDER` to switch).
- Both share the same `execute()` spine — cache, retry, timeout, observability — with embedding-aware usage handling.
- **The gateway knows NOTHING about RAG.** No chunking, retrieval, or prompt assembly. Contract: "text in → completion or vector out, robustly." That discipline is what keeps it platform-shaped.

**Vector infra:** one shared Postgres+pgvector instance, isolated by per-domain table (`preference_examples`, `nl2mongo_examples`). Every row: `{embedding, input, output, model, model_version, created_at}` — the model/version columns are §7's Option-C upgrade path bought for two columns now instead of a migration later.

**Domain layer — `portfolio-lab`:** a `rag/` module per domain, each owning its corpus, quality gate, retrieval tuning (top-k, thresholds), and prompt assembly. Per-request flow: embed input (via gateway) → search own table → assemble few-shot → generate (via gateway) → if output passes the quality gate, write back to the table. The write-back loop IS the self-evolving store. Domains never touch each other's tables.

**Between the layers — a shared retrieval helper:** the generic `embed → search → format-as-few-shot` plumbing both domains would otherwise duplicate (`lib/retrieval`, configured per domain: which table, which top-k). This mirrors the org-scale "platform retrieval library." Right-sizing rule: write it once inside the first domain, extract when the second domain needs it — don't pre-build.

**Evals:** per domain, fixed test set + scoring script, run in CI, never in the request path. The safety mechanism that makes the write-back loop safe.

**Build order (dependencies dictate it):** gateway embeddings (#5) → pgvector schema + retrieval helper → first domain's RAG (Preference Parser — clearest value) → its eval harness → then decide *with eval evidence* whether NL2Mongo gets RAG or whether good few-shot already suffices there.

**The one-liner + the boundary test:** the gateway exposes capabilities, the domains own knowledge, and the seam between them is two function calls (`generateEmbedding`, `generateStructured`). The test that the layering is right: **if adding a third domain ever requires editing `ai-provider`, the boundary has leaked.**

---

## 10. Testing AI systems — the three-layer model

**The core tension:** you can't assert on LLM output the way you assert on deterministic code. The output of a model call isn't a fixed value — it's a probability distribution. "Write a test that checks the LLM returned the right thing" is the wrong frame entirely. The right frame: test different things at different layers, each layer asking a different question.

---

### Layer 1 — Test the plumbing, not the model (unit / integration tests)

**Question it answers:** "Does my code around the model work correctly?"

Not testing what the LLM *said* — testing that:
- The right provider was called (env-aware routing)
- The cache hit/missed correctly
- Errors are typed and surfaced correctly
- The Zod schema validates (or rejects) the output shape
- The normaliser/whitelist drops hallucinated values
- Input guards reject bad inputs before hitting the model

**Key insight:** all of this is fully deterministic and testable without calling the model at all. Your 48 smoke tests already do this. The `normalise()` whitelist filter is a Layer 1 test target — if "Meat" slips through, that's a bug in *your code*, not the model, and it's testable with a fixed input/output pair.

**What belongs here:**
```typescript
// Normaliser test — fully deterministic, no model call
const result = normalise({ dietary: [{ name: "Meat", optedIn: true, confident: true }], ... })
expect(result.dietary).toHaveLength(0) // "Meat" not on whitelist → dropped
```

---

### Layer 2 — Evals (not unit tests — a different discipline entirely)

**Question it answers:** "Is the model output better or worse than before?"

Evals are NOT traditional tests. They don't pass or fail on a boolean. They *score* output quality across a fixed dataset, then you compare scores across runs:

```
input:    "I love Nike and hate synthetic fabrics"
expected: { brands: [{ name: "Nike", optedIn: true }], style: [] }
actual:   <whatever the model returned this run>
score:    exact_match | partial_credit | semantic_similarity
```

**When you run evals:**
- Before and after changing the system prompt — did quality improve?
- Before and after adding RAG — did retrieval help?
- On a schedule — is the model degrading as Anthropic updates it?
- When you suspect a regression (like the "test you meat preference" hallucination)

**The key distinction from unit tests:** evals answer "is this *better or worse than baseline*?" not "is this *correct*?" That's a different question, and it's the right question for LLM output. Your eval harness in milestone #6 is exactly this layer.

**Eval dataset design:**
- Fixed, curated test cases — inputs with expected outputs (or expected *properties* of outputs)
- Include edge cases, known-bad inputs, and regression cases (every real bug you find becomes a test case)
- The "test you meat preference" case → expected: `isEmpty: true`, score 0 if anything is returned
- Scores trend over time; a drop signals a regression worth investigating

**Scoring strategies (pick the right one for the task):**
- `exact_match` — output matches expected exactly. Only works for highly constrained structured extraction.
- `partial_credit` — correct items / total items. Better for preference extraction where partial hits are still useful.
- `semantic_similarity` — embedding distance between actual and expected. Good for free-text outputs.
- `LLM-as-judge` — use a second model call to score the first. Powerful but adds cost and latency; use for subjective quality.

---

### Layer 3 — Guardrails in code (deterministic fences around the model)

**Question it answers:** "Did the model's output pass the minimum bar to be usable?"

Guardrails don't test the LLM — they *constrain* its output at runtime. They run in the request path (unlike evals which run offline). Examples from your own code:

- **Zod schema** — structural shape guaranteed; output that doesn't match is rejected before it reaches the consumer
- **Whitelist normaliser** — items not on the whitelist are dropped regardless of model confidence
- **`isEmpty` check** — all arrays empty after normalisation → prompt user to rephrase, don't save
- **`confident` field** — low-confidence items surfaced to the UI for confirmation rather than silently applied
- **`maxInputTokens`** — budget guard before the call; over-length input → 400, not a model error

**The guardrail gap your "meat" case revealed:** `confident: false` is captured per-item but nothing in code currently *filters* or *flags* low-confidence items in a way that changes behaviour. A tighter guardrail: if the model returns an item as low-confidence AND it's a weak semantic match to the input, drop it — don't return it at all. This is a Layer 3 fix, not a model fix.

---

### How the three layers work together

```
User input
   ↓
Layer 3 (guardrails)    — input validation, token budget, runs in request path
   ↓
Model call              — the only non-deterministic step
   ↓
Layer 3 (guardrails)    — Zod validation, whitelist normaliser, isEmpty, confidence filter
   ↓
Response to consumer

Offline / CI:
Layer 1 (unit tests)    — plumbing, normaliser, error typing, routing — 48 smoke tests
Layer 2 (evals)         — score output quality on fixed dataset, compare to baseline
```

**The interview answer to "how do you test AI systems?"**
> "Three layers: unit tests for the deterministic plumbing around the model (routing, caching, error typing, guardrails); evals to score output quality across a fixed dataset and detect regressions across prompt or model changes; and runtime guardrails — Zod, whitelists, confidence filters — that constrain model output in the request path. The key insight is that none of these test what the model *said* — they test whether my code handles the model's output correctly, whether quality improved or degraded, and whether the output meets a minimum bar to be usable. You never write a test that asserts on LLM output verbatim."

**The failure mode to name in interviews:** teams that only do Layer 1 (unit tests) assume the model is a black box that "just works" and have no visibility into quality degradation over time. Teams that skip Layer 3 (guardrails) expose model hallucinations directly to users. Teams that skip Layer 2 (evals) can't tell whether a prompt change helped or hurt. All three layers are necessary; they answer different questions.

---

## 11. The @jz92 platform vision — a composable TypeScript AI platform

A layered, independently-versioned npm monorepo where each package has a single responsibility, packages depend strictly downward (never sideways), and applications sit at the top consuming whatever they need. The goal: reusable platform capabilities across any project, any LLM, while keeping domain knowledge (RAG corpora, evals, prompts) in the applications that own them.

```
@jz92/ai-core          Interfaces & contracts — the foundation everything depends on
       ↓
@jz92/ai-provider      Chat · Embeddings · Streaming · Routing · Caching · Retries
                        Telemetry · Cost · Metrics · Provider Adapters
       ↓
@jz92/vector           Provider-agnostic vector stores (pgvector, Pinecone, Weaviate)
       ↓
@jz92/retrieval        Chunking · Retrieval · Reranking
       ↓
@jz92/prompts          Prompt Registry
       ↓
@jz92/evals            Golden Tests · Benchmarks  ← sits beside apps, not in runtime
       ↓
@jz92/tools            Tool Registry
       ↓
@jz92/agents           Agent Runtime · Planner · ReAct · Supervisor
       ↓
Applications           portfolio-lab · NL2Mongo · Research Agent · ...
```

**Why `ai-core` is the right foundation:**
`ai-core` owns only interfaces and shared types — no implementations, no runtime dependencies. This means `vector`, `retrieval`, and `agents` can depend on `ai-core` shapes without pulling in `ai-provider`'s provider SDKs. Swapping the embedding provider (Voyage → OpenAI) is a config change in `ai-provider`, not a change in anything that depends on it. This is the "depend on abstractions, not implementations" principle applied at the package level.

**Package responsibilities (one-liners):**
- `ai-core` — contracts: `CompletionProvider`, `EmbeddingProvider`, `AIResponse`, `EmbeddingResponse`, `ProviderConfig`, `AIEvent`. Nothing else.
- `ai-provider` — implements `ai-core` contracts for specific providers (Anthropic, OpenAI, Voyage, Ollama); owns routing, caching, retry, timeout, observability.
- `vector` — provider-agnostic vector store interface + implementations (pgvector, Pinecone, Weaviate). Depends on `ai-core` for `EmbeddingResponse` shape; calls `ai-provider` for embedding generation.
- `retrieval` — chunking strategies, similarity search, reranking. Depends on `vector` for storage and `ai-provider` for query embedding.
- `prompts` — a registry of named, versioned prompt templates. Consumed by `retrieval` (few-shot assembly), `agents`, and applications.
- `evals` — golden test datasets, scoring harness, benchmarks. Sits beside applications in CI; not in the runtime request path.
- `tools` — tool definitions and registry, consumed by `agents`.
- `agents` — agent runtime: ReAct loop, planner, supervisor. The top of the platform stack. Depends on `retrieval`, `prompts`, `tools`, and `ai-provider`.

**Build order (what we're doing):**
1. `ai-core` — extract contracts from `ai-provider` (already partially there as `types.ts`)
2. `ai-provider` — add embeddings behind `ai-core` interfaces
3. `vector` — pgvector implementation first (right-sized for current needs)
4. `retrieval` — chunking + similarity search for the Preference Parser domain
5. `evals` — golden test harness (milestone #6)
6. `agents` — NL2Mongo agentic rebuild (milestone #9)

**The portfolio angle:**
This is not a portfolio *project* — it's a publishable TypeScript AI *platform*. Each package is independently useful, independently versioned, composable. `@jz92/retrieval` could be consumed by someone else's project. `@jz92/agents` is a lightweight TypeScript-native alternative to LangChain for teams on the TS stack. The whole stack demonstrates the org-scale platform/domain architecture from §8 — except you're building the platform itself, not just an application on top of one.

**The dependency rule (never violate this):**
Packages only depend downward. `ai-provider` never imports from `retrieval`. `vector` never imports from `agents`. If you find yourself importing upward, the abstraction boundary has leaked — extract an interface into `ai-core` instead.

---

## 12. @jz92/ai-core — full design spec

`ai-core` v1 ships four files, zero runtime dependencies (not even `zod` — pure TypeScript types and a tiny pub/sub array). Every other `@jz92/*` package imports from here; nothing imports *into* here.

```
ai-core/
  src/
    types.ts      — all contracts (completion, embedding, vector, provider, error)
    events.ts     — event bus + full discriminated event schema
    security.ts   — PII redaction, prompt injection detection, secret scrubbing
    index.ts      — re-exports everything
```

---

### `types.ts` — the contracts

```typescript
// Provider identity
export type AIProviderName       = 'ollama' | 'anthropic' | 'openai' | 'google' | 'groq' | 'mistral'
export type EmbeddingProviderName = 'voyage' | 'openai' | 'ollama'
export type AIEnvironment        = 'development' | 'test' | 'production'
export type AIErrorCode          =
  | 'AUTH_ERROR' | 'BILLING_ERROR' | 'RATE_LIMIT' | 'SERVER_ERROR'
  | 'MODEL_NOT_FOUND' | 'TOKEN_BUDGET' | 'TIMEOUT' | 'UNKNOWN'

// Trace context — generated by the application (API route), passed down through every call
export type TraceContext = {
  traceId: string         // one user action end-to-end (UUID v4, generated at the API route)
  correlationId?: string  // one step within that action (e.g. one agent tool call)
  userId?: string         // authenticated user if available — for cost attribution + debugging
  sessionId?: string      // user session — links multiple actions without linking individual traces
}

// Cache context — emitted on every event so subscribers can reconstruct cache behaviour
export type CacheContext = {
  layer: 'app-cache' | 'provider-cache' | 'none'
  key?: string            // what key was looked up — for debugging stale results
  hit: boolean
  hitRate?: number        // overall cache health signal from getStats()
}

// Completion contracts
export type CompletionRequest<T = string> = {
  prompt: string
  systemPrompt: string
  schema?: unknown        // ZodSchema<T> — typed in ai-provider, unknown here (no zod dep)
  cacheKey?: string
  maxInputTokens?: number
} & TraceContext

export type CompletionResponse<T> = {
  data: T
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
  provider: AIProviderName
  model: string
  fromCache: boolean
}

// Embedding contracts
export type EmbeddingRequest = {
  text: string
  cacheKey?: string
} & TraceContext

export type EmbeddingBatchRequest = {
  texts: string[]
} & TraceContext

export type EmbeddingResponse = {
  embedding: number[]
  model: string           // non-negotiable — written to pgvector alongside every vector
  dimensions: number      // non-negotiable — catches dev/prod mismatches before they corrupt the store
  provider: EmbeddingProviderName
  fromCache: boolean
}

export type EmbeddingBatchResponse = {
  embeddings: number[][]
  model: string
  dimensions: number
  provider: EmbeddingProviderName
}

// Vector store contracts — ai-core owns the shape; @jz92/vector owns the implementation
export type VectorEntry = {
  id?: string
  embedding: number[]
  input: string
  output: string
  model: string
  modelVersion: string
  createdAt?: Date
}

export type VectorQuery = {
  embedding: number[]
  topK: number
  threshold?: number
  filter?: Record<string, unknown>
}

export type VectorSearchResult = {
  entry: VectorEntry
  score: number
}
```

---

### `events.ts` — event bus + full discriminated schema

**The hierarchy:**
- `traceId` — one per user action (API route creates it)
- `correlationId` — one per step within that action
- `userId` / `sessionId` — from auth context, optional
- `source` — which package emitted the event
- `type` — what happened within that package

```typescript
// Base — every event carries this
type BaseEvent = {
  traceId: string
  correlationId?: string
  userId?: string
  sessionId?: string
  source: 'ai-provider' | 'vector' | 'retrieval' | 'guardrails' | 'agents' | 'prompts' | 'evals'
  type: string
  timestamp: string       // ISO
  durationMs?: number
  env: AIEnvironment
  cache?: CacheContext
  packageVersion?: string // which version emitted this — helps debug regressions
}

// ai-provider events
type CompletionSuccessEvent = BaseEvent & { source: 'ai-provider'; type: 'completion.success'; provider: AIProviderName; model: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number } }
type CompletionFailureEvent = BaseEvent & { source: 'ai-provider'; type: 'completion.failure'; provider: AIProviderName; model: string; error: { code: AIErrorCode; message: string }; attempt: number }
type CompletionRetryEvent   = BaseEvent & { source: 'ai-provider'; type: 'completion.retry';   provider: AIProviderName; model: string; error: { code: AIErrorCode; message: string }; attempt: number }
type EmbeddingSuccessEvent  = BaseEvent & { source: 'ai-provider'; type: 'embedding.success';  provider: EmbeddingProviderName; model: string; dimensions: number; inputTokens: number; batchSize?: number }
type EmbeddingFailureEvent  = BaseEvent & { source: 'ai-provider'; type: 'embedding.failure';  provider: EmbeddingProviderName; model: string; error: { code: AIErrorCode; message: string } }
type CacheHitEvent          = BaseEvent & { source: 'ai-provider'; type: 'cache.hit';          provider: AIProviderName | EmbeddingProviderName; model: string; cache: CacheContext }

// vector events
type VectorSearchEvent = BaseEvent & { source: 'vector'; type: 'search.success' | 'search.empty'; table: string; topK: number; returned: number; topScore?: number }
type VectorInsertEvent = BaseEvent & { source: 'vector'; type: 'insert.success'; table: string; model: string; dimensions: number }

// retrieval events
type RetrievalEvent = BaseEvent & { source: 'retrieval'; type: 'retrieved' | 'quality.gate.passed' | 'quality.gate.failed'; count?: number; topScore?: number; reason?: string }

// guardrail events (emitted from domain code)
type GuardrailEvent = BaseEvent & { source: 'guardrails'; type: 'hallucination.dropped' | 'empty.result' | 'low.confidence' | 'input.rejected'; items?: string[]; reason?: string }

// agent events
type AgentEvent = BaseEvent & { source: 'agents'; type: 'step.start' | 'step.complete' | 'plan.created' | 'loop.complete' | 'loop.failed'; step?: string; totalSteps?: number; attempt?: number }

// The discriminated union — subscriber gets one of these
export type PlatformEvent =
  | CompletionSuccessEvent | CompletionFailureEvent | CompletionRetryEvent
  | EmbeddingSuccessEvent  | EmbeddingFailureEvent
  | CacheHitEvent
  | VectorSearchEvent | VectorInsertEvent
  | RetrievalEvent | GuardrailEvent | AgentEvent

// The bus — zero external deps, never lets a subscriber crash a request
type Subscriber = (event: PlatformEvent) => void
let subscribers: Subscriber[] = []

export const emit        = (event: PlatformEvent): void => { for (const s of subscribers) { try { s(event) } catch {} } }
export const onEvent     = (s: Subscriber): (() => void) => { subscribers.push(s); return () => { subscribers = subscribers.filter(x => x !== s) } }
export const clearEvents = (): void => { subscribers = [] }  // for tests
```

**Application wiring (in the API route):**
```typescript
import { randomUUID } from 'crypto'
import { onEvent } from '@jz92/ai-core'

// Wire up once at app startup
onEvent((event) => {
  // Full lifecycle — ai-provider, vector, retrieval, agents — one stream
  console.log(`[${event.source}][${event.type}]`, {
    traceId:   event.traceId,
    userId:    event.userId,
    duration:  event.durationMs,
    cache:     event.cache,
  })
})

// In the API route — generate traceId here, pass it down
const traceId = randomUUID()
const result  = await parsePreferencesWithClaude(input, { traceId, userId: session.userId })
```

---

### `security.ts` — PII redaction, injection detection, secret scrubbing

**Built now — the three that matter:**

```typescript
// 1. PII REDACTION
// Applied before text hits a model, before it's stored in pgvector,
// before it appears in emitted events.
const DEFAULT_PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,    // email
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,    // credit card
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,          // UK postcode
  /\b(\+44|0)[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, // UK phone
  /\b\d{9}\b/g,                                        // NHS number (9 digits)
]

export const redact = (text: string, extraPatterns: RegExp[] = []): string => {
  let result = text
  for (const pattern of [...DEFAULT_PII_PATTERNS, ...extraPatterns]) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

// Redact sensitive fields from an event before emitting to external sinks
export const redactEvent = <T extends { [k: string]: unknown }>(
  event: T,
  sensitiveFields: string[] = ['userId', 'sessionId', 'input', 'prompt']
): T => ({
  ...event,
  ...Object.fromEntries(sensitiveFields.map(f => [f, event[f] ? '[REDACTED]' : undefined]))
})

// 2. PROMPT INJECTION DETECTION
// Detects attempts to override system instructions in user input.
// Call before trusting any user-supplied text.
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+/i,
  /forget\s+(everything|all)/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\[SYSTEM\]/i,
]

export const detectInjection = (text: string): boolean =>
  INJECTION_PATTERNS.some(p => p.test(text))

export const assertSafeInput = (text: string, field = 'input'): void => {
  if (detectInjection(text)) {
    throw new Error(`[ai-core] Potential prompt injection detected in ${field}`)
  }
}

// 3. SECRET SCRUBBING FROM EVENTS
// Prevents API keys, tokens, and bearer headers appearing in emitted events.
const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9-_]{20,}/g,   // Anthropic key
  /sk-[a-zA-Z0-9]{20,}/g,          // OpenAI key
  /Bearer\s+[a-zA-Z0-9-_.]{10,}/g, // Bearer token
  /pa-[a-zA-Z0-9]{20,}/g,          // Voyage key
]

export const scrubSecrets = (text: string): string => {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[SECRET]')
  }
  return result
}
```

---

### Deferred (designed, not built yet — slots in cleanly when needed)

**Cost tracking (`cost.ts`):** estimate cost from `CompletionSuccessEvent` / `EmbeddingSuccessEvent` using a provider pricing table. Add when you want per-user or per-trace cost attribution in the event stream. The event schema already carries all the data needed (`usage.inputTokens`, `usage.outputTokens`, `model`, `provider`) — cost.ts just adds the multiplication.

**Output sanitisation (`sanitise.ts`):** strip dangerous content from model responses (SQL injections, script tags, hallucinated instructions) before they reach consumers. Add when a domain reports a class of bad output the guardrails aren't catching. Keep it generic at `ai-core` level; domain-specific rules stay in the app.

**Validation utilities (`validation.ts`):** `isValidTraceId`, `isValidUserId`, `assertNonEmpty`. Add when a second package needs the same validation logic and duplication becomes the pain — not before.

---

### The test that ai-core v1 is right

```bash
cat ai-core/package.json | jq '.dependencies'
# Should return: null (or just {})
# If any runtime dependency appears, something leaked.
```

---

## 13. Token/prompt caching — provider-specific, not universal

A common gotcha when switching providers: token caching behaviour varies significantly by provider. `usePromptCache: true` in `ai-provider` means different things (or nothing) depending on which provider is underneath.

**Provider map:**

| Provider | Caching support | How it works | Control | Cost saving |
|---|---|---|---|---|
| **Anthropic** | ✅ Yes — most mature | Mark system prompt with `cache_control: { type: 'ephemeral' }` — Anthropic caches the transformer state after processing it | Explicit — you control what's marked | ~90% cheaper on cache reads |
| **OpenAI** | ✅ Yes — automatic | Completely automatic — OpenAI detects repeated prefixes and caches them internally. `cached_tokens` appears in usage when it fires | None — you can't force or prevent it | ~50% cheaper on cached tokens |
| **Google Gemini** | ✅ Yes — explicit | "Context Caching" — you create a named cache object via their API, reference it by ID. Configurable TTL (up to hours) | Explicit + storage model — you pay a small fee per cached token per hour | Significant on long contexts |
| **Ollama** | ❌ No | Local inference, no API cost anyway. Standard transformer KV cache exists internally but isn't exposed as a usage metric | N/A | N/A (free already) |
| **Groq** | ❌ No (currently) | Optimises for raw inference speed via custom hardware — caching not a current focus | N/A | N/A |
| **Mistral** | ❌ No (currently) | No prompt caching support | N/A | N/A |

**Why your `ai-provider` already handles this correctly:**

`usePromptCache` is set to `true` only for Anthropic in production:
```typescript
usePromptCache: provider === 'anthropic' && !isTest
```
- **Anthropic production** → `true` → `buildMessages()` adds `cacheControl` markers → Anthropic caches the system prompt
- **OpenAI** → `false` → no markers needed, OpenAI caches automatically anyway
- **Ollama** → `false` → no caching, no API cost, irrelevant
- **Groq/Mistral** → `false` → no caching support, flag silently does nothing

The abstraction layer handles the difference — the consumer just sets `systemPrompt` and `ai-provider` does the right thing per provider.

**The two cache layers in `ai-provider` — a clear distinction:**

| | `BoundedCache` (your app cache) | Provider token cache |
|---|---|---|
| What it caches | The **result** (preferences object, Mongo query, vector) | The **computation** of the system prompt |
| Hit means | Model never called — zero tokens, zero cost | Model called, but system prompt tokens are cheaper |
| Measured by | `getStats()` hit/miss counters | `cacheReadTokens` / `cacheCreationTokens` in usage |
| Keyed on | Your `cacheKey` string | The content of the system prompt itself |
| Saves | 100% of cost + latency | ~90% of system prompt token cost (Anthropic) |
| Lives | Your process memory (resets on deploy) | Provider's servers (survives your deploys) |
| Provider-specific? | No — works for all providers | Yes — Anthropic only (in your current setup) |

**The practical gotcha:**

If you switch from Anthropic to OpenAI or Groq and your costs change unexpectedly — check whether your system prompts were relying on Anthropic's prompt caching. On OpenAI, caching is automatic but less aggressive; on Groq, there's no caching at all. The `usePromptCache` flag gives you no signal about this because it silently becomes a no-op for non-Anthropic providers.

**Interview framing:**
> "Token caching is provider-specific — Anthropic requires explicit markers, OpenAI does it automatically, Ollama and Groq don't support it. My gateway abstracts this: `usePromptCache: true` only enables the markers for Anthropic in production; for other providers the flag is a no-op or irrelevant. On top of that I have my own app-level `BoundedCache` that's provider-agnostic — it caches the final result regardless of which model produced it, so a cache hit means zero tokens and zero API call, not just cheaper tokens."
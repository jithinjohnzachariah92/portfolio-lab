# AI Concepts — reference & interview prep

> Conceptual companion to `ROADMAP.md`. This is the "understand it / explain it in an interview" doc — not a task tracker.
> Strategic lane: **TypeScript-native AI product engineering**. Deep on the application layer; conversant on the ML layer.

---

## 1. What I've built vs what RAG actually is

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
# Portfolio Lab

A monorepo that houses self-contained **portfolio systems** and exposes each one
through a Next.js route so anyone can try it in the browser. Features connect to
MongoDB when they need to.

Built with Next.js (App Router) + Nx + Mongoose + the Anthropic SDK.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The landing page lists every
registered feature; click one to try it.

Environment variables (see `.env.local`):

- `ANTHROPIC_API_KEY` — for AI-backed features
- `MONGODB_URI` — for DB-backed features

## Features

| Route                   | What it does                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| `/admin`                | Ask questions in plain English; Claude writes & runs a MongoDB query.  |
| `/profile-preferences`  | Configure shopping preferences with AI assistance, persisted per user. |

## Architecture

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md). In short: each feature is an Nx
library under `libs/<feature>/` (api + ui), shared infra lives in `libs/shared/`
(`db`, `models`, `registry`), and `src/app/` is a thin routing layer that
delegates to the libraries.

## Adding a new feature

1. Scaffold `libs/<slug>/{api,ui}/src/` (copy the shape of an existing feature).
2. Add path aliases in `tsconfig.json` (`@<slug>/api`, `@<slug>/ui`).
3. Add a thin route at `src/app/<slug>/page.tsx` (and `src/app/api/...` if needed).
4. Register it in `libs/shared/registry/src/index.ts` so it shows on the landing page.

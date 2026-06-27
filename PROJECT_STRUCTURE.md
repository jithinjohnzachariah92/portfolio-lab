# Portfolio Lab — Project Structure

A monorepo that houses any number of **portfolio systems**. Each feature is a
self-contained Nx library and is exposed through a thin Next.js route at
`/<feature-slug>` so it can be tried in the browser. Features use shared
infrastructure (MongoDB, Mongoose models) when they need persistence.

```
portfolio-lab/
├── libs/
│   ├── shared/                       # Cross-feature infrastructure
│   │   ├── db/src/        (@shared/db)        # MongoDB connection (connectDB)
│   │   ├── models/src/    (@shared/models)    # Mongoose schemas (Customer, …)
│   │   └── registry/src/  (@shared/registry)  # Feature registry powering the landing page
│   │
│   ├── admin/                        # Feature: natural language → MongoDB query
│   │   ├── api/src/       (@admin/api)        # queryService (Claude + Mongo), handlers
│   │   └── ui/src/        (@admin/ui)         # QueryPage + styles
│   │
│   └── profile-preferences/          # Feature: AI-assisted shopping preferences
│       ├── types/src/     (@profile-preferences/types)
│       ├── utils/src/     (@profile-preferences/utils)
│       ├── api/src/       (@profile-preferences/api)
│       └── ui/src/        (@profile-preferences/ui)
│
├── src/app/                          # Next.js App Router — thin routing layer only
│   ├── page.tsx                      # Landing page (maps over @shared/registry)
│   ├── layout.tsx
│   ├── admin/page.tsx                # re-exports QueryPage
│   ├── profile-preferences/page.tsx  # re-exports PreferencesPage
│   └── api/
│       ├── query/route.ts            # → handleQuery (@admin/api)
│       ├── parsePreferences/route.ts # → handleParsePreferences (@profile-preferences/api)
│       └── savePreference/route.ts   # → handleSavePreference (@profile-preferences/api)
│
├── public/
├── nx.json                           # Nx workspace config
├── tsconfig.json                     # TS path aliases (one per library)
└── package.json
```

## The pattern

Three layers, strictly separated:

1. **Shared infrastructure** (`libs/shared/`) — anything more than one feature needs.
   - `@shared/db` — `connectDB()` MongoDB connection
   - `@shared/models` — Mongoose schemas
   - `@shared/registry` — the list of features (slug, title, description, icon, needsDb)

2. **Feature libraries** (`libs/<slug>/`) — one folder per portfolio system, each with
   its own `api` (server logic + route handlers) and `ui` (React pages/components).
   Larger features may also have `types` and `utils` (see `profile-preferences`).

3. **App routes** (`src/app/`) — no business logic. Page routes re-export a library
   page; API routes delegate to a library handler.

## Conventions

- **Import via aliases**, never relative paths across libraries:
  ```ts
  import { connectDB } from "@shared/db";
  import { Customer } from "@shared/models";
  import { features } from "@shared/registry";
  import { runNaturalLanguageQuery } from "@admin/api";
  import { QueryPage } from "@admin/ui";
  ```
- `@shared/db` and `@shared/models` export **named** symbols (`connectDB`, `Customer`) —
  use named imports.
- API route handlers return a consistent envelope: `{ success: true, data }` or
  `{ success: false, error }`.

## Adding a new feature

1. Create `libs/<slug>/api/src/` and `libs/<slug>/ui/src/` with `index.ts` barrels
   (copy the shape of `libs/admin/`). Add a `project.json`.
2. Add path aliases in `tsconfig.json`: `@<slug>/api`, `@<slug>/ui`.
3. Add the route wrappers in `src/app/<slug>/page.tsx` and any `src/app/api/...`.
4. Add an entry to `libs/shared/registry/src/index.ts` — it appears on the landing
   page automatically.

## Quick commands

```bash
npm run dev          # Start dev server
npx nx graph         # Visualize the dependency graph
npx nx lint admin    # Lint a single feature library
```

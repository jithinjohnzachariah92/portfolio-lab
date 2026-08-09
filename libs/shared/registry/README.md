# @shared/registry

**Feature Registry - Central Catalog of Portfolio Features**

## Purpose

Single source of truth for all portfolio features. This library **decouples feature discovery from feature implementation**, enabling:

- **Dynamic feature listing** - Landing page auto-discovers available features
- **Consistent routing** - Each feature has a standard `/<slug>` route
- **Metadata management** - Central place for titles, descriptions, icons
- **Runtime feature flags** - `needsDb` flag controls database dependency

**Why this exists:** Without a registry, adding a new feature would require changes in multiple places (landing page, routing config, etc.). With this registry, adding a feature is a single entry here plus the feature library itself. This follows **Principle 2: Think in systems, not features** — the system (registry) handles feature discovery.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @shared/registry                                │
├─────────────────────────────────────────────────────────────┤
│  Feature Interface                                                │
│    ├── slug: string (route segment + lib folder)              │
│    ├── title: string (display name)                            │
│    ├── description: string (one-line summary)                 │
│    ├── icon: string (emoji for card)                          │
│    └── needsDb: boolean (requires MongoDB)                    │
│                                                               │
│  features: Feature[]                                           │
│    ├── admin                                                   │
│    ├── profile-preferences                                    │
│    └── receipt-scanner                                        │
│                                                               │
│  getFeature(slug): Feature | undefined                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        Next.js Landing Page (consumes registry)
                            │
                            ▼
  Renders feature cards → links to /<slug> routes
```

## API

### `Feature` Interface

```typescript
interface Feature {
  // Route segment and library folder name
  // e.g., "admin" → /admin route, libs/admin/ directory
  slug: string;
  
  // Display name shown on landing card
  title: string;
  
  // One-line summary shown on landing card
  description: string;
  
  // Emoji used as card icon
  icon: string;
  
  // Whether feature requires MongoDB connection
  // Used to conditionally enable/disable features based on DB availability
  needsDb: boolean;
}
```

### `features` Array

Central array containing all portfolio features. Each feature entry enables:
- Automatic landing page card
- Route discovery (`/<slug>`)
- Database dependency tracking

**Adding a new feature:**
1. Add entry to `features` array
2. Create library at `libs/<slug>/`
3. Create route handler at appropriate location

### `getFeature(slug)` Function

Lookup utility to retrieve feature metadata by slug.

**Usage:**
```typescript
import { getFeature, features } from '@shared/registry';

const adminFeature = getFeature('admin');
// { slug: 'admin', title: 'Admin', description: '...', icon: '🔎', needsDb: true }

// List all features
const allFeatures = features;
```

## Current Features

| Slug | Title | Description | Icon | Needs DB |
|------|-------|-------------|------|----------|
| `admin` | Admin | NL2Mongo query interface for customer data | 🔎 | Yes |
| `profile-preferences` | Profile Preferences | Manage customer preferences via natural language or receipt inference | ⚙️ | Yes |
| `receipt-scanner` | Receipt Scanner | Scan receipts using vision, confirm and save to order history | 🧾 | No |

**Note:** `agent-demo` is defined in the codebase but not in the registry. This is likely a feature in development or a demo that doesn't need to appear on the landing page.

## Usage in Landing Page

The main landing page typically maps over `features` to render cards:

```typescript
import { features } from '@shared/registry';

function LandingPage() {
  return (
    <div className="feature-grid">
      {features.map((feature) => (
        <FeatureCard
          key={feature.slug}
          href={`/${feature.slug}`}
          title={feature.title}
          description={feature.description}
          icon={feature.icon}
          disabled={feature.needsDb && !dbAvailable}
        />
      ))}
    </div>
  );
}
```

## Design Decisions

### Why a Central Registry?
**Principle 2: Think in systems, not features** — Instead of each feature registering itself (which would require each feature to know about the registry), the registry knows about all features. This is simpler and more maintainable.

### Why `slug` as the Key?
The slug serves dual purpose:
1. **Route segment** - `/admin` route maps to admin feature
2. **Library folder** - Feature code lives in `libs/admin/`

This convention reduces configuration — the slug is the single identifier.

### Why `needsDb` Flag?
Allows the UI to conditionally enable/disable features based on database availability. For example, if MongoDB is down:
- `admin` and `profile-preferences` (needsDb: true) → disabled
- `receipt-scanner` (needsDb: false) → still works (only needs AI vision)

This follows **Principle 7: Separate audiences in failure handling** — users see graceful degradation, operators see the error.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports (Feature, features, getFeature) |
| `project.json` | Nx library configuration |

## Related Libraries

All feature libraries depend on this for discovery:
- **admin** - Registered feature
- **profile-preferences** - Registered feature  
- **receipt-scanner** - Registered feature

The landing page (in the main app) consumes this registry to render the feature catalog.

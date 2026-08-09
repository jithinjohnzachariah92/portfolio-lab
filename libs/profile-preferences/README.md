# @profile-preferences

**Customer Preference Management System**

## Purpose

Allows customers to **define, manage, and infer** their shopping preferences through:

1. **Natural Language Input** - Type preferences in plain English (e.g., "I love Nike and vegetarian food")
2. **Structured Selection** - Check boxes for each preference category
3. **Automatic Inference** - System infers preferences from scanned receipts
4. **User Confirmation** - Always confirm before saving inferred preferences

**Why this exists:** Understanding customer preferences enables:
- Personalized recommendations
- Targeted marketing
- Better customer experiences
- Data-driven insights

This follows **Principle 1: Lead with the "why" before the "how"** — customers state what they want, the system figures out how to categorize and store it.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     @profile-preferences                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         API Layer (api/src/)                               ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  handlers.ts                                                          ││
│  │    ├── handleParsePreferences() - Parse NL input                          ││
│  │    ├── handleSavePreference() - Save preferences to DB                    ││
│  │    └── handleGetPreferences() - Fetch preferences for customer            ││
│  │                                                                         ││
│  │  parseService.ts                                                       ││
│  │    ├── inferPreferences() - Main parsing function                          ││
│  │    ├── normalise() - Filter to valid whitelist items                     ││
│  │    ├── getQuality() - Check for empty/low-confidence results               ││
│  │    └── VALID_PREFERENCES - Whitelist of all valid preference items        ││
│  │                                                                         ││
│  │  inferenceService.ts                                                   ││
│  │    └── inferPreferencesFromOrders() - Infer from order history             ││
│  │                                                                         ││
│  │  customerService.ts                                                     ││
│  │    └── saveCustomerPreference() - DB write logic                          ││
│  │                                                                         ││
│  │  rag/retriever.ts                                                      ││
│  │    └── preferenceRetriever - RAG for preference extraction                ││
│  │                                                                         ││
│  │  evals/                                                                 ││
│  │    ├── testCases.ts - Test inputs with expected outputs                   ││
│  │    ├── run.ts - Eval runner with CI gate                                  ││
│  │    ├── scoring.ts - Quality metrics                                       ││
│  │    └── baseline.json - Baseline metrics                                   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Types Layer (types/src/)                           ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │  customer.ts - ICustomerPreferences, IPreferenceItem interfaces           ││
│  │  preferenceTypes.ts - PreferenceType union and PREFERENCE_TYPES array     ││
│  │  index.ts - Barrel export                                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      Utils Layer (utils/src/)                              ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │  preferences.ts - AVAILABLE_PREFERENCES whitelist                         ││
│  │  preferencesMerge.ts - mergePreferences(), getAffectedCategories()          ││
│  │  clientId.ts - getClientId(), clearClientId() - Local storage management  ││
│  │  index.ts - Barrel export                                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         UI Layer (ui/src/)                                  ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │  pages/PreferenecesPage.tsx - Main page with preference management         ││
│  │                                                                         ││
│  │  components/                                                            ││
│  │    ├── PreferenceCard.tsx - Card for each preference category             ││
│  │    ├── PreferenceItem.tsx - Individual preference checkbox                ││
│  │    ├── PreferenceModal.tsx - Modal for editing preferences                ││
│  │    └── SkeletonCard.tsx - Loading skeleton                                 ││
│  │                                                                         ││
│  │  hooks/                                                                ││
│  │    └── usePreferencesManager.ts - State management hook                   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    @shared/db (MongoDB)
                              │
                              ▼
                    Customer collection
```

## Preference Categories

The system supports 5 categories of preferences, each with a predefined whitelist:

### 1. Categories (Product Types)
Fashion, Home, Electronics, Beauty, Sports, Books, Toys, Food & Grocery

### 2. Dietary (Dietary Restrictions/Preferences)
Vegetarian, Vegan, Gluten-free, Organic, Keto, Dairy-free

### 3. Events (Shopping Occasions)
Christmas, Boxing Day, Black Friday, Easter, Summer Sale, New Year, Mother's Day, Father's Day

### 4. Style (Fashion Preferences)
Minimalist, Casual, Formal, Sporty, Vintage, Boho, Modern, Classic

### 5. Brands (Preferred Brands)
Nike, Adidas, Puma, Tommy Hilfiger, Calvin Klein, Gucci, Zara, H&M

**Total: 31 preference items across 5 categories**

## API

### Endpoints

#### `POST /api/parsePreferences`
Parse natural language input into structured preferences.

**Request:**
```typescript
{
  input: string;  // Natural language preferences
}
```

**Response (Success):**
```typescript
{
  success: true;
  fallback: false;
  preferences: ICustomerPreferences;  // Parsed preferences
  lowConfidenceItems: Array<{ category: string; name: string }>;  // Items to confirm
  hasLowConfidence: boolean;
}
```

**Response (Fallback):**
```typescript
{
  success: false;
  fallback: true;
  message: string;  // User-friendly message explaining the issue
}
```

#### `POST /api/savePreference`
Save preferences for a customer.

**Request:**
```typescript
{
  customerId: string;
  preferenceType: "categories" | "dietary" | "events" | "style" | "brands";
  items: IPreferenceItem[];
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
}
```

#### `GET /api/getPreferences?customerId=<id>`
Fetch preferences for a customer, with optional inference from orders.

**Response:**
```typescript
{
  success: true;
  preferences: ICustomerPreferences;  // Current saved preferences
  inferredPreferences: ICustomerPreferences | null;  // Inferred from orders
  isNew: boolean;  // Whether this is a new customer
}
```

## Key Components

### Parsing Pipeline (`parseService.ts`)

The parsing pipeline converts natural language to structured preferences:

```
Input → [Validation] → [RAG Retrieve] → [LLM Extract] → [Normalize] → [Quality Check] → [RAG Store] → Output
```

**Steps:**

1. **Input Validation** - Check length constraints (3-2000 characters)
2. **RAG Retrieve** - Find similar past inputs and their parsed results
3. **LLM Extract** - Use structured output to extract preferences
4. **Normalize** - Filter to valid whitelist items, drop hallucinations
5. **Quality Check** - Identify empty results and low-confidence items
6. **RAG Store** - Store good results for future retrieval

### Inference Pipeline (`inferenceService.ts`)

Infers preferences from order history:

```
Customer ID → [Fetch Orders] → [Build Summary] → [LLM Infer] → [Normalize] → [Filter Already Saved] → Output
```

**Key Features:**
- Conservative inference - only infer what's clearly supported by purchase history
- Retailer vs Brand distinction - grocery stores (M&S, Sainsbury's) are NOT brand preferences
- Dietary inference - only from explicit dietary signals in item names
- Category inference - grocery receipts support "Food & Grocery" category

### Validation Rules

**Input Constraints:**
- Min length: 3 characters
- Max length: 2000 characters (conservative, well under 4000 token limit)
- Must be a string

**Preference Validation:**
- Only items on the whitelist are accepted
- Name matching is case-insensitive
- Invalid items are dropped and logged (not an error)

### Quality Signals

The parser returns quality metadata:

- `isEmpty` - No valid preferences were extracted
- `lowConfidenceItems` - Items the model was uncertain about
- Both are used to guide the UI on next steps

## UI Components

### `PreferencesPage.tsx`

Main page with:
- AI-powered natural language input
- Quick example suggestions
- Preference cards for each category
- Modal for editing preferences
- Inferred preferences modal (auto-opens if inference found new preferences)
- Toast notifications

**User Flow:**
1. User sees current preferences in cards
2. User types natural language or clicks "Edit" on a card
3. System parses the input (or loads current preferences)
4. Modal opens showing all preferences in the affected category
5. User toggles preferences on/off
6. User saves, preferences are updated in the database

### `PreferenceCard.tsx`

Displays a summary of preferences for one category:
- Title
- Selected items (comma-separated)
- Count of selected items

Clicking the card opens the editing modal.

### `PreferenceModal.tsx`

Modal dialog for editing preferences in one or more categories:
- Multi-step support (if multiple categories affected)
- Step indicator
- Checkbox for each preference item
- Back/Next/Finish navigation
- Error display

### `PreferenceItem.tsx`

Individual checkbox for a preference item:
- Checkbox input
- Label with preference name
- Toggle on click

### `SkeletonCard.tsx`

Loading skeleton for preference cards.

### `usePreferencesManager.ts`

React hook for managing preferences state:
- Fetches initial preferences on mount
- Manages loading states
- Handles inferred preferences
- Provides update functions

### `useParsedPreferences.ts`

React hook for parsing natural language input:
- Manages parsing state
- Handles errors
- Returns parse message for display

## Design Decisions

### Why Whitelists?
**Principle 3: Refuse hacks; fix root causes** — Instead of letting the LLM invent arbitrary preference values, we:
1. Define a fixed whitelist for each category
2. Normalize extracted items against the whitelist
3. Drop invalid items (hallucinations)
4. Log dropped items for monitoring

This prevents:
- Hallucinated preferences from being saved
- Inconsistent preference values
- Database pollution

### Why RAG?
Few-shot examples improve parsing quality. The system:
1. Retrieves similar past inputs and their parsed results
2. Adds these as examples to the prompt
3. LLM follows the pattern from examples
4. Stores good results for future use

**Quality Gate:** Only store if not empty AND no low-confidence items.

### Why Conservative Inference?
**Principle 6: Bake in invisible qualities** — Inference from order history is conservative:
- Only infer what's explicitly supported by the data
- Don't infer dietary preferences from ordinary grocery items
- Don't confuse retailer names with brand preferences
- When in doubt, don't infer (empty result is correct)

This prevents:
- False positive inferences
- User distrust in the system
- Difficulty correcting wrong inferences

### Why Always Confirm Inferred Preferences?
**Principle 7: Separate audiences in failure handling** —
- **User**: Sees a modal asking them to confirm inferred preferences
- **System**: Automatically infers from available data

This gives users control while still providing value through automation.

### Why Title Case for Preference Names?
Consistency in naming:
- All preference names use Title Case ("Nike", "Christmas", "Vegetarian")
- Case-insensitive matching for user input
- Case-sensitive storage for consistency

### Why Separate into api/types/utils?
Following **Principle 2: Think in systems, not features** — The separation allows:
- `api/` - Backend logic that depends on external services
- `types/` - Pure TypeScript interfaces (no dependencies)
- `utils/` - Shared utility functions and constants

This makes the code more maintainable and testable.

## Best Practices

### ✅ Do
- Use Title Case for preference names
- Handle empty results gracefully (prompt user to rephrase)
- Highlight low-confidence items for user confirmation
- Always confirm before saving inferred preferences
- Use the available whitelist constants (AVAILABLE_PREFERENCES)

### ❌ Don't
- Don't add new preference items without updating all whitelists
- Don't save preferences without validation
- Don't infer dietary preferences from non-explicit signals
- Don't confuse retailer names with brand preferences

## Files

### API Layer (`api/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | API exports |
| `handlers.ts` | HTTP request handlers |
| `customerService.ts` | Customer DB operations |
| `parseService.ts` | Natural language parsing |
| `inferenceService.ts` | Preference inference from orders |
| `preferencesService.ts` | Client-side service wrapper |
| `rag/retriever.ts` | RAG configuration |
| `evals/testCases.ts` | Test cases |
| `evals/run.ts` | Eval runner |
| `evals/scoring.ts` | Quality metrics |
| `evals/baseline.json` | Baseline metrics |

### Types Layer (`types/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | Barrel export |
| `customer.ts` | Customer and preference interfaces |
| `preferenceTypes.ts` | Preference type definitions |

### Utils Layer (`utils/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | Barrel export |
| `preferences.ts` | AVAILABLE_PREFERENCES whitelist |
| `preferencesMerge.ts` | Preference merging utilities |
| `clientId.ts` | Client ID management |

### UI Layer (`ui/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | UI exports |
| `pages/index.ts` | Barrel export for pages |
| `pages/PreferencesPage.tsx` | Main page component |
| `components/index.ts` | Barrel export for components |
| `components/PreferenceCard.tsx` | Category card |
| `components/PreferenceItem.tsx` | Individual preference checkbox |
| `components/PreferenceModal.tsx` | Editing modal |
| `components/SkeletonCard.tsx` | Loading skeleton |
| `hooks/index.ts` | Hooks barrel export |
| `hooks/usePreferencesManager.ts` | State management hook |

## Dependencies

### Internal
- @shared/db - MongoDB connection
- @shared/models - Customer model

### External
- @jz92/ai-provider - LLM access with structured output
- @jz92/telemetry - Trace logging
- @jz92/vector - Vector store abstraction
- @jz92/retrieval - RAG abstraction
- mongoose - MongoDB ODM
- zod - Schema validation
- next/server - Next.js request/response types
- react - UI framework

## Related Libraries

- **@shared/db** - Database connection
- **@shared/models** - Customer data model (preferences are stored here)
- **@shared/registry** - Feature registration (profile-preferences is registered)
- **receipt-scanner** - Order scanning (provides data for inference)

# @shared/models

**Mongoose Data Models for Customer & Order Data**

## Purpose

Centralized Mongoose schemas and models that define the data structure for the portfolio's domain entities. This library provides **type-safe database access** with:

- **Strong TypeScript types** - Full interface definitions for all models
- **Schema validation** - Mongoose validation at the database level
- **Reusability** - Single source of truth for all feature libraries
- **Extensibility** - Easy to add new models following the same pattern

**Why this exists:** Having models in a shared library ensures consistency across all features. When the Customer or Order schema changes, all dependent libraries get the update automatically without duplication.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @shared/models                                │
├─────────────────────────────────────────────────────────────┤
│  Customer Model (src/Customer.ts)                             │
│    ├── _id: string                                            │
│    ├── name: string (required)                                │
│    ├── email: string (required, unique)                       │
│    ├── accountCreatedAt: Date (required)                      │
│    ├── sparksMember: boolean (default: false)                │
│    ├── profileComplete: boolean (default: false)             │
│    ├── lastLogin: Date (required)                            │
│    ├── totalOrders: number (default: 0)                      │
│    ├── totalSpend: number (default: 0)                        │
│    └── preferences: ICustomerPreferences                      │
│          ├── categories: IPreferenceItem[]                    │
│          ├── dietary: IPreferenceItem[]                       │
│          ├── events: IPreferenceItem[]                        │
│          ├── style: IPreferenceItem[]                         │
│          └── brands: IPreferenceItem[]                         │
│                                                               │
│  Order Model (src/Order.ts)                                  │
│    ├── _id: string                                            │
│    ├── customerId: string (required, indexed)                 │
│    ├── retailer: string (required)                            │
│    ├── purchaseDate: Date (optional)                          │
│    ├── items: IOrderItem[]                                    │
│    │     ├── name: string (required)                         │
│    │     ├── price: number (optional)                        │
│    │     ├── quantity: number (default: 1)                  │
│    │     ├── category: string (optional)                     │
│    │     └── brand: string (optional)                        │
│    ├── total: number (optional)                               │
│    ├── rawText: string (optional) - Original OCR/extraction   │
│    └── scannedAt: Date (default: Date.now)                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    @shared/db (MongoDB)
```

## Models

### Customer

Represents a retail customer with their preferences and purchasing history.

**Schema:**
```typescript
interface ICustomer extends Document {
  _id: string;
  name: string;
  email: string;
  accountCreatedAt: Date;
  sparksMember: boolean;
  profileComplete: boolean;
  lastLogin: Date;
  totalOrders: number;
  totalSpend: number;
  preferences: ICustomerPreferences;
}
```

**Indexes:**
- `email` - Unique index for login/lookup
- `preferences.*` - Array fields for querying preference data

**Preference Categories:**
- `categories` - Product categories (Fashion, Home, Electronics, etc.)
- `dietary` - Dietary restrictions (Vegetarian, Vegan, Gluten-free, etc.)
- `events` - Shopping events (Christmas, Boxing Day, Black Friday, etc.)
- `style` - Fashion styles (Minimalist, Casual, Formal, etc.)
- `brands` - Preferred brands (Nike, Adidas, Zara, etc.)

### Order

Represents a customer's purchase order, typically created from scanned receipts.

**Schema:**
```typescript
interface IOrder extends Document {
  _id: string;
  customerId: string;
  retailer: string;
  purchaseDate?: Date;
  items: IOrderItem[];
  total?: number;
  rawText?: string;
  scannedAt: Date;
}

interface IOrderItem {
  name: string;
  price?: number;
  quantity: number;
  category?: string;
  brand?: string;
}
```

**Indexes:**
- `customerId` - For fetching a customer's order history
- `scannedAt` - For chronological ordering

## API

### Exports

```typescript
// Models (Mongoose Document classes)
import { Customer } from '@shared/models';
import { Order } from '@shared/models';

// TypeScript Interfaces
import type { ICustomer, IOrder, IOrderItem } from '@shared/models';
```

### Usage Examples

**Creating a Customer:**
```typescript
import { Customer } from '@shared/models';

const customer = new Customer({
  _id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com',
  accountCreatedAt: new Date(),
  lastLogin: new Date(),
  preferences: {
    categories: [{ name: 'Fashion', optedIn: true }],
    dietary: [{ name: 'Vegetarian', optedIn: true }],
    events: [],
    style: [],
    brands: [],
  },
});

await customer.save();
```

**Querying Customers:**
```typescript
// Find Sparks members who like Nike
const customers = await Customer.find({
  sparksMember: true,
  'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: true } },
});
```

**Finding Orders:**
```typescript
const orders = await Order.find({ customerId: 'user-123' })
  .sort({ scannedAt: -1 })
  .limit(10);
```

## Design Decisions

### Why Mongoose?
- **Schema validation** - Enforce data structure at write time
- **TypeScript support** - Full type inference from schemas
- **Middleware** - Hooks for pre/post save operations
- **Population** - Reference other documents easily

### Why `Omit<Document, "_id">`?
The `ICustomer` and `IOrder` interfaces extend `Omit<Document, "_id">` to get all Mongoose document methods (save, remove, etc.) while overriding `_id` with a string type. This provides:
- Type-safe `_id` as string (not ObjectId)
- Access to Mongoose document methods
- Clean TypeScript types for application code

### Why `bufferCommands: false`?
In `@shared/db`, connections use `bufferCommands: false` to fail fast rather than silently queue operations during connection. This aligns with **Principle 3: Refuse hacks; fix root causes** — we want to know immediately if the database is unavailable.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports (models + interfaces) |
| `src/Customer.ts` | Customer model and schema |
| `src/Order.ts` | Order model and schema |
| `project.json` | Nx library configuration |

## Dependencies

- **mongoose** - MongoDB ODM
- **@shared/db** - Connection management
- **@profile-preferences/types** - Preference type definitions

## Related Libraries

- **@shared/db** - Database connection (required dependency)
- **@profile-preferences/types** - Preference types used in Customer model
- **admin** - Uses Customer for NL2Mongo queries
- **profile-preferences** - Reads/writes Customer.preferences
- **receipt-scanner** - Creates Order documents

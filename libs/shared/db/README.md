# @shared/db

**MongoDB Connection Manager**

## Purpose

Centralized MongoDB connection management using Mongoose. Provides a **singleton, cached connection** pattern that:

- **Prevents connection storms** — reuses existing connections across requests
- **Handles hot-reload** — Next.js fast-refresh safe via globalThis caching
- **Fails fast** — throws immediately if MONGODB_URI is missing
- **Zero runtime cost** — connection is lazy-initialized on first use

**Why this exists:** In serverless/edge environments, each request could create a new database connection. This library ensures we maintain a single, shared connection pool, reducing latency and avoiding MongoDB connection limits.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        @shared/db                               │
├─────────────────────────────────────────────────────────────┤
│  connectDB()                                                   │
│    └── Cached connection (globalThis._mongoose)               │
│        ├── conn: mongoose connection (if established)         │
│        └── promise: pending connection promise (if in flight) │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                 mongoose.connect(uri, { bufferCommands: false })
                            │
                            ▼
                    MongoDB Atlas (MONGODB_URI)
```

### Connection Caching Strategy

1. **First call to `connectDB()`**: Creates connection promise, stores in `globalThis._mongoose`
2. **Subsequent calls**: Returns cached connection if available, or waits on pending promise
3. **Connection error**: Clears cached promise, allowing retry on next call

This pattern is **Next.js compatible** — the cache survives across module reloads in development (hot reload) but is properly reset in production deployments.

## API

### `connectDB() => Promise<typeof mongoose>`

Returns the Mongoose connection. Automatic singleton management.

**Usage:**
```typescript
import { connectDB } from '@shared/db';

const db = await connectDB();
// db is the mongoose connection
```

**Important:** Call this at the start of any API route that needs database access. The connection is lazy — it won't connect until you call this.

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string |

**Example `.env.local`:**
```
MONGODB_URI=mongodb+srv://user:password@cluster.abc123.mongodb.net/dbname?appName=MyApp
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing MONGODB_URI | Throws `Error` on module load |
| Connection failure | Throws error, clears cached promise for retry |
| Invalid URI | Mongoose throws underlying error |

## Dependencies

- **mongoose** - MongoDB ODM
- **@types/mongoose** - TypeScript definitions (dev)

## Best Practices

### ✅ Do
- Call `connectDB()` once per request at the route handler level
- Let the library handle connection lifecycle — don't manually connect/disconnect
- Import `connectDB` directly where needed (it's lightweight)

### ❌ Don't
- Don't create new connections manually (`mongoose.connect()` directly)
- Don't cache connections yourself — this library already does it
- Don't export the raw `mongoose` instance — use `connectDB()`

## Testing

Mock MONGODB_URI in tests:
```typescript
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
```

The library will throw immediately if MONGODB_URI is undefined, making test failures obvious.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports |
| `src/mongodb.ts` | Connection implementation |
| `project.json` | Nx library configuration |

## Related Libraries

- **@shared/models** - Mongoose schemas that use this connection
- All feature libraries (`admin`, `profile-preferences`, `receipt-scanner`) depend on this

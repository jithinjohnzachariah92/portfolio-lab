# @receipt-scanner

**Vision-Powered Receipt OCR & Order History**

## Purpose

Allows users to **scan receipts using AI vision** and save them to their order history. The system:

1. Accepts an image of a receipt
2. Uses vision to extract retailer, items, prices, and totals
3. Displays the extracted data for user confirmation
4. Saves the confirmed order to the database
5. Displays the user's order history

**Why this exists:** Manual receipt entry is tedious. Vision-based extraction automates this process while giving users control through confirmation. This follows **Principle 1: Lead with the "why" before the "how"** — users upload a receipt, the system figures out the details.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     @receipt-scanner/api                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  handlers.ts                                                     │
│    ├── handleExtractReceipt() - Vision extraction only             │
│    ├── handleSaveOrder() - Save confirmed order to DB              │
│    └── handleGetOrders() - Fetch order history for customer        │
│                                                                   │
│  scanService.ts                                                  │
│    ├── extractReceipt() - Call vision API, extract order data      │
│    ├── saveOrder() - Create and save Order document                 │
│    └── getOrdersForCustomer() - Query orders by customerId         │
│                                                                   │
│  types/index.ts                                                  │
│    └── Type definitions for scan inputs and responses             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    @jz92/ai-provider (Vision)
                              │
                              ▼
                    @shared/db (MongoDB)
                              │
                              ▼
                    Order collection
```

## API

### Endpoints

#### `POST /api/extractReceipt`
Extract order data from a receipt image using vision.

**Request:**
```typescript
{
  image: string;      // Base64-encoded image
  mimeType?: string;  // Image MIME type (default: "image/jpeg")
}
```

**Response (Success):**
```typescript
{
  success: true;
  order: ExtractedOrder;
}
```

**Response (Error):**
```typescript
{
  success: false;
  error: string;
}
```

#### `POST /api/saveOrder`
Save a confirmed order to the database.

**Request:**
```typescript
{
  customerId: string;
  order: ExtractedOrder;
}
```

#### `GET /api/orders?customerId=<id>`
Fetch order history for a customer.

## Design Decisions

- **Vision instead of OCR** - More accurate for complex receipt layouts
- **Always confirm** - Prevents bad data from being saved
- **Optional fields** - Handles incomplete extractions gracefully
- **Separate extraction and saving** - Gives users control

## Files

| File | Purpose |
|------|---------|
| `api/src/handlers.ts` | HTTP request handlers |
| `api/src/scanService.ts` | Core scanning and extraction logic |
| `api/src/index.ts` | API exports |
| `types/index.ts` | Type definitions |
| `ui/src/pages/ReceiptScannerPage.tsx` | Main page component |
| `ui/src/index.ts` | UI exports |
| `project.json` | Nx library configuration |

## Related Libraries

- **@shared/db** - Database connection
- **@shared/models** - Order data model
- **@shared/registry** - Feature registration
- **@profile-preferences** - Uses inferred preferences from order history
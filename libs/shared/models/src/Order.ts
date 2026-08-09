import mongoose, { Schema, Document } from "mongoose";

// ── Order Item Interface ────────────────────────────────────────────────────
//
// Represents a single line item on a receipt/order.
// Price is optional because OCR may not always extract it reliably.
// Quantity defaults to 1 as most receipts show individual items.
export interface IOrderItem {
  name: string;      // Item name (required)
  price?: number;    // Price per unit (optional - may not be extracted)
  quantity: number;  // Number of units (default: 1)
  category?: string; // Product category (optional - inferred)
  brand?: string;    // Brand name (optional - inferred)
}

// ── Order Interface ─────────────────────────────────────────────────────────
//
// Represents a customer's purchase order, typically from a scanned receipt.
// Extends Mongoose Document to get save(), remove(), etc. methods.
//
// See Principle 2: Think in systems, not features —
// Order is the atomic unit of purchase history, enabling features like
// preference inference, spending analytics, and receipt management.
export interface IOrder extends Omit<Document, "_id"> {
  _id: string;
  customerId: string;        // Link to Customer document
  retailer: string;          // Store/retailer name (required)
  purchaseDate?: Date;      // When the purchase occurred (optional)
  items: IOrderItem[];      // Line items from the receipt
  total?: number;           // Order total (optional - may not be extracted)
  // Raw extraction text for debugging/audit
  // Preserves the original OCR/vision output
  rawText?: string;
  scannedAt: Date;          // When the receipt was scanned (auto-set)
}

// ── Order Item Schema ──────────────────────────────────────────────────────
//
// Mongoose sub-schema for order line items.
// All fields except name are optional to handle partial extractions
// from receipt OCR (vision models may miss some details).
const OrderItemSchema = new Schema<IOrderItem>({
  name: { type: String, required: true },
  price: { type: Number },      // Optional: OCR may not extract
  quantity: { type: Number, default: 1 },
  category: { type: String },   // Optional: inferred post-extraction
  brand: { type: String },      // Optional: inferred post-extraction
});

// ── Order Schema ───────────────────────────────────────────────────────────
//
// Mongoose schema for orders.
//
// Indexes:
//   - customerId: indexed for efficient order history queries
//   - scannedAt: default sort field for "recent orders" queries
//
// The schema is designed to be flexible — many fields are optional
// because receipt extraction is imperfect. Consumers should handle
// undefined values gracefully (Principle 6: Bake in invisible qualities).
const OrderSchema = new Schema<IOrder>(
  {
    _id: String,
    customerId: { type: String, required: true, index: true },
    retailer: { type: String, required: true },
    purchaseDate: { type: Date },           // Optional: may not be on receipt
    items: [OrderItemSchema],
    total: { type: Number },                // Optional: may not be extracted
    rawText: { type: String },               // Optional: for audit/debug
    scannedAt: { type: Date, default: Date.now }, // Auto-set on creation
  } as any
);

// ── Model Registration ─────────────────────────────────────────────────────
//
// Prevents re-registration of the model in hot-reload scenarios.
export default mongoose.models.Order ||
  mongoose.model<IOrder>("Order", OrderSchema);
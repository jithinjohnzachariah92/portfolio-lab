import { z } from "zod";
import { randomUUID } from "crypto";
import { generateStructuredFromImage } from "@jz92/ai-provider";
import { connectDB } from "@shared/db";
import { Order, IOrder } from "@shared/models";

// ── Schema Context ────────────────────────────────────────────────────────
//
// System prompt for vision-based receipt extraction.
// Note: The actual prompt is truncated in the source with `...` but would
// typically explain how to extract retailer, items, prices, dates from receipts.
const RECEIPT_SCHEMA_CONTEXT = `...`; // unchanged

// ── Zod Schema for Receipt Extraction ────────────────────────────────────
//
// Defines the expected structure for extracted receipt data.
// All fields except retailer and item names are optional to handle
// incomplete or unclear receipts.
//
// See Principle 6: Bake in invisible qualities —
// Making fields optional ensures we handle real-world receipts gracefully.
const orderExtractionSchema = z.object({
  retailer: z.string(),           // Store name (required)
  purchaseDate: z.string().optional(),  // Date string (optional)
  items: z.array(z.object({
    name: z.string(),           // Item name (required)
    price: z.number().optional(),        // Price per unit (optional)
    quantity: z.number().default(1),     // Quantity (default: 1)
  })).default([]),
  total: z.number().optional(),         // Total amount (optional)
});

export type ExtractedOrder = z.infer<typeof orderExtractionSchema>;

export type ScanReceiptInput = {
  image: string;      // Base64-encoded image data
  mimeType?: string;  // MIME type (default: "image/jpeg")
};

// ── Extract Receipt ──────────────────────────────────────────────────────
//
// Vision-based extraction ONLY - no database operations.
// This is deliberately separated from saving to allow:
//   - User review/confirmation before saving
//   - Editing extracted data
//   - Trying multiple images without DB writes
//
// See Principle 4: Design for the consumer, not yourself —
// This function does one thing (extraction) and does it well.
/**
 * Extract order data from a receipt image using vision.
 * 
 * @param input - Image data and optional MIME type
 * @returns ExtractedOrder with retailer, items, prices, dates
 * 
 * Uses structured output from vision model to get typed results.
 * Does NOT save to database - caller must confirm first.
 */
export const extractReceipt = async (
  input: ScanReceiptInput
): Promise<ExtractedOrder> => {
  const { image, mimeType } = input;

  const { data: extracted } = await generateStructuredFromImage({
    image,
    mimeType: mimeType ?? "image/jpeg",
    systemPrompt: RECEIPT_SCHEMA_CONTEXT,
    prompt: "Extract the order details from this receipt.",
    schema: orderExtractionSchema,
  });

  return extracted;
};

// ── Save Order ───────────────────────────────────────────────────────────
//
// Persists a user-confirmed order to the database.
// Called only after user has reviewed and confirmed the extracted data.
//
// See Principle 3: Refuse hacks; fix root causes —
// We validate the purchase date before saving to prevent invalid data.
export type SaveOrderInput = {
  customerId: string;
  order: ExtractedOrder; // possibly edited by the user before confirming
};

/**
 * Save an order to the database.
 * 
 * @param input - Customer ID and order data
 * @returns The saved Order document
 * 
 * Creates a new Order document with:
 *   - Generated UUID as _id
 *   - Validated purchase date (or undefined if invalid)
 *   - All items from the extracted order
 *   - Raw extraction JSON for audit/debugging
 */
export const saveOrder = async (input: SaveOrderInput): Promise<IOrder> => {
  const { customerId, order } = input;

  await connectDB();

  // Parse and validate the purchase date string
  // If parsing fails or results in NaN, treat as undefined
  const parsedDate = order.purchaseDate ? new Date(order.purchaseDate) : undefined;
  const validPurchaseDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  const newOrder = new Order({
    _id: randomUUID(),           // Generate unique ID
    customerId,                  // Link to customer
    retailer: order.retailer,    // Store name
    purchaseDate: validPurchaseDate,  // Validated date (or undefined)
    items: order.items,          // Line items
    total: order.total,          // Total amount
    // Store raw extraction for audit/debugging
    // Allows reconstructing what the vision model returned
    rawText: JSON.stringify(order),
  });

  await newOrder.save();
  return newOrder;
};

// ── Get Orders for Customer ──────────────────────────────────────────────
//
// Fetches order history for a customer, sorted by scan date (newest first).
// Powers the order history view on page load.
/**
 * Fetch all orders for a customer.
 * 
 * @param customerId - The customer's unique identifier
 * @returns Array of Order documents, sorted by scannedAt (newest first)
 */
export const getOrdersForCustomer = async (customerId: string): Promise<IOrder[]> => {
  await connectDB();
  return Order.find({ customerId }).sort({ scannedAt: -1 });
};
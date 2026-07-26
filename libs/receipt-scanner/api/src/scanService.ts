import { z } from "zod";
import { randomUUID } from "crypto";
import { generateStructuredFromImage } from "@jz92/ai-provider";
import { connectDB } from "@shared/db";
import { Order, IOrder } from "@shared/models";

const RECEIPT_SCHEMA_CONTEXT = `...`; // unchanged

const orderExtractionSchema = z.object({
  retailer: z.string(),
  purchaseDate: z.string().optional(),
  items: z.array(z.object({
    name: z.string(),
    price: z.number().optional(),
    quantity: z.number().default(1),
  })).default([]),
  total: z.number().optional(),
});

export type ExtractedOrder = z.infer<typeof orderExtractionSchema>;

export type ScanReceiptInput = {
  image: string;
  mimeType?: string;
};

// ── extractReceipt — vision extraction ONLY, no DB write ─────────────────────
// Returns the proposed order for the user to review/confirm before anything
// is persisted.
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

// ── saveOrder — the actual DB write, called only after user confirmation ────
export type SaveOrderInput = {
  customerId: string;
  order: ExtractedOrder; // possibly edited by the user before confirming
};

export const saveOrder = async (input: SaveOrderInput): Promise<IOrder> => {
  const { customerId, order } = input;

  await connectDB();

  const parsedDate = order.purchaseDate ? new Date(order.purchaseDate) : undefined;
  const validPurchaseDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  const newOrder = new Order({
    _id: randomUUID(),
    customerId,
    retailer: order.retailer,
    purchaseDate: validPurchaseDate,
    items: order.items,
    total: order.total,
    rawText: JSON.stringify(order),
  });

  await newOrder.save();
  return newOrder;
};

// ── getOrdersForCustomer — powers the order history view on page load ───────
export const getOrdersForCustomer = async (customerId: string): Promise<IOrder[]> => {
  await connectDB();
  return Order.find({ customerId }).sort({ scannedAt: -1 });
};
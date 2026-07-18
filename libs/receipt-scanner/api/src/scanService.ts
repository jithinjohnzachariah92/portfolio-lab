import { z } from "zod";
import { randomUUID } from "crypto";
import { generateStructuredFromImage } from "@jz92/ai-provider";
import { connectDB } from "@shared/db";
import { Order, IOrder } from "@shared/models";

const RECEIPT_SCHEMA_CONTEXT = `
You are a receipt scanner for a retail customer database.
Extract the following from the receipt image:
  - retailer: the store/brand name
  - purchaseDate: the date of purchase, if visible (format: YYYY-MM-DD)
  - items: a list of purchased items, each with a name, price (if visible),
    and quantity (default 1 if not shown)
  - total: the final total amount paid, if visible

Be conservative — only extract what is actually legible on the receipt.
If a field isn't visible or readable, omit it rather than guessing.
`;

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

export type ScanReceiptInput = {
  customerId: string;
  image: string;       // base64
  mimeType?: string;
};

export const scanReceipt = async (
  input: ScanReceiptInput
): Promise<IOrder> => {
  const { customerId, image, mimeType } = input;

  const { data: extracted } = await generateStructuredFromImage({
    image,
    mimeType: mimeType ?? "image/jpeg",
    systemPrompt: RECEIPT_SCHEMA_CONTEXT,
    prompt: "Extract the order details from this receipt.",
    schema: orderExtractionSchema,
  });

  await connectDB();

  const newOrder = new Order({
    _id: randomUUID(),
    customerId,
    retailer: extracted.retailer,
    purchaseDate: extracted.purchaseDate ? new Date(extracted.purchaseDate) : undefined,
    items: extracted.items,
    total: extracted.total,
    rawText: JSON.stringify(extracted),
  });

  await newOrder.save();

  return newOrder;
};
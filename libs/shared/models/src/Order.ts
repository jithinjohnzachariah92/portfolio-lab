import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem {
  name: string;
  price?: number;
  quantity: number;
  category?: string;
  brand?: string;
}

export interface IOrder extends Omit<Document, "_id"> {
  _id: string;
  customerId: string;
  retailer: string;
  purchaseDate?: Date;
  items: IOrderItem[];
  total?: number;
  rawText?: string;
  scannedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  name: { type: String, required: true },
  price: { type: Number },
  quantity: { type: Number, default: 1 },
  category: { type: String },
  brand: { type: String },
});

const OrderSchema = new Schema<IOrder>(
  {
    _id: String,
    customerId: { type: String, required: true, index: true },
    retailer: { type: String, required: true },
    purchaseDate: { type: Date },
    items: [OrderItemSchema],
    total: { type: Number },
    rawText: { type: String },
    scannedAt: { type: Date, default: Date.now },
  } as any
);

export default mongoose.models.Order ||
  mongoose.model<IOrder>("Order", OrderSchema);
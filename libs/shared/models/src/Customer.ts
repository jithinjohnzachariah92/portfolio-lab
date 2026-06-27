import mongoose, { Schema, Document } from "mongoose";
import { IPreferenceItem } from "@profile-preferences/types";

export interface ICustomer extends Omit<Document, "_id"> {
  _id: string;
  name: string;
  email: string;
  accountCreatedAt: Date;
  sparksMember: boolean;
  profileComplete: boolean;
  lastLogin: Date;
  totalOrders: number;
  totalSpend: number;
  preferences: {
    categories: IPreferenceItem[];
    dietary: IPreferenceItem[];
    events: IPreferenceItem[];
    style: IPreferenceItem[];
    brands: IPreferenceItem[];
  };
}

const PreferenceItemSchema = new Schema<IPreferenceItem>({
  name: { type: String, required: true },
  optedIn: { type: Boolean, default: true },
});

const CustomerSchema = new Schema<ICustomer>(
  {
    _id: String,
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    accountCreatedAt: { type: Date, required: true },
    sparksMember: { type: Boolean, default: false },
    profileComplete: { type: Boolean, default: false },
    lastLogin: { type: Date, required: true },
    totalOrders: { type: Number, default: 0 },
    totalSpend: { type: Number, default: 0 },
    preferences: {
      categories: [PreferenceItemSchema],
      dietary: [PreferenceItemSchema],
      events: [PreferenceItemSchema],
      style: [PreferenceItemSchema],
      brands: [PreferenceItemSchema],
    },
  } as any
);

export default mongoose.models.Customer ||
  mongoose.model<ICustomer>("Customer", CustomerSchema);

import mongoose, { Schema, Document } from "mongoose";
import { IPreferenceItem } from "@profile-preferences/types";

// ── Customer Interface ──────────────────────────────────────────────────────
//
// Represents a retail customer in the system.
// Extends Mongoose Document to get save(), remove(), etc. methods,
// while overriding _id with string type for consistency.
//
// See Principle 4: Design for the consumer, not yourself —
// we use string _id so consumers don't need to handle ObjectId conversion.
export interface ICustomer extends Omit<Document, "_id"> {
  _id: string;
  name: string;
  email: string;
  accountCreatedAt: Date;
  // M&S Sparks loyalty program membership
  sparksMember: boolean;
  // Whether user has completed their profile setup
  profileComplete: boolean;
  lastLogin: Date;
  // Lifecycle metrics for personalization
  totalOrders: number;
  totalSpend: number;
  // Preference data for recommendation engine
  // See @profile-preferences/types for available categories
  preferences: {
    categories: IPreferenceItem[];
    dietary: IPreferenceItem[];
    events: IPreferenceItem[];
    style: IPreferenceItem[];
    brands: IPreferenceItem[];
  };
}

// ── Preference Item Schema ──────────────────────────────────────────────────
// Shared sub-schema for all preference categories.
// Each preference has a name (from the whitelist) and optedIn boolean.
// Default optedIn: true means if a preference is mentioned without explicit
// positive/negative sentiment, we assume positive intent.
const PreferenceItemSchema = new Schema<IPreferenceItem>({
  name: { type: String, required: true },
  optedIn: { type: Boolean, default: true },
});

// ── Customer Schema ────────────────────────────────────────────────────────
//
// Mongoose schema definition. Note the 'as any' cast —
// this is required because Mongoose's type inference for nested objects
// doesn't perfectly align with our ICustomer interface.
//
// Indexes:
//   - email: unique index for login and lookup
//   - customerId: implicit via _id
//
// The preferences sub-document uses the PreferenceItemSchema for each category,
// enabling queries like:
//   Customer.find({ 'preferences.brands': { $elemMatch: { name: 'Nike', optedIn: true } } })
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

// ── Model Registration ─────────────────────────────────────────────────────
//
// Prevents re-registration of the model in hot-reload scenarios.
// mongoose.models.Customer will exist after first registration.
export default mongoose.models.Customer ||
  mongoose.model<ICustomer>("Customer", CustomerSchema);

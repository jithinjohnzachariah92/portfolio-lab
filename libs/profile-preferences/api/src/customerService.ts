
import { IPreferenceItem, ICustomerPreferences } from "@profile-preferences/types";
import { connectDB } from "@shared/db";
import { Customer } from "@shared/models";

type PreferenceType = "categories" | "dietary" | "events" | "style" | "brands";

export async function saveCustomerPreference(
  customerId: string,
  preferenceType: PreferenceType,
  items: IPreferenceItem[]
) {
  await connectDB();

  const updateData: Record<string, unknown> = {};
  updateData[`preferences.${preferenceType}`] = items;

  let result = await Customer.findByIdAndUpdate(customerId, updateData, {
    new: true,
  });

  if (!result) {
    // Customer doesn't exist, create one
    const defaultPreferences: ICustomerPreferences = {
      categories: preferenceType === "categories" ? items : [],
      dietary: preferenceType === "dietary" ? items : [],
      events: preferenceType === "events" ? items : [],
      style: preferenceType === "style" ? items : [],
      brands: preferenceType === "brands" ? items : [],
    };

    result = await Customer.create({
      _id: customerId,
      name: "Guest",
      email: `guest-${customerId}@nl2mongo.local`,
      accountCreatedAt: new Date(),
      lastLogin: new Date(),
      preferences: defaultPreferences,
    });
  }

  return result;
}

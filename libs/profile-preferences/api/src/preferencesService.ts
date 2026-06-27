import { ICustomerPreferences, IPreferenceItem } from "@profile-preferences/types";

export const preferencesService = {
  async fetchPreferences(
    customerId: string
  ): Promise<{ preferences: ICustomerPreferences; isNew: boolean }> {
    const res = await fetch(`/api/getPreferences?customerId=${customerId}`);
    if (!res.ok) throw new Error("Failed to fetch preferences");
    return res.json();
  },

  async savePreference(
    customerId: string,
    type: "categories" | "dietary" | "events" | "style" | "brands",
    items: IPreferenceItem[]
  ): Promise<void> {
    const res = await fetch("/api/savePreference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, preferenceType: type, items }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to save preferences");
    }
  },

  async parsePreferences(input: string): Promise<ICustomerPreferences> {
    const res = await fetch("/api/parsePreferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Parsing failed");
    }
    const json = await res.json();
    return json.preferences;
  },
};

export type PreferenceType =
  | "categories"
  | "dietary"
  | "events"
  | "style"
  | "brands";

export const PREFERENCE_TYPES: { type: PreferenceType; title: string }[] = [
  { type: "categories", title: "Categories" },
  { type: "dietary", title: "Dietary" },
  { type: "events", title: "Events" },
  { type: "style", title: "Style" },
  { type: "brands", title: "Brands" },
];

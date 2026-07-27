/**
 * Central registry of portfolio features.
 *
 * Each feature is a self-contained system living under `libs/<slug>/` and
 * exposed at the Next.js route `/<slug>`. The landing page maps over this
 * list to render its index, so adding a new feature is a single entry here
 * plus its library + route wrapper.
 */
export interface Feature {
  /** Route segment and library folder name, e.g. "admin" → /admin */
  slug: string;
  /** Display name shown on the landing card */
  title: string;
  /** One-line summary shown on the landing card */
  description: string;
  /** Emoji used as the card icon */
  icon: string;
  /** Whether the feature requires the MongoDB connection (@shared/db) */
  needsDb: boolean;
}

export const features: Feature[] = [
  {
    slug: "admin",
    title: "Admin",
    description:
      "Scan a receipt and Claude reads it directly using vision — no OCR. Confirm the extracted items and total, and it's saved to your order history.",
    icon: "🔎",
    needsDb: true,
  },
  {
    slug: "profile-preferences",
    title: "Profile Preferences",
    description:
      "Set preferences by typing naturally, or let Claude infer them from your saved receipts — either way, you confirm before anything is saved to your profile.",
    icon: "⚙️",
    needsDb: true,
  },
  {
    slug: "receipt-scanner",
    title: "Receipt Scanner",
    description:
      "Scan a receipt and Claude reads it directly using vision — no OCR. Confirm the extracted items and total, and it's saved to your order history.",
    icon: "🧾",
    needsDb: false,
  },
];

export function getFeature(slug: string): Feature | undefined {
  return features.find((f) => f.slug === slug);
}

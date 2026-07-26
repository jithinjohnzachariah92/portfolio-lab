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
      "Ask questions about customer data in plain English; Claude generates a MongoDB query and runs it live.",
    icon: "🔎",
    needsDb: true,
  },
  {
    slug: "profile-preferences",
    title: "Profile Preferences",
    description:
      "Configure shopping preferences with AI assistance, persisted per user to MongoDB.",
    icon: "⚙️",
    needsDb: true,
  },
  {
    slug: "receipt-scanner",
    title: "Receipt Scanner",
    description:
      "Scan and analyze receipts using AI-powered optical character recognition and data extraction.",
    icon: "🧾",
    needsDb: false,
  },
];

export function getFeature(slug: string): Feature | undefined {
  return features.find((f) => f.slug === slug);
}

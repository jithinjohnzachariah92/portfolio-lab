import { generateStructured } from "@jz92/ai-provider";
import { PreferencesSchema, type ParsedPreferences } from "./parseService";
import { normalise, getQuality } from "./parseService";
import { Order, type IOrderItem } from "@shared/models";

// ── Preference inference from order history ───────────────────────────────────
// Conservative by design, same philosophy as receipt extraction: only infer
// what's genuinely supported by whitelist matches from actual purchased item
// names/retailers — never force a category/brand match that doesn't fit.
//
// Known limitation, worth remembering: VALID_PREFERENCES.brands is a fashion
// retail whitelist (Nike, Adidas, Zara, H&M...); actual scanned receipts so
// far are grocery (M&S, Sainsbury's). Inference will mostly land on
// `categories` ("Food & Grocery" is in the whitelist) and `dietary` (only
// when item names explicitly signal it) — brands will often come back empty,
// and that's correct, not a bug.

const INFERENCE_SYSTEM_PROMPT = `
You are inferring likely shopping preferences from a customer's purchase history.

You will be given a list of past orders — retailer names and item names.
Based ONLY on what was actually purchased, infer which preferences (from the
fixed categories below) the customer likely has.

Be conservative. Only infer a preference if the purchase history genuinely
supports it. Do not guess. If nothing in the order history clearly supports
a category, leave it empty — an empty result is correct and expected when
purchase history doesn't reveal a clear preference in that dimension.

Categories: dietary, events, style, brands, categories (product categories
like "Food & Grocery", "Books", "Electronics" etc).

CRITICAL — retailer names are never brand preferences: the retailer name
(e.g. "M&S", "Sainsbury's", "Tesco") is NEVER a brand preference. "brands"
refers ONLY to this fixed fashion-brand list: Nike, Adidas, Puma, Tommy
Hilfiger, H&M, Zara, Gucci, Calvin Klein — clothing brands a customer might
want, completely separate from which shop they bought groceries at. Only
infer a brand preference if an item name or retailer is literally one of
those exact names.

If the retailer is a grocery store (M&S, Sainsbury's, Tesco, etc.), that
supports inferring categories: "Food & Grocery" — NOT a brand.

CRITICAL — dietary inference is positive-signal-only: only infer a dietary
preference when an item's name EXPLICITLY contains a dietary signal word —
e.g. an item literally named "Gluten Free Bread" or "Vegan Cheese" supports
inferring that preference with optedIn: true.

Do NOT infer the ABSENCE of a dietary preference from ordinary purchases.
Buying meat, dairy, or gluten-containing items does NOT mean the customer
dislikes or opts out of Vegetarian/Vegan/Gluten-free — it simply means
those items don't support inferring that preference either way. Ordinary
grocery items with no explicit dietary labeling should not affect dietary
preferences at all — leave dietary empty rather than infer anything from them.

Example: if the order history shows purchases from M&S or Sainsbury's with
grocery items (bread, chocolate, fresh produce, meat), infer:
{ "categories": [{ "name": "Food & Grocery", "optedIn": true, "confident": true }],
  "dietary": [], "events": [], "style": [], "brands": [] }
— because grocery shopping clearly supports a "Food & Grocery" category
preference, but says nothing about dietary restrictions, style, brands, or
events unless an item name explicitly signals one of those.
`;

export type InferenceResult =
  | { success: true; inferredPreferences: ParsedPreferences; isEmpty: boolean }
  | { success: false; reason: string };

export const inferPreferencesFromOrders = async (
  customerId: string,
  traceId?: string
): Promise<InferenceResult> => {
  const orders = await Order.find({ customerId }).sort({ scannedAt: -1 }).limit(20);

  if (orders.length === 0) {
    return { success: false, reason: "no order history" };
  }

  // Build a compact text summary of order history for the model — retailer
  // + item names only, no prices/dates (irrelevant to preference inference,
  // keeps the prompt small).
  const orderSummary = orders
    .map((o) => `${o.retailer}: ${o.items.map((i:IOrderItem) => i.name).join(", ")}`)
    .join("\n");

  try {
    const { data } = await generateStructured({
      systemPrompt: INFERENCE_SYSTEM_PROMPT,
      prompt: `Order history:\n${orderSummary}`,
      schema: PreferencesSchema,
      traceId,
    });

    const normalised = normalise(data);
    const quality = getQuality(normalised);

    return { success: true, inferredPreferences: normalised, isEmpty: quality.isEmpty };
  } catch (err) {
    console.error("[inferPreferencesFromOrders] error:", err);
    return { success: false, reason: "inference failed" };
  }
};
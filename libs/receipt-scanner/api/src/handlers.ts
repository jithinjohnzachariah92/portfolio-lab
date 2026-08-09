import { NextRequest, NextResponse } from "next/server";
import { extractReceipt, saveOrder, getOrdersForCustomer } from "./scanService";

// ── Extract Receipt Handler ────────────────────────────────────────────
//
// Endpoint: POST /api/extractReceipt
// Purpose: Extract order data from receipt image using vision
//
// See Principle 4: Design for the consumer, not yourself —
// This handler provides a clean interface for vision extraction.
/**
 * Extract order data from a receipt image.
 * 
 * This is extraction ONLY - no data is saved to the database.
 * The caller must review and confirm before saving.
 */
export async function handleExtractReceipt(req: NextRequest) {
  try {
    // ── Input Validation ───────────────────────────────────────────
    const { image, mimeType } = await req.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { success: false, error: "image (base64) is required" },
        { status: 400 }
      );
    }

    // ── Vision Extraction ────────────────────────────────────────
    const order = await extractReceipt({ image, mimeType });

    // ── Response ─────────────────────────────────────────────────
    return NextResponse.json({ success: true, order });
  } catch (error) {
    // ── Error Handling ───────────────────────────────────────────
    console.error("[handleExtractReceipt] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Extraction failed",
      },
      { status: 500 }
    );
  }
}

// ── Save Order Handler ──────────────────────────────────────────────────
//
// Endpoint: POST /api/saveOrder
// Purpose: Save a user-confirmed order to the database
//
// See Principle 3: Refuse hacks; fix root causes —
// This handler only saves after explicit user confirmation.
/**
 * Save a confirmed order to the database.
 * 
 * This is called AFTER the user has reviewed and confirmed
 * the extracted data. The order may have been edited by the user.
 */
export async function handleSaveOrder(req: NextRequest) {
  try {
    // ── Input Validation ───────────────────────────────────────────
    const { customerId, order } = await req.json();

    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json(
        { success: false, error: "customerId is required" },
        { status: 400 }
      );
    }
    if (!order || typeof order !== "object") {
      return NextResponse.json(
        { success: false, error: "order is required" },
        { status: 400 }
      );
    }

    // ── Save to Database ──────────────────────────────────────────
    const saved = await saveOrder({ customerId, order });

    // ── Response ─────────────────────────────────────────────────
    return NextResponse.json({ success: true, order: saved });
  } catch (error) {
    // ── Error Handling ───────────────────────────────────────────
    console.error("[handleSaveOrder] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Save failed",
      },
      { status: 500 }
    );
  }
}

// ── Get Orders Handler ─────────────────────────────────────────────────
//
// Endpoint: GET /api/orders?customerId=<id>
// Purpose: Fetch order history for a customer
//
// Powers the "Your Receipts" section on page load.
/**
 * Fetch order history for a customer.
 * 
 * Returns orders sorted by scannedAt (newest first).
 */
export async function handleGetOrders(req: NextRequest) {
  try {
    // ── Input Validation ───────────────────────────────────────────
    const customerId = req.nextUrl.searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "customerId is required" },
        { status: 400 }
      );
    }

    // ── Fetch Orders ─────────────────────────────────────────────
    const orders = await getOrdersForCustomer(customerId);

    // ── Response ─────────────────────────────────────────────────
    return NextResponse.json({ success: true, orders });
  } catch (error) {
    // ── Error Handling ───────────────────────────────────────────
    console.error("[handleGetOrders] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch orders",
      },
      { status: 500 }
    );
  }
}
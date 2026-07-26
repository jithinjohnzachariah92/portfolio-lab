import { NextRequest, NextResponse } from "next/server";
import { extractReceipt, saveOrder, getOrdersForCustomer } from "./scanService";

// ── Extract only — vision call, no DB write ───────────────────────────────────
export async function handleExtractReceipt(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { success: false, error: "image (base64) is required" },
        { status: 400 }
      );
    }

    const order = await extractReceipt({ image, mimeType });

    return NextResponse.json({ success: true, order });
  } catch (error) {
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

// ── Save — persists a user-confirmed (possibly edited) order ──────────────────
export async function handleSaveOrder(req: NextRequest) {
  try {
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

    const saved = await saveOrder({ customerId, order });

    return NextResponse.json({ success: true, order: saved });
  } catch (error) {
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

// ── Fetch order history — powers the page's on-load view ─────────────────────
export async function handleGetOrders(req: NextRequest) {
  try {
    const customerId = req.nextUrl.searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "customerId is required" },
        { status: 400 }
      );
    }

    const orders = await getOrdersForCustomer(customerId);

    return NextResponse.json({ success: true, orders });
  } catch (error) {
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
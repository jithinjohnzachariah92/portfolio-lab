import { NextRequest, NextResponse } from "next/server";
import { scanReceipt } from "./scanService";

export async function handleScanReceipt(req: NextRequest) {
  try {
    const { customerId, image, mimeType } = await req.json();

    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json(
        { success: false, error: "customerId is required" },
        { status: 400 }
      );
    }
    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { success: false, error: "image (base64) is required" },
        { status: 400 }
      );
    }

    const order = await scanReceipt({ customerId, image, mimeType });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error("[handleScanReceipt] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Scan failed",
      },
      { status: 500 }
    );
  }
}
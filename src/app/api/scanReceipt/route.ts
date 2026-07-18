import { NextRequest } from "next/server";
import { handleScanReceipt } from "@receipt-scanner/api/handlers";

export async function POST(req: NextRequest) {
  return handleScanReceipt(req);
}
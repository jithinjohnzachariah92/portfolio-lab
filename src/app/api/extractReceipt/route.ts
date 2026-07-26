import { NextRequest } from "next/server";
import { handleExtractReceipt } from "@receipt-scanner/api";

export async function POST(req: NextRequest) {
  return handleExtractReceipt(req);
}
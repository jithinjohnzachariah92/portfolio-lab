import { NextRequest } from "next/server";
import { handleSaveOrder } from "@receipt-scanner/api";

export async function POST(req: NextRequest) {
  return handleSaveOrder(req);
}
import { NextRequest } from "next/server";
import { handleGetOrders } from "@receipt-scanner/api";

export async function GET(req: NextRequest) {
  return handleGetOrders(req);
}
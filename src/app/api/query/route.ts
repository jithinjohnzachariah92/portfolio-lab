import { NextRequest } from "next/server";
import { handleQuery } from "@admin/api/handlers";

export async function POST(req: NextRequest) {
  return handleQuery(req);
}

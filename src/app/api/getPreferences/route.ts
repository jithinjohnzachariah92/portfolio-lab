import { NextRequest } from "next/server";
import { handleGetPreferences } from "@profile-preferences/api/handlers";

export async function GET(req: NextRequest) {
  return handleGetPreferences(req);
}

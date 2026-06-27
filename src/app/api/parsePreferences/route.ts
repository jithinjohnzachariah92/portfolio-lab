import { NextRequest } from "next/server";
import { handleParsePreferences } from "@profile-preferences/api/handlers";

export async function POST(req: NextRequest) {
  return handleParsePreferences(req);
}

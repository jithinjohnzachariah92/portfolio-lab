import { NextRequest } from "next/server";
import { handleSavePreference } from "@profile-preferences/api/handlers";

export async function POST(req: NextRequest) {
  return handleSavePreference(req);
}

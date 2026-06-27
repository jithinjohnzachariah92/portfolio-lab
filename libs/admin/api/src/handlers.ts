import { NextRequest, NextResponse } from "next/server";

import { runNaturalLanguageQuery } from "./queryService";

export async function handleQuery(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "Question is required" },
        { status: 400 }
      );
    }

    const data = await runNaturalLanguageQuery(question);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[handleQuery] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Query failed",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_PREFERENCES } from "@profile-preferences/utils";
import { ICustomerPreferences } from "@profile-preferences/types";
import { inferPreferences } from "./parseService";
import { saveCustomerPreference } from "./customerService";
import { Customer } from "@shared/models";
import { connectDB } from "@shared/db";
import { randomUUID } from "crypto";
import { printTraceSummary } from "node_modules/@jz92/telemetry/dist/lib/traceSummary";
import { inferPreferencesFromOrders } from "./inferenceService";

// ── Input constraints ──────────────────────────────────────────────────────
// Keep these in sync with maxInputTokens in parseService (4000 tokens ≈ 16000 chars).
// Checked at the route level so over-length inputs return a clean 400 before
// spending any tokens — rather than hitting the token-budget guard inside ai-provider.
const MIN_INPUT_LENGTH = 3;
const MAX_INPUT_LENGTH = 2000; // conservative; well under the 4000-token model limit

// ── Error code → HTTP response mapping ────────────────────────────────────
// AIProviderError codes surface from parseService so this route can return
// the right status + message per failure type rather than a generic fallback.
const errorResponse = (errorCode: string) => {
  switch (errorCode) {
    case "TOKEN_BUDGET":
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          message: "Your input is too long. Please shorten it and try again.",
        },
        { status: 400 },
      );
    case "RATE_LIMIT":
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          message: "We're busy right now. Please try again in a moment.",
        },
        { status: 429 },
      );
    case "AUTH_ERROR":
    case "BILLING_ERROR":
      // Ops problem — not the user's fault; hide the detail
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          message:
            "Something went wrong on our end. Please select your preferences manually.",
        },
        { status: 500 },
      );
    case "TIMEOUT":
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          message: "This took too long. Please try again.",
        },
        { status: 503 },
      );
    default:
      return NextResponse.json(
        {
          success: false,
          fallback: true,
          message:
            "We couldn't understand your preferences. Please select them manually.",
        },
        { status: 500 },
      );
  }
};

export const handleParsePreferences = async (req: NextRequest) => {
  try {
    const traceId = randomUUID();
    const { input } = await req.json();

    // ── Input validation ─────────────────────────────────────────────────
    if (!input || typeof input !== "string") {
      return NextResponse.json(
        { success: false, error: "Input is required and must be a string." },
        { status: 400 },
      );
    }

    const trimmed = input.trim();

    if (trimmed.length < MIN_INPUT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Input is too short. Please describe your preferences in a few words.",
        },
        { status: 400 },
      );
    }

    if (trimmed.length > MAX_INPUT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Input is too long. Please keep it under ${MAX_INPUT_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    // ── Parse ────────────────────────────────────────────────────────────
    const result = await inferPreferences(trimmed, { traceId });
    printTraceSummary(traceId);
    
    if (!result.success) {
      return errorResponse(result.errorCode);
    }

    const { preferences, quality } = result;

    // ── Output-quality signals ────────────────────────────────────────────
    // isEmpty: prompt the UI to ask the user to rephrase rather than saving
    // empty prefs. Not an error — just nothing recognisable in the input.
    if (quality.isEmpty) {
      return NextResponse.json({
        success: false,
        fallback: true,
        message:
          "We couldn't find any recognisable preferences in your input. Try mentioning specific brands, styles, or dietary needs.",
      });
    }

    // lowConfidenceItems: surface to the UI for user confirmation before saving.
    // Returned as a separate field so the UI can highlight uncertain items
    // (e.g. show them greyed-out with a "Did you mean X?" prompt).
    return NextResponse.json({
      success: true,
      fallback: false,
      preferences,
      lowConfidenceItems: quality.lowConfidenceItems,
      hasLowConfidence: quality.lowConfidenceItems.length > 0,
    });
  } catch (error) {
    console.error("[handleParsePreferences] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        fallback: true,
        message:
          "Something went wrong. Please select your preferences manually.",
      },
      { status: 500 },
    );
  }
};

export async function handleSavePreference(req: NextRequest) {
  try {
    const { customerId, preferenceType, items } = await req.json();

    if (!customerId || !preferenceType || !items) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    await saveCustomerPreference(customerId, preferenceType, items);

    return NextResponse.json({
      success: true,
      message: `${preferenceType} preferences saved`,
    });
  } catch (error) {
    console.error("Save preference error:", error);
    return NextResponse.json(
      {
        error: "Failed to save preferences",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidCustomerId = (id: string): boolean => UUID_REGEX.test(id);

// ── Default preferences factory ────────────────────────────────────────────
// Extracted so it's testable and not duplicated if a second call site needs it.
const buildDefaultPreferences = (): ICustomerPreferences => ({
  categories: AVAILABLE_PREFERENCES.categories.map((name) => ({
    name,
    optedIn: false,
  })),
  dietary: AVAILABLE_PREFERENCES.dietary.map((name) => ({
    name,
    optedIn: false,
  })),
  events: AVAILABLE_PREFERENCES.events.map((name) => ({
    name,
    optedIn: false,
  })),
  style: AVAILABLE_PREFERENCES.style.map((name) => ({ name, optedIn: false })),
  brands: AVAILABLE_PREFERENCES.brands.map((name) => ({
    name,
    optedIn: false,
  })),
});

// ── Merge saved prefs with the full available list ─────────────────────────
// Ensures the response always contains ALL preference options, with saved
// optedIn values merged in. New options added to AVAILABLE_PREFERENCES
// automatically appear as optedIn: false for existing customers.
const mergeWithAvailable = (
  category: keyof typeof AVAILABLE_PREFERENCES,
  saved: { name: string; optedIn: boolean }[] | undefined,
) => {
  const savedMap = new Map(
    (saved ?? []).map((item) => [item.name.toLowerCase(), item.optedIn]),
  );
  return AVAILABLE_PREFERENCES[category].map((name) => ({
    name,
    optedIn: savedMap.get(name.toLowerCase()) ?? false,
  }));
};

export const handleGetPreferences = async (req: NextRequest) => {
  try {
    const customerId = req.nextUrl.searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Missing customerId." },
        { status: 400 },
      );
    }

    if (!isValidCustomerId(customerId)) {
      return NextResponse.json(
        { success: false, error: "Invalid customerId format." },
        { status: 400 },
      );
    }

    await connectDB();

    const traceId = randomUUID();
    const customer = await Customer.findById(customerId);

    // ── Inference runs regardless of whether the customer doc exists ────────
    // A customer could have scanned receipts before ever saving explicit
    // preferences — inference shouldn't be gated on customer.preferences
    // already existing.
    const inferenceResult = await inferPreferencesFromOrders(customerId, traceId);
    const inferredPreferences =
      inferenceResult.success && !inferenceResult.isEmpty
        ? inferenceResult.inferredPreferences
        : null;

    printTraceSummary(traceId);

    if (!customer) {
      return NextResponse.json({
        success: true,
        preferences: buildDefaultPreferences(),
        inferredPreferences,
        isNew: true,
      });
    }

    const preferences: ICustomerPreferences = {
      categories: mergeWithAvailable("categories", customer.preferences?.categories),
      dietary: mergeWithAvailable("dietary", customer.preferences?.dietary),
      events: mergeWithAvailable("events", customer.preferences?.events),
      style: mergeWithAvailable("style", customer.preferences?.style),
      brands: mergeWithAvailable("brands", customer.preferences?.brands),
    };

    return NextResponse.json({
      success: true,
      preferences,
      inferredPreferences,
      isNew: false,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "CastError") {
      console.error("[handleGetPreferences] Invalid ObjectId:", error.message);
      return NextResponse.json(
        { success: false, error: "Invalid customerId format." },
        { status: 400 },
      );
    }

    console.error("[handleGetPreferences] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch preferences. Please try again." },
      { status: 500 },
    );
  }
};

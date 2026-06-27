import { NextRequest, NextResponse } from "next/server";

import { AVAILABLE_PREFERENCES } from "@profile-preferences/utils";
import { ICustomerPreferences } from "@profile-preferences/types";
import { parsePreferencesWithClaude } from "./parseService";
import { saveCustomerPreference } from "./customerService";
import { Customer } from "@shared/models";
import { connectDB } from "@shared/db";

export async function handleParsePreferences(req: NextRequest) {
    try {
    const { input } = await req.json();

    if (!input || typeof input !== "string") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const result = await parsePreferencesWithClaude(input);

    // graceful degradation — tell the UI to switch to manual mode
    if (result.fallback) {
      return NextResponse.json({
        success: false,
        fallback: true,
        message: "We couldn't understand your preferences. Please select them manually.",
      });
    }

    return NextResponse.json({
      success: true,
      fallback: false,
      preferences: result.preferences,
    });

  } catch (error) {
    console.error("[handleParsePreferences] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        fallback: true,
        message: "Something went wrong. Please select your preferences manually.",
      },
      { status: 500 }
    );
  }
}

export async function handleSavePreference(req: NextRequest) {
  try {
    const { customerId, preferenceType, items } = await req.json();

    if (!customerId || !preferenceType || !items) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
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
      { status: 500 }
    );
  }
}

export async function handleGetPreferences(req: NextRequest) {
  try {
    const customerId = req.nextUrl.searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing customerId" },
        { status: 400 }
      );
    }

    await connectDB();

    const customer = await Customer.findById(customerId);

    if (!customer) {
      const defaultPreferences: ICustomerPreferences = {
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
        style: AVAILABLE_PREFERENCES.style.map((name) => ({
          name,
          optedIn: false,
        })),
        brands: AVAILABLE_PREFERENCES.brands.map((name) => ({
          name,
          optedIn: false,
        })),
      };

      return NextResponse.json({
        success: true,
        preferences: defaultPreferences,
        isNew: true,
      });
    }

    const mergeWithAvailable = (
      category: keyof typeof AVAILABLE_PREFERENCES,
      saved: { name: string; optedIn: boolean }[] | undefined
    ) => {
      const savedMap = new Map(
        (saved || []).map((item) => [item.name.toLowerCase(), item.optedIn])
      );

      return AVAILABLE_PREFERENCES[category].map((name) => ({
        name,
        optedIn: savedMap.get(name.toLowerCase()) ?? false,
      }));
    };

    const preferences: ICustomerPreferences = {
      categories: mergeWithAvailable(
        "categories",
        customer.preferences?.categories
      ),
      dietary: mergeWithAvailable("dietary", customer.preferences?.dietary),
      events: mergeWithAvailable("events", customer.preferences?.events),
      style: mergeWithAvailable("style", customer.preferences?.style),
      brands: mergeWithAvailable("brands", customer.preferences?.brands),
    };

    return NextResponse.json({
      success: true,
      preferences,
      isNew: false,
    });
  } catch (error) {
    console.error("Get preferences error:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

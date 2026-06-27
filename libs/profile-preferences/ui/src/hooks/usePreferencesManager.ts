"use client";

import { useState, useEffect } from "react";
import { ICustomerPreferences } from "@profile-preferences/types";
import { AVAILABLE_PREFERENCES, getClientId } from "@profile-preferences/utils";
import { preferencesService } from "@profile-preferences/api";
import { mergePreferences, getAffectedCategories } from "@profile-preferences/utils";

const initializePreferences = (): ICustomerPreferences => {
  return {
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
};

export function usePreferencesManager() {
  const [preferences, setPreferences] = useState<ICustomerPreferences>(
    initializePreferences()
  );
  const [customerId, setCustomerId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = getClientId();
    setCustomerId(id);

    const loadPreferences = async () => {
      try {
        const data = await preferencesService.fetchPreferences(id);
        setPreferences(data.preferences);
      } catch (err) {
        console.error("Failed to load preferences:", err);
      } finally {
        setTimeout(() => setLoading(false), 500);
      }
    };

    loadPreferences();
  }, []);

  return {
    preferences,
    setPreferences,
    customerId,
    loading,
    initializePreferences,
  };
}

export function useParsedPreferences() {
  const [parsing, setParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const parse = async (
    input: string,
    preferences: ICustomerPreferences
  ): Promise<{
    preferences: ICustomerPreferences;
    affected: ReturnType<typeof getAffectedCategories>;
  } | null> => {
    if (!input.trim()) return null;

    setParsing(true);
    setParseMessage(null);

    try {
      const parsedPrefs = await preferencesService.parsePreferences(input);
      const oldPrefs = preferences;
      const mergedPrefs = mergePreferences(preferences, parsedPrefs);
      const affected = getAffectedCategories(oldPrefs, mergedPrefs);

      return { preferences: mergedPrefs, affected };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setParseMessage({ type: "error", text: message });
      return null;
    } finally {
      setParsing(false);
    }
  };

  return {
    parsing,
    parseMessage,
    setParseMessage,
    parse,
  };
}

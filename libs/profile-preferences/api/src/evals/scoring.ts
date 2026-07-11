import type { ParsedPreferences } from "../parseService";
import type { ExpectedPreferences, TestCase } from "./testCases";

// ── Scoring types ─────────────────────────────────────────────────────────────

export type CaseResult = {
  id: string;
  input: string;
  passed: boolean;
  accuracyScore: number; // 0-1: correct items / expected items
  hallucinated: string[]; // items extracted but not on whitelist (already dropped by normaliser)
  isEmpty: boolean; // what the parser actually returned
  shouldBeEmpty: boolean; // what we expected
  emptyCorrect: boolean; // isEmpty matched expectation
  durationMs: number;
  error?: string;
};

export type ConsistencyResult = {
  id: string;
  input: string;
  runs: ParsedPreferences[];
  consistent: boolean; // all runs produced identical output
};

export type EvalReport = {
  timestamp: string;
  totalCases: number;
  // Metric 1: Accuracy
  accuracyScore: number; // avg across all cases with expected items
  accuracyPerCase: Record<string, number>;
  // Metric 2: Consistency
  consistencyScore: number; // % of cases where 3 runs match
  // Metric 3: Hallucination
  hallucinationRate: number; // hallucinated items / total extracted (before normaliser)
  // Metric 4: Empty rate
  emptyRate: number; // wrong isEmpty / cases that should NOT be empty
  // Details
  caseResults: CaseResult[];
  failed: string[]; // case IDs that failed
};

// ── Metric 1: Accuracy ────────────────────────────────────────────────────────
// For each expected item, check if the parser extracted it with the right optedIn.
// Score = correct_items / total_expected_items (1.0 = perfect, 0.0 = nothing correct)

export const scoreAccuracy = (
  actual: ParsedPreferences,
  expected: ExpectedPreferences,
): number => {
  const categories = Object.keys(expected) as (keyof ExpectedPreferences)[];
  if (categories.length === 0) return 1.0; // empty expected = nothing to check

  let correct = 0;
  let total = 0;

  for (const category of categories) {
    const expectedItems = expected[category] ?? [];
    const actualItems = actual[category] ?? [];

    for (const expectedItem of expectedItems) {
      total++;
      const actualItem = actualItems.find(
        (a) => a.name.toLowerCase() === expectedItem.name.toLowerCase(),
      );
      if (actualItem && actualItem.optedIn === expectedItem.optedIn) {
        correct++;
      }
    }
  }

  return total === 0 ? 1.0 : correct / total;
};

// ── Metric 2: Consistency ─────────────────────────────────────────────────────
// Run the same input N times, check if all runs produce identical output.
// Consistent = all runs match run 1 exactly (same items, same optedIn values).

export const scoreConsistency = (runs: ParsedPreferences[]): boolean => {
  if (runs.length < 2) return true;

  const normalise = (prefs: ParsedPreferences) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(prefs).map(([k, v]) => [
          k,
          [...v].sort((a, b) => a.name.localeCompare(b.name)),
        ]),
      ),
    );

  const first = normalise(runs[0]);
  return runs.every((r) => normalise(r) === first);
};

// ── Metric 3: Hallucination rate ──────────────────────────────────────────────
// The normaliser already drops hallucinated items (not on whitelist) and logs them.
// We track the rate by comparing total extracted (before normalise) vs after.
// Since we only have access to the normalised output, we approximate:
// hallucination = items extracted by the model that were dropped by the normaliser.
// These appear in the [parsePreferences] console.warn log — captured separately.
// For scoring purposes: we count items in actual output that have confident: false
// as a proxy for uncertain/near-hallucinated extractions.

export const scoreHallucination = (actual: ParsedPreferences): string[] => {
  const lowConfidence: string[] = [];
  for (const [category, items] of Object.entries(actual)) {
    for (const item of items) {
      if (!item.confident) {
        lowConfidence.push(`${category}:${item.name}`);
      }
    }
  }
  return lowConfidence;
};

// ── Metric 4: Empty rate ──────────────────────────────────────────────────────
// For inputs that SHOULD produce preferences (shouldBeEmpty: false),
// how often does the parser incorrectly return isEmpty?

export const scoreEmpty = (
  actual: ParsedPreferences,
  testCase: TestCase,
): boolean => {
  const isEmpty = Object.values(actual).every((items) => items.length === 0);
  // correct if: isEmpty matches expectation
  return isEmpty === testCase.shouldBeEmpty;
};

// ── Aggregate report ──────────────────────────────────────────────────────────

export const buildReport = (
  caseResults: CaseResult[],
  consistencyResults: ConsistencyResult[],
): EvalReport => {
  const casesWithExpected = caseResults.filter((r) => !r.shouldBeEmpty);
  const accuracyScore =
    casesWithExpected.length === 0
      ? 1.0
      : casesWithExpected.reduce((sum, r) => sum + r.accuracyScore, 0) /
        casesWithExpected.length;

  const consistencyScore =
    consistencyResults.length === 0
      ? 1.0
      : consistencyResults.filter((r) => r.consistent).length /
        consistencyResults.length;

  const totalHallucinated = caseResults.reduce(
    (sum, r) => sum + r.hallucinated.length,
    0,
  );
  const hallucinationRate =
    caseResults.length === 0 ? 0 : totalHallucinated / caseResults.length;
  const shouldHavePrefs = caseResults.filter((r) => !r.shouldBeEmpty);
  const emptyRate =
    shouldHavePrefs.length === 0
      ? 0
      : shouldHavePrefs.filter((r) => r.isEmpty).length /
        shouldHavePrefs.length;

  return {
    timestamp: new Date().toISOString(),
    totalCases: caseResults.length,
    accuracyScore: +accuracyScore.toFixed(3),
    accuracyPerCase: Object.fromEntries(
      caseResults.map((r) => [r.id, r.accuracyScore]),
    ),
    consistencyScore: +consistencyScore.toFixed(3),
    hallucinationRate: +hallucinationRate.toFixed(3),
    emptyRate: +emptyRate.toFixed(3),
    caseResults,
    failed: caseResults.filter((r) => !r.passed).map((r) => r.id),
  };
};

"use client";

import styles from "./QueryPage.module.css";

/**
 * NL2Mongo results are shape-unknown: the query is natural language, so the
 * data coming back varies per question. This component detects the shape and
 * renders the right view rather than assuming "array of uniform flat objects".
 *
 * Shapes handled:
 *   - NL2Mongo envelope       → results as table + count + generated query
 *   - array of objects        → table (columns = union of all keys)
 *   - array of scalars        → single-column list
 *   - single object           → key/value table
 *   - scalar (number/string)  → big value (e.g. a count answer)
 *   - empty array / null      → empty state
 *
 * See Principle 4: Design for the consumer, not yourself —
 * This component handles all possible response shapes gracefully,
 * so consumers (QueryPage) don't need to know about the shape.
 */

type Json = unknown;

const isObject = (v: Json): v is Record<string, Json> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Render a single cell value readably — nested objects/arrays become compact JSON. */
const formatCell = (value: Json): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Union of keys across all rows — Mongo docs aren't guaranteed uniform. */
const collectColumns = (rows: Record<string, Json>[]): string[] => {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return Array.from(seen);
};

/**
 * The NL2Mongo API returns an envelope, not raw rows:
 *   { question, generatedQuery, results: [...], count: N }
 * Detect it and render the `results` array as the main table, with count +
 * generatedQuery shown as context. Falls through to generic rendering otherwise.
 */
const isNl2MongoEnvelope = (
  v: Json,
): v is {
  results: Json;
  count?: number;
  generatedQuery?: Json;
  question?: string;
} => isObject(v) && "results" in v;

export const ResultView = ({ data }: { data: Json }) => {
  // NL2Mongo response envelope → results as the table, metadata as context
  if (isNl2MongoEnvelope(data)) {
    const count =
      typeof data.count === "number"
        ? data.count
        : Array.isArray(data.results)
          ? data.results.length
          : undefined;

    return (
      <div className={styles.envelope}>
        {count !== undefined && (
          <p className={styles.rowCount}>
            {count} {count === 1 ? "match" : "matches"}
          </p>
        )}

        <ResultView data={data.results} />

        {data.generatedQuery !== undefined && (
          <details className={styles.queryDetails}>
            <summary className={styles.querySummary}>Show generated query</summary>
            <pre className={styles.resultData}>
              {typeof data.generatedQuery === "string"
                ? data.generatedQuery
                : JSON.stringify(data.generatedQuery, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  // Empty / nullish
  if (data === null || data === undefined) {
    return <p className={styles.emptyState}>No results.</p>;
  }

  // Scalar answer (e.g. a count) — show it prominently
  if (typeof data === "number" || typeof data === "string" || typeof data === "boolean") {
    return <p className={styles.scalarResult}>{String(data)}</p>;
  }

  // Array
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <p className={styles.emptyState}>No matching records.</p>;
    }

    // Array of objects → table
    if (data.every(isObject)) {
      const rows = data as Record<string, Json>[];
      const columns = collectColumns(rows);
      return (
        <div className={styles.tableWrapper}>
          <table className={styles.resultTable}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col} className={styles.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col} className={styles.td}>{formatCell(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.rowCount}>{rows.length} {rows.length === 1 ? "row" : "rows"}</p>
        </div>
      );
    }

    // Array of scalars (or mixed) → single-column list
    return (
      <div className={styles.tableWrapper}>
        <table className={styles.resultTable}>
          <tbody>
            {data.map((item, i) => (
              <tr key={i}>
                <td className={styles.td}>{formatCell(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.rowCount}>{data.length} {data.length === 1 ? "item" : "items"}</p>
      </div>
    );
  }

  // Single object → key/value table
  if (isObject(data)) {
    const entries = Object.entries(data);
    return (
      <div className={styles.tableWrapper}>
        <table className={styles.resultTable}>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key}>
                <th className={styles.thRow}>{key}</th>
                <td className={styles.td}>{formatCell(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Fallback — shouldn't reach here, but never render nothing
  return <pre className={styles.resultData}>{JSON.stringify(data, null, 2)}</pre>;
};

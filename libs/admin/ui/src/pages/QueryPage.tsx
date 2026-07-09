"use client";

import { useState } from "react";
import styles from "./QueryPage.module.css";
import { ResultView } from "./ResultView";


interface QueryResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export default function QueryPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  const handleSubmit = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute query",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>NL → Mongo</h1>
        <p className={styles.subtitle}>
          Ask questions about your customer data in plain English
        </p>
      </div>

      
        <div className={styles.inputSection}>
          <input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                handleSubmit();
              }
            }}
            placeholder="e.g., 'How many customers made purchases in the last 30 days?'"
            className={styles.textarea}
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
            className={styles.submitButton}
          >
            {loading ? "Fetching..." : "Ask"}
          </button>
        </div>

        {result && (
          <div className={styles.resultSection}>
            {result.success ? (
              <>
                <h2 className={styles.resultTitle}>Results</h2>
                <ResultView data={result.data} />
              </>
            ) : (
              <>
                <h2 className={styles.resultTitle}>Error</h2>
                <p className={styles.errorMessage}>{result.error}</p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

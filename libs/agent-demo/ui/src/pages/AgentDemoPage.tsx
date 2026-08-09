'use client';

import { useState } from 'react';
import styles from './AgentDemoPage.module.css';

// ── Type Definitions ─────────────────────────────────────────────────────

type AgentMessage = { role: string; content: string };

type DemoResult = {
  traceId: string;              // Unique identifier for this run
  task: string;                 // The problem statement
  finalAnswer: string | null;   // The agent's solution (or null if not found)
  iterationsUsed: number;        // Number of loop iterations completed
  maxIterationsExceeded: boolean; // Whether the iteration limit was reached
  messages: AgentMessage[];      // Full conversation trace from all loop phases
};

// ── Agent Demo Page Component ────────────────────────────────────────────
//
// Main UI for the agent loop demo. Displays the task, runs the agent,
// and shows the complete loop trace.
//
// See Principle 4: Design for the consumer, not yourself —
// This page makes the agent's reasoning transparent and accessible.
export default function AgentDemoPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Execute the agent demo.
   * 
   * Clears previous state, calls the API, and updates state with results.
   * Handles errors gracefully and provides user feedback.
   */
  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      // Call the API endpoint to run the agent
      const res = await fetch('/api/runAgentDemo', { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? 'Agent run failed');
        return;
      }

      // Store the complete results for display
      setResult(data);
    } catch (err) {
      setError('Agent run failed. Please try again.');
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      <h1>Agent Loop Demo</h1>
      <p className={styles.subtitle}>
        A raw observe → think → act → reflect → critique loop, working through a
        constraint-satisfaction task step by step.
      </p>
      
      {/* Task description - shows the problem the agent will solve */}

      <div className={styles.taskCard}>
        <h3>The task</h3>
        <p>
          You have $150. Buy exactly 12 items — nails ($2), screws ($3), bolts ($5).
          Buy at least 2 of each type, spending as close to $150 as possible without
          going over.
        </p>
      </div>

      <button onClick={handleRun} disabled={running} className={styles.runButton}>
        {running ? 'Running agent...' : 'Run Agent'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {/* Results display - shows when agent has completed */}
      {result && (
        <div className={styles.resultSection}>
          {/* Summary: how many iterations were used */}
          <div className={styles.summaryCard}>
            <p>
              <strong>Iterations used:</strong> {result.iterationsUsed}
              {result.maxIterationsExceeded && ' (max iterations exceeded)'}
            </p>
          </div>

          {/* Final answer: the agent's solution to the problem */}
          <div className={styles.answerCard}>
            <h3>Final Answer</h3>
            <p>{result.finalAnswer ?? 'No answer produced — loop hit the iteration limit.'}</p>
          </div>

          {/* Loop trace: complete conversation history from all phases */}
          <h3>Loop Trace</h3>
          <p className={styles.traceDescription}>
            Each card shows a message from one phase of the agent loop.
            The loop goes: observe → think → act → reflect → critique, then repeats.
          </p>
          {result.messages.map((msg, i) => (
            <div key={i} className={styles.traceCard}>
              {/* Role label shows which phase produced this message */}
              <span className={styles.roleLabel}>{msg.role}</span>
              <p>{msg.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
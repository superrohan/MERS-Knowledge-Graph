import { useEffect, useState } from "react";

const STEPS = ["Understanding query", "Searching code", "Traversing knowledge graph", "Building answer"];
const STEP_INTERVAL_MS = 550;

/**
 * These are the actual stages the query engine runs (spec §24); since a
 * single query call returns once, not stage-by-stage, this animates
 * through them at a fixed pace while the real request is in flight,
 * never claiming further progress than "still working" once caught up.
 */
export function QueryLoadingState() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="query-loading" role="status" aria-live="polite">
      <p className="text-muted">Analyzing your question...</p>
      <ul className="query-loading__steps">
        {STEPS.map((step, i) => (
          <li key={step} className={i < stepIndex ? "done" : i === stepIndex ? "active" : "pending"}>
            <span aria-hidden="true">{i < stepIndex ? "✓" : i === stepIndex ? "●" : "○"}</span> {step}
          </li>
        ))}
      </ul>
    </div>
  );
}

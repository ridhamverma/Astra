"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { resultsAiApi, type ResultExplanation } from "@/services/ai";
import { ThinkingStatus } from "./model-chat";

/** Key this component by immutable run IDs, so pending older requests cannot label a new run. */
export function AiAnalysis({
  runId,
  version,
  baselineRunId,
  stale = false,
}: {
  runId: string;
  version: number;
  baselineRunId?: string;
  stale?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ResultExplanation | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function explain() {
    setPending(true);
    setError("");
    try {
      const explanation = await resultsAiApi.explain(runId, baselineRunId);
      if (mounted.current) setResult(explanation);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not explain results. Simulation results remain available.",
        );
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  return (
    <section
      id="ai-explanation"
      className="astra-ai-analysis glass"
      aria-label="AI explanation"
    >
      <div className="astra-ai-topline">
        <span className="astra-ai-icon">
          <span className="builder-astra-mark" role="img" aria-label="Astra" />
        </span>
        <span className="astra-ai-pill">AI</span>
        <span className="astra-ai-version">Model version {version}</span>
      </div>
      <div className="astra-ai-analysis-heading">
        <div>
          <h2>AI explanation</h2>
          <p>
            A concise operational explanation grounded in this saved simulation
            run.
          </p>
        </div>
        <button
          type="button"
          className="astra-button-secondary"
          disabled={pending}
          onClick={() => void explain()}
          aria-busy={pending}
        >
          {pending
            ? "Explaining…"
            : result
              ? "Regenerate"
              : "Explain these results"}
        </button>
      </div>
      {stale && (
        <p className="astra-stale-notice">
          This explanation describes the saved run, not your edited canvas.
        </p>
      )}
      {baselineRunId && (
        <p className="astra-ai-baseline">
          Includes the selected baseline run with matching duration and seed.
        </p>
      )}
      {pending && (
        <div className="astra-ai-thinking">
          <ThinkingStatus />
        </div>
      )}
      {error && (
        <div className="astra-ai-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <p>{error}</p>
          <button
            type="button"
            className="astra-ghost-button"
            onClick={() => void explain()}
          >
            Try again
          </button>
        </div>
      )}
      {result && (
        <div className="astra-ai-explanation" aria-live="polite">
          {result.findings.map((finding) => (
            <article key={finding.id}>
              <p>{finding.text}</p>
              <details>
                <summary>Measured evidence</summary>
                <dl>
                  {finding.evidence.map((fact) => (
                    <div key={fact.id}>
                      <dt>{fact.label}</dt>
                      <dd>
                        {typeof fact.value === "number"
                          ? fact.value.toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })
                          : (fact.value ?? "Unavailable")}{" "}
                        {fact.unit}
                      </dd>
                    </div>
                  ))}
                </dl>
                <small>
                  Source: saved run {result.run_id}
                  {result.baseline_run_id
                    ? `; baseline ${result.baseline_run_id}`
                    : ""}
                </small>
              </details>
            </article>
          ))}
        </div>
      )}
      {!result && !pending && !error && (
        <p className="astra-ai-idle-note">
          Measured metrics and saved node names are sent to the configured AI
          provider. This does not run or change the simulation.
        </p>
      )}
      {result && (
        <p className="astra-ai-idle-note">
          Measured metrics and saved node names are sent to the configured AI
          provider. This does not run or change the simulation.
        </p>
      )}
    </section>
  );
}

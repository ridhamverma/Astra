"use client";

import { WorkspaceTable } from "./workspace-shell";
import type { BottleneckAnalysis } from "@/types/bottlenecks";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

function number(value: number | null, unit = "") {
  return value === null ? "—" : `${value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

export function BottleneckPanel({
  analysis,
  onViewNode,
  stale,
}: {
  analysis: BottleneckAnalysis;
  onViewNode: () => void;
  stale: boolean;
}) {
  const primary = analysis.ranked.find(
    (item) => item.node_id === analysis.primaryBottleneck,
  );
  const noPrimary =
    analysis.status === "no_congestion"
      ? "No congestion detected"
      : analysis.status === "not_applicable"
        ? "No Process stages"
        : "Insufficient measured data";
  return (
    <section
      id="bottlenecks"
      className="astra-bottleneck-panel glass"
      aria-label="Bottleneck analysis"
    >
      <div className="astra-section-title">
        <h2>Bottleneck analysis</h2>
        <span>Deterministic · measured metrics</span>
      </div>
      <div
        className={`astra-bottleneck-intro ${primary ? "is-warning" : analysis.status === "no_congestion" ? "is-success" : ""}`}
      >
        <div className="astra-bottleneck-outcome">
          <span aria-hidden="true">
            {primary ? (
              <AlertTriangle size={19} />
            ) : analysis.status === "no_congestion" ? (
              <CheckCircle2 size={19} />
            ) : null}
          </span>
          <div>
            <p className="astra-eyebrow">Analysis outcome</p>
            <h3>{primary ? primary.name : noPrimary}</h3>
            <p>
              {primary
                ? `Score ${analysis.score.toFixed(4)} / 1 · strongest combined utilization and congestion evidence in this run.`
                : analysis.reasons.join(" ")}
            </p>
            {primary && (
              <dl className="workspace-evidence">
                <div>
                  <dt>Utilization</dt>
                  <dd>
                    {number(primary.evidence.utilization * 100, "%")} ·
                    Congestion detected
                    <span
                      className="astra-utilization-track"
                      aria-hidden="true"
                    >
                      <i
                        style={{
                          width: `${Math.min(100, primary.evidence.utilization * 100)}%`,
                        }}
                      />
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Queue length · avg / max</dt>
                  <dd>
                    {number(primary.evidence.average_queue_length)} /{" "}
                    {primary.evidence.maximum_queue_length ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>Mean resource wait</dt>
                  <dd>
                    {number(primary.evidence.average_waiting_time, "min")}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </div>
        {primary && (
          <button
            className="astra-button-secondary"
            disabled={stale}
            onClick={onViewNode}
          >
            View on canvas
          </button>
        )}
      </div>
      {primary && (
        <ul className="astra-bottleneck-reasons">
          {primary.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {analysis.ranked.length > 0 && (
        <WorkspaceTable label="Bottleneck analysis table">
          <thead>
            <tr>
              <th scope="col">Rank / Process</th>
              <th scope="col" className="numeric">
                Score
              </th>
              <th scope="col" className="numeric">
                Utilization
              </th>
              <th scope="col" className="numeric">
                Mean resource wait
              </th>
              <th scope="col" className="numeric">
                Max resource wait
              </th>
              <th scope="col" className="numeric">
                Upstream avg queue
              </th>
              <th scope="col" className="numeric">
                Largest queue peak
              </th>
              <th scope="col" className="numeric">
                Rejected
              </th>
            </tr>
          </thead>
          <tbody>
            {analysis.ranked.map((item, index) => (
              <tr
                key={item.node_id}
                className={
                  item.node_id === analysis.primaryBottleneck
                    ? "astra-bottleneck-primary-row"
                    : ""
                }
              >
                <th scope="row">
                  {index + 1}. {item.name}
                  {item.node_id === analysis.primaryBottleneck
                    ? " · Primary"
                    : ""}
                </th>
                <td className="numeric">{item.score.toFixed(4)}</td>
                <td className="numeric">
                  <span className="astra-utilization-value">
                    {number(item.evidence.utilization * 100, "%")}
                  </span>
                  <span className="astra-utilization-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.max(0, Math.min(100, item.evidence.utilization * 100))}%`,
                      }}
                    />
                  </span>
                </td>
                <td className="numeric">
                  {number(item.evidence.average_waiting_time, "min")}
                </td>
                <td className="numeric">
                  {number(item.evidence.maximum_waiting_time, "min")}
                </td>
                <td className="numeric">
                  {number(item.evidence.average_queue_length)}
                </td>
                <td className="numeric">
                  {item.evidence.maximum_queue_length ?? "—"}
                </td>
                <td className="numeric">
                  {item.evidence.rejected_entities ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </WorkspaceTable>
      )}
      <details className="astra-bottleneck-method">
        <summary>
          <span aria-hidden="true">›</span>Scoring method & evidence
        </summary>
        <p>
          Score = utilization × max(wait pressure, queue pressure, rejection
          fraction). Wait pressure = mean resource wait ÷ (mean resource wait +
          reference service time). Queue pressure = average upstream backlog ÷
          (backlog + resource count). Only Queues directly feeding each Process
          contribute.
        </p>
        <p>
          The strongest congestion signal is used to avoid adding correlated
          waits twice. Scores are a ranking heuristic, not confidence
          probabilities. Peak waits and queues describe bursts; sustained
          averages determine the score.
        </p>
        {analysis.ranked.map((item) => (
          <div key={item.node_id}>
            <strong>{item.name}</strong>
            <p>
              Service reference:{" "}
              {number(item.evidence.reference_service_time, "min")} (
              {item.evidence.service_time_basis}) · wait pressure{" "}
              {item.evidence.normalized_waiting.toFixed(4)} · queue pressure{" "}
              {item.evidence.normalized_queue.toFixed(4)} · rejection fraction{" "}
              {item.evidence.rejection_fraction.toFixed(4)}
            </p>
            {item.evidence.upstream_queues.map((queue) => (
              <p key={queue.node_id}>
                {queue.name}: average wait{" "}
                {number(queue.average_waiting_time, "min")}, max wait{" "}
                {number(queue.maximum_waiting_time, "min")}, average length{" "}
                {number(queue.average_queue_length)}, peak{" "}
                {queue.maximum_queue_length}, {queue.waiting_at_end} waiting at
                end, {queue.rejected_entities} rejected.
              </p>
            ))}
          </div>
        ))}
        {analysis.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        <p>
          — means unavailable. Busy stages with no observed congestion receive
          score zero. Missing metrics are not invented.
        </p>
      </details>
    </section>
  );
}

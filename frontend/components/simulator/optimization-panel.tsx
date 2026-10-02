"use client";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WorkspacePageHeader, WorkspaceTable } from "./workspace-shell";
import { AlertTriangle } from "lucide-react";
import { validateOptimizationFields } from "@/lib/workspace-presentation";
import { ApiRequestError } from "@/services/api";
import {
  optimizationApi,
  type ObjectiveMetric,
  type OptimizationResult,
} from "@/services/optimization";
import type { NodeMetrics } from "@/types/simulation-result";
import type { SimulationModel } from "@/types/simulation";

const METRICS: Record<ObjectiveMetric, { label: string; unit: string }> = {
  average_waiting_time: { label: "Average waiting time", unit: "min" },
  maximum_waiting_time: { label: "Maximum waiting time", unit: "min" },
  throughput: { label: "Throughput", unit: "entities/hr" },
  completion_rate: { label: "Completion rate", unit: "%" },
  average_cycle_time: { label: "Average cycle time", unit: "min" },
};
function utilization(metrics: NodeMetrics | undefined) {
  return metrics && "resource_utilization" in metrics
    ? metrics.resource_utilization
    : null;
}
function number(value: number | null | undefined, scale = 1) {
  return value == null
    ? "—"
    : (value * scale).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function OptimizationPanel({
  model,
  busy,
  setBusy,
  onApply,
  onGoBuilder,
  visible = true,
}: {
  model: SimulationModel;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onApply: (nodeId: string, resources: number) => void;
  onGoBuilder: () => void;
  visible?: boolean;
}) {
  const processes = model.nodes.filter((node) => node.type === "process");
  const [nodeId, setNodeId] = useState("");
  const selected = processes.find((node) => node.id === nodeId) ?? processes[0];
  const [minimum, setMinimum] = useState("1");
  const [maximum, setMaximum] = useState("3");
  const [step, setStep] = useState("1");
  const [metric, setMetric] = useState<ObjectiveMetric>("average_waiting_time");
  const [operator, setOperator] = useState<"<=" | ">=">("<=");
  const [target, setTarget] = useState("15");
  const [replications, setReplications] = useState("3");
  const [additional, setAdditional] = useState("2");
  const [costMode, setCostMode] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const currentSnapshot = JSON.stringify(model);
  const stale = result !== null && snapshot !== currentSnapshot;
  const resources = selected?.config.resource_count;
  // Reset the editable search range when the selected canonical Process changes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (resources !== undefined) {
        setMinimum(String(resources));
        setMaximum(String(Math.min(100, resources + 2)));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id, resources]);
  // A removed cost must immediately disable the previous cost objective.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (selected?.config.cost_per_resource == null) setCostMode(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id, selected?.config.cost_per_resource]);
  const fieldErrors = validateOptimizationFields({
    minimum,
    maximum,
    step,
    replications,
    target,
    additional,
    percentage: metric === "completion_rate",
  });
  async function search() {
    if (!selected || Object.keys(fieldErrors).length) return;
    setBusy(true);
    setPending(true);
    setError("");
    setResult(null);
    try {
      const response = await optimizationApi.run({
        base_model: model,
        variable_node: selected.id,
        variable_parameter: "resource_count",
        min: Number(minimum),
        max: Number(maximum),
        step: Number(step),
        objective_metric: metric,
        operator,
        target: Number(target) / (metric === "completion_rate" ? 100 : 1),
        replications: Number(replications),
        max_additional_resources: additional === "" ? null : Number(additional),
        cost_objective: costMode ? "minimize_resource_cost" : null,
      });
      setResult(response);
      setSnapshot(currentSnapshot);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError && cause.issues.length
          ? `${cause.message}: ${cause.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`
          : cause instanceof Error
            ? cause.message
            : "Optimization failed.",
      );
    } finally {
      setBusy(false);
      setPending(false);
    }
  }
  const scale = result?.objective_metric === "completion_rate" ? 100 : 1;
  const observedMetric = result
    ? METRICS[result.objective_metric]
    : METRICS[metric];
  const fields = [
    ["minimum", "Minimum resources", minimum, setMinimum, 1, 100],
    ["maximum", "Maximum resources", maximum, setMaximum, 1, 100],
    ["step", "Resource step", step, setStep, 1, 100],
    ["replications", "Replications", replications, setReplications, 1, 10],
  ] as const;
  return (
    <section className="astra-optimization" aria-label="Optimization">
      <WorkspacePageHeader
        overline="Operational optimization"
        title="Test resource configurations"
        description="Grid search runs the actual simulator for each value using the same duration and seeds."
      />
      {!selected ? (
        <p className="astra-stale-notice">
          Add a Process node to optimize resource capacity.
        </p>
      ) : (
        <>
          <form
            className="astra-optimization-form glass"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <label className="astra-property-field">
              <span>Process</span>
              <select
                disabled={busy}
                aria-label="Optimization process"
                value={selected.id}
                onChange={(event) => {
                  setNodeId(event.target.value);
                  setCostMode(false);
                }}
              >
                {processes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} · {node.config.resource_count} resources
                  </option>
                ))}
              </select>
            </label>
            {fields.map(([id, label, value, setValue, min, max]) => (
              <label className="astra-property-field" key={label}>
                <span>{label}</span>
                <input
                  required
                  disabled={busy}
                  aria-label={label}
                  aria-invalid={Boolean(fieldErrors[id])}
                  aria-describedby={
                    fieldErrors[id] ? `optimization-${id}-error` : undefined
                  }
                  type="number"
                  min={min}
                  max={max}
                  step="1"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
                {fieldErrors[id] && (
                  <small
                    className="workspace-field-error"
                    id={`optimization-${id}-error`}
                  >
                    {fieldErrors[id]}
                  </small>
                )}
              </label>
            ))}
            <label className="astra-property-field">
              <span>Objective metric</span>
              <select
                disabled={busy}
                aria-label="Optimization objective"
                value={metric}
                onChange={(event) => {
                  const metric = event.target.value as ObjectiveMetric;
                  setMetric(metric);
                  setOperator(
                    metric === "throughput" || metric === "completion_rate"
                      ? ">="
                      : "<=",
                  );
                  setTarget(metric === "completion_rate" ? "90" : "15");
                }}
              >
                {Object.entries(METRICS).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="astra-property-field">
              <span>Target operator</span>
              <select
                disabled={busy}
                aria-label="Target operator"
                value={operator}
                onChange={(event) =>
                  setOperator(event.target.value as "<=" | ">=")
                }
              >
                <option value="<=">At most (≤)</option>
                <option value=">=">At least (≥)</option>
              </select>
            </label>
            <label className="astra-property-field">
              <span>Target ({METRICS[metric].unit})</span>
              <input
                required
                disabled={busy}
                aria-label="Optimization target"
                aria-invalid={Boolean(fieldErrors.target)}
                aria-describedby={
                  fieldErrors.target ? "optimization-target-error" : undefined
                }
                type="number"
                min="0"
                max={metric === "completion_rate" ? 100 : undefined}
                step="any"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
              {fieldErrors.target && (
                <small
                  className="workspace-field-error"
                  id="optimization-target-error"
                >
                  {fieldErrors.target}
                </small>
              )}
            </label>
            <label className="astra-property-field">
              <span>Maximum additional resources (optional)</span>
              <input
                disabled={busy}
                aria-label="Maximum additional resources"
                aria-invalid={Boolean(fieldErrors.additional)}
                aria-describedby={
                  fieldErrors.additional
                    ? "optimization-additional-error"
                    : undefined
                }
                type="number"
                min="0"
                max="99"
                step="1"
                value={additional}
                onChange={(event) => setAdditional(event.target.value)}
              />
              {fieldErrors.additional && (
                <small
                  className="workspace-field-error"
                  id="optimization-additional-error"
                >
                  {fieldErrors.additional}
                </small>
              )}
            </label>
            <label className="astra-optimization-cost">
              <input
                disabled={busy || selected.config.cost_per_resource == null}
                type="checkbox"
                checked={costMode}
                onChange={(event) => setCostMode(event.target.checked)}
              />{" "}
              Minimize resource cost while meeting the target
            </label>
            <div className="workspace-info">
              <AlertTriangle size={18} aria-hidden="true" />
              <p>
                Selected process cost:{" "}
                {selected.config.cost_per_resource == null
                  ? "not configured. Set Cost per resource in the builder to enable cost minimization."
                  : `${number(selected.config.cost_per_resource)} units per resource for your modeled period.`}{" "}
                Duration: {model.simulation.duration} min · first seed:{" "}
                {model.simulation.seed}. Target must hold in every replication.{" "}
                {selected.config.cost_per_resource == null && (
                  <button
                    type="button"
                    className="astra-ghost-button"
                    onClick={onGoBuilder}
                  >
                    Go to Builder
                  </button>
                )}
              </p>
            </div>
            <div className="workspace-submit">
              <button
                className="astra-button-primary"
                disabled={busy || Object.keys(fieldErrors).length > 0}
                type="submit"
                aria-busy={pending}
              >
                {pending && (
                  <span className="builder-run-spinner" aria-hidden="true" />
                )}
                {pending ? "Running grid search…" : "Run grid search"}
              </button>
              {pending && (
                <span role="status">
                  Testing the resource range with {replications} replications
                  per configuration.
                </span>
              )}
            </div>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="astra-notice astra-notice-error">
          {error}
        </p>
      )}
      {!result && !pending && !error && (
        <p className="workspace-before-results">
          Run grid search to compare measured resource configurations.
        </p>
      )}
      {result && (
        <div className="astra-optimization-results">
          <h3>Last search results</h3>
          <p>
            {result.simulation_runs} simulations ·{" "}
            {result.tested_configurations} configurations including baseline ·
            seeds {result.seeds.join(", ")}. Goal: {observedMetric.label}{" "}
            {result.operator} {number(result.target, scale)}{" "}
            {observedMetric.unit}.
          </p>
          {stale && (
            <p className="astra-stale-notice">
              The model has changed since this search. Run grid search again
              before applying a recommendation.
            </p>
          )}
          <div className="astra-optimization-recommendation">
            <h3>
              {result.recommended
                ? `Recommended: ${result.recommended.configuration.value} resources`
                : "No feasible configuration"}
            </h3>
            <p>{result.recommendation_reason}</p>
            {result.metric_improvement && (
              <p>
                Baseline → recommended mean:{" "}
                {number(result.metric_improvement.baseline_value, scale)} →{" "}
                {number(result.metric_improvement.recommended_value, scale)}{" "}
                {observedMetric.unit}. Change (recommended − baseline):{" "}
                {number(result.metric_improvement.absolute_difference, scale)}{" "}
                {observedMetric.unit === "%"
                  ? "percentage points"
                  : observedMetric.unit}
                . Relative change:{" "}
                {number(result.metric_improvement.percentage_difference)}%.
              </p>
            )}
            <p>
              Additional configured cost: {number(result.additional_cost)}{" "}
              units. — means unavailable.
            </p>
            {result.recommended && (
              <button
                disabled={busy || stale}
                className="astra-button-secondary"
                onClick={() =>
                  onApply(
                    result.recommended!.configuration.node_id,
                    result.recommended!.configuration.value,
                  )
                }
              >
                Apply to builder
              </button>
            )}
            <p className="astra-property-note">
              Applying changes the resource count in the canvas. Save and Run
              Simulation to create a new measured result.
            </p>
          </div>
          <WorkspaceTable label="Resource configuration results">
            <thead>
              <tr>
                <th scope="col">Configuration</th>
                <th scope="col">Resources</th>
                <th scope="col">Status</th>
                <th scope="col">Mean objective</th>
                <th scope="col">Observed range</th>
                <th scope="col">Sample SD</th>
                <th scope="col">Mean utilization</th>
                <th scope="col">Completed (mean)</th>
                <th scope="col">Rejected (mean)</th>
                <th scope="col">Remaining (mean)</th>
                <th scope="col">Resource cost</th>
                <th scope="col">Total cost</th>
              </tr>
            </thead>
            <tbody>
              {[
                result.baseline,
                ...result.tested_candidates.filter(
                  (item) =>
                    item.configuration.value !==
                    result.baseline.configuration.value,
                ),
              ].map((item) => (
                <tr
                  key={item.configuration.value}
                  className={
                    item.configuration.value ===
                    result.recommended?.configuration.value
                      ? "workspace-recommended"
                      : ""
                  }
                >
                  <th scope="row">
                    {item.configuration.value ===
                    result.baseline.configuration.value
                      ? "Baseline"
                      : `Candidate ${item.configuration.value}`}
                    {item.configuration.value ===
                    result.recommended?.configuration.value ? (
                      <span className="workspace-chip">Recommended</span>
                    ) : null}
                  </th>
                  <td>{item.configuration.value}</td>
                  <td>
                    <span
                      className={`workspace-chip ${item.status === "feasible" ? "is-success" : "is-error"}`}
                    >
                      {item.status === "feasible"
                        ? "✓ Meets target"
                        : "× Does not meet target"}
                    </span>
                    {item.infeasible_reasons.length > 0 && (
                      <details>
                        <summary>Why?</summary>
                        <ul>
                          {item.infeasible_reasons.map((reason, index) => (
                            <li key={index}>{reason}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td>
                    {number(item.objective.mean, scale)} {observedMetric.unit}
                  </td>
                  <td>
                    {number(item.objective.minimum, scale)}–
                    {number(item.objective.maximum, scale)}
                  </td>
                  <td>{number(item.objective.standard_deviation, scale)}</td>
                  <td>
                    {number(
                      item.node_metrics[item.configuration.node_id]
                        ?.resource_utilization?.mean,
                      100,
                    )}
                    %
                  </td>
                  <td>{number(item.summary_metrics.total_completed.mean)}</td>
                  <td>{number(item.summary_metrics.total_rejected.mean)}</td>
                  <td>{number(item.summary_metrics.in_system_at_end.mean)}</td>
                  <td>{number(item.resource_cost)}</td>
                  <td>{number(item.total_resource_cost)}</td>
                </tr>
              ))}
            </tbody>
          </WorkspaceTable>
          {visible && (
            <div className="astra-optimization-chart">
              <h3>{observedMetric.label} across candidates</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={result.tested_candidates.map((item) => ({
                    resources: item.configuration.value,
                    value:
                      item.objective.mean == null
                        ? null
                        : item.objective.mean * scale,
                  }))}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-hairline)"
                  />
                  <XAxis
                    dataKey="resources"
                    label={{
                      value: "Resources",
                      position: "insideBottom",
                      offset: -5,
                    }}
                    height={45}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => [
                      `${value} ${observedMetric.unit}`,
                      "Mean objective",
                    ]}
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--text-muted)"
                    isAnimationActive={false}
                  >
                    {result.tested_candidates.map((item) => (
                      <Cell
                        key={item.configuration.value}
                        fill={
                          item.configuration.value ===
                          result.recommended?.configuration.value
                            ? "var(--accent)"
                            : "var(--text-muted)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <details>
            <summary>Replication evidence & search limits</summary>
            {result.tested_candidates.map((item) => (
              <div key={item.configuration.value}>
                <h4>{item.configuration.value} resources</h4>
                <ul>
                  {item.replications.map((rep) => (
                    <li key={rep.seed}>
                      Seed {rep.seed}: {observedMetric.label}{" "}
                      {number(rep.summary[result.objective_metric], scale)}{" "}
                      {observedMetric.unit}; {rep.summary.total_completed}{" "}
                      completed; utilization{" "}
                      {number(
                        utilization(
                          rep.node_metrics[item.configuration.node_id],
                        ),
                        100,
                      )}
                      %.
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <ul>
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}

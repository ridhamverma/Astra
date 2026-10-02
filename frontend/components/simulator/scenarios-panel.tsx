"use client";

import {
  WorkspacePageHeader,
  WorkspaceSkeleton,
  WorkspaceTable,
} from "./workspace-shell";
import { measuredChange } from "@/lib/workspace-presentation";
import { AiAnalysis } from "./ai-analysis";
import { useEffect, useState } from "react";
import { ApiRequestError } from "@/services/api";
import {
  scenariosApi,
  type Scenario,
  type ScenarioComparison,
} from "@/services/scenarios";
import type { SimulationModel } from "@/types/simulation";

function value(number: number | null, unit: string, signed = false) {
  if (number === null) return "—";
  return `${signed && number > 0 ? "+" : ""}${number.toFixed(2)} ${unit}`;
}

export function ScenariosPanel({
  projectId,
  model,
  activeId,
  revision,
  busy,
  setBusy,
  onLoad,
  onDeleted,
  onRun,
  onRenamed,
}: {
  projectId?: string;
  model: SimulationModel;
  activeId: string | null;
  revision: number;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onLoad: (scenario: Scenario) => void;
  onDeleted: (id: string) => void;
  onRun: (scenario: Scenario) => Promise<void>;
  onRenamed: (scenario: Scenario) => void;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [name, setName] = useState("Baseline");
  const [baselineId, setBaselineId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    // External project changes start a fresh database read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    scenariosApi
      .list(projectId)
      .then((items) => {
        if (!active) return;
        setScenarios(items);
        setComparison(null);
        setBaselineId((id) =>
          items.some((item) => item.id === id) ? id : (items[0]?.id ?? ""),
        );
        setCandidateId((id) =>
          items.some((item) => item.id === id) ? id : (items[1]?.id ?? ""),
        );
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, revision, retry]);

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError && cause.issues.length > 0
          ? `${cause.message}: ${cause.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`
          : cause instanceof Error
            ? cause.message
            : "Could not update scenarios.",
      );
    } finally {
      setBusy(false);
    }
  }

  function upsert(scenario: Scenario) {
    setScenarios((items) =>
      items.some((item) => item.id === scenario.id)
        ? items.map((item) => (item.id === scenario.id ? scenario : item))
        : [...items, scenario],
    );
    setComparison(null);
    if (!baselineId) setBaselineId(scenario.id);
  }

  const baseline = scenarios.find((item) => item.id === baselineId),
    candidate = scenarios.find((item) => item.id === candidateId);
  const compareReason =
    !baseline || !candidate
      ? "Choose both snapshots."
      : baselineId === candidateId
        ? "Choose two different snapshots."
        : !baseline.latest_run || !candidate.latest_run
          ? "Run both snapshots before comparing."
          : baseline.latest_run.model_version !== baseline.model_version ||
              candidate.latest_run.model_version !== candidate.model_version
            ? "Run both current snapshot versions."
            : baseline.latest_run.duration !== candidate.latest_run.duration ||
                baseline.latest_run.seed !== candidate.latest_run.seed
              ? "Both runs must use the same duration and seed."
              : "";
  const best = comparison?.metrics
    .filter(
      (item) =>
        measuredChange(item.key, item.absolute_difference).label === "Improved",
    )
    .sort(
      (a, b) =>
        Math.abs(b.percentage_difference ?? 0) -
        Math.abs(a.percentage_difference ?? 0),
    )[0];
  return (
    <section className="astra-scenarios" aria-label="Scenarios and comparison">
      <WorkspacePageHeader
        overline="Experiment with your system"
        title="Scenarios & comparison"
        description="Save a baseline, duplicate it, change resources in the builder, then run and compare."
      />
      {!projectId ? (
        <p className="astra-stale-notice">
          Save the project first to create scenarios.
        </p>
      ) : (
        <>
          <section
            className="astra-snapshots-panel glass"
            aria-label="Snapshots"
          >
            <h2>Snapshots</h2>
            <div className="astra-scenario-create">
              <label>
                Snapshot name
                <input
                  disabled={busy}
                  aria-label="Scenario name"
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button
                className="astra-button-primary"
                disabled={busy || loading || !name.trim()}
                onClick={() =>
                  void action(async () => {
                    const scenario = await scenariosApi.create(
                      projectId,
                      name.trim(),
                      model,
                    );
                    upsert(scenario);
                    onLoad(scenario);
                    setNotice(`Created ${scenario.name}.`);
                  })
                }
              >
                Create from current model
              </button>
            </div>
            <p className="astra-sidebar-help">
              A snapshot saves the current graph, settings and resource
              configuration.
            </p>
            {error && (
              <p className="astra-notice astra-notice-error" role="alert">
                {error}{" "}
                <button
                  className="astra-ghost-button"
                  onClick={() => setRetry((value) => value + 1)}
                  disabled={busy}
                >
                  Retry
                </button>
              </p>
            )}
            {notice && (
              <p className="astra-notice" role="status">
                {notice}
              </p>
            )}
            {loading && <WorkspaceSkeleton label="Loading snapshots" />}
            <div className="astra-scenario-grid">
              {scenarios.map((scenario) => (
                <article
                  className={`astra-scenario-card ${activeId === scenario.id ? "astra-scenario-active" : ""}`}
                  key={scenario.id}
                >
                  <h3>
                    {scenario.name}
                    {activeId === scenario.id && <span>Loaded</span>}
                  </h3>
                  <p>
                    Created {new Date(scenario.created_at).toLocaleString()}
                  </p>
                  <p>
                    {scenario.model.simulation.duration} min · seed{" "}
                    {scenario.model.simulation.seed} · v{scenario.model_version}
                  </p>
                  <p>
                    {scenario.model.nodes
                      .filter((node) => node.type === "process")
                      .map(
                        (node) =>
                          `${node.name}: ${node.config.resource_count} ${node.config.resource_count === 1 ? "resource" : "resources"}`,
                      )
                      .join(" · ")}
                  </p>
                  <p>
                    <span
                      className={`workspace-chip ${scenario.latest_run?.model_version === scenario.model_version ? "is-success" : ""}`}
                    >
                      {scenario.latest_run?.model_version ===
                      scenario.model_version
                        ? "✓ Run completed"
                        : scenario.latest_run
                          ? "Model changed · run again"
                          : "No run yet"}
                    </span>
                  </p>
                  <p>
                    {scenario.latest_run
                      ? `${scenario.latest_run.summary.total_completed} completed · ${scenario.latest_run.summary.throughput.toFixed(1)} / hour`
                      : "Current snapshot has not been run"}
                  </p>
                  <div className="astra-scenario-actions">
                    <button
                      disabled={busy}
                      onClick={() => {
                        onLoad(scenario);
                        setNotice(
                          `Loaded ${scenario.name}. Edit resources in the builder, then Save or Run Simulation.`,
                        );
                      }}
                    >
                      Load
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await onRun(scenario);
                        })
                      }
                    >
                      Run saved snapshot
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const copy = await scenariosApi.duplicate(
                            scenario.id,
                            `${scenario.name.slice(0, 195)} copy`,
                          );
                          upsert(copy);
                          setCandidateId(copy.id);
                          onLoad(copy);
                          setNotice(
                            `Loaded ${copy.name}. Change resources in the builder, then run.`,
                          );
                        })
                      }
                    >
                      Duplicate
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setRenameId(scenario.id);
                        setRenameName(scenario.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setDeleteId(scenario.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {renameId === scenario.id && (
                    <form
                      className="astra-scenario-inline"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void action(async () => {
                          const renamed = await scenariosApi.update(
                            scenario.id,
                            { name: renameName.trim() },
                          );
                          upsert(renamed);
                          onRenamed(renamed);
                          setRenameId(null);
                        });
                      }}
                    >
                      <input
                        disabled={busy}
                        aria-label="New scenario name"
                        value={renameName}
                        maxLength={200}
                        onChange={(event) => setRenameName(event.target.value)}
                      />
                      <button
                        disabled={busy || !renameName.trim()}
                        type="submit"
                      >
                        Save name
                      </button>
                      <button type="button" onClick={() => setRenameId(null)}>
                        Cancel
                      </button>
                    </form>
                  )}
                  {deleteId === scenario.id && (
                    <div className="astra-scenario-inline">
                      <p>Delete this scenario? Its run history will remain.</p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await scenariosApi.delete(scenario.id);
                            setScenarios((items) =>
                              items.filter((item) => item.id !== scenario.id),
                            );
                            if (baselineId === scenario.id) setBaselineId("");
                            if (candidateId === scenario.id) setCandidateId("");
                            setComparison(null);
                            setDeleteId(null);
                            onDeleted(scenario.id);
                          })
                        }
                      >
                        Confirm delete
                      </button>
                      <button onClick={() => setDeleteId(null)}>Cancel</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {!loading && scenarios.length === 0 && (
              <p className="astra-sidebar-help">
                No snapshots yet. Create a baseline from your current model.
              </p>
            )}
          </section>
          <section className="astra-comparison glass">
            <h2>Compare measured results</h2>
            <p>
              Both current snapshots must have a run with the same duration and
              seed. Changes are scenario minus baseline.
            </p>
            <div className="astra-comparison-controls">
              <label>
                Baseline
                <select
                  disabled={busy}
                  aria-label="Comparison baseline"
                  value={baselineId}
                  onChange={(event) => {
                    setBaselineId(event.target.value);
                    setComparison(null);
                  }}
                >
                  <option value="">Select baseline</option>
                  {scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scenario
                <select
                  disabled={busy}
                  aria-label="Comparison scenario"
                  value={candidateId}
                  onChange={(event) => {
                    setCandidateId(event.target.value);
                    setComparison(null);
                  }}
                >
                  <option value="">Select scenario</option>
                  {scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="astra-button-primary"
                disabled={busy || loading || Boolean(compareReason)}
                title={compareReason || "Compare measured results"}
                aria-describedby={
                  compareReason ? "scenario-compare-reason" : undefined
                }
                onClick={() =>
                  void action(async () => {
                    setComparison(null);
                    setComparison(
                      await scenariosApi.compare(
                        projectId,
                        baselineId,
                        candidateId,
                      ),
                    );
                  })
                }
              >
                Compare
              </button>
            </div>
            {compareReason && (
              <p id="scenario-compare-reason" className="astra-sidebar-help">
                {compareReason}
              </p>
            )}
            {comparison && (
              <>
                <p className="astra-comparison-fair">
                  Same duration: {comparison.duration} min · Same seed:{" "}
                  {comparison.seed}
                </p>
                <WorkspaceTable label="Measured snapshot comparison">
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col">Baseline · {comparison.baseline.name}</th>
                      <th scope="col">Scenario · {comparison.scenario.name}</th>
                      <th scope="col">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.metrics.map((metric) => (
                      <tr key={metric.key}>
                        <th scope="row">{metric.label}</th>
                        <td>{value(metric.baseline, metric.unit)}</td>
                        <td>{value(metric.scenario, metric.unit)}</td>
                        <td
                          className={
                            measuredChange(
                              metric.key,
                              metric.absolute_difference,
                            ).className
                          }
                        >
                          <span>
                            {
                              measuredChange(
                                metric.key,
                                metric.absolute_difference,
                              ).direction
                            }{" "}
                            {value(
                              metric.absolute_difference,
                              metric.unit === "%" ? "pp" : metric.unit,
                              true,
                            )}{" "}
                            ·{" "}
                            {
                              measuredChange(
                                metric.key,
                                metric.absolute_difference,
                              ).label
                            }
                          </span>
                          <small className="workspace-change-relative">
                            {value(metric.percentage_difference, "%", true)}{" "}
                            relative
                          </small>
                          {best?.key === metric.key && (
                            <span className="workspace-chip workspace-best">
                              Best improvement
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </WorkspaceTable>
                <p>
                  — means unavailable or an undefined percentage from a zero
                  baseline. pp means percentage points. Results represent one
                  seeded simulation per snapshot.
                </p>
                {comparison.scenario.latest_run &&
                  comparison.baseline.latest_run && (
                    <AiAnalysis
                      key={`${comparison.scenario.latest_run.id}:${comparison.baseline.latest_run.id}`}
                      runId={comparison.scenario.latest_run.id}
                      version={comparison.scenario.model_version}
                      baselineRunId={comparison.baseline.latest_run.id}
                    />
                  )}
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}

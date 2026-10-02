"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulationNode } from "@/types/simulation";
import {
  isProcessMetrics,
  isQueueMetrics,
  type SimulationRun,
} from "@/types/simulation-result";
import { AiAnalysis } from "./ai-analysis";
import { BottleneckPanel } from "./bottleneck-panel";
import {
  WorkspacePageHeader,
  WorkspaceKpiCard as StatCard,
  WorkspaceTable,
} from "./workspace-shell";

const SECTIONS = [
  { id: "overview", label: "Overview", kind: "title" as const },
  { id: "bottlenecks", label: "Bottlenecks", kind: "section" as const },
  { id: "ai-explanation", label: "AI explanation", kind: "section" as const },
  { id: "charts", label: "Charts", kind: "section" as const },
  { id: "queues", label: "Queues", kind: "section" as const },
  { id: "processes", label: "Processes", kind: "section" as const },
];

function minutes(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function percent(value: number): string {
  return (value * 100).toFixed(1);
}

function ChartCard({
  title,
  subtitle,
  children,
  action,
  className = "",
  id,
  label,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
  label: string;
}) {
  return (
    <section
      id={id}
      className={`astra-chart-card glass ${className}`}
      aria-label={label}
    >
      <div className="astra-chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: number | string;
  suffix: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="astra-chart-tooltip">
      <span>
        {typeof label === "number" ? `${label.toFixed(2)} min` : label}
      </span>
      <strong>
        {payload[0].value}
        {suffix}
      </strong>
    </div>
  );
}

function QueueTable({
  rows,
  nodeNames,
}: {
  rows: Array<
    [
      string,
      Extract<
        SimulationRun["node_metrics"][string],
        { total_arrivals: number }
      >,
    ]
  >;
  nodeNames: Record<string, string>;
}) {
  if (!rows.length)
    return (
      <div className="astra-table-empty">
        <span aria-hidden="true">▤</span>
        <p>This model has no Queue nodes.</p>
      </div>
    );
  return (
    <WorkspaceTable label="Queue performance table">
      <thead>
        <tr>
          <th scope="col">Queue</th>
          <th scope="col" className="numeric">
            Avg wait
          </th>
          <th scope="col" className="numeric">
            Max wait
          </th>
          <th scope="col" className="numeric">
            Avg length
          </th>
          <th scope="col" className="numeric">
            Arrivals
          </th>
          <th scope="col" className="numeric">
            Rejected
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([id, metrics]) => (
          <tr key={id}>
            <th scope="row">{nodeNames[id] ?? id}</th>
            <td className="numeric">
              {minutes(metrics.average_waiting_time)}
              {metrics.average_waiting_time === null ? "" : " min"}
            </td>
            <td className="numeric">
              {minutes(metrics.maximum_waiting_time)}
              {metrics.maximum_waiting_time === null ? "" : " min"}
            </td>
            <td className="numeric">
              {metrics.average_queue_length.toFixed(1)}
            </td>
            <td className="numeric">{metrics.total_arrivals}</td>
            <td className="numeric">{metrics.rejected_entities}</td>
          </tr>
        ))}
      </tbody>
    </WorkspaceTable>
  );
}

function ProcessTable({
  rows,
  nodeNames,
}: {
  rows: Array<
    [
      string,
      Extract<
        SimulationRun["node_metrics"][string],
        { resource_utilization: number }
      >,
    ]
  >;
  nodeNames: Record<string, string>;
}) {
  if (!rows.length)
    return (
      <div className="astra-table-empty">
        <span aria-hidden="true">◫</span>
        <p>This model has no Process nodes.</p>
      </div>
    );
  return (
    <WorkspaceTable label="Process performance table">
      <thead>
        <tr>
          <th scope="col">Process</th>
          <th scope="col" className="numeric">
            Resources
          </th>
          <th scope="col" className="numeric">
            Utilization
          </th>
          <th scope="col" className="numeric">
            Processed
          </th>
          <th scope="col" className="numeric">
            Avg service
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([id, metrics]) => (
          <tr key={id}>
            <th scope="row">{nodeNames[id] ?? id}</th>
            <td className="numeric">{metrics.resource_count}</td>
            <td className="numeric">
              {percent(metrics.resource_utilization)}%
            </td>
            <td className="numeric">{metrics.entities_processed}</td>
            <td className="numeric">
              {minutes(metrics.average_service_time)}
              {metrics.average_service_time === null ? "" : " min"}
            </td>
          </tr>
        ))}
      </tbody>
    </WorkspaceTable>
  );
}

function SkeletonCards() {
  return (
    <div
      className="astra-insights-skeletons"
      aria-label="Loading simulation insights"
      aria-busy="true"
    >
      <div className="astra-stats-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="astra-stat-card astra-skeleton-card">
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return <div className="astra-chart-empty">{message}</div>;
}

export function AnalyticsDashboard({
  run,
  nodes,
  stale,
  onViewBottleneck,
  loading = false,
}: {
  run: SimulationRun;
  nodes: SimulationNode[];
  stale: boolean;
  onViewBottleneck: () => void;
  loading?: boolean;
}) {
  const nodeNames = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.name])),
    [nodes],
  );
  const queueRows = Object.entries(run.node_metrics).filter(
    (
      entry,
    ): entry is [
      string,
      Extract<(typeof entry)[1], { total_arrivals: number }>,
    ] => isQueueMetrics(entry[1]),
  );
  const processRows = Object.entries(run.node_metrics).filter(
    (
      entry,
    ): entry is [
      string,
      Extract<(typeof entry)[1], { resource_utilization: number }>,
    ] => isProcessMetrics(entry[1]),
  );
  const [selectedQueue, setSelectedQueue] = useState(queueRows[0]?.[0] ?? "");
  const queueId = queueRows.some(([id]) => id === selectedQueue)
    ? selectedQueue
    : queueRows[0]?.[0];
  const queuePoints = queueId
    ? (run.time_series.queue_lengths[queueId] ?? [])
    : [];
  const completedPoints = run.time_series.cumulative_completed;
  const utilization = processRows.map(([id, metrics]) => ({
    id,
    name: nodeNames[id] ?? id,
    value: Number((metrics.resource_utilization * 100).toFixed(1)),
  }));
  const queueName = queueId
    ? (nodeNames[queueId] ?? queueId)
    : "No queue selected";

  return (
    <section className="astra-analytics" aria-label="Simulation analytics">
      <div className="astra-insights-frame">
        <div className="astra-insights-content">
          <nav className="workspace-section-links" aria-label="On this page">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
          </nav>
          <section
            id="overview"
            className="astra-insights-overview"
            aria-label="Operational overview"
          >
            <WorkspacePageHeader
              overline="Simulation results"
              title="Operational overview"
              description={`Measured over ${run.duration} simulated minutes · seed ${run.seed}`}
              actions={
                <>
                  <span className="astra-run-success">
                    <i aria-hidden="true" />
                    Run completed
                  </span>
                  <span className="workspace-chip">
                    Model v{run.model_version}
                  </span>
                </>
              }
            />
            {stale && (
              <p className="astra-stale-notice">
                The model has changed since this run. Run Simulation again to
                measure the current graph.
              </p>
            )}
            {loading ? (
              <SkeletonCards />
            ) : (
              <div className="astra-stats-grid">
                <StatCard
                  label="Average waiting"
                  value={minutes(run.summary.average_waiting_time)}
                  unit="min"
                  hint="Per completed entity"
                />
                <StatCard
                  label="Maximum waiting"
                  value={minutes(run.summary.maximum_waiting_time)}
                  unit="min"
                  hint="Longest completed wait"
                />
                <StatCard
                  label="Throughput"
                  value={run.summary.throughput.toFixed(1)}
                  unit="/hr"
                  hint="Completed per simulated hour"
                />
                <StatCard
                  label="Entities completed"
                  value={run.summary.total_completed.toLocaleString()}
                  hint={`Of ${run.summary.total_generated.toLocaleString()} generated`}
                />
                <StatCard
                  label="Completion rate"
                  value={percent(run.summary.completion_rate)}
                  unit="%"
                  hint="Completed ÷ generated"
                />
                <StatCard
                  label="Average cycle time"
                  value={minutes(run.summary.average_cycle_time)}
                  unit="min"
                  hint="Creation to completion"
                />
              </div>
            )}
          </section>

          {!loading && (
            <>
              <BottleneckPanel
                analysis={run.bottleneck_analysis}
                stale={stale}
                onViewNode={onViewBottleneck}
              />
              <AiAnalysis
                key={run.id}
                runId={run.id}
                version={run.model_version}
                stale={stale}
              />
              <section
                id="charts"
                className="astra-insights-section"
                aria-label="Simulation charts"
              >
                <div className="astra-section-heading">
                  <h2>Charts</h2>
                </div>
                <div className="astra-charts-grid">
                  <ChartCard
                    title="Queue length over time"
                    subtitle={
                      queueId
                        ? `Waiting entities · ${queueName}`
                        : "Add a Queue node to see this chart"
                    }
                    label={`Queue length over time for ${queueName}. Waiting entities over simulated minutes.`}
                    action={
                      queueRows.length > 0 && (
                        <label className="astra-queue-picker">
                          <span>Queue</span>
                          <select
                            aria-label="Select queue for queue length chart"
                            value={queueId}
                            onChange={(event) =>
                              setSelectedQueue(event.target.value)
                            }
                          >
                            {queueRows.map(([id]) => (
                              <option key={id} value={id}>
                                {nodeNames[id] ?? id}
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    }
                  >
                    <div className="astra-chart-body">
                      {queueRows.length > 0 ? (
                        queuePoints.length > 0 ? (
                          <div
                            className="astra-chart-plot"
                            role="img"
                            aria-label={`Queue length chart for ${queueName}, showing waiting entities over simulated minutes.`}
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={queuePoints}
                                margin={{
                                  top: 8,
                                  right: 18,
                                  left: 8,
                                  bottom: 0,
                                }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="var(--border-hairline)"
                                />
                                <XAxis
                                  dataKey="time"
                                  tickFormatter={(value) =>
                                    Number(value).toFixed(1)
                                  }
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 12 }}
                                  tickMargin={8}
                                  unit="m"
                                />
                                <YAxis
                                  allowDecimals={false}
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 12 }}
                                  width={36}
                                />
                                <Tooltip
                                  content={<ChartTooltip suffix=" waiting" />}
                                />
                                <Line
                                  type="stepAfter"
                                  dataKey="value"
                                  stroke="var(--accent)"
                                  strokeWidth={2}
                                  dot={false}
                                  activeDot={{ r: 4 }}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <EmptyChart message="Chart data was not saved for this earlier run." />
                        )
                      ) : (
                        <EmptyChart message="No Queue metrics for this run." />
                      )}
                    </div>
                  </ChartCard>
                  <ChartCard
                    title="Completed entities over time"
                    subtitle="Cumulative completions during the run"
                    label="Completed entities over time, showing cumulative completions during the simulation."
                  >
                    <div className="astra-chart-body">
                      {completedPoints.length > 0 ? (
                        <div
                          className="astra-chart-plot"
                          role="img"
                          aria-label="Area chart showing cumulative completed entities over simulated minutes."
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={completedPoints}
                              margin={{ top: 8, right: 18, left: 8, bottom: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="var(--border-hairline)"
                              />
                              <XAxis
                                dataKey="time"
                                tickFormatter={(value) =>
                                  Number(value).toFixed(1)
                                }
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                                tickMargin={8}
                                unit="m"
                              />
                              <YAxis
                                allowDecimals={false}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                                width={36}
                              />
                              <Tooltip
                                content={<ChartTooltip suffix=" completed" />}
                              />
                              <Area
                                type="stepAfter"
                                dataKey="value"
                                stroke="var(--accent)"
                                fill="rgba(240,100,69,.12)"
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <EmptyChart message="Chart data was not saved for this earlier run." />
                      )}
                    </div>
                  </ChartCard>
                  <ChartCard
                    title="Resource utilization"
                    subtitle="Busy resource time ÷ available resource time"
                    className="astra-utilization-chart"
                    label="Horizontal bar chart showing resource utilization by process."
                  >
                    <div className="astra-chart-body">
                      {utilization.length > 0 ? (
                        <div
                          className="astra-chart-plot"
                          role="img"
                          aria-label="Horizontal bars comparing utilization percentages across process resources."
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={utilization}
                              layout="vertical"
                              margin={{ top: 8, right: 28, left: 8, bottom: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="var(--border-hairline)"
                                horizontal={false}
                              />
                              <XAxis
                                type="number"
                                domain={[0, 100]}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                                tickMargin={8}
                                unit="%"
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={150}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                              />
                              <Tooltip content={<ChartTooltip suffix="%" />} />
                              <Bar
                                dataKey="value"
                                fill="var(--accent)"
                                radius={[0, 5, 5, 0]}
                                maxBarSize={24}
                                isAnimationActive={false}
                              >
                                {utilization.map((item) => (
                                  <Cell
                                    key={item.id}
                                    fill={
                                      item.id ===
                                      run.bottleneck_analysis.primaryBottleneck
                                        ? "var(--accent)"
                                        : "var(--text-muted)"
                                    }
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <EmptyChart message="No Process metrics for this run." />
                      )}
                    </div>
                  </ChartCard>
                </div>
              </section>
              <section
                id="queues"
                className="astra-insights-section astra-node-analytics"
                aria-labelledby="queue-performance-title"
              >
                <div className="astra-node-analytics-card glass">
                  <div className="astra-section-title">
                    <h2 id="queue-performance-title">Queue performance</h2>
                    <span>
                      {queueRows.length}{" "}
                      {queueRows.length === 1 ? "queue" : "queues"}
                    </span>
                  </div>
                  <QueueTable rows={queueRows} nodeNames={nodeNames} />
                </div>
              </section>
              <section
                id="processes"
                className="astra-insights-section astra-node-analytics"
                aria-labelledby="process-performance-title"
              >
                <div className="astra-node-analytics-card glass">
                  <div className="astra-section-title">
                    <h2 id="process-performance-title">Process performance</h2>
                    <span>
                      {processRows.length}{" "}
                      {processRows.length === 1 ? "process" : "processes"}
                    </span>
                  </div>
                  <ProcessTable rows={processRows} nodeNames={nodeNames} />
                </div>
              </section>
            </>
          )}
          {loading && (
            <div className="astra-loading-sections" aria-hidden="true">
              <section
                id="bottlenecks"
                className="astra-bottleneck-panel astra-skeleton-panel"
              >
                <div className="astra-skeleton-line" />
                <div className="astra-skeleton-line short" />
                <div className="astra-skeleton-line" />
              </section>
              <section
                id="ai-explanation"
                className="astra-ai-analysis astra-skeleton-panel"
              >
                <div className="astra-skeleton-line" />
                <div className="astra-skeleton-line short" />
              </section>
              <section id="charts" className="astra-insights-section">
                <div className="astra-charts-grid">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={index}
                      className="astra-chart-card astra-chart-skeleton"
                    >
                      <i />
                      <i />
                      <i />
                    </div>
                  ))}
                </div>
              </section>
              <section
                id="queues"
                className="astra-node-analytics astra-skeleton-panel"
              >
                <div className="astra-skeleton-line" />
              </section>
              <section
                id="processes"
                className="astra-node-analytics astra-skeleton-panel"
              >
                <div className="astra-skeleton-line" />
              </section>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function AnalyticsEmptyState({
  onRun,
  loading = false,
}: {
  onRun: () => void;
  loading?: boolean;
}) {
  return (
    <section className="astra-analytics astra-analytics-empty">
      <section className="astra-empty-insights">
        <h1>Run a simulation to see insights</h1>
        <button
          type="button"
          className="astra-button-primary"
          disabled={loading}
          onClick={onRun}
        >
          {loading ? "Running…" : "Run Simulation"}
        </button>
      </section>
    </section>
  );
}

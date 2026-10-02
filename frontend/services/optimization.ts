import { json, request } from "./api";
import type { SimulationModel } from "@/types/simulation";
import type { NodeMetrics, SimulationSummary } from "@/types/simulation-result";

export type ObjectiveMetric = "average_waiting_time" | "maximum_waiting_time" | "throughput" | "completion_rate" | "average_cycle_time";
export interface OptimizationRequest {
  base_model: SimulationModel; variable_node: string; variable_parameter: "resource_count";
  min: number; max: number; step: number; objective_metric: ObjectiveMetric; operator: "<=" | ">="; target: number;
  cost_objective: "minimize_resource_cost" | null; max_additional_resources: number | null; replications: number;
}
export interface MetricStatistics { mean: number | null; minimum: number | null; maximum: number | null; standard_deviation: number | null; observations: number }
export interface CandidateResult {
  configuration: { node_id: string; parameter: "resource_count"; value: number };
  status: "feasible" | "infeasible"; infeasible_reasons: string[]; rank: number | null;
  objective: MetricStatistics; summary_metrics: Record<string, MetricStatistics>;
  node_metrics: Record<string, Record<string, MetricStatistics>>;
  replications: { seed: number; summary: SimulationSummary; node_metrics: Record<string, NodeMetrics> }[];
  resource_cost: number | null; total_resource_cost: number | null; additional_cost: number | null;
}
export interface OptimizationResult {
  baseline: CandidateResult; tested_candidates: CandidateResult[]; recommended: CandidateResult | null;
  metric_improvement: { baseline_value: number | null; recommended_value: number | null; absolute_difference: number | null; percentage_difference: number | null; improvement: number | null } | null;
  additional_cost: number | null; seeds: number[]; simulation_runs: number; tested_configurations: number;
  objective_metric: ObjectiveMetric; operator: "<=" | ">="; target: number;
  cost_objective: "minimize_resource_cost" | null; recommendation_reason: string; notes: string[];
}
export const optimizationApi = { run: (body: OptimizationRequest) => request<OptimizationResult>("/api/v1/optimize", json(body)) };

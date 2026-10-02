import { json, request } from "./api";
import type { SimulationModel } from "@/types/simulation";
import type { PlaybackRun, SimulationRun } from "@/types/simulation-result";

export interface Scenario {
  id: string;
  project_id: string;
  name: string;
  model_version: number;
  model: SimulationModel;
  latest_run: SimulationRun | null;
  created_at: string;
  updated_at: string;
}

export interface ComparisonMetric {
  key: string;
  label: string;
  unit: string;
  baseline: number | null;
  scenario: number | null;
  absolute_difference: number | null;
  percentage_difference: number | null;
}

export interface ScenarioComparison {
  baseline: Scenario;
  scenario: Scenario;
  duration: number;
  seed: number;
  metrics: ComparisonMetric[];
}

const path = (id: string) => `/api/v1/scenarios/${encodeURIComponent(id)}`;
export const scenariosApi = {
  list: (projectId: string) => request<Scenario[]>(`/api/v1/projects/${encodeURIComponent(projectId)}/scenarios`),
  create: (projectId: string, name: string, model: SimulationModel) => request<Scenario>(`/api/v1/projects/${encodeURIComponent(projectId)}/scenarios`, json({ name, model })),
  update: (id: string, changes: { name?: string; model?: SimulationModel }) => request<Scenario>(path(id), { ...json(changes), method: "PUT" }),
  duplicate: (id: string, name: string) => request<Scenario>(`${path(id)}/duplicate`, json({ name })),
  delete: (id: string) => request<void>(path(id), { method: "DELETE" }),
  run: (id: string) => request<PlaybackRun>(`${path(id)}/runs`, json({ include_timeline: true })),
  compare: (projectId: string, baselineId: string, scenarioId: string) => request<ScenarioComparison>(`/api/v1/projects/${encodeURIComponent(projectId)}/scenarios/compare`, json({ baseline_id: baselineId, scenario_id: scenarioId })),
};

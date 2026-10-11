import { json, request } from "./api";
import { ModelVersions } from "./model-versions";
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
const versions = new ModelVersions();
function remember(scenario: Scenario) { versions.set(scenario.id, scenario.model_version); return scenario; }
export const scenariosApi = {
  list: (projectId: string) => request<Scenario[]>(`/api/v1/projects/${encodeURIComponent(projectId)}/scenarios`).then(items => items.map(remember)),
  create: (projectId: string, name: string, model: SimulationModel) => request<Scenario>(`/api/v1/projects/${encodeURIComponent(projectId)}/scenarios`, json({ name, model })).then(remember),
  update: (id: string, changes: { name?: string; model?: SimulationModel; expected_version?: number }) => request<Scenario>(path(id), { ...json({ ...changes, ...(changes.model && versions.get(id) != null && changes.expected_version === undefined ? { expected_version: versions.get(id) } : {}) }), method: "PUT" }).then(remember),
  duplicate: (id: string, name: string) => request<Scenario>(`${path(id)}/duplicate`, json({ name })).then(remember),
  delete: async (id: string) => { await request<void>(path(id), { method: "DELETE" }); versions.delete(id); },
  run: (id: string) => request<PlaybackRun>(`${path(id)}/runs`, json({ include_timeline: true, ...(versions.get(id) != null ? { model_version: versions.get(id) } : {}) })),
  compare: (projectId: string, baselineId: string, scenarioId: string) => request<ScenarioComparison>(`/api/v1/projects/${encodeURIComponent(projectId)}/scenarios/compare`, json({ baseline_id: baselineId, scenario_id: scenarioId })),
};

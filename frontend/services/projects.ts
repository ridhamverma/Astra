import type { SimulationModel } from "@/types/simulation";
import type { SimulationRun, PlaybackRun } from "@/types/simulation-result";
import { json, request } from "@/services/api";
import { ModelVersions } from "./model-versions";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  latest_version: number | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  run_count: number;
  last_run_at: string | null;
  status: "needs_review" | "completed" | "running" | "failed";
  model: SimulationModel | null;
}

export interface ProjectDetail extends ProjectSummary {
  model: SimulationModel | null;
}

const versions = new ModelVersions();
function remember(project: ProjectDetail) { versions.set(project.id, project.latest_version); return project; }

export const projectsApi = {
  createBlank: (name = "Untitled project") => request<ProjectDetail>("/api/v1/projects", json({ name })).then(remember),
  list: () => request<ProjectSummary[]>("/api/v1/projects"),
  get: async (id: string) => {
    const project = await request<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`);
    // Called when the simulator loads a project; library previews never mark it opened.
    // An activity-write outage must not prevent a successfully loaded model from opening.
    void request<void>(`/api/v1/projects/${encodeURIComponent(id)}/access`, { method: "POST" }).catch(() => undefined);
    return remember(project);
  },
  rename: (id: string, name: string) => request<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`, { ...json({ name }), method: "PUT" }),
  remove: async (id: string) => { await request<void>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: "DELETE" }); versions.delete(id); },
  create: (name: string, model: SimulationModel) => request<ProjectDetail>("/api/v1/projects", json({ name, model })).then(remember),
  update: (id: string, name: string, model: SimulationModel) => request<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`, { ...json({ name, model, ...(versions.get(id) !== undefined ? { expected_version: versions.get(id) ?? 0 } : {}) }), method: "PUT" }).then(remember),
  run: (id: string) => request<PlaybackRun>(`/api/v1/projects/${encodeURIComponent(id)}/runs`, json({ include_timeline: true, ...(versions.get(id) != null ? { model_version: versions.get(id) } : {}) })),
  versions: (id: string) => request<number[]>(`/api/v1/projects/${encodeURIComponent(id)}/versions`),
  version: (id: string, version: number) => request<SimulationModel>(`/api/v1/projects/${encodeURIComponent(id)}/versions/${version}`),
  runs: (id: string) => request<SimulationRun[]>(`/api/v1/projects/${encodeURIComponent(id)}/runs`).then(runs => runs.filter(run => !run.is_scenario && !run.scenario_id)),
};

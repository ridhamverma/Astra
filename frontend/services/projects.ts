import type { SimulationModel } from "@/types/simulation";
import type { SimulationRun, PlaybackRun } from "@/types/simulation-result";
import { json, request } from "@/services/api";

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

export const projectsApi = {
  createBlank: (name = "Untitled project") => request<ProjectDetail>("/api/v1/projects", json({ name })),
  list: () => request<ProjectSummary[]>("/api/v1/projects"),
  get: async (id: string) => {
    const project = await request<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`);
    // Called when the simulator loads a project; library previews never mark it opened.
    // An activity-write outage must not prevent a successfully loaded model from opening.
    await request<void>(`/api/v1/projects/${encodeURIComponent(id)}/access`, { method: "POST" }).catch(() => undefined);
    return project;
  },
  rename: (id: string, name: string) => request<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`, { ...json({ name }), method: "PUT" }),
  remove: (id: string) => request<void>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
  create: (name: string, model: SimulationModel) => request<ProjectDetail>("/api/v1/projects", json({ name, model })),
  update: (id: string, name: string, model: SimulationModel) => request<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`, { ...json({ name, model }), method: "PUT" }),
  run: (id: string) => request<PlaybackRun>(`/api/v1/projects/${encodeURIComponent(id)}/runs`, json({ include_timeline: true })),
  runs: (id: string) => request<SimulationRun[]>(`/api/v1/projects/${encodeURIComponent(id)}/runs`),
};

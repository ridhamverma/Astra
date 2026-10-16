import type { SimulationModel } from "@/types/simulation";
import type { ProjectDetail } from "./projects";
import { json, request } from "./api";
import { rememberProjectTemplate } from "@/lib/project-background";
export interface StarterTemplate { id: string; name: string; description: string; model: SimulationModel }
export const templatesApi = {
  list: () => request<StarterTemplate[]>("/api/v1/templates"),
  createProject: (id: string, name?: string) => request<ProjectDetail>(`/api/v1/templates/${encodeURIComponent(id)}/projects`, json(name ? { name } : {})).then(project => {
    rememberProjectTemplate(project.id, id);
    return project;
  }),
};

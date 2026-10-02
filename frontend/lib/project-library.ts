import type { ProjectSummary } from "@/services/projects";

export const statusLabels = { needs_review: "Needs review", completed: "Completed", running: "Running", failed: "Failed" };
export const projectTypes = ["Operations", "Customer support", "Manufacturing", "Fulfillment", "Custom"] as const;
export interface LibraryFilters { search: string; status: string; type: string; updated: string; sort: string }
export const defaultFilters: LibraryFilters = { search: "", status: "all", type: "all", updated: "all", sort: "updated" };

/** Categories are inferred from saved project/model names; no synthetic metadata is persisted. */
export function projectType(project: ProjectSummary): string {
  const names = [project.name, project.description ?? "", ...(project.model?.nodes.map(node => node.name) ?? [])].join(" ").toLowerCase();
  if (/warehouse|fulfillment|packing|shipping|dispatch/.test(names)) return "Fulfillment";
  if (/manufactur|assembly|production/.test(names)) return "Manufacturing";
  if (/support|call center|customer.service|ticket/.test(names)) return "Customer support";
  if (/hospital|bank|restaurant|clinic|registration|doctor|cashier/.test(names)) return "Operations";
  return "Custom";
}
export function activityTime(project: ProjectSummary): number {
  return Math.max(Date.parse(project.updated_at), Date.parse(project.last_accessed_at ?? project.updated_at), Date.parse(project.last_run_at ?? project.updated_at));
}
export function recentProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((a, b) => activityTime(b) - activityTime(a) || a.id.localeCompare(b.id)).slice(0, 3);
}
export function filterProjects(projects: ProjectSummary[], filters: LibraryFilters, now = Date.now()): ProjectSummary[] {
  const result = projects.filter(project => {
    const days = (now - Date.parse(project.updated_at)) / 86400000;
    return project.name.toLowerCase().includes(filters.search.trim().toLowerCase()) &&
      (filters.status === "all" || project.status === filters.status) &&
      (filters.type === "all" || projectType(project) === filters.type) &&
      (filters.updated === "all" || days <= Number(filters.updated));
  });
  return result.sort((a, b) => {
    const comparison = filters.sort === "name_asc" ? a.name.localeCompare(b.name) :
      filters.sort === "name_desc" ? b.name.localeCompare(a.name) :
      filters.sort === "runs" ? b.run_count - a.run_count :
      filters.sort === "created" ? Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(b.updated_at) - Date.parse(a.updated_at);
    return comparison || a.id.localeCompare(b.id);
  });
}
export function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

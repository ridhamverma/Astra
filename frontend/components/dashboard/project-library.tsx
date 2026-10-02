"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { projectsApi, type ProjectSummary } from "@/services/projects";
import { defaultFilters, filterProjects, recentProjects, projectTypes, statusLabels, type LibraryFilters } from "@/lib/project-library";
import { ProjectStarters } from "@/components/project-starters";
import { ProjectCard } from "./project-card";
import { Notifications } from "./notifications";
import { Icon } from "./icon";
import styles from "./workspace.module.css";

export function ProjectLibrary({ recent = false }: { recent?: boolean }) {
  const { user } = useAuth(); const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState<LibraryFilters>(defaultFilters); const [showFilters, setShowFilters] = useState(false);
  const [action, setAction] = useState<{ project: ProjectSummary; kind: "rename" | "delete" } | null>(null);
  const [name, setName] = useState(""); const [actionError, setActionError] = useState(""); const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const submitting = useRef(false);
  useEffect(() => {
    let cancelled = false;
    projectsApi.list().then(items => { if (!cancelled) { setProjects(items); if (!recent) { try { const saved = JSON.parse(sessionStorage.getItem(`astra:library:${user?.id}`) || "null"); if (saved) setFilters({ ...defaultFilters, ...saved }); } catch { /* Storage is optional. */ } } } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load projects."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recent, retry, user?.id]);
  useEffect(() => { if (action) dialog.current?.showModal(); }, [action]);
  function changeFilters(next: LibraryFilters) { setFilters(next); try { sessionStorage.setItem(`astra:library:${user?.id}`, JSON.stringify(next)); } catch { /* Private browsing can disable storage. */ } }
  function closeAction() { if (submitting.current) return; dialog.current?.close(); setAction(null); }
  async function applyAction() {
    if (!action || submitting.current) return;
    submitting.current = true; setBusy(true); setActionError("");
    try {
      if (action.kind === "rename") { const updated = await projectsApi.rename(action.project.id, name.trim()); setProjects(items => items.map(item => item.id === updated.id ? updated : item)); }
      else { await projectsApi.remove(action.project.id); setProjects(items => items.filter(item => item.id !== action.project.id)); }
      submitting.current = false; setBusy(false); closeAction();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not update project."); submitting.current = false; setBusy(false); }
  }
  const visible = recent ? recentProjects(projects) : filterProjects(projects, filters);
  const filtered = filters.search || filters.status !== "all" || filters.type !== "all" || filters.updated !== "all";
  return <section className={styles.page}>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>YOUR WORKSPACE</p><h1>{recent ? "Recents" : "Projects"}</h1>{!recent && <p className={styles.subtitle}>Manage and explore all your operational models.</p>}</div><div className={styles.headerActions}>{!recent && projects.length > 0 && <ProjectStarters />}<Notifications projects={projects} /></div></header>
    {!recent && <div className={styles.toolbar}><label className={styles.search}><Icon name="search" /><span className={styles.srOnly}>Search projects</span><input type="search" placeholder="Search projects..." value={filters.search} onChange={event => changeFilters({ ...filters, search: event.target.value })} /></label><button className={`${styles.secondaryButton} ${showFilters ? styles.filterActive : ""}`} aria-expanded={showFilters} aria-controls="project-filters" onClick={() => setShowFilters(!showFilters)}><Icon name="filter" />Filters{filtered && <span className={styles.filterDot} />}</button><label className={styles.sortLabel}><span className={styles.srOnly}>Sort projects</span><select aria-label="Sort projects" value={filters.sort} onChange={event => changeFilters({ ...filters, sort: event.target.value })}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="runs">Most simulation runs</option></select></label></div>}
    {!recent && showFilters && <div id="project-filters" className={styles.filters}>
      <label>Status<select aria-label="Status" value={filters.status} onChange={event => changeFilters({ ...filters, status: event.target.value })}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Project type<select aria-label="Project type" value={filters.type} onChange={event => changeFilters({ ...filters, type: event.target.value })}><option value="all">All types</option>{projectTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>Last updated<select aria-label="Last updated" value={filters.updated} onChange={event => changeFilters({ ...filters, updated: event.target.value })}><option value="all">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label><button className={styles.textButton} onClick={() => changeFilters(defaultFilters)}>Reset filters</button>
      <p className={styles.filterHelp}>Project types are identified from saved model and process names.</p>
    </div>}
    <div className={styles.sectionHeading}><h2>{recent ? "Pick up where you left off" : "Project library"}</h2>{!loading && !error && <span>{visible.length} {visible.length === 1 ? "project" : "projects"}</span>}</div>
    {error ? <div role="alert" className={styles.errorBanner}>{error}<button className={styles.secondaryButton} onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>Try again</button></div> : loading ? <div className={styles.loading} role="status"><span className={styles.loadingSpinner} />Loading {recent ? "recent projects" : "projects"}…</div> : !visible.length ? <div className={styles.empty}><div className={styles.emptyIcon}><Icon name={recent ? "recent" : "projects"} /></div><h2>{recent ? "No recent projects" : projects.length ? "No matching projects" : "No projects yet"}</h2><p>{recent ? "Projects you open or edit will appear here. Create your first project to get started." : projects.length ? "Try a different search or adjust your filters." : "Create an operational model to begin exploring your system."}</p>{recent ? <><ProjectStarters /><Link className={styles.emptySecondary} href="/projects">View projects</Link></> : projects.length ? <button className={styles.secondaryButton} onClick={() => changeFilters(defaultFilters)}>Reset filters</button> : <ProjectStarters />}</div> : <div className={styles.projectGrid}>{visible.map(project => <ProjectCard key={project.id} project={project} management={!recent} onAction={(project, kind) => { setName(project.name); setActionError(""); setAction({ project, kind }); }} />)}</div>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="project-action-title" onCancel={event => { event.preventDefault(); closeAction(); }}><form onSubmit={event => { event.preventDefault(); void applyAction(); }}><div className={styles.dialogHeader}><h2 id="project-action-title">{action?.kind === "delete" ? "Delete project?" : "Rename project"}</h2><button type="button" disabled={busy} className={styles.iconButton} aria-label="Close project action" onClick={closeAction}><Icon name="close" /></button></div>{action?.kind === "delete" ? <p className={styles.muted}>Delete “{action.project.name}” and its models, scenarios, and simulation runs? This cannot be undone.</p> : <label className={styles.fieldLabel}>Project name<input className={styles.input} required maxLength={200} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>}{actionError && <p role="alert" className={styles.errorBanner}>{actionError}</p>}<div className={styles.dialogFooter}><button type="button" disabled={busy} className={styles.secondaryButton} onClick={closeAction}>Cancel</button><button className={styles.primaryButton} disabled={busy || (action?.kind === "rename" && !name.trim())}>{busy ? "Saving…" : action?.kind === "delete" ? "Delete project" : "Save name"}</button></div></form></dialog>
  </section>;
}

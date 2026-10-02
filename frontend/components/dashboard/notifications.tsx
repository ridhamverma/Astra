"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { projectsApi, type ProjectSummary } from "@/services/projects";
import { relativeTime } from "@/lib/project-library";
import { Icon } from "./icon";
import styles from "./workspace.module.css";
export function Notifications({ projects }: { projects?: ProjectSummary[] }) {
  const [loaded, setLoaded] = useState<ProjectSummary[]>([]); const [error, setError] = useState("");
  useEffect(() => { if (projects !== undefined) return; let cancelled = false; projectsApi.list().then(items => { if (!cancelled) setLoaded(items); }).catch(() => { if (!cancelled) setError("Could not load simulation activity."); }); return () => { cancelled = true; }; }, [projects]);
  const activity = (projects ?? loaded).filter(project => project.last_run_at).sort((a, b) => Date.parse(b.last_run_at!) - Date.parse(a.last_run_at!)).slice(0, 5);
  return <details className={styles.notifications}>
    <summary className={styles.iconButton} aria-label="Notifications" title="Notifications"><Icon name="bell" /></summary>
    <div className={styles.notificationPanel}><h2>Simulation activity</h2>{error ? <p role="alert" className={styles.errorText}>{error}</p> : activity.length ? activity.map(project => <Link key={project.id} href={`/simulator?project=${encodeURIComponent(project.id)}`}><span className={styles.activityDot} /><div><strong>{project.name}</strong><p>Latest run completed</p><time dateTime={project.last_run_at!}>{relativeTime(project.last_run_at!)}</time></div><Icon name="arrow" /></Link>) : <p className={styles.muted}>No simulation activity yet.</p>}</div>
  </details>;
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "@/services/projects";
import { projectType, relativeTime, statusLabels } from "@/lib/project-library";
import { NODE_DEFINITIONS } from "@/lib/simulation-editor";
import { Icon } from "./icon";
import styles from "./workspace.module.css";

function WorkflowPreview({ project }: { project: ProjectSummary }) {
  const preview = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [measuredLabels, setMeasuredLabels] = useState<number[]>([]);
  useEffect(() => {
    if (!preview.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(preview.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const labels = preview.current?.querySelectorAll<HTMLElement>(`.${styles.workflowLabel}`);
    if (!labels?.length) return;
    const observer = new ResizeObserver(() => {
      const heights = Array.from(labels, label => label.scrollHeight);
      setMeasuredLabels(previous => heights.length === previous.length && heights.every((height, index) => height === previous[index]) ? previous : heights);
    });
    labels.forEach(label => observer.observe(label));
    return () => observer.disconnect();
  }, [project.model, width]);
  const nodes = project.model?.nodes.slice(0, 12) ?? [];
  const columns = Math.max(1, Math.min(nodes.length, Math.floor(width / 60)));
  const cellWidth = width / columns;
  // Reserve enough space for full names, even when long words wrap.
  const labelCharacters = Math.max(1, Math.floor((cellWidth - 8) / 12));
  const labelHeights = nodes.map((node, index) => measuredLabels[index] ?? Math.ceil(Array.from(node.name).length / labelCharacters) * 14);
  const rows = Math.ceil(nodes.length / columns);
  const rowHeights = Array.from({ length: rows }, (_, row) => 32 + Math.max(...labelHeights.slice(row * columns, (row + 1) * columns)));
  const rowTops = rowHeights.map((_, row) => rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0));
  const height = Math.max(150, rowHeights.reduce((sum, height) => sum + height, 0));
  // Compact rows keep labels at 12 screen pixels without shrinking the whole SVG.
  const point = (id: string) => {
    const index = nodes.findIndex(node => node.id === id);
    if (index < 0) return null;
    const row = Math.floor(index / columns);
    const column = row % 2 ? columns - 1 - index % columns : index % columns;
    return { x: (column + .5) * cellWidth, y: rowTops[row] + 14 };
  };
  if (!nodes.length) return <div ref={preview} className={`${styles.preview} ${styles.blankPreview}`}><Icon name="projects" /><span>Blank model</span></div>;
  return <div ref={preview} className={`${styles.preview} ${styles.workflowPreview}`}><svg style={{ height }} role="img" aria-label={`${project.name} workflow: ${nodes.map(node => node.name).join(" → ")}`}>
    {(project.model?.edges ?? []).map(edge => {
      const a = point(edge.source); const b = point(edge.target);
      if (!a || !b) return null;
      const direction = b.x >= a.x ? 1 : -1;
      const path = a.y === b.y
        ? `M${a.x + direction * 12} ${a.y} H${b.x - direction * 12}`
        : `M${a.x + 12} ${a.y} H${a.x + cellWidth / 2 - 4} V${b.y} H${b.x + 12}`;
      return <path key={edge.id} d={path} fill="none" className={styles.workflowEdge} strokeWidth="1.3" />;
    })}
    {nodes.map((node, index) => { const p = point(node.id)!; return <g key={node.id} className={node.type === "process" ? styles.highlightedNode : undefined} transform={`translate(${p.x},${p.y})`}><rect className={styles.workflowNode} x="-12" y="-12" width="24" height="24" rx="6" /><g className={styles.workflowIcon} transform="translate(-9 -9)"><Icon name={NODE_DEFINITIONS[node.type].icon} style={{ width: 18, height: 18 }} /></g><foreignObject x={-cellWidth / 2 + 4} y="14" width={cellWidth - 8} height={labelHeights[index]}><div className={styles.workflowLabel}>{node.name}</div></foreignObject></g>; })}
  </svg>{project.model && project.model.nodes.length > 12 && <span className={styles.previewCount}>+{project.model.nodes.length - 12} blocks</span>}</div>;
}

export function ProjectCard({ project, management, onAction }: { project: ProjectSummary; management?: boolean; onAction?: (project: ProjectSummary, action: "rename" | "delete") => void }) {
  return <article className={styles.projectCard}>
    <Link href={`/simulator?project=${encodeURIComponent(project.id)}`} className={styles.previewLink} aria-label={`Open ${project.name}`}><WorkflowPreview project={project} /></Link>
    <div className={styles.cardBody}><div className={styles.cardTitle}><h2><Link href={`/simulator?project=${encodeURIComponent(project.id)}`}>{project.name}</Link></h2>{management && <details className={styles.cardMenu}><summary className={styles.iconButton} aria-label={`Actions for ${project.name}`} title="Project actions"><Icon name="dots" /></summary><div><button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onAction?.(project, "rename"); }}>Rename project</button><button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onAction?.(project, "delete"); }}>Delete project</button></div></details>}</div>
      <p className={styles.description}>{project.description || "An editable operational simulation model."}</p>
      <div className={styles.cardTags}><span className={`${styles.status} ${styles[project.status]}`}><span />{statusLabels[project.status]}</span>{management && <span className={styles.type}>{projectType(project)}</span>}</div>
      <div className={styles.cardMeta}><time dateTime={project.updated_at} title={new Date(project.updated_at).toLocaleString()}>Updated {relativeTime(project.updated_at)}</time><span><Icon name="run" />{project.run_count} {project.run_count === 1 ? "run" : "runs"}</span></div>
      <Link href={`/simulator?project=${encodeURIComponent(project.id)}`} className={styles.openProject}>Open project<Icon name="arrow" /></Link>
    </div>
  </article>;
}

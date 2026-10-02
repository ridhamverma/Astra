"use client";
import type { ReactNode } from "react";
import { Save } from "lucide-react";

/** One persistent shell for every workspace view; Builder supplies the shared chrome. */
export function WorkspaceShell({
  view,
  status,
  children,
}: {
  view: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`astra-workspace astra-builder-workspace astra-builder-screen workspace-shell ${view === "builder" ? "" : "workspace-page-screen"}`}
      data-view={view}
    >
      {children}
      {status}
    </div>
  );
}
export function WorkspaceStatusBar({
  counts,
  dirty,
  saving,
  disabled,
  scenario,
  onSave,
}: {
  counts: { nodes: number; edges: number };
  dirty: boolean;
  saving: boolean;
  disabled: boolean;
  scenario?: string;
  onSave: () => void;
}) {
  return (
    <footer
      className="builder-canvas-actions glass"
      aria-label="Project status"
    >
      <div className="builder-canvas-meta">
        <span>
          {counts.nodes} nodes · {counts.edges} links
        </span>
        <span
          role="status"
          className={`builder-save-status ${dirty ? "is-unsaved" : "is-saved"}`}
        >
          <i aria-hidden="true" />
          {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
        </span>
        {scenario && (
          <span className="workspace-scenario-label">Scenario: {scenario}</span>
        )}
      </div>
      <button
        className="builder-secondary"
        disabled={disabled}
        onClick={onSave}
        aria-label={scenario ? "Save scenario" : "Save project"}
        title={scenario ? "Save scenario" : "Save project"}
      >
        <Save className="builder-save-icon" size={18} />
        <span>{saving ? "Saving…" : scenario ? "Save scenario" : "Save"}</span>
      </button>
    </footer>
  );
}

export function WorkspacePageHeader({
  overline,
  title,
  description,
  actions,
}: {
  overline: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="astra-analytics-intro workspace-page-header">
      <div>
        <p className="astra-eyebrow">{overline}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="workspace-page-actions">{actions}</div>}
    </div>
  );
}

export function WorkspaceSkeleton({ label }: { label: string }) {
  return (
    <div className="workspace-skeleton" aria-label={label} aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass">
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

export function WorkspaceKpiCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
}) {
  return (
    <article className="astra-stat-card glass">
      <span>{label}</span>
      <strong>
        <span className="astra-stat-value">{value}</span>
        {unit && value !== "—" && (
          <span className="astra-stat-unit">{unit}</span>
        )}
      </strong>
      <small>{hint}</small>
    </article>
  );
}
export function WorkspaceTable({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="astra-table-wrap"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table>{children}</table>
    </div>
  );
}

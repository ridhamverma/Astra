"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { templatesApi, type StarterTemplate } from "@/services/templates";
import { projectsApi } from "@/services/projects";
import { Icon } from "./dashboard/icon";
import workspaceStyles from "./dashboard/workspace.module.css";
import { projectStarterImage } from "./project-starter-images";
import styles from "./project-starters.module.css";

interface StarterCardProps {
  id: string;
  name: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  imageSrc: string | null;
  blocks?: number;
  minutes?: number;
  imageFailed: boolean;
  onSelect: (id: string) => void;
  onImageError?: (id: string) => void;
}

function StarterCard({ id, name, description, selected, disabled, imageSrc, blocks, minutes, imageFailed, onSelect, onImageError }: StarterCardProps) {
  return <label className={styles.starterCard}>
    <input className={styles.starterInput} type="radio" name="starter" value={id} checked={selected} disabled={disabled} onChange={() => onSelect(id)} />
    <div className={`${styles.media} ${imageSrc && !imageFailed ? "" : styles.placeholder} ${id === "blank" ? styles.blankPlaceholder : ""}`}>
      {imageSrc && !imageFailed
        ? <Image className={styles.photo} src={imageSrc} alt="" fill sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 280px" loading="lazy" onError={() => onImageError?.(id)} />
        : id === "blank"
          ? <span className={styles.blankPlus}><Icon name="plus" style={{ width: 32, height: 32 }} /></span>
          : <Icon name="projects" style={{ width: 32, height: 32 }} />}
      <span className={styles.selectionMark} aria-hidden="true">{selected && <span className={styles.check}>✓</span>}</span>
    </div>
    <div className={styles.cardContent}>
      <strong className={styles.cardTitle}>{name}</strong>
      <span className={styles.cardDescription} title={description}>{description}</span>
      {(blocks !== undefined || minutes !== undefined) && <span className={styles.metaRow}>
        {blocks !== undefined && <span className={styles.metaPill}>{blocks} blocks</span>}
        {minutes !== undefined && <span className={styles.metaPill}>{minutes} min</span>}
      </span>}
    </div>
  </label>;
}

export function ProjectStarters() {
  const router = useRouter(); const dialog = useRef<HTMLDialogElement>(null); const nameInput = useRef<HTMLInputElement>(null); const submitting = useRef(false);
  const titleId = useId(); const startingPointId = useId();
  const [open, setOpen] = useState(false); const [templates, setTemplates] = useState<StarterTemplate[]>([]);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [name, setName] = useState(""); const [selected, setSelected] = useState("blank"); const [retry, setRetry] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    nameInput.current?.focus();
    let cancelled = false;
    templatesApi.list().then(items => { if (!cancelled) setTemplates(items); })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load templates."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, retry]);

  function close() { if (submitting.current) return; dialog.current?.close(); setOpen(false); }

  async function create() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const project = selected === "blank" ? await projectsApi.createBlank(name.trim() || undefined) : await templatesApi.createProject(selected, name.trim() || undefined);
      router.push(`/simulator?project=${encodeURIComponent(project.id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create project."); setBusy(false); submitting.current = false; }
  }

  const selectedName = selected === "blank" ? "Blank project" : templates.find(template => template.id === selected)?.name ?? "Blank project";
  const blankDescription = "Build your own process flow.";

  return <>
    <button className={workspaceStyles.primaryButton} onClick={() => { setLoading(true); setError(""); setOpen(true); }}><Icon name="plus" />Create project</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}>
      <header className={styles.dialogHeader}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>NEW PROJECT</p>
          <h2 className={styles.title} id={titleId}>Create a project</h2>
          <p className={styles.subtitle}>Start with a blank canvas or an editable starter model.</p>
        </div>
        <button type="button" disabled={busy} className={`${workspaceStyles.iconButton} ${styles.closeButton}`} onClick={close} aria-label="Close project creation" title="Close"><Icon name="close" /></button>
      </header>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void create(); }} aria-busy={busy}>
        <div className={styles.body}>
          <label className={styles.nameField}>
            <span className={styles.nameLabel}><span>Project name</span><span className={styles.optionalTag}>Optional</span></span>
            <input ref={nameInput} className={`${workspaceStyles.input} ${styles.nameInput}`} maxLength={200} placeholder="Untitled project" value={name} disabled={busy} onChange={event => setName(event.target.value)} />
          </label>
          <h3 className={styles.sectionTitle} id={startingPointId}>Choose a starting point</h3>
          <div className={styles.cardGrid} role="radiogroup" aria-labelledby={startingPointId}>
            <StarterCard id="blank" name="Blank project" description={blankDescription} selected={selected === "blank"} disabled={busy} imageSrc={projectStarterImage("blank")} imageFailed={false} onSelect={setSelected} />
            {!loading && templates.map(template => <StarterCard key={template.id} id={template.id} name={template.name} description={template.description} selected={selected === template.id} disabled={busy} imageSrc={projectStarterImage(template.id)} blocks={template.model.nodes.length} minutes={template.model.simulation.duration} imageFailed={failedImages[template.id] ?? false} onSelect={setSelected} onImageError={id => setFailedImages(current => ({ ...current, [id]: true }))} />)}
            {loading && <p className={styles.loading} role="status">Loading starter templates…</p>}
          </div>
          {error && <div role="alert" className={`${workspaceStyles.errorBanner} ${styles.error}`}>{error}{!templates.length && <button type="button" className={workspaceStyles.textButton} onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>Retry templates</button>}</div>}
        </div>
        <footer className={styles.footer}>
          <span className={styles.selectionText}>Starting from: <strong>{selectedName}</strong></span>
          <div className={styles.footerActions}>
            <button type="button" className={`${workspaceStyles.secondaryButton} ${styles.footerAction}`} disabled={busy} onClick={close}>Cancel</button>
            <button className={`${workspaceStyles.primaryButton} ${styles.createAction}`} disabled={busy || (selected !== "blank" && loading)}>{busy ? "Creating project…" : "Create project"}<Icon name="arrow" style={{ width: 16, height: 16 }} /></button>
          </div>
        </footer>
      </form>
    </dialog>
  </>;
}

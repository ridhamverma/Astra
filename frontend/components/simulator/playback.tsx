"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { PlaybackStation, healthcareTheme, type PlaybackTheme } from "./station-visuals";
import { PlaybackEdge, PlaybackPaths, PlaybackPeople } from "./playback-scene";
import "./playback-scene.css";
import "./playback-tokens.css";
import "./operations-floor.css";
import { IsometricStation } from "./isometric-station";
import { projectModelPosition } from "@/lib/isometric";
import { PLAYBACK_DESIGN } from "@/lib/playback-design";
import { CanvasGrid, CanvasZoomControls } from "./canvas-ui";
import { WorkspacePageHeader } from "./workspace-shell";
import {
  toEditorEdges,
  toEditorNodes,
  type EditorNode,
  type EditorEdge,
} from "@/lib/simulation-editor";
import { playbackLayout } from "@/lib/playback-layout";
import { PlaybackButtons } from "./playback-buttons";
import { PlaybackTimeline } from "./playback-timeline";
import { playbackShortcut } from "@/lib/playback-timeline";
import { PlaybackEventLog } from "./playback-event-log";
import { PlaybackInspector } from "./playback-inspector";
import { entityInformation, indexEntityEvents } from "@/lib/playback-information";
import { PlaybackClock } from "@/lib/playback-clock";
import { PlaybackState } from "./playback-state";
import { TimelinePlayer, routeKey, visualJourneys } from "@/lib/playback";
import type { PlaybackRun } from "@/types/simulation-result";

const nodeTypes = {
  source: PlaybackStation,
  queue: PlaybackStation,
  process: PlaybackStation,
  decision: PlaybackStation,
  delay: PlaybackStation,
  sink: PlaybackStation,
};
const edgeTypes = { builder: PlaybackEdge };

function PlaybackCanvas({
  run,
  player,
  visible,
  theme,
  selected, following, onSelect, onStopFollowing, logOpen, onSeek, onLogClose, clock, reducedMotion,
}: {
  run: PlaybackRun;
  player: TimelinePlayer;
  visible: boolean;
  theme: PlaybackTheme;
  clock: PlaybackClock; reducedMotion: boolean;
  selected: string | null; following: boolean; onSelect: (id: string | null) => void; onStopFollowing: () => void; logOpen: boolean; onSeek: (index: number) => void; onLogClose: () => void;
}) {
  const flow = useReactFlow<EditorNode, EditorEdge>();
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 599px)");
    const update = () => setPhone(media.matches); update();
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  // Replay the positions from this run snapshot on every screen size.
  const sceneRun = useMemo(() => ({ ...run, model: { ...run.model, nodes: run.model.nodes.map(node => ({ ...node, position: projectModelPosition(node.position) })) } }), [run]);
  const fitPadding = phone ? PLAYBACK_DESIGN.mobileFitPadding : PLAYBACK_DESIGN.fitPadding;
  const wrapper = useRef<HTMLDivElement>(null);
  const manuallyZoomed = useRef(false);
  const fit = useCallback(
    () => { manuallyZoomed.current = false; void flow.fitView({ padding: fitPadding, minZoom: 0.08, maxZoom: 1.25 }); },
    [flow, fitPadding],
  );
  useEffect(() => {
    if (!visible) return;
    let timer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!manuallyZoomed.current) fit(); }, PLAYBACK_DESIGN.resizeDebounceMs);
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (wrapper.current) observer.observe(wrapper.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [fit, run.id, visible, phone]);
  const countsKey = JSON.stringify([[...player.occupancy], [...player.completedByNode], player.index]);
  const nodes = useMemo(() => {
    const counts = new Map<
      string,
      { present: number; serving: number; waiting: number }
    >(JSON.parse(countsKey)[0]);
    const { overflow } = playbackLayout(player, run.model.nodes);
    return toEditorNodes(sceneRun.model.nodes).map((node) => {
      const count = counts.get(node.id);
      const outgoing = run.model.edges.filter(
        (edge) => edge.source === node.id,
      );
      return {
        ...node,
        ariaLabel: `${node.data.name}, ${node.type} station`,
        data: {
          ...node.data,
          builderPresentation: true,
          sceneTheme: theme,
          scenePresent: count?.present ?? 0,
          sceneServing: count?.serving ?? 0,
          sceneServiceSlots: player.atNode(node.id).filter(e => e.state === "serving").map(e => e.serviceSlot ?? 0),
          sceneOverflow: overflow.get(node.id) ?? 0,
          bottleneck: node.id === run.bottleneck_analysis.primaryBottleneck,
          yesProbability: outgoing[0]?.probability ?? 0,
          rows: (node.type === "process"
            ? [["Serving", String(count?.serving ?? 0)], ["Available", String(Math.max(0, ("resource_count" in node.data.config ? node.data.config.resource_count : 1) - (count?.serving ?? 0)))]]
            : node.type === "sink"
              ? [["Completed", String(player.completedByNode.get(node.id) ?? 0)]]
              : [[node.type === "delay" ? "Holding" : "Present", String(count?.present ?? 0)], ["Waiting", String(count?.waiting ?? 0)]]) as [string, string][],
        },
      };
    });
  }, [run, sceneRun, countsKey, theme, player]);
  const entityIndex = useMemo(() => indexEntityEvents(run.events), [run.events]);
  const selectedRoute = selected ? entityInformation(entityIndex.get(selected) ?? [], player.index, player.time).route : [];
  const journeyEdges = new Set(visualJourneys(player).flatMap(j => j.legs.map(leg => routeKey(leg.source, leg.target))));
  const edges = toEditorEdges(run.model.edges, run.model.nodes).map(edge => {
    const key = routeKey(edge.source, edge.target);
    const outgoing = run.model.edges.filter(e => e.source === edge.source);
    const total = outgoing.reduce((sum,e) => sum + (player.routes.get(routeKey(e.source,e.target)) ?? 0), 0);
    const count = player.routes.get(key) ?? 0;
    return { ...edge, type: "builder", label: undefined, targetHandle: "target-left", sourceHandle: edge.sourceHandle ?? "source-right",
      data: { ...edge.data, playbackActive: journeyEdges.has(key), playbackFollowed: selectedRoute.some((id,i) => id === edge.source && selectedRoute[i+1] === edge.target),
        label: edge.sourceHandle ? `${edge.sourceHandle === "yes" ? "Yes" : "No"} ${Math.round((edge.data?.probability ?? 0) * 100)}% (${count}/${total})` : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "var(--edge-arrow)" } };
  });
  return (
    <div
      ref={wrapper}
      className="astra-canvas astra-playback-canvas"
      aria-label="Read-only playback canvas"
      tabIndex={0}
      onPointerDownCapture={event => { if (event.target instanceof Element && event.target.closest(".builder-controls button")) manuallyZoomed.current = true; }}
    >
      <div className="playback-graph">{visible && (
        <PlaybackPaths><ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: fitPadding, minZoom: 0.08, maxZoom: 1.25 }}
          minZoom={0.08}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          zoomOnPinch
          onMoveStart={(event) => { if (event) { manuallyZoomed.current = true; onStopFollowing(); } }}
          panOnScroll
        >
          <CanvasGrid />
          <PlaybackPeople run={sceneRun} player={player} theme={theme} selected={selected} onSelect={onSelect} following={following} onStopFollowing={onStopFollowing} clock={clock} reducedMotion={reducedMotion} />
        </ReactFlow></PlaybackPaths>
      )}
      <details className="playback-blocks" key={phone ? "phone" : "desktop"} open={!phone}>
        <summary>Blocks</summary><p>Stations in this run · zoom in for details</p>
        {run.model.nodes.map(node => <div className="floor-block" key={node.id}><IsometricStation kind={node.type} resources={"resource_count" in node.config ? node.config.resource_count : 1} /><span title={node.name}>{node.name}</span></div>)}
      </details>
      <CanvasZoomControls onFit={fit} />
      </div>
      {selected && <PlaybackInspector run={run} player={player} selected={selected} following={following} onFollow={() => onSelect(selected)} onClose={() => onSelect(null)} />}
      {logOpen && <PlaybackEventLog run={run} player={player} selected={selected} onSeek={onSeek} onClose={onLogClose} />}
      <PlaybackLegend run={run} />
    </div>
  );
}

export function SimulationPlayback({ run, visible, theme = healthcareTheme, loading = false, error, onRetry, onCreate, stale = false }: {
  run?: PlaybackRun | null; visible: boolean; theme?: PlaybackTheme; loading?: boolean; error?: string; onRetry?: () => void; onCreate?: () => void; stale?: boolean;
}) {
  if (!visible) return run ? <PlaybackSession key={run.id} run={run} visible={false} theme={theme} stale={stale} /> : null;
  if (loading || error || !run) return <PlaybackState state={loading ? "loading" : error ? "error" : "empty"} error={error} onRetry={onRetry} onCreate={onCreate} />;
  return <PlaybackSession key={run.id} run={run} visible theme={theme} stale={stale} />;
}

function PlaybackSession({ run, visible, theme, stale }: { run: PlaybackRun; visible: boolean; theme: PlaybackTheme; stale: boolean }) {
  const player = useMemo(
    () => { const next = new TimelinePlayer(run.events, run.duration); next.prepareSnapshots(); return next; },
    [run],
  );
  const clock = useMemo(() => new PlaybackClock(), []);
  const [systemMotion, setSystemMotion] = useState(false), [motion, setMotion] = useState(true);
  const reducedMotion = systemMotion || !motion;
  const [announcement, setAnnouncement] = useState("");
  const announcedIndex = useRef(0), lastAnnouncement = useRef(0), resumeOnShow = useRef(false), playingRef = useRef(false);
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<string | null>(null), [following, setFollowing] = useState(false), [logOpen, setLogOpen] = useState(false);
  const [, repaint] = useState(0);
  const controlsRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(speed),
    seekFrame = useRef(0),
    section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!visible) return;
    const controls = controlsRef.current,
      shell = controls?.closest<HTMLElement>(".workspace-shell");
    if (!controls || !shell) return;
    const measure = () =>
      shell.style.setProperty(
        "--playback-controls-height",
        `${Math.ceil(controls.getBoundingClientRect().height)}px`,
      );
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(controls);
    return () => {
      observer?.disconnect();
      shell.style.removeProperty("--playback-controls-height");
    };
  }, [visible]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemMotion(media.matches); update();
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) { resumeOnShow.current = playingRef.current; setPlaying(false); }
      else if (resumeOnShow.current) { resumeOnShow.current = false; setPlaying(true); }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  // Hidden views pause their existing replay rather than losing its state.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!visible) setPlaying(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);
  useEffect(() => () => cancelAnimationFrame(seekFrame.current), []);
  useEffect(() => {
    if (!playing || !visible) return;
    let frame = 0,
      last: number | null = null,
      target = player.time, lastUI = 0;
    const tick = (now: number) => {
      if (last !== null)
        target = Math.min(
          run.duration,
          target + Math.min((now - last) / 1000, 0.1) * speedRef.current,
        );
      last = now;
      const caughtUp = player.advance(target);
      clock.notify();
      if (now - lastUI >= PLAYBACK_DESIGN.uiIntervalMs) {
        lastUI = now; repaint(value => value + 1);
        if (now - lastAnnouncement.current >= PLAYBACK_DESIGN.liveIntervalMs) {
          const meaningful = run.events.slice(announcedIndex.current, player.index).filter(e => e.type === "entity_completed" || e.type === "queue_rejected");
          announcedIndex.current = player.index;
          if (meaningful.length) {
            lastAnnouncement.current = now;
            const event = meaningful[meaningful.length - 1];
            setAnnouncement(`${event.entity_id} ${event.type === "entity_completed" ? "completed" : "rejected"}${meaningful.length > 1 ? `; ${meaningful.length} changes` : ""}`);
          }
        }
      }
      if (caughtUp && player.time >= run.duration) {
        repaint(value => value + 1); setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);

    };
  }, [playing, visible, player, run, clock]);
  function seek(target: number) {
    setPlaying(false);
    cancelAnimationFrame(seekFrame.current);
    const step = () => {
      const done = player.seek(target);
      clock.notify(true); announcedIndex.current = player.index; repaint((value) => value + 1);
      if (!done) seekFrame.current = requestAnimationFrame(step);
    };
    step();
  }
  function reset() { setPlaying(false); cancelAnimationFrame(seekFrame.current); player.reset(); announcedIndex.current = 0; clock.notify(true); repaint(v => v + 1); }
  function toggle() { cancelAnimationFrame(seekFrame.current); if (player.time >= run.duration) player.reset(); setPlaying(value => !value); clock.notify(true); repaint(v => v + 1); }
  function seekEvent(index: number) { setPlaying(false); cancelAnimationFrame(seekFrame.current); player.seekIndex(index + 1); clock.notify(true); announcedIndex.current = player.index; repaint(v => v + 1); }

  function step(direction: -1 | 1) { setPlaying(false); cancelAnimationFrame(seekFrame.current); player.step(direction); clock.notify(true); announcedIndex.current = player.index; repaint(v => v + 1); }
  const finished =
    player.time >= run.duration && player.index === run.events.length;
  return (
    <section
      ref={section}
      className={`astra-playback ${visible ? "" : "astra-hidden"}`}
      aria-label="Simulation playback"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.target instanceof Element && event.target.closest("input,select,textarea,[contenteditable=true]")) return;
        // Let focused buttons retain their native Space/Enter activation.
        if (event.key === " " && event.target instanceof Element && event.target.closest("button,summary,[role=button]")) return;
        const action = playbackShortcut(event.key, event.shiftKey);
        if (!action) return;
        event.preventDefault();
        if (action === "clear") { setSelected(null); setFollowing(false); }
        else if (action === "toggle") toggle();
        else if (action === "previous" || action === "next") step(action === "previous" ? -1 : 1);
        else if (action === "reset" || action === "start") reset();
        else if (action === "end") seek(run.duration);
        else if (action === "back10" || action === "forward10") seek(player.time + (action === "back10" ? -1 : 1) / 6);
      }}
    >
      <WorkspacePageHeader
        overline="Simulation playback"
        title="Replay your system"
        description="Follow entities through the last measured simulation run."
        actions={
          <><span className="workspace-chip">Model v{run.model_version}</span><button className="astra-button-secondary" aria-pressed={!reducedMotion} title={systemMotion ? "System reduced motion is enabled" : "Toggle walking and visual transfers"} onClick={() => setMotion(v => !v)}>{reducedMotion ? "Motion off" : "Motion on"}</button><button className="astra-button-secondary" aria-expanded={logOpen} onClick={() => setLogOpen(v => !v)}>Event log</button></>
        }
      />
      {stale && <p className="playback-notice" role="status" aria-label="Run status">This run uses model v{run.model_version}. The editor has newer changes; this replay stays tied to its saved snapshot.</p>}
      {!run.events.length && <p className="playback-notice" role="status" aria-label="Run status">This run has no events. There are no entities to replay.</p>}
      <span className="playback-live" aria-live="polite" aria-atomic="true">{announcement}</span>
      <div ref={controlsRef} className="astra-playback-controls glass">
        <PlaybackButtons playing={playing} finished={finished} disabled={!run.events.length} canPrevious={player.index > 0} canNext={player.index < run.events.length} onToggle={toggle} onReset={reset} onStep={step} />
        <label>
          Speed
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {[0.5, 1, 2, 4, 8].map((value) => (
              <option key={value} value={value}>
                {value}× · {value} min/s
              </option>
            ))}
          </select>
        </label>
        <PlaybackTimeline events={run.events} duration={run.duration} time={player.time} index={player.index} playing={playing} onSeek={seek} onDragEnd={resume => { if (resume && player.time < run.duration) setPlaying(true); }} />
        <div className="playback-readout">
          <strong data-testid="playback-clock">
            {player.time.toFixed(2)} / {run.duration} min
          </strong>
          <span>
            {finished ? "Finished" : playing && visible ? "Playing" : player.time === 0 && player.index > 0 ? "Initial state" : "Paused"}{" "}
            · {player.index.toLocaleString("en-US")} /{" "}
            {run.events.length.toLocaleString("en-US")} events
          </span>
        </div>
      </div>
      <div className="astra-playback-summary">
        {[
          ["arrived", player.arrived],
          ["in system", player.active.size],
          ["completed", player.completed],
          ["rejected", player.rejected],
        ].map(([label, count]) => (
          <span className="workspace-chip playback-stat" key={label} data-muted={label === "rejected" && count === 0} title={label === "rejected" ? "Rejected entities could not enter a queue because it was at capacity." : undefined}>
            {count} {label}
          </span>
        ))}
      </div>
      <ReactFlowProvider>
        <PlaybackCanvas run={run} player={player} visible={visible} theme={theme} selected={selected} following={following} onSelect={id => { if (id === selected && id !== null) setFollowing(v => !v); else { setSelected(id); setFollowing(false); } }} onStopFollowing={() => setFollowing(false)} logOpen={logOpen} onSeek={seekEvent} onLogClose={() => setLogOpen(false)} clock={clock} reducedMotion={reducedMotion} />
      </ReactFlowProvider>

    </section>
  );
}

function PlaybackLegend({ run }: { run: PlaybackRun }) { return (
      <div className="playback-legend">
        <span>
          <i className="playback-swatch waiting" />
          Waiting
        </span>
        <span>
          <i className="playback-swatch" />
          Active / in service
        </span>
        <span>
          <i className="playback-swatch transfer" />
          Transfer
        </span>
        <details
          className="playback-info"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary
            aria-label="Playback information"
            title="Playback information"
          >
            ?
          </summary>
          <p><time dateTime={run.created_at}>{new Date(run.created_at).toISOString().replace("T", " ").slice(0, 16) + " UTC"}</time> · seed {run.seed} · {run.duration} simulated minutes · {run.summary.total_generated} total entities.</p>
          <p>
            Space: play/pause · Left/Right: previous/next event · Shift+Left/Right: ±10 simulated seconds · Home/End: start/end · R: reset · Esc: clear selection. 1× = one simulated minute per second. Instant connections use a
            brief visual transition. Counts include all entities. Up to six people per station and 80 people overall are shown; overflow counts include hidden people. Visual transfers take at most 0.4 simulated minutes and do not delay occupancy or results. Reset reuses this run.
            Playback is available until you reload or run again.
          </p>
        </details>
      </div>
); }

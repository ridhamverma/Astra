"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
} from "@xyflow/react";
import { AstraNode } from "./astra-node";
import { BuilderEdge } from "./builder-edge";
import { CanvasGrid, CanvasZoomControls } from "./canvas-ui";
import { WorkspacePageHeader } from "./workspace-shell";
import {
  toEditorEdges,
  toEditorNodes,
  type EditorNode,
  type EditorEdge,
} from "@/lib/simulation-editor";
import { TimelinePlayer, TRANSIT_DURATION } from "@/lib/playback";
import type { PlaybackRun } from "@/types/simulation-result";

const nodeTypes = {
  source: AstraNode,
  queue: AstraNode,
  process: AstraNode,
  decision: AstraNode,
  delay: AstraNode,
  sink: AstraNode,
};
const edgeTypes = { builder: BuilderEdge };

function PlaybackCanvas({
  run,
  player,
  visible,
}: {
  run: PlaybackRun;
  player: TimelinePlayer;
  visible: boolean;
}) {
  const flow = useReactFlow<EditorNode, EditorEdge>();
  const wrapper = useRef<HTMLDivElement>(null);
  const fit = useCallback(
    () => void flow.fitView({ padding: 0.15, minZoom: 0.08, maxZoom: 1.25 }),
    [flow],
  );
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    resize();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    if (wrapper.current) observer?.observe(wrapper.current);
    window.addEventListener("orientationchange", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("orientationchange", resize);
    };
  }, [fit, run.id, visible]);
  const countsKey = JSON.stringify([...player.occupancy]);
  const nodes = useMemo(() => {
    const counts = new Map<
      string,
      { present: number; serving: number; waiting: number }
    >(JSON.parse(countsKey));
    return toEditorNodes(run.model.nodes).map((node) => {
      const count = counts.get(node.id);
      const outgoing = run.model.edges.filter(
        (edge) => edge.source === node.id,
      );
      return {
        ...node,
        data: {
          ...node.data,
          builderPresentation: true,
          bottleneck: node.id === run.bottleneck_analysis.primaryBottleneck,
          yesProbability: outgoing[0]?.probability ?? 0,
          rows:
            node.type === "process"
              ? ([
                  ["Serving", String(count?.serving ?? 0)],
                  ["Waiting", String(count?.waiting ?? 0)],
                ] as [string, string][])
              : ([
                  ["Present", String(count?.present ?? 0)],
                  ["Waiting", String(count?.waiting ?? 0)],
                ] as [string, string][]),
        },
      };
    });
  }, [run, countsKey]);
  const edges = useMemo(
    () =>
      toEditorEdges(run.model.edges, run.model.nodes).map((edge) => ({
        ...edge,
        type: "builder",
        label: undefined,
        targetHandle: "target-left",
        sourceHandle: edge.sourceHandle ?? "source-right",
        data: {
          ...edge.data,
          label: edge.sourceHandle
            ? `${edge.sourceHandle === "yes" ? "Yes" : "No"} ${Math.round((edge.data?.probability ?? 0) * 100)}%`
            : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: "var(--edge-arrow)",
        },
      })),
    [run],
  );
  const positions = useMemo(
    () => new Map(run.model.nodes.map((node) => [node.id, node.position])),
    [run],
  );
  const offsets = new Map<string, number>();
  return (
    <div
      ref={wrapper}
      className="astra-canvas astra-playback-canvas"
      aria-label="Read-only playback canvas"
      tabIndex={0}
    >
      {visible && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.08, maxZoom: 1.25 }}
          minZoom={0.08}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          zoomOnPinch
          panOnScroll
        >
          <CanvasGrid />
          <ViewportPortal>
            <svg className="astra-playback-overlay" aria-hidden="true">
              {player.markers().map((entity) => {
                const point = positions.get(entity.nodeId);
                if (!point) return null;
                const offset = offsets.get(entity.nodeId) ?? 0;
                offsets.set(entity.nodeId, offset + 1);
                const x = point.x + 12 + (offset % 20) * 10,
                  y = point.y - 12 - Math.floor(offset / 20) * 10;
                return entity.state === "waiting" ? (
                  <circle
                    key={entity.id}
                    data-entity={entity.id}
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill="none"
                    stroke="var(--warning)"
                    strokeWidth="1.75"
                  >
                    <title>{entity.id}: waiting</title>
                  </circle>
                ) : (
                  <circle
                    key={entity.id}
                    data-entity={entity.id}
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill="var(--accent)"
                  >
                    <title>
                      {entity.id}: {entity.state}
                    </title>
                  </circle>
                );
              })}
              {player.transfers.map((transfer) => {
                const source = positions.get(transfer.source),
                  target = positions.get(transfer.target);
                if (!source || !target) return null;
                const progress = Math.min(
                  1,
                  Math.max(0, (player.time - transfer.time) / TRANSIT_DURATION),
                );
                const route = edges.find(
                  (edge) =>
                    edge.source === transfer.source &&
                    edge.target === transfer.target,
                );
                const start = {
                    x: source.x + 248,
                    y:
                      source.y +
                      112 *
                        (route?.sourceHandle === "yes"
                          ? 0.35
                          : route?.sourceHandle === "no"
                            ? 0.65
                            : 0.5),
                  },
                  end = { x: target.x, y: target.y + 56 },
                  midX = (start.x + end.x) / 2;
                const x =
                  progress < 1 / 3
                    ? start.x + (midX - start.x) * progress * 3
                    : progress < 2 / 3
                      ? midX
                      : midX + (end.x - midX) * (progress * 3 - 2);
                const y =
                  progress < 1 / 3
                    ? start.y
                    : progress < 2 / 3
                      ? start.y + (end.y - start.y) * (progress * 3 - 1)
                      : end.y;
                return (
                  <path
                    key={transfer.index}
                    transform={`translate(${x},${y})`}
                    d="M-4-4 5 0-4 4-2 0Z"
                    fill="var(--success)"
                  >
                    <title>{transfer.id}: transfer</title>
                  </path>
                );
              })}
            </svg>
          </ViewportPortal>
        </ReactFlow>
      )}
      <CanvasZoomControls onFit={fit} />
    </div>
  );
}

export function SimulationPlayback({
  run,
  visible,
}: {
  run: PlaybackRun;
  visible: boolean;
}) {
  const player = useMemo(
    () => new TimelinePlayer(run.events, run.duration),
    [run],
  );
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
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
      target = player.time;
    const tick = (now: number) => {
      if (last !== null)
        target = Math.min(
          run.duration,
          target + Math.min((now - last) / 1000, 0.1) * speedRef.current,
        );
      last = now;
      const caughtUp = player.advance(target);
      repaint((value) => value + 1);
      if (caughtUp && player.time >= run.duration) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const hide = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", hide);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [playing, visible, player, run.duration]);
  function seek(target: number) {
    setPlaying(false);
    cancelAnimationFrame(seekFrame.current);
    const step = () => {
      const done = player.seek(target);
      repaint((value) => value + 1);
      if (!done) seekFrame.current = requestAnimationFrame(step);
    };
    step();
  }
  const finished =
    player.time >= run.duration && player.index === run.events.length;
  return (
    <section
      ref={section}
      className={`astra-playback ${visible ? "" : "astra-hidden"}`}
      aria-label="Simulation playback"
      onKeyDown={(event) => {
        if (
          event.code === "Space" &&
          !(
            event.target instanceof HTMLElement &&
            event.target.closest("input,select,textarea,button,summary")
          )
        ) {
          event.preventDefault();
          if (!finished) setPlaying((value) => !value);
        }
      }}
    >
      <WorkspacePageHeader
        overline="Simulation playback"
        title="Replay your system"
        description="Follow entities through the last measured simulation run."
        actions={
          <span className="workspace-chip">Model v{run.model_version}</span>
        }
      />
      <div ref={controlsRef} className="astra-playback-controls glass">
        <div className="playback-buttons">
          <button
            className="astra-button-primary"
            disabled={finished || playing}
            onClick={() => setPlaying(true)}
          >
            Play
          </button>
          <button
            className="astra-button-secondary"
            disabled={!playing}
            onClick={() => setPlaying(false)}
          >
            Pause
          </button>
          <button
            className="astra-button-secondary"
            onClick={() => {
              setPlaying(false);
              cancelAnimationFrame(seekFrame.current);
              player.reset();
              repaint((value) => value + 1);
            }}
          >
            Reset
          </button>
        </div>
        <label>
          Speed
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {[0.5, 1, 2, 4].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <label className="playback-scrub">
          Simulation time
          <input
            aria-label="Playback time"
            type="range"
            min={0}
            max={run.duration}
            step={0.01}
            value={player.time}
            onChange={(event) => seek(event.currentTarget.valueAsNumber)}
          />
        </label>
        <div className="playback-readout">
          <strong data-testid="playback-clock">
            {player.time.toFixed(2)} / {run.duration} min
          </strong>
          <span>
            {finished ? "Finished" : playing && visible ? "Playing" : "Paused"}{" "}
            · {player.index.toLocaleString()} /{" "}
            {run.events.length.toLocaleString()} events
          </span>
        </div>
      </div>
      <div className="astra-playback-summary">
        {[
          `Model v${run.model_version}`,
          `${player.active.size} active`,
          `${player.completed} completed`,
          `${player.rejected} rejected`,
        ].map((label) => (
          <span className="workspace-chip" key={label}>
            {label}
          </span>
        ))}
      </div>
      <ReactFlowProvider>
        <PlaybackCanvas run={run} player={player} visible={visible} />
      </ReactFlowProvider>
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
          <p>
            1× = one simulated minute per second. Instant connections use a
            brief visual transition. Counts include all entities. Up to 80
            active markers and 80 transfers are shown. Reset reuses this run.
            Playback is available until you reload or run again.
          </p>
        </details>
      </div>
    </section>
  );
}

import { IsometricStation as StationIllustration } from "./isometric-station";
import { memo } from "react";
import { AnimatedPerson } from "./animated-person";
import { stationPosition, STATION_CAPACITY } from "@/lib/playback-layout";
export { stationPosition, STATION_CAPACITY };
import { Handle, Position, type NodeProps, useViewport } from "@xyflow/react";
import type { EditorNode, NodeKind } from "@/lib/simulation-editor";

/** Theme is presentation-only; schema node kinds and configs remain unchanged. */
export interface PlaybackTheme { name: string; captions: Record<NodeKind, string>; Person?: typeof AnimatedPerson; Station?: typeof StationIllustration; }
export const healthcareTheme: PlaybackTheme = { name: "Healthcare", captions: { source: "Source", queue: "Queue", process: "Process", decision: "Decision", delay: "Delay", sink: "Sink" } };

export { IsometricStation as StationIllustration } from "./isometric-station";

export const PlaybackStation = memo(function PlaybackStation({ type, data, selected }: NodeProps<EditorNode>) {
  const { zoom } = useViewport();
  const resources = "resource_count" in data.config ? data.config.resource_count : 1;
  const Illustration = data.sceneTheme?.Station ?? StationIllustration;
  return <div className={`playback-station glass ${selected ? "is-selected" : ""}`} data-kind={type} data-active={(data.sceneServing ?? 0) > 0 || (data.scenePresent ?? 0) > 0} data-compact={zoom < .7} data-overview={zoom < .35} style={{ "--scene-zoom": zoom } as import("react").CSSProperties}>
    {type !== "source" && <Handle id="target-left" type="target" position={Position.Left} className="astra-handle" />}
    <div className="station-heading"><span>{data.sceneTheme?.captions[type] ?? healthcareTheme.captions[type]}</span><small>{type}</small></div>
    <strong className="station-name" title={data.name}>{data.name}</strong>
    <Illustration kind={type} resources={resources} occupiedSlots={data.sceneServiceSlots} />
    <dl className="station-metrics">{data.rows?.map(([label, value]) => <div key={label}><dt title={label}>{label === "Available" ? "Avail." : label}</dt><dd>{value}</dd></div>)}</dl>
    {((type === "process") || (type === "queue" && "capacity" in data.config && data.config.capacity !== null)) && <div className="station-load" role="img" aria-label={type === "process" ? `Resource usage ${data.sceneServing ?? 0} of ${resources}` : `Queue occupancy ${data.scenePresent ?? 0}`}><i style={{width: `${Math.min(1, type === "process" ? (data.sceneServing ?? 0) / resources : "capacity" in data.config && data.config.capacity ? (data.scenePresent ?? 0) / data.config.capacity : 0) * 100}%`}} /></div>}
    {!!data.sceneOverflow && <span className="station-overflow">+{data.sceneOverflow} more</span>}
    {type === "decision" ? <><Handle id="yes" type="source" position={Position.Right} style={{ top: 122 }} className="astra-handle" title="Yes branch" /><Handle id="no" type="source" position={Position.Right} style={{ top: 162 }} className="astra-handle" title="No branch" /></> : type !== "sink" && <Handle id="source-right" type="source" position={Position.Right} className="astra-handle" />}
  </div>;
});

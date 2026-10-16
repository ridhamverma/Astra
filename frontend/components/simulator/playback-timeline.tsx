"use client";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { aggregateEventTicks } from "@/lib/playback-timeline";
import { eventUpperBound } from "@/lib/playback";
import type { SimulationEvent } from "@/types/simulation-result";
export function PlaybackTimeline({ events, duration, time, index, playing, onSeek, onDragEnd }: {
  events: readonly SimulationEvent[]; duration: number; time: number; index: number; playing: boolean;
  onSeek: (time: number) => void; onDragEnd: (resume: boolean) => void;
}) {
  const ticks = useMemo(() => aggregateEventTicks(events, duration), [events, duration]);
  const wasPlaying = useRef(false), dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const at = hover === null ? null : events[Math.max(0, eventUpperBound(events, hover) - 1)];
  return <div className="playback-timeline" onPointerMove={event => {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(duration, (event.clientX - box.left) / box.width * duration)));
  }} onPointerLeave={() => setHover(null)}>
    <div className="timeline-track" style={{ "--timeline-progress": `${duration ? time / duration * 100 : 0}%` } as CSSProperties}>
      <input id="playback-time" aria-label="Playback time" type="range" role="slider" min={0} max={duration} step={.001} value={time}
        aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} aria-valuetext={`${time.toFixed(2)} of ${duration} minutes, event ${index} of ${events.length}`}
        disabled={duration <= 0} onChange={e => onSeek(e.currentTarget.valueAsNumber)}
        onPointerDown={e => { dragging.current = true; wasPlaying.current = playing; e.currentTarget.setPointerCapture(e.pointerId); onSeek(time); }}
        onPointerUp={() => { if (dragging.current) { dragging.current = false; onDragEnd(wasPlaying.current); } }}
        onPointerCancel={() => { dragging.current = false; onDragEnd(false); }} />
      <div className="timeline-ticks" aria-hidden="true">{ticks.map((tick,i) => <i key={i} data-kind={tick.kind} style={{ left: `${duration ? tick.time / duration * 100 : 0}%` }} title={`${tick.time.toFixed(2)} min · ${tick.count} ${tick.kind}`} />)}</div>
    </div>
    <div className="timeline-endpoints" aria-hidden="true"><span>0</span><span>{duration} min</span></div>
    {hover !== null && <output className="timeline-tooltip" style={{ left: `${duration ? hover / duration * 100 : 0}%` }}>{hover.toFixed(2)} min<span className="timeline-tooltip-event"> · {at ? `${at.entity_id} ${at.type.replaceAll("_", " ")}` : "Start"}</span></output>}
  </div>;
}

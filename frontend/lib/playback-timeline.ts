import type { SimulationEvent } from "../types/simulation-result";
export type TickKind = "arrival" | "completion" | "rejection";
export interface EventTick { time: number; kind: TickKind; count: number; events: SimulationEvent[]; }
const kinds: Partial<Record<SimulationEvent["type"], TickKind>> = { entity_created: "arrival", entity_completed: "completion", queue_rejected: "rejection" };
/** Fixed screen bins cap DOM output independently of run length. Each category is retained. */
export function aggregateEventTicks(events: readonly SimulationEvent[], duration: number, bins = 120): EventTick[] {
  const groups = new Map<string, EventTick>();
  for (const event of events) {
    const kind = kinds[event.type]; if (!kind) continue;
    const bin = Math.min(bins - 1, Math.floor(event.time / Math.max(duration, Number.EPSILON) * bins));
    const key = `${bin}:${kind}`, old = groups.get(key);
    if (old) { old.count++; old.events.push(event); }
    else groups.set(key, { time: event.time, kind, count: 1, events: [event] });
  }
  return [...groups.values()].sort((a,b) => a.time - b.time);
}
export function playbackShortcut(key: string, shift = false): "toggle" | "previous" | "next" | "back10" | "forward10" | "start" | "end" | "reset" | "clear" | null {
  if (key === " ") return "toggle";
  if (key === "ArrowLeft") return shift ? "back10" : "previous";
  if (key === "ArrowRight") return shift ? "forward10" : "next";
  if (key === "Home") return "start";
  if (key === "End") return "end";
  if (key.toLowerCase() === "r") return "reset";
  if (key === "Escape") return "clear";
  return null;
}

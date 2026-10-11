import { stationSlot } from "./isometric";
import { MARKER_LIMIT, visualJourneys, type ActiveEntity, type TimelinePlayer } from "./playback";
import type { SimulationNode } from "../types/simulation";
export const STATION_CAPACITY = 6;
export function stationPosition(slot: number) { return stationSlot(slot); }
/** One bounded render plan shared by overflow badges and the character layer. */
export function playbackLayout(player: TimelinePlayer, nodes: readonly SimulationNode[], reducedMotion = false) {
  const slots: { entity: ActiveEntity; slot: number }[] = [];
  const visibleIds = new Set<string>();
  const overflow = new Map<string, number>();
  for (const node of nodes) {
    let waitingSlot = 0, visible = 0;
    const entities = player.atNode(node.id);
    for (const entity of entities) {
      const slot = entity.state === "serving" ? entity.serviceSlot ?? 0 : (node.type === "process" ? node.config.resource_count : 0) + waitingSlot++;
      if (slot >= STATION_CAPACITY || slots.length >= MARKER_LIMIT) continue;
      slots.push({ entity, slot }); visibleIds.add(entity.id); visible++;
    }
    overflow.set(node.id, entities.length - visible);
  }
  const candidates = reducedMotion ? [] : visualJourneys(player);
  const activeJourneys = candidates.filter(j => visibleIds.has(j.id));
  const departures = candidates.filter(j => !player.active.has(j.id)).slice(0, MARKER_LIMIT - slots.length);
  return { slots, journeys: [...activeJourneys, ...departures], overflow };
}

export interface ScenePoint { x: number; y: number; }
export interface ScenePath { length: number; sample: (distance: number) => ScenePoint; }
/** Arc-length motion on rendered curves, plus continuous station-interior connectors. */
export function sampleSceneJourney(paths: readonly ScenePath[], start: ScenePoint, end: ScenePoint, progress: number) {
  const segments: ScenePath[] = [];
  const line = (a: ScenePoint, b: ScenePoint) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ length, sample: distance => { const p = length ? distance / length : 1; return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p }; } });
  };
  let previous = start;
  for (const path of paths) { line(previous, path.sample(0)); segments.push(path); previous = path.sample(path.length); }
  line(previous, end);
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let distance = total * Math.max(0, Math.min(1, progress));
  let current = segments[segments.length - 1];
  for (const segment of segments) {
    current = segment;
    if (distance <= segment.length || segment === segments[segments.length - 1]) { distance = Math.min(distance, segment.length); break; }
    distance -= segment.length;
  }
  const point = current.sample(distance);
  const next = current.sample(Math.min(current.length, distance + 1));
  const prev = current.sample(Math.max(0, distance - 1));
  return { ...point, facing: next.x - prev.x };
}

const scenePathCache = new Map<string, ScenePath>();
/** Measure actual SVG geometry once; frame sampling uses a bounded arc-length lookup. */
export function cacheScenePath(path: { getTotalLength(): number; getPointAtLength(distance: number): ScenePoint; getAttribute?(name: string): string | null }): ScenePath {
  const geometry = path.getAttribute?.("d");
  const cached = geometry ? scenePathCache.get(geometry) : undefined;
  if (cached) return cached;
  const length = path.getTotalLength();
  const count = Math.max(1, Math.min(1024, Math.ceil(length / 4)));
  const points = Array.from({ length: count + 1 }, (_, i) => { const point = path.getPointAtLength(length * i / count); return { x: point.x, y: point.y }; });
  const result: ScenePath = { length, sample: distance => {
    const offset = length ? Math.min(count, Math.max(0, distance / length * count)) : 0;
    const index = Math.min(count - 1, Math.floor(offset)), fraction = offset - index;
    const a = points[index], b = points[index + 1];
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  } };
  if (geometry) { if (scenePathCache.size >= 1024) scenePathCache.delete(scenePathCache.keys().next().value!); scenePathCache.set(geometry, result); }
  return result;
}

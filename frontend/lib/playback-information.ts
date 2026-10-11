import type { SimulationEvent } from "../types/simulation-result";
export interface IndexedEvent { event: SimulationEvent; index: number; }
export function indexEntityEvents(events: readonly SimulationEvent[]) {
  const result = new Map<string, IndexedEvent[]>();
  events.forEach((event,index) => { const group = result.get(event.entity_id) ?? []; group.push({event,index}); result.set(event.entity_id,group); });
  return result;
}
/** Timing is reconstructed from logged requests/starts/completions, including open intervals. */
export function entityInformation(events: readonly IndexedEvent[], consumed: number, time: number) {
  let arrivedAt: number | null = null, endedAt: number | null = null, waitingAt: number | null = null, servingAt: number | null = null;
  let wait = 0, service = 0, nodeId: string | null = null, status = "present";
  const route: string[] = [];
  for (const {event,index} of events) {
    if (index >= consumed) break;
    if (event.type === "entity_created") { arrivedAt = event.time; nodeId = event.node_id; }
    if (event.type === "node_enter") { nodeId = event.node_id; route.push(event.node_id); }
    if (event.type === "queue_wait_started" || event.type === "service_requested") { waitingAt ??= event.time; status = "waiting"; }
    if (event.type === "service_started") { if (waitingAt !== null) wait += event.time - waitingAt; waitingAt = null; servingAt = event.time; status = "serving"; }
    if (event.type === "service_completed") { if (servingAt !== null) service += event.time - servingAt; servingAt = null; status = "present"; }
    if (event.type === "entity_completed" || event.type === "queue_rejected") { endedAt = event.time; status = event.type === "entity_completed" ? "completed" : "rejected"; }
  }
  const until = endedAt ?? time;
  return { arrivedAt, endedAt, nodeId, status, route, wait: wait + (waitingAt !== null ? Math.max(0, until - waitingAt) : 0), service: service + (servingAt !== null ? Math.max(0, until - servingAt) : 0), inSystem: arrivedAt === null ? null : Math.max(0, until - arrivedAt) };
}

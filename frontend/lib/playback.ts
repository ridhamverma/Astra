import type { SimulationEvent } from "../types/simulation-result";

export const MARKER_LIMIT = 80;
export const FRAME_EVENT_LIMIT = 4000;
export const SNAPSHOT_INTERVAL = 256;
export const MAX_SNAPSHOTS = 64;
export const TRANSIT_DURATION = 0.4; // Presentation only; never added to simulation time.
export interface ActiveEntity {
  id: string;
  nodeId: string;
  state: "waiting" | "serving" | "present";
  createdAt: number;
  enteredAt: number;
  enteredOrder: number;
  serviceStartedAt?: number;
  serviceSlot?: number;
  departing?: boolean;
}
export interface NodeOccupancy {
  present: number;
  waiting: number;
  serving: number;
}
export interface Transfer {
  id: string;
  source: string;
  target: string;
  time: number;
  index: number;
}

/** One forward cursor: O(events consumed), bounded work per frame and bounded SVG output.
 * Equal-time events retain backend ordering. Completed/rejected entities leave active state.
 */
export class TimelinePlayer {
  time = 0;
  index = 0;
  completed = 0;
  rejected = 0;
  arrived = 0;
  routes = new Map<string, number>();
  private snapshots: PlayerSnapshot[] | null = null;
  active = new Map<string, ActiveEntity>();
  occupancy = new Map<string, NodeOccupancy>();
  transfers: Transfer[] = [];
  completedByNode = new Map<string, number>();
  private nodeCacheIndex = -1;
  private nodeCache = new Map<string, ActiveEntity[]>();
  constructor(
    readonly events: readonly SimulationEvent[],
    readonly duration: number,
  ) {}

  reset() {
    this.time = this.index = this.completed = this.rejected = this.arrived = 0;
    this.routes.clear();
    this.active.clear();
    this.occupancy.clear();
    this.transfers = [];
    this.completedByNode.clear();
    this.nodeCacheIndex = -1;
    this.nodeCache.clear();
  }

  /** Binary-search the event prefix, restore its nearest checkpoint, apply a bounded tail.
   * Restoration is O(active entities); lookup is O(log events), never a full backward replay.
   */
  seek(target: number, budget = FRAME_EVENT_LIMIT): boolean {
    target = Math.min(this.duration, Math.max(0, target));
    const count = eventUpperBound(this.events, target);
    if (target < this.time || count < this.index || count - this.index > SNAPSHOT_INTERVAL) {
      this.prepareSnapshots();
      const snapshots = this.snapshots!;
      let low = 0, high = snapshots.length;
      while (low < high) { const mid = (low + high) >>> 1; if (snapshots[mid].index <= count) low = mid + 1; else high = mid; }
      this.restore(snapshots[Math.max(0, low - 1)]);
    }
    return this.advance(target, budget);
  }

  /** Select an exact event prefix, including equal-time events in backend order. */
  seekIndex(count: number): void {
    count = Math.max(0, Math.min(this.events.length, count));
    this.prepareSnapshots();
    const snapshots = this.snapshots!;
    let low = 0, high = snapshots.length;
    while (low < high) { const mid = (low + high) >>> 1; if (snapshots[mid].index <= count) low = mid + 1; else high = mid; }
    this.restore(snapshots[Math.max(0, low - 1)]);
    if (count > this.index) this.advance(this.events[count - 1].time, count - this.index);
    this.time = count ? this.events[count - 1].time : 0;
    this.transfers = this.transfers.filter(t => this.time - t.time < TRANSIT_DURATION);
  }

  /** Exact prefix stepping retains backend order even among equal-time events. */
  step(direction: -1 | 1): void { this.seekIndex(this.index + direction); }

  prepareSnapshots(): void {
    if (this.snapshots) return;
    const cursor = new TimelinePlayer(this.events, this.duration);
    const snapshots = [cursor.capture()];
    const interval = Math.max(SNAPSHOT_INTERVAL, Math.ceil(this.events.length / MAX_SNAPSHOTS));
    while (cursor.index < this.events.length) {
      cursor.advance(this.events[Math.min(this.events.length, cursor.index + interval) - 1].time, interval);
      snapshots.push(cursor.capture());
    }
    this.snapshots = snapshots;
  }

  private capture(): PlayerSnapshot {
    return { time: this.time, index: this.index, completed: this.completed, rejected: this.rejected,
      arrived: this.arrived, active: new Map(this.active),
      occupancy: new Map([...this.occupancy].map(([id, count]) => [id, { ...count }])),
      transfers: this.transfers.map(t => ({ ...t })), completedByNode: new Map(this.completedByNode), routes: new Map(this.routes) };
  }

  private restore(snapshot: PlayerSnapshot): void {
    this.time = snapshot.time; this.index = snapshot.index;
    this.completed = snapshot.completed; this.rejected = snapshot.rejected; this.arrived = snapshot.arrived;
    this.active = new Map(snapshot.active);
    this.occupancy = new Map([...snapshot.occupancy].map(([id, count]) => [id, { ...count }]));
    this.transfers = snapshot.transfers.map(t => ({ ...t }));
    this.completedByNode = new Map(snapshot.completedByNode); this.routes = new Map(snapshot.routes);
    this.nodeCacheIndex = -1; this.nodeCache.clear();
  }

  private change(entity: ActiveEntity, amount: number) {
    if (entity.departing) return;
    const count = this.occupancy.get(entity.nodeId) ?? {
      present: 0,
      waiting: 0,
      serving: 0,
    };
    count.present += amount;
    if (entity.state !== "present") count[entity.state] += amount;
    this.occupancy.set(entity.nodeId, count);
  }

  advance(target: number, budget = FRAME_EVENT_LIMIT): boolean {
    target = Math.min(this.duration, Math.max(this.time, target));
    let consumed = 0;
    while (
      this.index < this.events.length &&
      this.events[this.index].time <= target &&
      consumed < budget
    ) {
      const event = this.events[this.index];
      const previous = this.active.get(event.entity_id);
      if (event.type === "entity_created") this.arrived++;
      if (
        event.type === "entity_completed" ||
        event.type === "queue_rejected"
      ) {
        if (previous) {
          this.change(previous, -1);
          this.active.delete(previous.id);
        }
        if (event.type === "entity_completed") {
          this.completed++;
          this.completedByNode.set(event.node_id, (this.completedByNode.get(event.node_id) ?? 0) + 1);
        }
        else this.rejected++;
      } else if ((event.type === "node_exit" || event.type === "queue_exit") && previous?.nodeId === event.node_id && !previous.departing) {
        this.change(previous, -1);
        this.active.set(previous.id, { ...previous, departing: true });
      } else if (event.type === "service_completed" && previous) {
        this.change(previous, -1);
        const entity: ActiveEntity = { ...previous, state: "present", serviceSlot: undefined };
        this.active.set(entity.id, entity);
        this.change(entity, 1);
      } else if (
        event.type === "entity_created" ||
        event.type === "node_enter" ||
        event.type === "queue_wait_started" ||
        event.type === "service_started" ||
        event.type === "service_requested"
      ) {
        // A Queue requests downstream service while the entity still occupies the Queue.
        const nodeId =
          event.type === "service_requested" && previous
            ? previous.nodeId
            : event.node_id;
        if (previous) this.change(previous, -1);
        if (
          event.type === "node_enter" &&
          previous &&
          previous.nodeId !== nodeId
        ) {
          const route = routeKey(previous.nodeId, nodeId);
          this.routes.set(route, (this.routes.get(route) ?? 0) + 1);
          this.transfers.push({
            id: previous.id,
            source: previous.nodeId,
            target: nodeId,
            time: event.time,
            index: this.index,
          });
          if (this.transfers.length > MARKER_LIMIT) this.transfers.shift();
        }
        const entity: ActiveEntity = {
          id: event.entity_id,
          nodeId,
          createdAt: previous?.createdAt ?? event.time,
          enteredAt: previous?.nodeId === nodeId ? previous.enteredAt : event.time,
          enteredOrder: previous?.nodeId === nodeId ? previous.enteredOrder : this.index,
          serviceStartedAt: event.type === "service_started" ? event.time : previous?.nodeId === nodeId ? previous.serviceStartedAt : undefined,
          serviceSlot: event.type === "service_started" ? this.freeServiceSlot(nodeId, event.entity_id) : previous?.nodeId === nodeId ? previous.serviceSlot : undefined,
          state:
            event.type === "service_started"
              ? "serving"
              : event.type === "queue_wait_started" ||
                  event.type === "service_requested"
                ? "waiting"
                : "present",
        };
        this.active.set(entity.id, entity);
        this.change(entity, 1);
      }
      this.time = event.time;
      this.index++;
      consumed++;
    }
    const caughtUp =
      this.index === this.events.length ||
      this.events[this.index].time > target;
    if (caughtUp) this.time = target;
    this.transfers = this.transfers.filter(
      (transfer) => this.time - transfer.time < TRANSIT_DURATION,
    );
    return caughtUp;
  }

  private freeServiceSlot(nodeId: string, id: string): number {
    const used = new Set([...this.active.values()].filter(e => e.nodeId === nodeId && e.id !== id && e.state === "serving").map(e => e.serviceSlot));
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  /** FIFO is node-entry order, independent of state updates or Map insertion order. */
  atNode(nodeId: string): ActiveEntity[] {
    if (this.nodeCacheIndex !== this.index) {
      this.nodeCache.clear();
      for (const entity of this.active.values()) {
        if (entity.departing) continue;
        const entities = this.nodeCache.get(entity.nodeId) ?? [];
        entities.push(entity); this.nodeCache.set(entity.nodeId, entities);
      }
      for (const entities of this.nodeCache.values()) entities.sort((a, b) => a.enteredOrder - b.enteredOrder);
      this.nodeCacheIndex = this.index;
    }
    return this.nodeCache.get(nodeId) ?? [];
  }

  markers(): ActiveEntity[] {
    const markers: ActiveEntity[] = [];
    for (const entity of this.active.values()) {
      markers.push(entity);
      if (markers.length === MARKER_LIMIT) break;
    }
    return markers;
  }
}

export interface VisualJourney { id: string; legs: Transfer[]; leg: Transfer; progress: number; totalProgress: number; }
/** All equal-time hops share ONE bounded transition; later transfers replace earlier ones.
 * Logical occupancy is never delayed. A seek derives exactly the same visual state.
 */
export function visualJourneys(player: TimelinePlayer): VisualJourney[] {
  const groups = new Map<string, Transfer[]>();
  for (const transfer of player.transfers) {
    const old = groups.get(transfer.id);
    groups.set(transfer.id, old?.[0].time === transfer.time ? [...old, transfer] : [transfer]);
  }
  const journeys: VisualJourney[] = [];
  for (const [id, legs] of groups) {
    const start = legs[0].time;
    const duration = Math.min(TRANSIT_DURATION, player.duration - start);
    if (duration <= 0) continue;
    const progress = (player.time - start) / duration;
    if (progress < 0 || progress >= 1) continue;
    const position = progress * legs.length;
    journeys.push({ id, legs, leg: legs[Math.floor(position)], progress: position % 1, totalProgress: progress });
  }
  return journeys;
}

interface PlayerSnapshot {
  time: number; index: number; completed: number; rejected: number; arrived: number;
  active: Map<string, ActiveEntity>; occupancy: Map<string, NodeOccupancy>;
  transfers: Transfer[]; completedByNode: Map<string, number>; routes: Map<string, number>;
}
export function routeKey(source: string, target: string) { return `${source}\u0000${target}`; }
export function eventUpperBound(events: readonly SimulationEvent[], time: number): number {
  let low = 0, high = events.length;
  while (low < high) { const mid = (low + high) >>> 1; if (events[mid].time <= time) low = mid + 1; else high = mid; }
  return low;
}

import type { SimulationEvent } from "../types/simulation-result";

export const MARKER_LIMIT = 80;
export const FRAME_EVENT_LIMIT = 4000;
export const TRANSIT_DURATION = 0.4; // Presentation only; never added to simulation time.
export interface ActiveEntity {
  id: string;
  nodeId: string;
  state: "waiting" | "serving" | "present";
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
  active = new Map<string, ActiveEntity>();
  occupancy = new Map<string, NodeOccupancy>();
  transfers: Transfer[] = [];
  constructor(
    readonly events: readonly SimulationEvent[],
    readonly duration: number,
  ) {}

  reset() {
    this.time = this.index = this.completed = this.rejected = 0;
    this.active.clear();
    this.occupancy.clear();
    this.transfers = [];
  }

  seek(target: number, budget = FRAME_EVENT_LIMIT): boolean {
    target = Math.min(this.duration, Math.max(0, target));
    if (target < this.time) this.reset();
    return this.advance(target, budget);
  }

  private change(entity: ActiveEntity, amount: number) {
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
      if (
        event.type === "entity_completed" ||
        event.type === "queue_rejected"
      ) {
        if (previous) {
          this.change(previous, -1);
          this.active.delete(previous.id);
        }
        if (event.type === "entity_completed") this.completed++;
        else this.rejected++;
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

  markers(): ActiveEntity[] {
    const markers: ActiveEntity[] = [];
    for (const entity of this.active.values()) {
      markers.push(entity);
      if (markers.length === MARKER_LIMIT) break;
    }
    return markers;
  }
}

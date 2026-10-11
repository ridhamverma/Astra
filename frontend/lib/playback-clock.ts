/** An external frame signal keeps animation updates out of the graph/control tree. */
export class PlaybackClock {
  private version = 0;
  forced = false;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.version;
  notify = (force = false) => { this.forced = force; this.version++; for (const listener of this.listeners) listener(); this.forced = false; };
}

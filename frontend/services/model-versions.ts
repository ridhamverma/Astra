import { getSessionGeneration } from "./api";

/** Version tokens are scoped to the current authenticated browser session. */
export class ModelVersions {
  private generation = -1;
  private values = new Map<string, number | null>();
  private current() {
    const generation = getSessionGeneration();
    if (generation !== this.generation) {
      this.values.clear();
      this.generation = generation;
    }
  }
  get(id: string) { this.current(); return this.values.get(id); }
  set(id: string, version: number | null) { this.current(); this.values.set(id, version); }
  delete(id: string) { this.current(); this.values.delete(id); }
}

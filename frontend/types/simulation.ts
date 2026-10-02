/** Canonical Astra model JSON. Runtime validation is defined in backend/app/schemas/simulation.py. */

export type Distribution = "constant" | "exponential" | "uniform";

export interface Position {
  x: number;
  y: number;
}

export interface SourceConfig {
  distribution: Distribution;
  mean_interarrival_time: number;
  minimum_interarrival_time?: number | null;
  maximum_interarrival_time?: number | null;
  max_entities?: number | null;
}

export interface QueueConfig {
  capacity: number | null; // null means unlimited
  discipline: "fifo";
}

export interface ProcessConfig {
  resource_count: number;
  service_distribution: Distribution;
  mean_service_time: number;
  minimum_service_time?: number | null;
  maximum_service_time?: number | null;
  cost_per_resource?: number | null;
}

export interface DecisionConfig {
  routing: "probability";
}

export interface DelayConfig {
  distribution: Distribution;
  mean_delay: number;
  minimum_delay?: number | null;
  maximum_delay?: number | null;
}

export type SinkConfig = Record<string, never>;

interface BaseNode {
  id: string;
  name: string;
  position: Position;
}

export type SimulationNode =
  | (BaseNode & { type: "source"; config: SourceConfig })
  | (BaseNode & { type: "queue"; config: QueueConfig })
  | (BaseNode & { type: "process"; config: ProcessConfig })
  | (BaseNode & { type: "decision"; config: DecisionConfig })
  | (BaseNode & { type: "delay"; config: DelayConfig })
  | (BaseNode & { type: "sink"; config: SinkConfig });

export interface SimulationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: "yes" | "no" | string | null;
  probability?: number | null; // required for each outgoing Decision edge
}

export interface SimulationSettings {
  duration: number;
  seed: number;
}

export interface SimulationModel {
  id: string;
  name: string;
  simulation: SimulationSettings;
  nodes: SimulationNode[];
  edges: SimulationEdge[];
}

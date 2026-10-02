/** Wire types for backend/app/simulation/results.py and persisted RunRead. */

export interface SimulationSummary {
  total_generated: number;
  total_completed: number;
  total_rejected: number;
  in_system_at_end: number;
  completion_rate: number;
  average_cycle_time: number | null;
  maximum_cycle_time: number | null;
  average_waiting_time: number | null;
  maximum_waiting_time: number | null;
  throughput: number;
}

export interface QueueMetrics {
  total_arrivals: number;
  total_exited: number;
  rejected_entities: number;
  average_waiting_time: number | null;
  maximum_waiting_time: number | null;
  average_queue_length: number;
  maximum_queue_length: number;
  waiting_at_end: number;
}

export interface ProcessMetrics {
  resource_count: number;
  services_started: number;
  entities_processed: number;
  total_busy_resource_time: number;
  resource_utilization: number;
  average_service_time: number | null;
  average_waiting_time: number | null;
  maximum_waiting_time: number | null;
}

export type NodeMetrics = QueueMetrics | ProcessMetrics;

export function isQueueMetrics(metrics: NodeMetrics): metrics is QueueMetrics {
  return "total_arrivals" in metrics;
}

export function isProcessMetrics(metrics: NodeMetrics): metrics is ProcessMetrics {
  return "resource_utilization" in metrics;
}

export interface TimeSeriesPoint {
  time: number;
  value: number;
}

export interface SimulationTimeSeries {
  queue_lengths: Record<string, TimeSeriesPoint[]>;
  cumulative_completed: TimeSeriesPoint[];
}

export interface SimulationRun {
  bottleneck_analysis: import("./bottlenecks").BottleneckAnalysis;
  scenario_id: string | null;
  id: string;
  project_id: string;
  model_version: number;
  seed: number;
  duration: number;
  summary: SimulationSummary;
  node_metrics: Record<string, NodeMetrics>;
  time_series: SimulationTimeSeries;
  created_at: string;
}


export interface SimulationEvent {
  time: number;
  type: "entity_created" | "node_enter" | "node_exit" | "service_started" | "service_completed" | "entity_completed" | "queue_enter" | "queue_exit" | "queue_rejected" | "queue_wait_started" | "service_requested";
  entity_id: string;
  node_id: string;
}

/** Only returned for a freshly executed run; history remains compact. */
export interface PlaybackRun extends SimulationRun {
  model: import("./simulation").SimulationModel;
  events: SimulationEvent[];
}

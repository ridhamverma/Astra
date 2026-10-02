/** Matches backend/app/schemas/bottlenecks.py. Scores are heuristics, not probabilities. */
export interface QueueEvidence {
  node_id: string;
  name: string;
  average_waiting_time: number | null;
  maximum_waiting_time: number | null;
  average_queue_length: number;
  maximum_queue_length: number;
  waiting_at_end: number;
  rejected_entities: number;
  total_arrivals: number;
}

export interface BottleneckEvidence {
  utilization: number;
  average_waiting_time: number | null;
  maximum_waiting_time: number | null;
  reference_service_time: number;
  service_time_basis: "measured" | "configured";
  average_queue_length: number | null;
  maximum_queue_length: number | null;
  waiting_at_end: number | null;
  rejected_entities: number | null;
  normalized_waiting: number;
  normalized_queue: number;
  rejection_fraction: number;
  congestion_pressure: number;
  upstream_queues: QueueEvidence[];
}

export interface RankedBottleneck {
  node_id: string;
  name: string;
  score: number;
  evidence: BottleneckEvidence;
  reasons: string[];
}

export interface BottleneckAnalysis {
  method: "utilization_pressure_v1";
  status: "detected" | "no_congestion" | "insufficient_data" | "not_applicable";
  primaryBottleneck: string | null;
  score: number;
  reasons: string[];
  ranked: RankedBottleneck[];
  notes: string[];
}

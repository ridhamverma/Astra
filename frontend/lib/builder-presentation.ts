import type { SimulationRun, PlaybackRun } from "@/types/simulation-result";
import type { EditorNode, EditorEdge } from "@/lib/simulation-editor";

export function averageUtilization(run: SimulationRun): string {
  const processes = Object.values(run.node_metrics).filter(
    (metric) => "resource_utilization" in metric,
  );
  const resources = processes.reduce(
    (sum, metric) =>
      sum + ("resource_count" in metric ? metric.resource_count : 0),
    0,
  );
  const busy = processes.reduce(
    (sum, metric) =>
      sum +
      ("total_busy_resource_time" in metric
        ? metric.total_busy_resource_time
        : 0),
    0,
  );
  return resources
    ? ((100 * busy) / (run.duration * resources)).toFixed(0)
    : "--";
}

/** Runtime-only presentation: never serializes measured values into configured fields. */
export function nodeRows(
  node: EditorNode,
  run?: SimulationRun | null,
  timeline?: PlaybackRun | null,
  edges: EditorEdge[] = [],
  nodes: EditorNode[] = [],
): [string, string][] {
  const config = node.data.config;
  const format = (value: number | null | undefined, suffix = "") =>
    value == null ? "--" : `${Number(value.toFixed(1))}${suffix}`;
  switch (node.type) {
    case "source": {
      const arrivals =
        timeline?.id === run?.id
          ? timeline?.events.filter(
              (event) =>
                event.node_id === node.id && event.type === "entity_created",
            ).length
          : run && nodes.filter((node) => node.type === "source").length === 1
            ? run.summary.total_generated
            : undefined;
      return [
        [
          "Rate",
          arrivals != null && run
            ? format((arrivals / run.duration) * 60, " / hr")
            : "mean_interarrival_time" in config
              ? format(60 / config.mean_interarrival_time, " / hr")
              : "--",
        ],
        ["Arrivals", format(arrivals)],
      ];
    }
    case "queue":
      return [
        [
          "Capacity",
          "capacity" in config && config.capacity != null
            ? `${config.capacity}`
            : "Unlimited",
        ],
        ["Discipline", "FIFO"],
      ];
    case "process":
      return [
        [
          "Mean time",
          "mean_service_time" in config
            ? format(config.mean_service_time, " min")
            : "--",
        ],
        [
          "Resources",
          "resource_count" in config ? `${config.resource_count} staff` : "--",
        ],
      ];
    case "decision": {
      const branches = edges.filter((edge) => edge.source === node.id);
      const yes = branches.find((edge) => edge.sourceHandle === "yes")?.data
        ?.probability;
      const no = branches.find((edge) => edge.sourceHandle === "no")?.data
        ?.probability;
      return [
        ["Yes", format(yes == null ? undefined : yes * 100, "%")],
        ["No", format(no == null ? undefined : no * 100, "%")],
      ];
    }
    case "delay": {
      let average: number | undefined;
      if (timeline?.id === run?.id) {
        const entered = new Map<string, number>();
        const holds: number[] = [];
        for (const event of timeline?.events ?? []) {
          if (event.node_id !== node.id) continue;
          if (event.type === "node_enter")
            entered.set(event.entity_id, event.time);
          if (event.type === "node_exit" && entered.has(event.entity_id))
            holds.push(event.time - entered.get(event.entity_id)!);
        }
        if (holds.length)
          average = holds.reduce((sum, value) => sum + value, 0) / holds.length;
      }
      return [
        [
          "Configured",
          "mean_delay" in config ? format(config.mean_delay, " min") : "--",
        ],
        ["Avg hold", format(average, " min")],
      ];
    }
    case "sink": {
      const completed =
        timeline?.id === run?.id
          ? timeline?.events.filter(
              (event) =>
                event.node_id === node.id && event.type === "entity_completed",
            ).length
          : run && nodes.filter((node) => node.type === "sink").length === 1
            ? run.summary.total_completed
            : undefined;
      return [
        [
          "Rate",
          format(
            completed != null && run
              ? (completed / run.duration) * 60
              : undefined,
            " / hr",
          ),
        ],
        ["Completed", format(completed)],
      ];
    }
  }
}

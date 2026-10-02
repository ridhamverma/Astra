import type { Edge, Node, SmoothStepPathOptions } from "@xyflow/react";
import type { IconName } from "@/components/dashboard/icon";
import type {
  SimulationEdge,
  SimulationModel,
  SimulationNode,
} from "@/types/simulation";

export type NodeKind = SimulationNode["type"];
export type EditorNode = Node<
  {
    name: string;
    config: SimulationNode["config"];
    bottleneck?: boolean;
    builderPresentation?: boolean;
    rows?: [string, string][];
    running?: boolean;
    error?: string;
    yesProbability?: number;
    builderSourcePosition?: "left" | "right" | "top" | "bottom";
    builderTargetPosition?: "left" | "right" | "top" | "bottom";
  },
  NodeKind
>;
export type EditorEdge = Edge<{
  probability?: number;
  label?: string;
  running?: boolean;
}> & { pathOptions?: SmoothStepPathOptions };

export const NODE_DEFINITIONS: Record<
  NodeKind,
  { label: string; description: string; accent: string; icon: IconName }
> = {
  source: {
    label: "Source",
    description: "Creates entities",
    accent: "#0d9488",
    icon: "logIn",
  },
  queue: {
    label: "Queue",
    description: "FIFO waiting line",
    accent: "#d97706",
    icon: "listOrdered",
  },
  process: {
    label: "Process",
    description: "Uses resources",
    accent: "#4f46e5",
    icon: "users",
  },
  decision: {
    label: "Decision",
    description: "Routes by chance",
    accent: "#a21caf",
    icon: "split",
  },
  delay: {
    label: "Delay",
    description: "Holds entities",
    accent: "#0284c7",
    icon: "timer",
  },
  sink: {
    label: "Sink",
    description: "Completes flow",
    accent: "#475569",
    icon: "circleCheck",
  },
};

export const NODE_KINDS = Object.keys(NODE_DEFINITIONS) as NodeKind[];

export function createNode(
  kind: NodeKind,
  position: { x: number; y: number },
): EditorNode {
  const id = crypto.randomUUID();
  const name = NODE_DEFINITIONS[kind].label;
  const config: SimulationNode["config"] = {
    source: { distribution: "constant", mean_interarrival_time: 5 },
    queue: { capacity: null, discipline: "fifo" },
    process: {
      resource_count: 1,
      service_distribution: "constant",
      mean_service_time: 4,
    },
    decision: { routing: "probability" },
    delay: { distribution: "constant", mean_delay: 2 },
    sink: {},
  }[kind] as SimulationNode["config"];
  return { id, type: kind, position, data: { name, config } };
}

export function toEditorNodes(nodes: SimulationNode[]): EditorNode[] {
  return nodes.map(({ id, type, name, position, config }) => ({
    id,
    type,
    position,
    data: { name, config },
  }));
}

export function toEditorEdges(
  edges: SimulationEdge[],
  nodes: SimulationNode[] = [],
): EditorEdge[] {
  const branchIndex = new Map<string, number>();
  return edges.map(({ id, source, target, probability, sourceHandle }) => {
    const decision =
      nodes.find((node) => node.id === source)?.type === "decision";
    const index = branchIndex.get(source) ?? 0;
    branchIndex.set(source, index + 1);
    return {
      id,
      source,
      target,
      ...(decision
        ? {
            sourceHandle:
              sourceHandle === "yes" || sourceHandle === "no"
                ? sourceHandle
                : edges.filter(
                      (edge) =>
                        edge.source === source &&
                        nodes.find((node) => node.id === edge.target)?.type ===
                          "sink",
                    ).length === 1 &&
                    edges.filter((edge) => edge.source === source).length === 2
                  ? nodes.find((node) => node.id === target)?.type === "sink"
                    ? "no"
                    : "yes"
                  : index === 0
                    ? "yes"
                    : "no",
          }
        : {}),
      type: "smoothstep",
      data: probability == null ? {} : { probability },
      label:
        probability == null ? undefined : `${Math.round(probability * 100)}%`,
    };
  });
}

export function toSimulationModel(
  id: string,
  name: string,
  simulation: SimulationModel["simulation"],
  nodes: EditorNode[],
  edges: EditorEdge[],
): SimulationModel {
  return {
    id,
    name,
    simulation,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      name: node.data.name,
      position: { x: node.position.x, y: node.position.y },
      config: node.data.config,
    })) as SimulationNode[],
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle === "yes" || edge.sourceHandle === "no"
        ? { sourceHandle: edge.sourceHandle }
        : {}),
      ...(edge.data?.probability == null
        ? {}
        : { probability: edge.data.probability }),
    })),
  };
}

export function balanceDecisionEdges(
  edges: EditorEdge[],
  sourceId: string,
): EditorEdge[] {
  const outgoing = edges.filter((edge) => edge.source === sourceId);
  if (outgoing.length === 0) return edges;
  const probability = 1 / outgoing.length;
  return edges.map((edge) =>
    edge.source === sourceId
      ? {
          ...edge,
          data: { probability },
          label: `${Math.round(probability * 100)}%`,
        }
      : edge,
  );
}

export function createsCycle(
  edges: EditorEdge[],
  source: string,
  target: string,
): boolean {
  if (source === target) return true;
  const seen = new Set<string>();
  const pending = [target];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(
      ...edges
        .filter((edge) => edge.source === current)
        .map((edge) => edge.target),
    );
  }
  return false;
}

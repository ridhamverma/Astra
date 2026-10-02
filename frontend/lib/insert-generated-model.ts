import type { SimulationModel } from "@/types/simulation";

/** Append reviewed nodes without replacing the user's configuration, positions, or IDs. */
export function insertGeneratedModel(base: SimulationModel, draft: SimulationModel, createId = () => crypto.randomUUID()): SimulationModel {
  const ids = new Map(draft.nodes.map((node) => [node.id, createId()]));
  const bottom = base.nodes.length ? Math.max(...base.nodes.map((node) => node.position.y)) + 240 : 0;
  return { ...base,
    nodes: [...base.nodes, ...draft.nodes.map((node) => ({ ...structuredClone(node), id: ids.get(node.id)!, position: { x: node.position.x, y: node.position.y + bottom } }))],
    edges: [...base.edges, ...draft.edges.map((edge) => ({ ...edge, id: createId(), source: ids.get(edge.source)!, target: ids.get(edge.target)! }))],
  };
}
export function generationRequestKey(prompt: string) { return prompt.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }

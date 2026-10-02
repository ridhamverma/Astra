import type { SimulationModel } from "@/types/simulation";

/** Longest-path layers keep branches and merges readable; only validated DAGs enter here. */
export function layoutGeneratedModel(model: SimulationModel): SimulationModel {
  const incoming = new Map(model.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(
    model.nodes.map((node) => [node.id, [] as string[]]),
  );
  const depth = new Map(model.nodes.map((node) => [node.id, 0]));
  for (const edge of model.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const ready = model.nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index];
    for (const target of outgoing.get(id) ?? []) {
      depth.set(
        target,
        Math.max(depth.get(target) ?? 0, (depth.get(id) ?? 0) + 1),
      );
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if (incoming.get(target) === 0) ready.push(target);
    }
  }
  const branches = new Set(
    model.edges
      .filter(
        (edge) =>
          model.nodes.find((node) => node.id === edge.source)?.type ===
            "decision" &&
          model.nodes.find((node) => node.id === edge.target)?.type !== "sink",
      )
      .map((edge) => edge.target),
  );
  const branchRows = new Map<number, number>();
  const rows = new Map<number, number>();
  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const column = depth.get(node.id) ?? 0;
      const row = rows.get(column) ?? 0;
      const branchRow = branchRows.get(column) ?? 0;
      if (branches.has(node.id)) branchRows.set(column, branchRow + 1);
      else rows.set(column, row + 1);
      return {
        ...node,
        position: {
          x: column * 352,
          y: branches.has(node.id) ? -112 - branchRow * 160 : row * 160,
        },
      };
    }),
  };
}

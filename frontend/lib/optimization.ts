import type { SimulationModel } from "@/types/simulation";

/** Apply only a reviewed resource configuration; preserve every other canonical field. */
export function applyResourceConfiguration(model: SimulationModel, nodeId: string, resources: number): SimulationModel {
  if (!Number.isInteger(resources) || resources < 1 || resources > 100) throw new Error("Resources must be an integer from 1 to 100.");
  if (!model.nodes.some((node) => node.id === nodeId && node.type === "process")) throw new Error("The optimized Process is no longer in this model.");
  return { ...model, nodes: model.nodes.map((node) => node.id === nodeId && node.type === "process" ? { ...node, config: { ...node.config, resource_count: resources } } : node) };
}

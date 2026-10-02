import { json, request, type ApiIssue } from "@/services/api";
import type { SimulationModel } from "@/types/simulation";

export interface ValidationResult {
  valid: boolean;
  errors: ApiIssue[];
}

export const simulationsApi = {
  validate: (model: SimulationModel) => request<ValidationResult>("/api/v1/simulations/validate", json(model)),
};

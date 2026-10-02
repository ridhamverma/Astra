import { json, request } from "./api";
import type { SimulationModel } from "@/types/simulation";
export interface GeneratedDraft { model: SimulationModel; assumptions: string[] }
export interface ExplanationFact { id: string; label: string; value: number | string | null; unit: string; run_id: string; path: string }
export interface ExplanationFinding { id: string; text: string; evidence: ExplanationFact[] }
export interface ResultExplanation { run_id: string; baseline_run_id: string | null; model_version: number; findings: ExplanationFinding[]; explanation: string; method: string }
export const resultsAiApi = { explain: (runId: string, baselineRunId?: string) => request<ResultExplanation>("/api/v1/ai/explain-results", json({ run_id: runId, baseline_run_id: baselineRunId ?? null })) };
export const aiApi = { generate: (prompt: string) => request<GeneratedDraft>("/api/v1/ai/generate-model", json({ prompt })) };

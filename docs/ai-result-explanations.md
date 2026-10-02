# AI explanation of recorded results (Phase 15)

## Contract

`POST /api/v1/ai/explain-results` accepts:

```json
{"run_id":"saved-run-uuid", "baseline_run_id":null}
```

`baseline_run_id` is optional. The backend loads recorded summary and node metrics plus the immutable model version, and recomputes the existing deterministic bottleneck analysis. It accepts no caller-provided metrics, labels, explanations or recommendations. A comparison requires different runs from the same project with identical duration and seed. All differences come from existing deterministic arithmetic, never the AI.

The response identifies both source runs and the model version and contains `explanation`, `findings`, and `method: evidence_bound_selection_v1`. Each finding carries numerical evidence with a source run ID, source field path, label, value and unit. Fraction values in evidence remain fractions; prose formats them as percentages. Rounded prose never replaces the underlying evidence.

## Grounding method

A prompt alone cannot guarantee that unrestricted generated prose contains no invented claims. Astra therefore uses bounded explanation composition:

1. Build supported statements from real saved metrics. Include throughput, completion rate, completed-entity waits, cycle time, Process utilization, time-weighted Queue lengths, remaining/rejected entities and deterministic bottleneck evidence.
2. Give the AI those statements and structured source facts. It selects and orders 2–6 observations for a concise operational explanation. Overview and deterministic bottleneck status are mandatory, plus comparison context when applicable.
3. Request structured output containing only `finding_ids`, with an enum derived from the supported catalogue. Validate the response independently: reject unknown or duplicated IDs, missing mandatory context, extra fields, arbitrary prose, new metrics, costs, recommendations and confidence scores.
4. Render selected statements with Astra's wording and values. No unrestricted LLM prose reaches the UI. The AI controls emphasis and ordering; all numerical and operational claims come from the verified catalogue.

Invalid selections receive repair feedback, with a strict three-attempt limit and 95-second overall timeout. The existing Gemini adapter bounds each request and output size. Structured fact payloads are limited to 100,000 characters; selections to 10,000. Outages return sanitized 503 errors; exhausted invalid output returns 502. Nothing changes models, saves results or calls the simulator. No provider fallback fabricates an explanation.

Missing observations stay unavailable; they are never replaced by zero. No-congestion findings describe only the observed run. Completed-entity waiting metrics exclude unfinished entities. Queue waiting metrics cover exited waiters, while queue length and horizon counts include entities still waiting. Comparisons describe observed differences without claiming causal proof or optimality. Utilization differences use percentage points. Zero baselines never produce infinite relative changes. Costs and recommendations are intentionally absent because this phase has no supported cost model or optimization evidence.

## UI

The Analytics view retains **Simulation Results** and adds a separate **AI Explanation** panel. Click **Explain these results** to request it. Expand **Measured evidence** to inspect source values. Editing the canvas marks explanations as descriptions of the saved run. Component state is tied to immutable run IDs, so an older response cannot attach itself to a new run.

The scenario comparison view also offers AI Explanation using the exact two recorded runs in the visible comparison. Changing selection or running updated scenarios clears comparison state and its explanation. Errors appear inside the AI panel; analytics, editing, playback and simulation remain usable.

Use the existing optional `ASTRA_GEMINI_API_KEY` in ignored `backend/.env`, then restart the backend. There are no frontend credentials or new database migrations. Requests disclose that recorded metrics and node names are sent to the configured provider.

## Verification

Tests use actual SimPy outputs and provider-selection fixtures. They verify exact source evidence, one-versus-three Doctor resources, no completions, null and zero baselines, unfair comparison rejection, invented prose/cost/confidence/recommendation rejection, bounded repairs, immutable saved-version provenance and manual simulation after AI failure. Provider fixtures exercise the grounding boundary without making a live LLM claim. Browser checks used an isolated provider fixture with real recorded runs: Doctor congestion explained correctly, and the comparison reported waiting 15→0 minutes and throughput 11→28 per hour. The regular app showed its missing-key error while keeping analytics and simulation controls available. Live provider behavior was subsequently verified on 2026-10-01 with Gemini 3.1 Flash-Lite. The endpoint returned HTTP 200 for the saved one-Doctor run, with four evidence-bound findings describing actual throughput, completion, deterministic bottleneck and queue congestion.

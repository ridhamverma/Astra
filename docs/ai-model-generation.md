# Natural-language model drafts (Phase 14)

## Setup

Add `ASTRA_GEMINI_API_KEY` to the ignored `backend/.env`, then restart the backend. Obtain a key from [Google AI Studio](https://aistudio.google.com/apikey). Do not put it in a frontend variable or commit it. Optional configuration:

```
ASTRA_AI_PROVIDER=gemini
ASTRA_GEMINI_MODEL=gemini-3.1-flash-lite
ASTRA_GEMINI_API_KEY=
```

The default is [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite/), which supports structured output. Google rejected Gemini 2.5 Flash for new users during live setup, so the default was updated. Check [current pricing and free-tier availability](https://ai.google.dev/gemini-api/docs/pricing) for your account before choosing a model; availability and quotas can change. Descriptions are sent to Google; the UI discloses this. See [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output) and the [generateContent API](https://ai.google.dev/api/generate-content).

## Contract and architecture

`POST /api/v1/ai/generate-model` accepts `{"prompt":"Describe your operational system…"}` and returns `{"model": <canonical Astra model>, "assumptions": ["…"]}`. Descriptions are bounded to 10–6000 characters. All times are minutes; unspecified duration/seed default to 480/42. The provider is instructed to preserve supplied parameters and disclose assumptions. Human review remains necessary: validation proves the graph is executable, not that the language interpretation is accurate.

`ModelProvider` supplies structured text. `generate_simulation_model` owns validation and repair. The vendor schema is derived from the existing Pydantic model, with references expanded and discriminated unions expressed as `anyOf`. There is no competing simulation model. Provider output passes Pydantic envelope/canonical validation, executable graph validation, and existing API limits before return. Invalid JSON, cycles, probabilities, configuration or extra code fields trigger repair feedback. Three total attempts (two repairs), 30 seconds per provider request and 95 seconds overall are strict ceilings. Output sizes and tokens are bounded. Provider failure returns a sanitized 503; exhausted invalid output returns 502. No tools, code execution or simulation call is available to the LLM.

The provider key is sent in a backend request header, never a URL or frontend response. New providers implement the same interface and are selected in `get_model_provider`. Provider outages have no dependency path to manual editing, saving or standalone simulation.

## Workflow

Open Simulator → Generate Model. Enter a description; generation creates a preview containing duration, seed, every node parameter, connections, probabilities and assumptions. Check the explicit review box before **Use reviewed model** becomes available. Import replaces the current canvas only after that acknowledgment; an existing project retains its name. The draft has no saved version or results. Nodes are arranged by graph depth, branches vertically separated. Select nodes to edit distribution, uniform bounds, queue capacity, entity limits, service resources, costs, delays and names; select Decision edges to edit probabilities. Uniform means follow the midpoint. Saving/running uses existing validation. Import never saves or runs automatically.

## Verification

`backend/tests/test_ai_generation.py` uses provider fixtures for simple service, bank and branching hospital descriptions. It checks canonical validation, eight invalid-output repairs, strict retry limits, prompt bounds, structured provider transport, sanitized errors and core fallback. These fixtures test the integration contract, **not live language interpretation**. Frontend tests verify deterministic layout with unchanged parameters and routing.

For live verification after configuring a key, use the following descriptions in the UI and confirm extracted values, editable properties and no automatic run:

1. “Create a bank where customers arrive every 3 minutes, there are two counters, service takes 5 minutes, and the queue holds 20 customers.” Expect Source → Queue → Process → Sink, arrival 3, resources 2, service 5, capacity 20.
2. “Create a clinic: arrivals every 4 minutes, registration with one clerk taking 2 minutes, an unlimited FIFO waiting queue, three doctors taking 10 minutes each, then discharge. Simulate 8 hours with seed 42.” Expect duration 480 and the specified two Processes.
3. “Orders arrive every 2 minutes, wait in a queue of 30, are packed by two workers in 3 minutes, then 70% ship immediately and 30% wait a constant 5 minutes before shipping. Run duration 60 minutes, seed 7.” Expect Decision probabilities 0.7/0.3 and a Delay of 5.

Repeat each prompt and validate the results. Graphs may differ between generations; seeded simulation reproducibility is independent of LLM generation. Browser verification used a temporary, isolated provider fixture: preview values, disabled import until review, canvas layout, resource editing and uniform bounds all worked, with Analytics remaining disabled (no automatic run). The actual development app also showed the missing-key error and allowed manual Source creation afterward. Live generation was subsequently verified on 2026-10-01 with Gemini 3.1 Flash-Lite: the bank prompt returned HTTP 200 and canonical parameters of arrival 3 minutes, two resources, service 5 minutes and capacity 20. Gemini 3.8 Flash temporarily returned high-demand errors during setup; the configured Flash-Lite model succeeded. Clinic and branching-hospital live checks remain separate from the fixture-based tests.

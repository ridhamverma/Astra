# Scenarios and comparison

## Workflow

1. Save a valid project and open **Scenarios & Compare**.
2. Name the current builder snapshot **Baseline** and create it.
3. Run Simulation. The run is associated with that scenario.
4. Return to Scenarios & Compare and duplicate Baseline.
5. In the builder, select a Process and change its resource count.
6. Save scenario or Run Simulation. Running saves pending changes first.
7. Rename the copy if desired, select Baseline and the copy, and Compare.

Load restores the complete canonical model, configuration, seed, duration, and
canvas positions. **Run saved snapshot** runs exactly what is stored, while the
header's **Run Simulation** saves and runs the currently loaded scenario edits.
Rename preserves model version and runs. Delete removes the named scenario;
its compact run history remains available in project history. After reload,
open Scenarios & Compare and load any saved snapshot.

## Persistence

`scenarios` stores ID, project ID, name, immutable model version reference, and
timestamps. The canonical graph remains in the existing PostgreSQL JSONB model
version table. A duplicate initially references the same immutable version;
editing creates a new project model version and moves only that scenario's
reference. Unchanged saves reuse the existing version. Scenario versions are
part of the project's version sequence, so the project's latest model also
reflects its latest saved scenario snapshot.

`simulation_runs.scenario_id` associates a run with its named scenario. Runs
retain their immutable model version, seed, duration, summary, node metrics,
and lightweight chart series. A deleted scenario clears the association using
`ON DELETE SET NULL`, preserving runs. No permanent event logs are introduced.
Existing project run, analytics, and playback routes remain available.

## Comparison rules

- Both selected scenarios belong to the same project and are distinct.
- Each must have a run of its **current model version**. Old runs are not silently
  used after a snapshot changes.
- Simulation duration and seed must match exactly. Otherwise the API returns a
  clear 409 response; set the same values in the builder and rerun the scenarios.
- Duplication carries duration and seed forward automatically.
- Metrics come solely from stored simulator results. No frontend demo values or
  AI-generated statistics are involved.
- Processes are matched by stable node ID. Added/removed processes display an
  unavailable value for the side where that Process does not exist.

For baseline value B and scenario value S:

- Absolute difference (signed, in the metric's units): `S - B`.
- Percentage difference: `(S - B) / abs(B) * 100`.
- Unknown values yield unavailable differences. A zero baseline yields an
  unavailable percentage rather than infinity or a misleading zero.
- Completion rate and utilization are shown as percentages, with absolute
  differences in percentage points (pp).

The comparison includes average and maximum waiting, throughput, completion
rate, average cycle time, and each Process's utilization. System waiting and
cycle time retain the existing engine definitions (completed entities only).
Comparisons represent individual seeded runs, not statistical confidence bounds.
The engine uses its existing separate random streams; identical seeds provide
reproducibility but do not guarantee identical service samples per entity when
routing/service ordering changes.

## API

- `GET /api/v1/projects/{id}/scenarios`
- `POST /api/v1/projects/{id}/scenarios` — `{name, model}`
- `GET /api/v1/scenarios/{id}`
- `PUT /api/v1/scenarios/{id}` — `{name?, model?}`
- `DELETE /api/v1/scenarios/{id}`
- `POST /api/v1/scenarios/{id}/duplicate` — `{name}`
- `POST /api/v1/scenarios/{id}/runs` — optional `{include_timeline: true}`
- `POST /api/v1/projects/{id}/scenarios/compare` — `{baseline_id, scenario_id}`

Apply the database migration with `cd backend && .venv/bin/alembic upgrade head`.
Run tests with `.venv/bin/python -m pytest -q` from backend; frontend verification
uses `npm run typecheck`, `npm run test:playback`, and `npm run build`.

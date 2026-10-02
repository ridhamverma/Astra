# Ready-made simulation templates (Phase 18)

## Use

Sign in and open **Projects**. Choose **New Blank Project** for a saved empty draft, or **Create From Template** to select a starter. An optional project name replaces the template name. The new project opens in the normal builder; every node, connection, setting and position is editable. Click **Run Simulation** to generate analytics and playback, or save scenario variations and compare them.

Creating a template project saves model version 1 but does not run a simulation. A blank draft has no model version until a valid graph is saved. Existing validation applies when running or saving graphs.

## Starter configurations

Every template uses 480 simulated minutes, seed 42, exponential arrivals, FIFO queues and the existing Astra canonical model. Parameters are illustrative teaching examples, not measurements of any particular organization. Optional costs are left unset for users to configure in their own units.

| Template | Main flow and configuration |
| --- | --- |
| Hospital | Arrivals every 5 minutes on average → one Registration resource, uniform 2–4 minutes → unlimited Waiting Queue → three Doctors, exponential mean 12 minutes → constant Treatment delay 4 minutes → Discharge. Treatment here does not consume a limited staff resource. |
| Bank | Arrivals every 3 minutes on average → 20-place Waiting Area → two Service Counters, exponential mean 5 minutes → Customer Exit. |
| Restaurant | Arrivals every 3 minutes on average → 20-place Order Queue → one Cashier, uniform 1–3 minutes → 30-place Kitchen Queue → two Kitchen resources, uniform 4–8 minutes → constant Pickup delay 1 minute → Order Collected. |
| Warehouse | Arrivals every 4 minutes on average → 40-place Picking Queue → two Pickers, uniform 4–8 minutes → 30-place Packing Queue → one Packer, uniform 2–4 minutes → constant Dispatch delay 3 minutes → Order Shipped. |
| Customer-service center | Arrivals every 3 minutes on average → 30-place Support Queue → two Agents, exponential mean 4 minutes → Decision: 80% close directly; 20% enter a 15-place Escalation Queue and receive Specialist service, uniform 5–9 minutes, before closing. |

Finite queues use the existing full-queue rejection policy. Metrics come from actual events; remaining entities and rejections should be considered alongside completed-entity waiting and cycle times. All distributions and resource counts are editable after creation.

## Data and API

Canonical starter JSON is packaged in `backend/app/templates/data/`. `app.templates.get_template` validates the canonical model and executable graph; `instantiate_template` returns an independent deep copy with a new model ID. Templates are not special engines: all runs use the unchanged standalone `simulate(model)` function.

Authenticated endpoints:

- `GET /api/v1/templates`: five catalogue entries with ID, name, description and canonical model.
- `POST /api/v1/templates/{template_id}/projects`: `{}` or `{"name":"My Hospital"}`; returns the ordinary project response with status 201.

Creation delegates to the existing project persistence flow, assigns the authenticated owner and saves an ordinary immutable model version. Caller-supplied owner fields are rejected. There is no separate template project type or database migration. New copies cannot change the packaged definitions or other projects. Setuptools package data includes all five JSON files in the backend wheel.

## Verification

Tests execute every template twice, checking repeatability, event-derived creation/completion counts, entity accounting, throughput and utilization. PostgreSQL tests create each template as an owned project, run it, compare metrics to direct simulation, edit a resource, save version 2, reload through a new app/session and run again. Tests also cover independent copies, unknown IDs, invalid names, ownership isolation and blank project creation.

The complete backend suite passed 207 tests; frontend tests, TypeScript checks and production build passed. The built backend wheel contains all five JSON files. The live browser loaded all five cards, created and ran Bank (149 completions at seed 42 over 480 minutes), displayed the saved project, and created a separate empty draft. See `phase18-template-catalogue.png`.

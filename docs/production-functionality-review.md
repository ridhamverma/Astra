# Astra functionality review

Reviewed on 2026-10-11 in the original project. The existing Builder/playback port and other pre-existing workspace changes were preserved. This review changed backend logic, frontend services/types, tests, and this report. It changed no UI components, pages, styles, copy, fonts, or assets: all 98 files under `frontend/app`, `components`, `styles`, and `public` match the pre-review hash inventory, with no new UI files.

The verified backend/data-flow issues below are fixed. The app still has component-level functional issues that require permission to edit UI files before it can be considered fully production-ready.

## Inspection and data provenance

| Area | Input → processing → output | Findings |
| --- | --- | --- |
| Registration/login/logout, route protection | Validated credentials → Argon2id password verification and PostgreSQL opaque sessions → HttpOnly cookie and CSRF token | Real authentication and ownership checks. Session rotation, revocation, expiry, origins, CSRF, throttling, and two-user isolation have integration coverage. Names now reject whitespace-only input. |
| Dashboard, project library, notifications, settings | Owned projects/account API → library sorting/filtering/activity aggregation → cards, recents, account details | Real stored data. Notifications summarize successful persisted simulation runs. Project categories are inferred from model/process names, as the UI states. Settings displays account data; it does not advertise editable account settings. |
| Project creation, templates, rename/delete | Existing forms/services → owner-scoped API transactions → persisted project/version records | Template documents are fixed starter configurations, not fabricated run results. Projects remain editable after template creation. Browser checks cover rename persistence, search, deletion, account navigation, and logout. |
| Builder editing/saving | Logical node positions/configs/connections → canonical JSON → immutable PostgreSQL snapshots | Partial graphs now persist. Config validation, IDs, endpoint references, and size limits still apply. Full executable validation remains mandatory before Run. |
| Simulator and metrics | User-configured arrival/service/delay distributions, resources, routes, duration, seed → SimPy events → measured summaries, node metrics, time series | Real deterministic calculations. FIFO, finite/zero-capacity rejection, resource contention, multiple Sources, Delay, seeded Decision routes, horizon behavior, unfinished work, utilization, and completed-entity averages have existing tests. |
| Playback | Current run's immutable model/events → event replay/checkpoints → entities, inspection, seeking, controls | Uses actual engine events. Existing reduced-motion, pause/resume, equal-time stepping, seeking, touch, responsiveness, and long-run performance checks pass. Saved history intentionally retains compact metrics, not event timelines; reopening requires a fresh run to replay. |
| Scenarios/comparisons | Separate saved snapshots + successful runs → duration/seed/current-version checks → arithmetic metric differences | Real measured results. Scenario snapshots no longer replace the baseline, including after deletion. |
| Optimization/bottlenecks | User-selected Process/grid/objective/costs → bounded SimPy replications and measured evidence → ranked feasible candidates and bottleneck findings | No LLM-generated metrics or guessed outcomes. Feasibility must hold in every replication. Baseline is measured, events are transient, unsupported/missing objectives and numeric overflow are handled. Configured costs are user-defined amounts, not external pricing. |
| AI generation/explanation | User prompt or authorized saved-run evidence → configured Gemini provider → validated JSON/evidence-constrained explanation | Real external integration. Live checks returned HTTP 200 for both generation and saved-run explanation. Missing key/provider failures retain manual simulation and return explicit errors; tests also cover malformed responses, repair bounds, and outages. |
| Public landing demonstration | Selected resource count → four-entry local outcome table → illustrative demo values | Hardcoded, explicitly labeled illustrative data. It is separate from authenticated simulation. No component edits were made to replace it. |

Queue behavior was checked against the existing documented contract: a Queue immediately before a Process acquires that Process's resource and enforces waiting capacity; a Queue before a non-Process passes through without waiting. This behavior was preserved rather than reinterpreting existing models.

## Fixes implemented

- **Baseline/scenario isolation:** immutable snapshots now retain an `is_scenario` origin. Baseline lookup, version history, project status, main run selection, and execution use the correct snapshot stream. Deleting a scenario cannot turn its runs into baseline results. Version numbers remain unique across both streams.
- **Draft persistence:** Source-only, empty, disconnected, and other unfinished topologies can be saved/reopened as typed canonical drafts. Invalid configs, duplicate identifiers, dangling endpoints, and API limits remain rejected. Draft persistence does not make the graph executable.
- **Version conflict protection:** browser services send the known version for model edits and pin runs to their known snapshot. Stale writes return HTTP 409, including first-save races on blank projects. Identical saved models reuse the existing version. Direct API clients should send `expected_version`; omission remains supported for backward compatibility.
- **Request reliability:** reads time out after 15 seconds; mutations after 120 seconds, including response decoding. Network failures, unreadable JSON, and malformed API error details become predictable service errors. Identical simultaneous mutations share one request; later intentional actions still execute. Writes are never automatically retried after ambiguous failures.
- **Session correctness:** version caches reset when the authenticated CSRF/session identity changes. An old request's delayed HTTP 401 cannot clear a newly authenticated session.
- **Nonessential activity writes:** opening a successfully loaded project does not wait for access tracking. Tracking uses the database's current edit timestamp, so a stale activity request cannot roll back a concurrent edit timestamp.
- **Validation errors:** field paths are retained in request validation responses; malformed JSON remains distinguished from field validation. Project/account names are normalized and whitespace-only names rejected. Error responses do not expose submitted credentials.
- **Readiness:** missing database configuration, connection failures, and incomplete Alembic migrations return sanitized HTTP 503. The error schema now accepts the existing `service_unavailable` code, avoiding an accidental HTTP 500 while constructing these errors. Unsupported AI providers are not advertised as enabled. Liveness remains `/health`.

## Remaining component issues — unchanged pending approval

These require edits to UI files under the user's current restriction. The first two were reproduced in a real browser against the real API using a disposable account:

1. **Invalid numeric draft can run the old value.** In `frontend/components/simulator/node-properties.tsx`, `NumberField` retains invalid input locally without updating the canonical model or notifying the workspace. Entering service time `0` showed `aria-invalid=true`, but Run successfully executed the previous configured service time `2`. Fix requires connecting numeric validity to Save/Run in `node-properties.tsx` and `workspace.tsx` while retaining the existing markup, validation text, and styles.
2. **Loading a scenario discards unsaved edits.** `workspace.tsx`'s `loadScenario` immediately replaces nodes/edges/settings and clears dirty state. A browser check confirmed an unsaved Source-name change disappeared after Load. Fix requires protecting or retaining the unsaved working graph before replacement. Any new confirmation text/dialog would require explicit approval for a presentation/copy change; retaining drafts can be implemented without such a visual change.
3. **Version tokens should be bound directly to the loaded canvas snapshot.** The service guards protect ordinary cross-tab edits, but refreshing the scenario list can refresh its cached token while the loaded working graph is older. Passing the active `modelVersion` explicitly from the workspace would close that component-level gap. Backend `expected_version` support is implemented.
4. **Device notes are separate from saved models.** Notes use `localStorage` keyed by project ID or a shared `draft` key. They do not sync across devices, and the draft-to-project key change does not migrate notes. Account-scoping/migration requires workspace storage-handler edits. The existing “Saved on this device” presentation was preserved.
5. **Public illustrative demo remains a lookup table.** `frontend/components/landing-page.tsx` contains fixed outcomes and comparison baseline values. Replacing it with calculated results requires component changes. Production authenticated results are calculated by the backend.

## Historical data and migration limits

`0007_snapshot_origin` is additive and has been applied to the local database. It retains every project, graph, version, and run. It identifies historical scenario snapshots using surviving scenario references and runs with a scenario ID.

Old scenario edits or already-deleted scenarios with no surviving run/reference cannot be identified reliably: the old schema stored no origin. The migration conservatively leaves those unproven versions classified as baseline. Projects affected before this fix may therefore need a manual snapshot review; automatic recovery is not guaranteed. Use the owned project's immutable version endpoints to identify the intended baseline, then save that graph as a new baseline using the current `expected_version`. No ambiguous historical record was deleted or guessed from its timestamp/name.

## Deployment and external setup

No dependencies or credentials were added. Local PostgreSQL and Gemini were already configured. Production deployment still needs its own configuration:

1. Configure managed PostgreSQL through `ASTRA_DATABASE_URL` and run `cd backend && .venv/bin/alembic upgrade head` (or the deployment environment's `alembic upgrade head`). Readiness must return HTTP 200 at `/health/ready` before accepting traffic.
2. Configure `ASTRA_ENVIRONMENT=production`, `ASTRA_COOKIE_SECURE=true`, and explicit HTTPS `ASTRA_CORS_ORIGINS`. Same-site deployments can use `lax`; cross-site cookie deployments require `ASTRA_COOKIE_SAMESITE=none` and HTTPS. Prefer same-site hosting where browser third-party-cookie restrictions would otherwise block sessions.
3. Set the frontend's `NEXT_PUBLIC_API_URL` to the deployed API **before building**. Configure the reverse proxy/load balancer to preserve cookies and allow credentialed requests. Keep secrets out of frontend environment variables.
4. For AI, configure the backend's `ASTRA_AI_PROVIDER=gemini`, `ASTRA_GEMINI_API_KEY`, and an available `ASTRA_GEMINI_MODEL` for the provider account. Without it, manual editing, simulation, comparison, optimization, and playback remain available. Successful local checks do not guarantee another account's quota/model access.
5. Existing admission and authentication throttles are per backend process. For multiple workers/instances, add shared ingress rate limits and capacity controls. This review did not deploy infrastructure, load-test multiple instances, or add an external operational-data integration. Simulation parameters come from user models and starter templates.

Configuration examples are in `backend/.env.example` and `frontend/.env.example`. Authentication uses opaque database sessions; no JWT-based integration or fabricated external data was introduced.

## Verification

- Backend: full pytest suite, including isolated PostgreSQL persistence/auth/migrations and simulator/metrics/optimization/AI failure tests; **262 passed**, with one existing Starlette/httpx TestClient deprecation warning.
- Frontend: **66 unit tests passed**; TypeScript typecheck and targeted ESLint checks passed.
- Backend Ruff checks passed across app/tests and the new migration; `git diff --check` passed.
- Production Next build passed. Browser QA used the existing opt-in `ASTRA_PLAYBACK_QA=1` route; the final normal production build disables that route.
- Real browser/API suite: **41 passed**. Includes user-created Process/Delay models, placement/configuration/connections/save/reopen/run/playback, draft saving, stale-save rejection, scenario isolation after deletion, library rename/search/delete, settings/logout, sidebar sizes/overflow/Sink/tooltips, reduced motion, screenshots, and playback controls/seeking.
- Long-run browser benchmark: approximately **54 FPS** and all measured seeks **38 ms or less** on this machine. These are local observations, not deployment performance guarantees.
- Live Gemini generation returned Source → Queue → Process → Sink; live saved-run explanation returned HTTP 200. Test data/accounts were removed.
- Diagnostic checks confirmed the two unresolved input/unsaved-work behaviors above. UI hash inventory: **98 unchanged files, zero additions**.

## Files changed during this review

- `backend/alembic/versions/0007_snapshot_origin.py`
- `backend/app/api/routes/{auth,health,projects,scenarios}.py`
- `backend/app/api/{schemas,simulation_validation}.py`
- `backend/app/main.py`
- `backend/app/models/persistence.py`
- `backend/app/schemas/{drafts,projects,scenarios}.py`
- `backend/tests/{test_production_workflows,test_health,test_e2e_workflow}.py` (the existing workflow test only received unused-import/fixture lint cleanup)
- `frontend/services/{api,model-versions,projects,scenarios}.ts`
- `frontend/types/simulation-result.ts`
- `frontend/tests/{services,project-versions}.test.cjs` (existing version test adapted to the service dependency)
- `frontend/tests/e2e/production-workflows.spec.cjs`
- `docs/production-functionality-review.md`

The simulator engine, canonical simulation schema, result calculations, optimization algorithm, authentication flow, and UI presentation were preserved.

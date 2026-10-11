# Playback implementation and validation

This report covers the six requested refinement phases. Simulation engine code, event ordering, durations, and persisted metrics were not changed. Presentation consumes the existing immutable events and one shared animation clock.

| Phase | Change and reason | Files touched | Phase checks and visual result | Deferred work |
| --- | --- | --- | --- | --- |
| 1. Canvas | Debounced initial/resize fit respects manual navigation; inverse-zoom title and metric typography; compact controls; in-canvas legend. Mobile uses a presentation-only two-column layout and reserves a toolbar gutter. Station interiors separate people from wrapped titles and footer metrics. | `components/simulator/playback.tsx`, `playback-scene.tsx`, `playback-scene.css`, `station-visuals.tsx`, `lib/playback-layout.ts` | Test and lint passed. Typecheck reported the pre-existing run-history TS2339 errors until phase 6. Desktop now fills about 89% of canvas width; title/essential metric text is 12/10 screen pixels. No document scroll at all three tested sizes. | Physical gesture checks remain unverified; see below. |
| 2. Controls | One Play/Pause/Replay toggle, secondary Reset, event steps, truthful min/s presets, shortcuts, aggregated typed ticks and hover summaries. Drag seeking preserves prior play intent. Checkpoints avoid full backward replay. Fixed widths and tabular numbers prevent shifts. | `playback.tsx`, `playback-buttons.tsx`, `playback-timeline.tsx`, `lib/playback.ts`, `lib/playback-timeline.ts`, timeline/component tests | Test and lint passed; same pre-existing TS2339 errors. Reset starts at zero consumed events. Exact prefixes retain equal-time ordering. Scrubber right edge moves 0 pixels throughout seeking and actual 8× replay. | Snapshot restoration necessarily costs O(active entities); it is not mathematically O(log n) for the entire state copy. Lookup is binary and the replay tail is bounded. |
| 3. Information | One model badge, actual run context, four stable count pills, configured/realized decision labels, occupancy highlights, entity path/inspector/follow camera, virtualized filtered event log. Log clicks select an exact event prefix. | `playback.tsx`, `playback-inspector.tsx`, `playback-event-log.tsx`, `playback-scene.tsx`, `lib/playback-information.ts`, `lib/simulation-editor.ts` | Test and lint passed; same pre-existing TS2339 errors. Inspector shows measured/open wait and service intervals; selection dims other entities and highlights the consumed route. Log uses a bounded visible window. | Historical compact run records still lack event logs under the existing storage architecture. No historical events were fabricated or regenerated. |
| 4. Semantics | Coral UI accent separated from operational waiting/service/transfer/rejection/completion tokens. Rings, dots, and arrows supplement color. Raised text/control contrast, disabled-button legibility, scoped typography fallback and focus rings. | `playback-tokens.css`, `playback-scene.css`, `lib/playback-design.ts`, `station-visuals.tsx`, palette tests | Test and lint passed; same pre-existing TS2339 errors. Palette text is ≥4.5:1 and border/track ≥3:1 against playback surfaces. Axe reports no serious/critical violations on mid-run playback. | Automated axe does not replace a screen-reader audit. |
| 5. Robustness | Shared-clock imperative person transforms/poses, memoized characters and stations, cached actual SVG geometry, throttled graph readouts/live announcements. Reduced motion and in-app toggle, hidden-tab intent, empty/loading/error/retry/stale/zero-event states, responsive log and 44px controls. Production workspace now exposes these states. | `animated-person.tsx`, `playback-scene.tsx`, `playback-state.tsx`, `playback.tsx`, `workspace.tsx`, `lib/playback-clock.ts`, layout/design files, demo/stress fixture | Test and lint passed; same pre-existing TS2339 errors. Long-run production benchmark measures approximately 55 fps with 80 rendered people and 26,560 real engine events. At overview zoom below 0.35, positions update at 30 Hz and limb details remain static; normal zoom uses the shared frame clock for articulation. Simulation time remains authoritative. | Hardware-dependent performance is a measured benchmark, not a guarantee for every device. Actual OS reduced-motion verification remains blocked. |
| 6. Cleanup | Correct typed immutable-version service methods and owner-scoped GET APIs fix run-history errors. Added mapping/component/browser/performance tests and 21 screenshot baselines. | `services/projects.ts`, `components/design/run-history.tsx`, `backend/app/api/routes/projects.py`, `backend/tests/test_project_version_api.py`, frontend tests/config/package files, this documentation | Final frontend unit/component tests: 58 passed. Lint and typecheck pass without new suppressions. Unchanged engine/metrics suite: 27 passed. Backend changed-file Ruff passes. Final browser comparison matrix: 32 passed, including all 21 screenshot comparisons. | Database-backed tests cannot complete while PostgreSQL is unavailable. |

## Initial state explanation

The clinic fixture contains ten ordered events at simulation time zero for the first entity: creation, source entry/exit, queue entry/wait/request/exit, queue node exit, process entry, and service start. The old player applied that entire timestamp immediately on mounting; these were ten events, not ten arrivals. Reset now consumes zero events. Playback/seek to zero applies the real zero-time prefix and labels it **Initial state**. Previous/next and event-log selection can inspect each equal-time event individually. Exit events release occupancy once while keeping identity for the next node entry; service completion frees its resource slot.

## Automated verification

`npm test`, `npm run lint`, and `npm run typecheck` were run after every implementation phase. Earlier typecheck failures were the existing missing `projectsApi.versions`/`version` methods, resolved by actual typed APIs in phase 6.

The Chrome Playwright matrix covers initial, 7.1-minute mid-run, selected entity, log-open, finished, empty, and reduced-motion views at **1440×800**, **1024×768**, and **390×844**. Additional checks cover keyboard shortcuts/input guards, exact event stepping, selection/follow clearing, filters/log seeking, drag pause/resume, manual zoom preservation and refit, resize, loading/retry/stale/zero states, no serious/critical axe violations, emulated touch pan/pinch, emulated visibility lifecycle, moving transfers and pause freeze, full-run pixel stability, and long-run frame/seek performance.

The deterministic seek unit test compares complete state with sequential replay at multiple forward/backward times across >10,000 events, including equal-time prefixes and the final event gap. `npm run bench:playback` measures 400 mixed seeks across **15,500 events** with snapshots prepared first. A representative run measured max **0.42 ms**, p95 **0.05 ms**, and snapshot preparation **3.48 ms**. The script fails if max seek exceeds 50 ms. Browser tests separately measured input-to-ARIA state commit on the 26,560-event stress run: 6.6–32.9 ms across eight forward/backward seeks, all below 50 ms.

The isolated browser frame test disables trace DOM recording, since recording every SVG mutation changes the workload. Representative optimized production results: **55.1–55.6 fps**, paused baseline approximately 61 fps, p95 frame gap 33.3 ms. The test retains a >50 fps assertion. It does not claim that overview entities individually animate at 60 Hz; the documented 30 Hz detail policy applies there.

## Reproduce

From `frontend`:

```sh
npm test
npm run lint
npm run typecheck
npm run bench:playback
npm run dev -- --port 3100
npm run test:e2e
```

`/playback-demo` normally exists only in development. The explicit local flag `ASTRA_PLAYBACK_QA=1` permits optimized-build QA; leave it unset for deployment. To benchmark a production build:

```sh
ASTRA_PLAYBACK_QA=1 npm run build
PLAYBACK_QA_PRODUCTION=1 npm run test:e2e
```

Playwright uses an installed Chrome and reuses a server already listening on port 3100. When a production build exists it starts that build with the explicit local QA flag; otherwise it starts Next development mode. Visual baselines were recorded on macOS Chrome with UTC/en-GB/dark settings. Other platforms may need their own reviewed baselines.

Google Fonts requests failed in this environment: webpack's existing font loader encountered quoted URLs it could not parse, and Turbopack could not fetch the font CSS. Optimized QA was built using Next's font-response testing hook and cached copies of the existing DM Sans/Fraunces files. No font loader, app layout, font asset, or deployment font setup was modified. Normal production build font fetching remains an environment limitation.

The staging copy's symlinked dependencies also triggered an intermittent webpack development font-manifest read/reload error. Next's default compiler with the staging workspace root fixed the development QA issue; this staging-only root configuration is not part of the change.

## Database and manual limits

A fresh persistence run fails before test execution in `test_library_activity_and_status_use_saved_models_and_runs` with a database setup connection refusal. The configured PostgreSQL host/port is **localhost:5433**; it has no listening service. The Docker daemon socket is also absent. Credentials were excluded from diagnostic output. No database configuration, schema, data, volumes, or engine behavior was changed to hide the failure. The new owner-scoped immutable-version integration test remains blocked by the same database prerequisite.

I visually inspected the desktop/mobile mid-run and followed-entity screenshots, including title/stat separation and the mobile toolbar gutter. Browser automation verified mouse/pointer scrubbing, zoom controls, resize/refit, touch pan/pinch emulation, and media-emulated reduced motion. Physical trackpad/pinch gestures and an actual macOS preference change were **not** verified: the native browser moved away from the QA tab during the attempt, and System Settings access was denied by computer-use permissions. No OS preference was changed.

## Reviewed screenshots

[Desktop mid-run](../tests/e2e/playback.spec.cjs-snapshots/mid-run-1440-darwin.png), [desktop followed entity](../tests/e2e/playback.spec.cjs-snapshots/followed-1440-darwin.png), [tablet log](../tests/e2e/playback.spec.cjs-snapshots/event-log-1024-darwin.png), and [mobile mid-run](../tests/e2e/playback.spec.cjs-snapshots/mid-run-390-darwin.png). All seven requested states have baselines at all three sizes.

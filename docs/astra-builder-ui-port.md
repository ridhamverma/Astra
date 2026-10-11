# Astra Builder and playback UI port

Reference: `/Users/vridham14/Documents/Astra copy`
Target: `/Users/vridham14/Documents/Astra`

Both projects' frontend AGENTS.md instructions and relevant file differences were inspected before editing. Existing changes in the target were preserved. No dependencies were added; the installed Motion package supports the reference AnimatedGridPattern component.

## Implementation

- Shared 30-degree isometric station artwork for Source, Queue, Process, Decision, Delay, and Sink.
- Presentation projection and inverse projection for placement, pointer dragging, and keyboard movement. Canonical model positions, configs, simulation settings, and decision branch IDs remain in model space.
- Connections, connection previews, station entity slots, and playback journeys share the same projection. Playback uses the run snapshot's coordinates at all screen sizes.
- Expanded/collapsed sidebar widths of 240/64 px; 56 px rows, 4 px gaps, 40/36 px icons, collapsed 8 px horizontal padding, right-side top-layer tooltips.
- Sidebar height reserves at least 24 px above the actual toolbar. Its radius and neutral material follow the toolbar. Hidden scrollbars and conditional top/bottom fades retain vertical scrolling.
- Reference Magic UI AnimatedGridPattern behind the Builder, outside the viewport transform, with pointer events disabled, the existing background/accent tokens, radial mask, and edge vignette. The reduced-motion preference is subscribed live and removes animated squares.
- Small overview layouts hide overlapping station names until hover/focus/selection; station names remain available to assistive technology. Playback also has the reference collapsible station catalog.
- Original authentication, backend, schema, timing, saved project/version logic, metrics, event log, playback controls, fonts, bars, tabs, and unrelated buttons were retained. No `/builder-preview` route was introduced.

## Files changed by this task

Existing frontend files edited:

- `frontend/components/simulator/workspace.tsx`
- `frontend/components/simulator/astra-node.tsx`
- `frontend/components/simulator/builder-edge.tsx`
- `frontend/components/simulator/canvas-ui.tsx`
- `frontend/components/simulator/playback.tsx`
- `frontend/components/simulator/playback-scene.tsx`
- `frontend/components/simulator/station-visuals.tsx`
- `frontend/lib/playback-layout.ts`
- `frontend/lib/playback-design.ts`
- `frontend/tests/e2e/playback.spec.cjs` — fit assertion now accounts for the station catalog and asserts node containment; interaction checks retained.
- `frontend/tests/e2e/playback.spec.cjs-snapshots/{initial,mid-run,followed,event-log,finished,reduced-motion}-{1440,1024,390}-darwin.png` — 18 reviewed visual baselines for the new station rendering. Empty-state baselines unchanged.

Added:

- `frontend/components/simulator/isometric-station.tsx`
- `frontend/components/simulator/isometric-connection.tsx`
- `frontend/components/simulator/operations-floor.css`
- `frontend/components/ui/animated-grid-pattern.tsx`
- `frontend/lib/isometric.ts`
- `frontend/tests/isometric.test.cjs`
- `frontend/tests/e2e/isometric-builder.spec.cjs`
- `frontend/tests/e2e/builder-sidebar.spec.cjs`
- `frontend/tests/e2e/user-model-live.spec.cjs` — opt-in real backend tests; temporary accounts and their projects are cleaned up.
- `docs/astra-builder-ui-port.md`

Other pre-existing modified/untracked files in the working tree were not part of this port.

## Validation

- `npm run typecheck` passed.
- ESLint on the changed TS/TSX implementation files, with `--max-warnings 0`, passed. The repository ESLint configuration excludes tests.
- `npm test`: 60 tests passed, including existing Builder, playback, timeline, schema, and version tests plus projection checks.
- Production build passed. The browser-test build uses the existing `ASTRA_PLAYBACK_QA=1` flag to expose the existing playback demo fixture; normal authentication remains active.
- `ASTRA_LIVE_QA=1 npx playwright test`: all 38 browser tests passed against the production build, including the two real API tests. The final 80-entity benchmark measured 54.2 fps; the slowest measured seek was 37.6 ms.
- Sidebar checks at 1440x900, 1024x768, and 390x844 cover dimensions, toolbar clearance, Sink scrolling, tooltips, scrollbar styles, fade state, fixed background, and live reduced-motion changes.
- Canonical-coordinate browser test checks projected saved positions, pointer drag and keyboard movement, unchanged nodes/configs/edges/simulation settings, and saving.
- Real API tests build custom Source → Process → Sink and Source → Delay → Sink models, configure them, connect them, execute five entities, inspect playback totals, reload saved projects, and rerun.
- Playback coverage includes screenshots, keyboard controls, exact event stepping, scrub/seek, speed selection, replay, entity inspection/following, event logs, responsive resize, touch pan/pinch, hidden-tab lifecycle, motion toggle, accessibility, and moving/frozen entities.

## Local app and limits

Builder: http://localhost:3000/simulator
Backend: http://localhost:8000/health

Authentication is unchanged; use a normal existing account or register through the app. The local API and production frontend were started for use after the task.

Browser automation used Chrome/Chromium. Cross-browser scrollbar-hiding CSS is included for Firefox, Chrome, Safari, and Edge, but native Firefox/Safari/Edge sessions were not exercised. Very wide saved layouts retain their coordinates on phones; zoom in to see detailed captions and metrics.

# Builder redesign review

Implemented the screenshot's token palette, asset-based Astra mark, glass chrome, responsive header/metrics/status, one node toolbar, custom controls, six card variants, Decision handles, smooth edges and pills, inspector tabs, chat sheets, command palette, empty state and undo. Existing project routes, simulation, save and AI insertion behavior remain in place. Other workspace view content and Playback node presentation are preserved.

## Changed files

- `frontend/components/simulator/workspace.tsx`: header, canvas integration, viewport fitting, actions, history and responsive panel orchestration.
- `frontend/components/simulator/astra-node.tsx`: memoized six Builder card variants; original Playback presentation retained.
- `frontend/components/simulator/node-properties.tsx`: configuration validation, metrics and device-local notes.
- `frontend/components/simulator/model-chat.tsx`: existing chat restyled with responsive sheets and preserved history/review/insertion guard.
- `frontend/components/simulator/builder-ui.tsx` (new): shared logo mark, sheet focus management, palette and sheet handle.
- `frontend/components/simulator/builder-edge.tsx` (new): memoized custom edges and label pills.
- `frontend/app/(site)/simulator/builder.css`: Builder-scoped tokens, glass and responsive styles; older chrome styles scoped to other views.
- `frontend/lib/builder-presentation.ts` (new): real-result card metrics, measured delay and average utilization.
- `frontend/lib/builder-edge-geometry.ts` (new): smooth routing and legacy short-gap label clearance.
- `frontend/lib/model-layout.ts`: spacing for newly generated models only.
- `frontend/lib/simulation-editor.ts`, `frontend/types/simulation.ts`: stable Decision handles and saved graph migration.
- `backend/app/schemas/simulation.py`, `docs/simulation-model.schema.json`: optional saved source handle metadata.
- `frontend/tests/builder-edge.test.cjs`, `frontend/tests/builder-presentation.test.cjs` (new), `frontend/tests/model-layout.test.cjs`, `frontend/tests/simulation-editor.test.cjs`, `backend/tests/test_simulation_schema.py`: regression coverage.

## Validation

- 29 frontend tests and 235 backend tests passed.
- ESLint (zero warnings), TypeScript, Prettier on changed frontend files and production build passed.
- Production browser console: no errors or warnings in exercised flows.
- Verified Run, refreshed run metrics, palette insertion, undo restoring graph/saved status, inspector configuration/metrics/notes, chat focus and closing, Decision migration and branch labels.
- Captured 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024 and 390×844; checked 320px width too. No horizontal page overflow. Desktop fitting reserves panel width and toolbar/panel clearance.
- Browser viewport checks do not substitute for physical-device pinch gestures or on-screen keyboard testing. Live external AI generation was not exercised; existing mocked generation/insertion tests passed.
- Backend tests report an existing FastAPI/Starlette httpx deprecation warning, unrelated to browser console or this change.

## Adaptations

- The saved Hospital model differs from the reference flow and has tight historical spacing. Its positions and model parameters were preserved; fit zoom consequently differs. Short legacy gaps route above cards to keep labels clear. The requested 104px spacing and raised Delay branch apply to newly generated models.
- Explicit Decision outputs at 35%/65% take priority over a perfectly straight centerline No edge; smoothstep bridges the small vertical offset.
- Existing distributions are Constant, Exponential and Uniform. The screenshot's unsupported Triangular distribution was not added.
- Delay configured duration and measured hold have independent sources. Older persisted run history lacks delay events and shows `--` for measured hold; fresh run events produce the measured value.
- Notes persist on the current device to avoid expanding the canonical simulation schema beyond permitted fields.
- A real simulation was run on the existing Hospital project during verification, creating a new run without changing its graph or settings.

## Screenshots

Open [side-by-side comparison](comparison.html), or individual captures: [1920](1920-inspector.jpg), [1440](1440-inspector.jpg), [1280](1280-inspector.jpg), [1024](1024-inspector.jpg), [768](768-inspector.jpg), [390 inspector](390-inspector.jpg), [390 canvas](390-canvas.jpg), [390 chat](390-chat.jpg).

Production preview is available at http://localhost:3001. The user's existing development server on port 3000 was left running.

No open questions.

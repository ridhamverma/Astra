# Builder workspace

The Builder alone uses the wireframe's full-screen black/orange project workspace. The existing authentication guard, project route (`/simulator?project=<id>`), save/run APIs, graph schema, React Flow editing, node configuration, and feature panels are reused.

## Interaction

- The project title uses the existing editable name field. The logo links back to Projects.
- The compact header contains Builder, Insights, Playback, Scenarios and Optimization. The existing availability rules for run-dependent tabs are preserved. Their content is unchanged.
- All six supported node types (Source, Queue, Process, Decision, Delay and Sink) remain available in the vertical icon palette, matching the six icons in the reference. Click a tool and then the canvas to place it, drag it onto the canvas, or focus the tool and press Enter to add at the center.
- Select a node/edge for its floating properties inspector. Close it to recover the open canvas. Settings exposes the existing duration and seed controls. Run Simulation is in the header; Save and saved/unsaved status are in the 44px footer. Zoom and Fit view stay 24px from the canvas bottom-left edge in either toolbar state.
- Ask Astra is the sole header generation entry point (renamed from Generate Model). It opens/closes the attached drawer, restores focus on close, and preserves the conversation when closed. Desktop canvas resizing automatically refits the graph; on narrow phones the drawer occupies the workspace below the header, and closing restores the canvas.
- Enter sends, Shift+Enter adds a line. Concurrent requests are guarded synchronously. Real API/provider errors appear in the conversation with an edit/retry action.
- Backend-validated drafts show parameters, assumptions and connections. Review is required before insertion. Insertion appends fresh node/edge IDs below existing nodes, preserving the project identity, existing graph, seed, duration and scenario. It never saves or runs. An inserted response cannot be inserted again; repeating an already inserted request requires explicit confirmation.

## Verification

| Check | Result |
| --- | --- |
| Frontend unit suite, including graph preservation/remapping and repeated insert IDs | 15 passed |
| ESLint and TypeScript | Passed |
| Production build | Passed |
| Real project opens with seven nodes and six connections | Passed |
| Real AI bank generation, review and insertion | Passed; existing seven nodes retained, four new nodes appended |
| Keyboard node creation and existing properties controls | Passed |
| Desktop drawer resize keeps every workflow node within the canvas | Passed |
| Tablet 768px, mobile 390px/320px | No horizontal page overflow |
| Insights navigation opens the existing saved results panel | Passed |

Browser generation and insertion were performed on an unsaved preview of Restaurant. Those canvas changes were not persisted to the user's project. Responsive screenshots are saved alongside this document.

Previews: [desktop with drawer](builder-desktop-open.png), [desktop closed](builder-desktop-closed.png), [mobile drawer](builder-mobile-open.png).

## Dark Ember desktop refinement

Builder controls use the Dark Ember palette. At desktop widths the header is 56px tall with a segmented tab group. Linear flows render on one centerline with 220×88px nodes, 96px gaps and straight 1.5px edges. Loaded model positions remain unchanged until the user edits and saves. Fit view uses 20% clearance and leaves at least 80px beside the toolbar. It re-fits after loading, window resizing, drawer changes and scenario loads. Node borders remain neutral except for the orange selected state; the red-orange bottleneck badge stays separate. The plain project title remains editable inline. The Blocks toolbar is 50px collapsed and 220px expanded with 36px tools. Playback keeps its lock and explanatory tooltip until a run is available. Save is disabled when the project is clean. Run and Save guard duplicate requests. React Flow attribution and the Next.js development indicator are hidden.

Verified with isolated browser fixtures (no user project writes) at 1280px, 1024px and 768px: no horizontal overflow; the toolbar-to-flow gap stays above 80px; the main path stays centered; all five edges stay horizontal; and the zoom controls stay 24px from the canvas edges. At 1280px the header is 56px. Checked resize and drawer re-fitting, header collision, attribution hiding and the 44px footer. TypeScript, ESLint, all 15 unit tests and the production build passed.

Previews: [1280px](builder-refined-1280.png), [1024px](builder-refined-1024.png), [768px](builder-refined-768.png).

# Recents and project library

`/dashboard` is Recents. `/projects` is the complete project library. Both use the scoped black/orange workspace shell, existing DM Sans/Fraunces fonts, uploaded Concept 11 logo, protected routes, and existing cookie/CSRF authentication. Home, login, registration, and the simulator retain their existing layouts.

## Real project data

- Migration `0006_project_activity` stores the last opened timestamp independently of edit timestamps. The owner-authorized, CSRF-protected `POST /api/v1/projects/{id}/access` records an actual simulator open. Listing or previewing a project does not record an open. Failure to record activity does not block model loading.
- Recents orders by the latest of open, edit, and saved simulation time with a stable ID tie-break, and selects at most three projects. There is no search, sorting, filtering, creation, or overflow menu on Recents. Its empty state links to Projects.
- Library summaries include canonical saved graphs, compact run counts, and latest run time. List queries batch the latest versions and run aggregates; event timelines are not loaded.
- A project is **Completed** when its current model version has a successful baseline run. Otherwise it **Needs review**, including after the model changes. The current synchronous engine does not persist running/failed jobs, so those filters can legitimately return no matches; the interface never fabricates those statuses.
- Workflow thumbnails draw saved node positions and connections, showing up to twelve blocks. Blank projects are explicitly shown as blank. No illustrative graph substitutes for the saved model.
- Project type is inferred from project/model/process names and is disclosed next to the filters. There is no manually stored category or improvement score in the current schema.
- The notification control opens actual recent simulation activity. It does not invent unread notifications.

## Project management

Projects supports case-insensitive name search, combinable status/type/updated-date filters, reset, and sorting by edit time, creation time, name, or run count. Preferences persist in session storage per user. Overflow actions reuse the existing rename and delete APIs; deletion requires an explicit confirmation dialog.

Creation uses the existing blank project and five starter-template APIs. A synchronous submission guard and disabled controls prevent duplicate requests. Successful creation navigates to the existing `/simulator?project=<id>` convention. Failed creation stays in the creation dialog on Projects with a visible API error. Native dialogs provide focus trapping, Escape cancellation, and focus restoration.

The Settings navigation opens a protected account-information page and displays the existing user data; no unsupported account editing is exposed.

## Verification

| Check | Result |
| --- | --- |
| PostgreSQL migration, activity independent of edits, run count/status transitions | Passed |
| Activity endpoint and project summaries isolated between two users | Passed |
| Backend suite | 234 passed |
| ESLint, TypeScript check, and production build | Passed |
| Frontend tests: Recents ordering, combined filters, deterministic sorts, existing simulation utilities | 13 passed |
| Browser: Recents has three cards, zero search/management controls; Projects shows all four projects | Passed |
| Browser: search/no results/reset and combined filters | Passed |
| Browser: filters survive navigation to Recents and back | Passed |
| Browser: real Warehouse template creation navigates to simulator with seven editable nodes | Passed |
| Browser: actual simulation updates card status, run count, notification activity, and Recents order | Passed |
| Browser: desktop 1440px, tablet 768px, mobile 390px/320px | No horizontal overflow |
| Browser: narrow-screen template dialog and collapsed navigation | Passed |

The verification created **Order Fulfillment** from the Warehouse template and saved one real run. No existing user project was deleted or renamed.

Screenshots: [Recents](dashboard-recents.png), [Projects](dashboard-projects.png), [mobile Recents](dashboard-recents-mobile.png).

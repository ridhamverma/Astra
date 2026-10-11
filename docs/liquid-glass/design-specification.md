# Astra — Model. Simulate. Improve.

Complete design direction, implementation reference, demonstration models and QA record. 6 October 2026.

Assumption: retain the existing Next.js/React/React Flow/Recharts/FastAPI stack, dark workspace identity and canonical model schema; interpret “three scenarios” as baseline plus two alternatives.

## A1. Quick audit — ranked by impact

1. **Measured content wears control material.** Nodes, KPI cards, chart cards, tables and bottleneck panels currently share `.glass`; this weakens hierarchy and multiplies canvas compositing cost.
2. **Run settings are detached from the decision to run.** Duration and seed need to be inspectable immediately before validation; a successful run must retain its immutable version reference.
3. **Comparison eligibility is easy to miss.** Duration and seed mismatch needs a persistent, numerical banner, separate from whether snapshot versions have been rerun.
4. **Validation needs two-way navigation.** Every issue must identify its node or route, focus it on activation, and preserve the attempted settings. Node error labels must survive loss of color.
5. **Bottleneck authority needs calibration.** High utilization is not proof by itself. Resource wait, upstream queues, horizon backlog and the heuristic score must remain visible together.
6. **Playback can compete with its own canvas.** Crowded transport controls, tiny fit-to-view nodes and an ambiguous utilization label make recorded events harder to interpret. “Busy now” and whole-run utilization are different views.
7. **Optimization needs bounded language.** Mark only the best feasible tested configuration. Show seeds, tested range, observation ranges, costs and infeasibility reasons alongside the recommendation.
8. **AI draft validation looks too final.** “Validated draft” with a check mark can imply operational correctness. Replace it with “Draft: review before use,” keeping explicit parameter review and evidence citations.
9. **Template cards describe industries, not lessons.** Photographs and unexplained duration badges give less guidance than actual graph thumbnails, an operational question and three short first-run tips.
10. **The interface lacks one accessible material contract.** Small 25–36 px controls, dark-only values, low-contrast secondary treatments and inconsistent radii need shared tokens and transparent fallbacks.

## A2. Design direction

### Preserved identity

Extracted from `frontend/app/layout.tsx`, `components/dashboard/workspace.module.css`, `app/(site)/simulator/builder.css`, the existing landing page and login styles:

| Identity | Existing value or behavior | Use |
|---|---|---|
| Primary coral | `#F06445` | Primary workspace actions, selection, active model edits |
| Coral hover / press | `#FF7958` / `#D8553A` | Interaction states |
| Warm ivory | `#FFF9F0` | Dark foreground, light content surface, glass highlights |
| Charcoal / chrome | `#0B0B0A` / `#050505` | Calm dark canvas and shadow color |
| Card / elevated / input | `#151513` / `#1D1C19` / `#111110` | Opaque content layers |
| Border / strong | `#302E29` / `#49453E` | Separators and light-mode ink |
| Secondary neutrals | `#B8B1A6`, `#A8A39B` | Secondary text; stronger control boundaries |
| Existing semantic family | green `#55B77E`, amber `#E0A93B`, rose `#F27D91` | Success, caution, errors and labeled chart channels |
| Typography | DM Sans; Fraunces 500/600 | DM Sans for operational work, Fraunces for page introductions |
| Logo | `/astra-logo.png`; existing Astra wordmark and concept mark | Preserve silhouette; 28–34 px in chrome; no Apple assets |
| Tone | “Model. Simulate. Improve.”; direct operational verbs | “Validate & run,” “Review result,” “Apply to builder” |
| Legacy public light treatments | coral `#C9513C` / `#D95D45`; background `#F8F7F3` | Evidence of the existing warm palette; do not introduce an unrelated blue/purple identity |

All new chromatic values are exact existing colors, opacity variants or sRGB channel mixes of that family. Light coral `#A74832` is 68% existing coral plus 32% existing charcoal; it retains identity while supporting small white-on-coral action text. The complete resolved values are in the CSS and JSON token files.

### Four principles

1. **A steady model, a responsive instrument layer.** Keep model geometry and evidence opaque; let navigation and tools carry the material.
2. **Evidence before decoration.** Always show the run's duration, seed, model version and units where they affect interpretation.
3. **One change, a visible consequence.** Keep selection, parameter editing, validation, execution and comparison within one persistent workspace.
4. **Accessible by construction.** Text, shape, icon and interaction must still communicate when color, transparency or motion is removed.

Astra should feel like a precise instrument made from warm materials: charcoal canvas, ivory text, recognizable coral actions and a restrained Fraunces headline. Floating tools catch a small rim of light as the pointer moves. The model stays still and legible beneath them. Rounded outer panels contain deliberately simpler inner controls; numeric evidence uses stable tabular figures. Light mode reads like warm paper and translucent ivory, preserving exactly the same hierarchy and coral identity.

Apple's material guidance places Liquid Glass in navigation and controls and reserves Clear for visually rich backgrounds. Astra adapts that hierarchy for the web; it does not claim native optical refraction. [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

### Glass / Not glass

| Component | Material | Rationale |
|---|---|---|
| App toolbar, project breadcrumb, run group | Regular | Persistent tools float above work |
| Workspace sidebar, tab bar | Regular outer container | Selected tabs borrow the parent material; no nested blur |
| Block palette, zoom controls, minimap control frame | Regular | Navigation tools, never model data |
| Properties inspector, AI assistant shell | Regular | Editable controls over canvas |
| Run setup, create-project sheet, command palette, menus, popovers | Regular | A single active transient layer |
| Playback transport, speed menu, scrubber | Regular | Recorded-event controls |
| Segmented controls, toggles, sliders, form fields | Solid/tinted child inside Regular parent | Inherit depth without another backdrop filter |
| Toasts, notification popup | Regular, with icon and text | Compact feedback above content |
| Clear controls | Reserved; not used on analytical screens | Only over future/existing rich-media surfaces with an explicit dimming layer; there is no qualifying production use in this redesign |
| Canvas, model nodes, ports, connectors, probability labels | Opaque | Spatial stability and cheap rendering |
| Metric cards, charts, legends and chart tooltips | Opaque | Values cannot depend on what is behind them |
| Node tables, comparison tables, bottleneck ranking, evidence breakdown | Opaque | Readability and numerical scanning |
| Optimization candidates, best-tested recommendation, cost grids | Opaque | Recommendations remain evidence, not floating controls |
| Project cards, template cards, thumbnails, run/version rows | Opaque | Browsable content |
| AI draft model, assumptions, metric citations | Opaque within assistant shell | Generated content remains inspectable |
| Authentication forms, account details, empty-state instructions | Opaque | Reading and input surfaces |

Depth order: canvas/background `0`; content `1`; controls `20` (toolbar `30` where needed); transient overlays `60` or native dialog top layer. Opening a modal makes underlying glass opaque and disables its blur pass. Child controls never add a second filter.

## A3. Design tokens

Complete exact CSS: `frontend/styles/astra-tokens.css`. Matching machine-readable JSON: `frontend/styles/astra-tokens.json`. Both are reproduced in the appendices of this document.

| Token group | Specification |
|---|---|
| Canvas / content, dark | `#0B0B0A` / `#151513` |
| Canvas / content, light | `#F6F0E6` / `#FFF9F0` |
| Primary / secondary / muted, dark | `#FFF9F0` / `#B8B1A6` / `#A8A39B` |
| Primary / secondary / muted, light | `#0B0B0A` / `#49453E` / `#625E58` |
| Action, dark / light | `#F06445` / `#A74832` |
| Action text, dark / light | `#0B0B0A` / `#FFF9F0` |
| Semantic success, dark / light | `#55B77E` / `#336849` |
| Semantic warning, dark / light | `#E0A93B` / `#7A5D23` |
| Semantic error, dark / light | `#F27D91` / `#914D58` |
| Control boundary, dark / light | `#A8A39B` / `#807B73`; 1 px, 2 px for high contrast |
| Typography | DM Sans 12/18 caption, 13/20 label, 14/21 body, 16/24 lead, 20/28 section; Fraunces 32/38.4 page, 48/57.6 hero; 32/38.4 DM Sans 600 metrics |
| Numeric figures | `font-variant-numeric: tabular-nums lining-nums`; units 14/21; null values `—` with “Unavailable” context |
| Spacing | `0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64` px |
| Desktop grid | ≥1100 px; 12 conceptual columns, 24 px gutters; 1280 px analytical content maximum; 48 px library inset |
| Tablet grid | 700–1099 px; 8 columns, 24 px gutters; 32 px library inset; panels become overlays |
| Mobile grid | ≤699 px; 4 columns, 16 px gutters/inset; single-column cards; horizontal data regions scroll independently |
| Radii | capsule 999 px; field 12 px; content card 20 px; panel 28 px; inner panel 16 px at 12 px inset |
| Concentric rule | `inner radius = max(0, outer radius − inset)`; 28−12=16; 20−8=12; a full capsule remains a capsule |
| Icon geometry | existing Lucide/Astra line icons; 20 px square, 1.75 px round-cap stroke; 16 px for inline status; 44×44 px hit area |
| Motion | press 120 ms, hover 160 ms, panel 320 ms, layout ≈420 ms; easing `cubic-bezier(.2,.8,.2,1)` |
| Spring | stiffness 380, damping 34, mass 1; duration is approximate settling time, not an independent spring guarantee |
| Press | scale .98, brightness 1.06; no scaling under Reduce Motion |
| Accessibility focus | 2 px focus stroke + 4 px offset; high-contrast outline uses current mode's text color |

### Data visualization — three independent families

| Metric | Dark low / middle / high | Light low / middle / high | Redundant encoding |
|---|---|---|---|
| Queue length | `#3A301A / #856629 / #E0A93B` | `#E8DECB / #B9A680 / #806225` | Step-after line; waiting entity axis; numeric focus tooltip |
| Completions | `#213226 / #386E4E / #55B77E` | `#DADFD2 / #8FA994 / #336849` | Cumulative line/area; count focus tooltip; count units |
| Utilization | `#3D282A / #8F4E58 / #F27D91` | `#EBDAD5 / #C29A9C / #914D58` | Horizontal bars; node label and percent; text “Primary” for bottleneck |

Low and middle fills are backgrounds, not small text or the sole signal. High colors are the chart strokes and have ≥3:1 contrast against the solid chart surface. Do not claim that arbitrary same-hue series are colorblind-safe: safety comes from separate labeled panels, shape/type differences and numerical tables. Severity always includes a triangle and label, never just a red/green change. Utilization is not automatically scored as good or bad.

### Material tokens

| Mode / variant | Tint | Blur / saturation | Required backing |
|---|---|---|---|
| Dark Regular | `rgba(21,21,19,.92)` | 20 px / 1.4 | Any app content; opacity bounds worst-case background contrast |
| Light Regular | `rgba(255,249,240,.94)` | 20 px / 1.4 | Any app content |
| Dark Clear | `rgba(11,11,10,.68)` | 12 px / 1.2 | `rgba(5,5,5,.56)` dimmer over rich media |
| Light Clear | `rgba(255,249,240,.78)` | 12 px / 1.2 | `rgba(255,249,240,.64)` local light scrim over rich media |

Regular and Clear share each mode's rim, inner highlights and adaptive shadow, avoiding unnecessary material variants. Exact gradients and shadow stacks are in the appendix. The high Regular opacity is intentional: operational text must pass contrast checks even over a bright underlying chart.

## A4. Glass material recipe

Production implementation: `astra-material.css` plus scoped `astra-workspace.css`; pointer response and user preferences: `components/design/preferences.tsx`.

1. Establish a solid fallback `background:var(--a-surface)` and 1 px edge.
2. Under `@supports`, layer a 240 px radial specular gradient in the padding box, the Regular tint gradient in the padding box, and the mode's 135° rim gradient in the border box. The transparent border reveals the rim without a second backdrop filter.
3. Use `backdrop-filter: blur(20px) saturate(1.4)` with the WebKit form. The dark inner highlights are ivory at .12 and .04; dark external shadows are chrome at .20 and .32. Light inner highlights are ivory .96 and strong ink .08; external shadows use strong ink .08/.12.
4. One passive pointer listener finds the closest control material, ignores canvas nodes and touch input, and updates local `--pointer-x/y` once per animation frame. It resets the previously active panel. Reduced Motion disables this response.
5. Optional refraction filter: `public/astra-refraction.svg`, `feTurbulence` frequencies .012/.02, one octave, seed 42; displacement 1.25 px. It is intentionally disabled by default. Apply only to a decorative edge clone, never to foreground text, charts, inputs or an entire canvas.
6. Without backdrop support, use opaque solid materials. With Reduce Transparency, force opacity 1 and filters off. With Increase Contrast, use opaque surfaces and stronger edges. With Reduce Motion, use 120 ms opacity transitions and suppress moving transfer glyphs; recorded counts and time controls remain available. Forced Colors uses system Canvas/CanvasText/Highlight.
7. Use native `dialog` for run setup and the existing native project sheet: focus is contained, Escape closes, and focus returns to the initiating action. Persistent inspectors use existing focus handling, drag handles and dismissible mobile scrims.

Performance budget: at most four simultaneous canvas material groups (toolbar; combined palette/navigation group; inspector or AI panel; bottom transport/status group). Tiny inner controls borrow their group's material. Nodes, edge labels and metric strips have zero filters. No blur-radius animation. No displacement on the canvas. Existing playback caps 80 active markers and 80 transfers and processes at most 4,000 events per frame. Keep node components memoized; update aggregate badges rather than creating a DOM element for every simulated entity. Large graphs should cull offscreen nodes; inspect actual frame times before claiming an FPS target.

## A5. Component library

### Universal state contract

Applies to every interactive item below; content-only cards use only applicable states.

| State | Exact treatment and behavior |
|---|---|
| Default | Opaque content or one Regular control material; 44 px minimum action hit area |
| Hover | 160 ms background/edge change; accent hover token for primary actions; no data-color changes |
| Pressed | .98 scale and 1.06 brightness for 120 ms; retained semantic label |
| Focus | 2 px visible outline, 4 px offset; keyboard order follows visual order |
| Disabled | Native `disabled` where possible, .55 opacity, `not-allowed`; persistent adjacent reason if the action depends on data |
| Loading | Existing content retained when valid; `aria-busy`; status label (“Validating…”, “Saving…”, “Running…”); duplicate submission blocked |
| Error | Error icon plus plain-language message; related field `aria-invalid`, `aria-describedby`; no loss of entered data; explicit retry |
| Empty | Solid empty surface with a specific reason and one available next action; never fabricate zero measurements |

### Astra components and dimensions

| Component | Geometry | Behavior / copy |
|---|---|---|
| Source node | 248×112 minimum; radii 36/20/20/36 | Green input-arrow icon; “SOURCE”; arrival distribution and mean. No input port |
| Queue node | 248×112 minimum; 20 px radius; 4 px double left edge | Amber ordered-list icon; “QUEUE”; FIFO/capacity; playback waiting count |
| Process node | 248×112 minimum; 20 px radius | Coral resources icon; service time/resources; playback “Serving” and “Busy now” |
| Decision node | 248×112 minimum; radii 28/8/28/8 | Rose split icon; separate Yes/No ports at 35%/65%; probabilities sum to one |
| Delay node | 248×112 minimum; radii 20/40/40/20 | Neutral timer icon; explicitly no constrained resource |
| Sink node | 248×112 minimum; radii 20/36/36/20; double right edge | Green completion icon; no output port |
| Node selection / invalid / running | 2 px selection ring at 3 px offset; 2 px dashed invalid edge | Invalid includes “⚠ Check configuration”; bottleneck includes labeled triangle; active state never relies only on glow |
| Ports | 12 px visible; 44 px interaction region | Left input/right output, labeled; keyboard destination form provides equivalent connection creation |
| Connector | 2 px line, arrowhead, 24 px pointer corridor | Label uses opaque fill, 8 px radius, 4×8 px padding; decision branch names and percentages |
| Block palette | 60 px collapsed / 220 px expanded; 28 px outer radius; 8 px inset | Six 44 px tool targets, labels, existing keyboard shortcuts; click adds at canvas center |
| Properties inspector | 336 px desktop; 280 px compact, 360 px compact height cap; 28 px radius | Configuration, measured metrics, existing notes; 44 px fields, 8 px label gap, 20 px field rhythm; mobile 44dvh/76dvh detents |
| Forms | 12 px field radius, ≥44 px height; 16 px input text on mobile | Supported constant/exponential/uniform controls; uniform bounds must match mean midpoint; capacity blank means unlimited; probabilities show numeric total |
| Validation list | 44 px minimum row; node name + issue | Activate to select/focus the affected block. Run remains unexecuted until validation succeeds |
| Run setup | 420 px maximum width; viewport minus 32 px; 28 px radius; 24 px inset | “Run this model”; duration, seed; “Validate & run”; native dialog and shared spring origin |
| Run history | Opaque 20 px card, 24 px inset; minimum 68 px entry | Version, duration, seed, date, completions and “Review result” |
| Model versions | Immutable version list plus read-only configuration disclosure | “Model vN · read-only”; no editor controls on the snapshot. GET endpoints read existing saved graphs |
| Metric card | Minimum 144 px height; 20 px radius; 24 px inset | 32 px tabular value, 14 px unit; measured basis under label; null is “—” |
| Chart card | 20 px radius; 24 px inset; 240 px plot target | Solid backgrounds; separate queue/completion/utilization channels; persistent units and usable tables |
| Data table | 48 px minimum row; 16 px cell inset; 20 px enclosing card | Column headers use `scope`; keyboard-focusable overflow region; no squeezed numeric columns |
| Playback bar | Desktop fit-content, 12×16 px padding, 28 px radius; mobile full width | 44 px controls; native range with formatted `aria-valuetext`; .5×/1×/2×/4×/10×/20×; idles after 4 s without hiding the scrubber |
| Playback inspector | 248 px desktop, 168 px mobile; 20 px radius; 16 px inset | “Recorded timeline · read-only”; “Busy now” separate from whole-run utilization |
| Scenario card | Opaque 20 px radius; 24 px inset | Name, version, settings, latest run; load, duplicate, rename, run; preserves existing persistence behavior |
| Comparison banner | 12 px radius; 12×16 px padding; 4 px leading rule | “✓ Settings match” / “⚠ Settings mismatch”; prints both duration/seed pairs; mismatch disables comparison |
| Bottleneck ranking | Opaque 20 px card; 48 px rows | Rank, score, utilization, resource wait, upstream queue, rejected; exact evidence and method disclosure |
| Optimization form | Regular outer panel; 4 columns desktop, 2 tablet, 1 mobile | Existing metric target, one Process resource range, replication count, optional configured costs |
| Optimization result grid | Solid 20 px card; 48 px rows | “Best feasible tested option”; feasibility reason per candidate; mean and range; stale results cannot be applied |
| AI draft / explanation | Regular assistant frame; solid draft/evidence cards | “Draft: review before use”; explicit review checkbox before insertion; explanation cites stored metric keys and values |
| No AI provider | Solid message in assistant shell | “AI is not configured. You can still build, validate and run models manually.” Provider errors preserve entered text |
| Menus / command palette / toasts | 16 / 28 / 16 px radii; 8 / 16 / 12 px inset | 44 px menu rows, command arrows/Home/End/Escape, icon + readable message, no nested blur |
| Template card | 20 px radius; 16:10 model preview; 24 px content inset | Insight, block count, “240 simulated min,” measured local engine estimate, tags, “Use this template” |

## A6. Information architecture and flows

Persistent navigation remains Recents / Projects / Settings. A project retains Builder / Insights / Playback / Scenarios / Optimization. Bottleneck evidence remains inside Insights; comparison remains inside Scenarios. This avoids inventing more top-level features.

| Flow | Steps and transition |
|---|---|
| Create from template | Projects → Create project → choose graph card → optional name → Use this template. The sheet closes into the new Builder; no automatic execution. Three first-run tips appear |
| Build and validate | Add block via palette or keyboard → edit inspector → connect by port or destination form → Run → inspect duration/seed → Validate & run. Errors focus the block and remain editable |
| Run | Validate → save an immutable version if needed → execute → show result with model version. Loading labels track actual phases; no fake progress percentage |
| Review results | Insights shows summary, run settings and evidence; charts and node tables stay on the same scroll surface; run history opens earlier immutable measurements |
| Replay | Playback uses the current recorded timeline without rerunning; play/pause/seek/reset; select a node for its current occupancy and full-run utilization. No saved timeline claim after refresh |
| Create scenario | Save baseline snapshot → duplicate → load/edit one parameter → save → run. Retain matching duration/seed |
| Compare | Choose baseline/candidate → inspect match banner and snapshot currency → Compare → read absolute and relative changes. Zero denominators remain unavailable, not infinite |
| Bottleneck | Insights → Bottlenecks → inspect utilization + waits + upstream evidence → View on canvas → edit appropriate resource count |
| Optimize | Choose Process → bounds/step → metric/operator/target → replications → optional costs → run search → inspect every candidate → apply tested configuration → save/run |
| AI draft | Ask Astra → describe process → draft arrives with assumptions → inspect configuration → acknowledge review → insert editable draft → validate/run manually |

Run opens with a shared element spring. Inspector toggles compact/expanded detents; its scroll position and selected block persist. Analytical toolbar condenses after 24 px of scroll to a 64 px minimum height. Playback removes its secondary event-count line after 4 seconds idle, retaining controls and clock. Reduced Motion substitutes 120 ms cross-fades.

## A7. Screen-by-screen specification

All content scrolling uses the page body except the canvas, which pans/zooms, and long inspector/table regions, which scroll independently. Sticky navigation never covers a focused row. Error states preserve data and return keyboard focus to the related control. “Retry” repeats only the failed request.

| Screen | Goal and primary action | Desktop layout / depth | Empty / loading / error copy | Tablet / mobile / scroll |
|---|---|---|---|---|
| Landing | Explain process modeling; “Get started” | Preserve existing Fraunces editorial layout and Astra mark; 1280 px content; control-only header material; model illustration remains solid | Illustrative marketing data stays explicitly labeled; no claim that a marketing animation ran the backend engine | Stack existing sections; 16 px mobile inset; document scroll. Public landing remains the established brand layout rather than a new product feature |
| Login / register | Access a private workspace; “Sign in” / “Create account” | Solid 1000 px card, 28 px radius, 32 px inset, two columns | Existing inline field errors; busy submission label; preserve email/name on error | One column on narrow screens; 44 px inputs/buttons; page scroll for keyboard |
| Recents | Resume work; “Open project” | Sidebar 260 px; page 48 px inset; three solid project cards with 24 px gaps; 182 px graph preview | “No recent projects”; “Create project”; loading status; failure with Retry | 208 px intermediate sidebar, mobile menu at ≤699 px; 2 then 1 card columns; page scroll |
| Projects | Find and organize saved models; “Create project” | Same shell; 44 px search/filter/sort; grid with solid graph previews and visible save/run status | “Create your first model”; loading list; “Could not load projects. Retry” | Filters stack; menus 44 px rows; horizontal text ellipsis only with full title accessible |
| Template picker | Pick an operational question; “Use this template” | Native 920 px sheet, 28 px radius; 32 px horizontal inset; 3 columns, 16 px gaps; fixed header/footer, solid scroll body | “Loading starter templates…”; retry catalogue; creation failure remains in sheet | 2 columns tablet, 1 mobile; width viewport−32; max-height 90dvh; name field stays labeled |
| Builder | Create an executable graph; “Run” | 76 px toolbar, 72 px solid metrics strip, canvas, 60 px status footer; palette offset 24; inspector 336; nodes 248×112; 104 px template gaps | “Add a Source to begin”; loading saved model; validation list with focus actions; save error keeps canvas | Palette collapses; inspector bottom/side sheet; canvas fills remaining height; 4 px drag grid |
| Run setup | Verify execution conditions; “Validate & run” | 420 px Regular dialog at layer 60; 24 px inset; duration/seed; trust note; 44 px actions | Invalid numeric field blocks submit; “Validating…” then “Saving…” then “Running…”; engine error remains actionable | Width viewport−32; native focus containment; independent vertical scrolling |
| Insights | Explain measured performance; “Review result” or “View on canvas” | 1200 px existing analysis area; 32 px title; six solid 144 px metric cards in 3 columns; 24 px gaps; evidence/chart/table sections | “Run a simulation to see insights”; metric skeletons; unavailable metrics as—; stale-canvas banner | 2 then 1 columns; tables scroll within labeled regions; local anchor navigation; condensed toolbar |
| Run history / versions | Inspect evidence provenance; “Review result” / “Inspect snapshot” | Solid 20 px card;24 px inset; rows include time/settings/version; version disclosure shows canonical config values | “Run this model to save your first result”; “Loading immutable snapshot…”; Retry on read failure | Rows stack on mobile; disclosures remain keyboard accessible; no editable fields in old versions |
| Playback — hero | See congestion develop; “Play” | Solid calm canvas; queue markers hollow amber circles, in-service markers coral dots, transfers green arrows; selected Process in floating 248 px inspector; Regular transport below/over bottom safe area; canvas≥460 px | “Run a simulation to unlock Playback”; recorded count badges; timeline absent after reload explains why; no rerun on Reset | Mobile 400 px canvas, ≥.55 initial zoom with pan; inspector 168 px collapsible; transport full width below canvas; page scrolling outside canvas |
| Scenarios | Make controlled experiments; “Create baseline” | Solid snapshot list beside comparison region where width allows;24 px inset; immutable version and run settings on each card | “No snapshots yet. Create a baseline from your current model”; loading; duplicate/save/run errors remain attached to action | Stack cards above comparison; preserve pair selection; scroll page |
| Comparison | Assess measured changes; “Compare” | Two 44 px selectors; settings banner; solid 48 px-row table; signed difference, units, interpreted label | “Choose both snapshots”; “Run both current snapshot versions”; explicit mismatch; no fabricated table | Selections stack; fixed minimum table columns scroll horizontally; shared page scroll |
| Bottleneck evidence | Identify the strongest measured constraint; “View on canvas” | Solid 20 px ranking/evidence panel; labeled utilization, mean wait, queue averages/peaks, score breakdown | “No congestion detected in this run” differs from missing evidence; unavailable node metrics are not zero | Evidence stack; table remains scrollable; node jump returns to Builder selection |
| Optimization | Test bounded resource changes; “Run optimization” | Four-column Regular form; solid recommendation and candidate grid; costs/replication settings visible; tested-only disclaimer | No Process: “Add a Process to search resource counts”; running disables duplicate; no feasible result: revise target/range; stale result cannot apply | Two/one form columns; grids scroll horizontally; results page preserves settings on error |
| AI draft | Produce an inspectable starting model; “Generate draft” / reviewed “Insert” | 336 px Regular drawer; solid assumptions, node configs and route probabilities; review checkbox | No provider configuration, transient failure, invalid generated model, empty prompt each distinct; manual builder remains usable | Mobile bottom sheet 76dvh; composer visible above keyboard; conversation scrolls independently |
| AI explanation | Connect narrative to measurements; “Explain these results” | Solid evidence cards within Insights/comparison; run/version context; disclosed metric keys, values, units and references | Provider absence/failure offers retry; stale evidence is labeled; never replace metrics with generated numbers | Single column; long IDs/metric keys wrap; document scroll |
| Settings | Inspect account; adjust appearance | Solid 700 px account card,28 px inset; theme select and three 44 px accessibility rows | Missing display name reads “Not provided”; account errors retain current values | Single column; preferences saved locally; OS accessibility also applies |
| Overlays / notifications | Act without losing context | Single Regular material; command palette max 560 px; menu min 180 px; toast max 360 px; all 44 px targets | Specific action result; errors retained until dismissed/retried; no repetitive status announcements | Width viewport−32; Escape closes; focus returns; mobile scrim blocks background actions |

Hero composition: a Bank queue holding five waiting entities, two tellers serving, 79 completions and 33 rejections at 240 min. The inspector says “Busy now 100%” and “Run utilization 99.9%.” These are different, correctly labeled quantities. The glass bar controls a recording; the nodes and underlying model never become translucent.

## A8. Production implementation

The existing application has been edited in place; there is no replacement stack, new simulation engine, schema migration or fabricated analytical service.

| Area | Implemented source |
|---|---|
| Exact token CSS / JSON | `frontend/styles/astra-tokens.css`, `astra-tokens.json` |
| Material / fallbacks / workspace composition | `frontend/styles/astra-material.css`, `astra-workspace.css` |
| Pointer response and accessibility settings | `frontend/components/design/preferences.tsx` |
| Native accessible Run setup + shared spring | `frontend/components/design/run-setup.tsx` |
| Keyboard connections | `frontend/components/design/keyboard-connection.tsx` |
| Graph thumbnails and template onboarding | `frontend/components/design/model-thumbnail.tsx`, `template-guide.tsx`, `components/project-starters.tsx` |
| Run history and immutable versions | `frontend/components/design/run-history.tsx`, `services/projects.ts`, `backend/app/api/routes/projects.py` |
| Library / settings / authentication | Existing dashboard CSS and components, settings route, login CSS |
| Builder / nodes / connectors / inspector | Existing `components/simulator/workspace.tsx`, `astra-node.tsx`, `builder-edge.tsx`, `node-properties.tsx`, `builder-ui.tsx` |
| Results / playback / scenarios / bottleneck / optimization / AI | Existing production simulator components consume the new contract; persistence/service calls retained |
| Template data | `backend/app/templates/data/*.json`; five complete canonical models |
| Ready-made scenario models and search requests | `docs/liquid-glass/templates/<id>/{baseline,add-one,alternative,optimization}.json` |
| Meaningful verification | `backend/tests/test_template_insights.py`, version isolation integration test, `frontend/tests/design-contrast.test.cjs` |

Two read-only routes expose existing immutable snapshots: `GET /api/v 1/projects/{id}/versions` returns the existing version numbers; `GET /api/v 1/projects/{id}/versions/{n}` returns the existing canonical SimulationModel. Both perform the same project-owner check used by the rest of the API. Neither changes the data schema or model.

Implementation limits are explicit in C. The production code has no API mocks. Browser screenshots were captured with a temporary component review harness fed a real engine run; its abbreviated review navigation is not the application's product navigation.

## B. Demonstration template redesign

### Shared semantics and realism

These are hypothetical teaching configurations, not calibrated operational predictions. Every duration is 240 simulated minutes, every baseline/scenario seed is 42, all arrival processes are exponential and all service distributions are supported uniform distributions. Each uniform mean equals the midpoint of its bounds. Source `max_entities` is omitted, so the horizon limits arrivals. Queues are FIFO. Capacity `null` means unlimited. Only Bank intentionally rejects from a finite queue. Source/Queue/Sink have no staffing resources. Omitted route probabilities on non-Decision edges mean a single deterministic route. All times are minutes.

Every block origin is on a 4 px grid. Left-to-right columns use 360 px pitch:248 px node width plus 104 px connector gap. Straight routes need no crossings. Customer service uses a raised branch at y 48 and main path at y 160. IDs are short stable operational nouns; labels describe the work or entity state, never generic “Process 1.”

### B1–B4. Story, complete graph, parameters and engineered baseline

**Hospital — who:** clinic operations planner. **Question:** “Should we add registration staff or another doctor?” **Insight:** the doctor stage is the constrained resource despite a busy registration desk.

| ID / type / name | Position | Configuration | Reason |
|---|---|---|---|
| arrivals / Source / Patient arrivals | (0,160) | exponential mean 5 | Independent walk-in arrivals; nominal 12/hour |
| registration / Process / Registration | (360,160) | 1 resource; uniform 2–4, mean 3; cost 1 | Short check-in task; nominal 20/hour capacity |
| waiting / Queue / Doctor waiting room | (720,160) | FIFO; capacity null | Preserve measurable doctor backlog without artificial admission rejection |
| doctor / Process / Doctor consultation | (1080,160) | 2 resources; uniform 10–14, mean 12; cost 3 each | Nominal 10/hour capacity against 12/hour offered arrivals |
| discharge / Sink / Patients discharged | (1440,160) | {} | End of modeled visit; unnecessary unconstrained treatment block removed |

Edges: arrivals→registration→waiting→doctor→discharge. Expected: doctor utilization/wait/backlog high, throughput constrained; no rejections. Measured baseline: doctor 98.17% utilization;57 generated,39 completed,0 rejected,18 remaining; mean completed-entity wait 40.52 min;9.75 completions/hour.

**Bank — who:** branch manager. **Question:** “Do more chairs solve the line?” **Insight:** buffer capacity and service capacity solve different problems.

| ID / type / name | Position | Configuration | Reason |
|---|---|---|---|
| arrivals / Source / Customer arrivals | (0,160) | exponential mean 2 | Nominal 30/hour peak demand |
| waiting / Queue / Lobby ·6 places | (360,160) | FIFO; capacity 6 | Deliberately finite waiting space exposes rejected demand |
| counter / Process / Teller service | (720,160) | 2 resources; uniform 5–7, mean 6; cost 1 each | Nominal 20/hour capacity, visibly below arrivals |
| exit / Sink / Customers served | (1080,160) | {} | Completed service |

Edges: arrivals→waiting→counter→exit. Expected: near-full utilization, queue saturation, rejections, remaining work. Measured: counter 99.94%;119 generated,79 completed,33 rejected,7 remaining; wait 13.63 min;19.75/hour. Shorter waiting alone is not evidence of better service when customers are rejected.

**Restaurant — who:** lunch-service manager. **Question:** “Should the next person take orders or prepare food?” **Insight:** a faster front counter does not remove a kitchen constraint.

| ID / type / name | Position | Configuration | Reason |
|---|---|---|---|
| arrivals / Source / Order arrivals | (0,160) | exponential mean 2.5 | Nominal 24 orders/hour |
| ordering / Process / Take order | (360,160) |1 resource; uniform.5–1.5, mean 1; cost 1 | Fast order entry, nominal 60/hour |
| waiting / Queue / Kitchen tickets | (720,160) | FIFO; capacity null | Explicit measurable backlog before kitchen |
| kitchen / Process / Prepare order | (1080,160) |1 resource; uniform 3–5, mean 4; cost 2 | Nominal 15/hour kitchen capacity |
| pickup / Sink / Orders collected | (1440,160) |{} | Pickup is outside the constrained preparation task |

Edges: arrivals→ordering→waiting→kitchen→pickup. Expected: kitchen utilization, wait and remaining orders increase; no queue rejection. Measured: kitchen 99.58%;99 generated,61 completed,0 rejected,38 remaining; wait 55.39 min;15.25/hour.

**Warehouse — who:** fulfillment planner. **Question:** “Why does faster picking fail to improve dispatch?” **Insight:** packing must be balanced with picking; transfer time is not a staffing resource.

| ID / type / name | Position | Configuration | Reason |
|---|---|---|---|
| arrivals / Source / Order release | (0,160) | exponential mean 3 | Nominal 20 orders/hour |
| picking / Process / Pick order | (360,160) |2 resources; uniform 3–5, mean 4; cost 1 each | Nominal 30/hour upstream capacity |
| waiting / Queue / Packing buffer | (720,160) |FIFO; capacity null | Measure accumulation at handoff |
| packing / Process / Pack order | (1080,160) |1 resource; uniform 4–6, mean 5; cost 1.5 | Nominal 12/hour bottleneck |
| dispatch / Delay / Dispatch transfer | (1440,160) |constant 2 | Unconstrained transfer time, not a conveyor capacity model |
| shipped / Sink / Orders dispatched | (1800,160) |{} | Completed dispatch |

Edges: arrivals→picking→waiting→packing→dispatch→shipped. Expected: packing near saturation, long buffer wait, limited completions, remaining work; zero rejected. Measured: packing 98.57%;80 generated,47 completed,0 rejected,33 remaining; wait 59.55 min;11.75/hour.

**Customer-service center — who:** support workforce planner. **Question:** “Why are general agents available while escalations accumulate?” **Insight:**35% escalation with long specialist service can overload one specialist.

| ID / type / name | Position | Configuration | Reason |
|---|---|---|---|
| arrivals / Source / Support requests |(0,160)|exponential mean 2.5|Nominal 24 requests/hour |
| agents / Process / Frontline support |(360,160)|2 resources; uniform 1–3, mean 2; cost 1 each|Short triage/handling, ample frontline capacity |
| routing / Decision / Needs specialist? |(720,160)|probability routing|Separate case resolution from escalation |
| waiting / Queue / Specialist backlog |(1080,48)|FIFO; capacity null|Explicit upstream queue evidence |
| specialist / Process / Specialist resolution |(1440,48)|1 resource; uniform 8–12, mean 10; cost 2.5|Offered 8.4 escalations/hour exceeds 6/hour capacity |
| resolved / Sink / Requests resolved |(1800,160)|{}|Both routes end in one resolution count |

Edges: arrivals→agents→routing; routing Yes(.35)→waiting→specialist→resolved; routing No(.65)→resolved. Expected: specialist saturation and backlog despite lower frontline utilization; aggregate waits dilute the specialist impact. Measured: specialist 99.16%;99 generated,88 completed,0 rejected,11 remaining; wait 16.80 min;22/hour.

### B5. Three ready-made scenarios per template

All numbers below are actual measurements of the unchanged engine at 240 min/seed 42. Waiting is the existing **completed-entity** summary average, not a new all-arrivals average. “Add one” is a separate snapshot, never an automatic edit to the baseline.

| Template / scenario | Exact change | Wait min | Completed / rejected / remaining | Interpretation |
|---|---|---:|---|---|
| Hospital baseline | doctors 2, registration 1 |40.52|39 /0 /18|Doctor constraint |
| Hospital +1 doctor | doctor resources 3 |8.36|52 /0 /5|Waiting/backlog fall; completion rises; ranking can shift to registration |
| Hospital +1 registration | registration resources 2, doctors 2 |40.35|38 /0 /19|No meaningful relief; finite-horizon timing can slightly change completions |
| Bank baseline | tellers 2, lobby 6 |13.63|79 /33 /7|Capacity and rejection pressure |
| Bank +1 teller | teller resources 3 |4.02|111 /5 /3|More completions, lower wait/rejections |
| Bank larger lobby | capacity 18, tellers 2 |38.96|79 /21 /19|Same throughput; fewer rejected, more waiting and unfinished work |
| Restaurant baseline | kitchen 1, order desk 1 |55.39|61 /0 /38|Kitchen constrained |
| Restaurant +1 cook | kitchen resources 2 |2.99|96 /0 /3|Substantially less backlog and waiting |
| Restaurant +1 order desk | ordering resources 2 |54.21|61 /0 /38|No throughput benefit |
| Warehouse baseline | picking 2, packing 1 |59.55|47 /0 /33|Packing constrained |
| Warehouse +1 packer | packing resources 2 |4.08|79 /0 /1|More dispatches, much less wait; constraint can shift upstream |
| Warehouse +1 picker | picking resources 3 |61.28|46 /0 /34|Extra upstream capacity does not clear packing |
| Service baseline | specialist 1, escalation.35 |16.80|88 /0 /11|Specialist overload |
| Service +1 specialist | specialist resources 2 |2.08|97 /0 /2|Wait/backlog fall; more completions |
| Service fewer escalations | routing Yes.15 / No.85 |1.90|99 /0 /0|Less specialist load **only if real frontline capability supports that routing** |

Expected utilization direction after a resource increase is usually downward for that node because the capacity denominator increases; do not label lower utilization intrinsically good. Results for other seeds or horizons can differ. The matching seed controls reproducibility; it does not prove statistical significance or identical random draws for every changed event schedule.

### B6. Optimization presets

Every preset varies only the existing `resource_count` parameter for one Process, step 1; uses metric `average_waiting_time`, operator`<=`,3 replications with seeds 42/43/44; and `cost_objective:"minimize_resource_cost"`. Costs are **arbitrary configured cost units per resource**, not currency, wages, a rate or a real budget estimate.

| Template | Variable / range | Target | Configured cost each | Measured best feasible tested count |
|---|---|---:|---:|---:|
| Hospital |doctor 2–4|≤10 min|3|3 |
| Bank |counter 2–4|≤5 min|1|4 |
| Restaurant |kitchen 1–3|≤5 min|2|2 |
| Warehouse |packing 1–3|≤6 min|1.5|2 |
| Customer service |specialist 1–3|≤6 min|2.5|2 |

Each tests 3 configurations×3 seeds=9 engine runs. Bank's three-teller mean is 4.86 min across seeds, but the candidate is infeasible because Astra checks the target on each replication, not just the mean. Four tellers are the least configured-cost feasible tested option. This is a useful demonstration of why one favorable run is insufficient.

Mandatory result copy: **“Limited to configurations tested. This recommendation uses the specified model, duration, seeds, target and configured costs; it does not guarantee real-world outcomes.”** Do not call this a global optimum.

### B7. Sanity checks and real-data validation

For every template:

- Exact run accounting: generated = completed + rejected + remaining. Values are integer counts at the horizon; queue occupancy excludes entities already in service.
- Throughput = completed ×60 /240, in completions per simulated hour. It is not completion rate; completion rate=completed/generated.
- Every Process utilization is between 0 and 1; display it as 0–100%. A Process's total busy resource time cannot exceed resources×duration.
- Queue lengths are nonnegative integers. Bank's maximum waiting queue is≤6 baseline and≤18 in the larger-lobby scenario; this does not count customers in teller service.
- Queue/Process wait averages refer to the engine's completed waits. Do not add correlated queue and resource wait averages. Remaining work must be inspected alongside average waiting.
- Replaying/resetting does not change event counts or generate another run. Seeds and duration remain unchanged across the three comparison snapshots.

| Template | Validate against real data |
|---|---|
| Hospital | Arrival pattern by time of day, consultation distribution, actual skill pools, shifts, triage priority and patients who leave. This model has no clinical acuity or emergency priority |
| Bank | Arrival bursts, service mix, teller specialization, lobby capacity interpretation and observed refusal/abandonment. The engine's queue rejection is not a patience-time model |
| Restaurant | Ticket mix, batch preparation, station sharing, parallel cooking and pickup behavior. One entity here is one order, not each dish |
| Warehouse | Pick/pack units, batch size, travel times, shared equipment, staffing shifts and actual transfer capacity. Delay alone does not constrain dispatch throughput |
| Customer service | Escalation fraction, specialist time, skill availability, routing accuracy and first-contact resolution. Never lower the routing probability without evidence that cases can be resolved correctly |

### B8. Template cards and first run

Use the actual canonical graph as the thumbnail; do not use stock photography to imply the graph's content. Preview 16:10, card 20 px radius, title 16/24 semibold, insight 14/21, metadata 12/18. Three columns desktop, two tablet, one mobile. Selection includes a radio/check mark, border and label. The sheet's primary action reads “Use this template.” Runtime copy is “Engine: <0.1 s locally”; this is an estimate from local engine timing, excludes API/database/browser overhead and is not a guaranteed remote response time.

| Title | One-line insight | Blocks | Tags |
|---|---|---:|---|
| Hospital |Registration looks busy. Doctor capacity drives the waiting room.|5|Healthcare · resource constraint |
| Bank |More lobby space reduces rejections, but does not add service capacity.|4|Service operations · finite buffer |
| Restaurant |A faster order desk cannot clear a constrained kitchen.|5|Food service · serial stages |
| Warehouse |Balance packing with picking before releasing more work.|6|Fulfillment · capacity balance · delay |
| Customer-service center |A small escalation stream can overwhelm one specialist.|6|Support · probability routing |

Three tips maximum:1 “Run the 240-minute baseline with seed 42. Look for the waiting line.”2 “Open Insights. Compare utilization with resource wait and upstream queue evidence.”3 “Save a baseline scenario, add one resource at the bottleneck, then run with the same settings.” Tips are dismissible, not blocking coach marks, and do not run or modify the model.

### B9. Machine-readable output

The exact schema is `{id,name,simulation:{duration,seed},nodes:[{id,type,name,config,position:{x,y}}],edges:[{id,source,target,sourceHandle?,probability?}]}`. Extra fields are forbidden by the existing model schema. Teaching notes, tags and presets therefore live outside the model, not as invented schema properties.

All five complete baseline JSON documents are reproduced in the appendix and installed in the existing backend template catalogue. Each template directory contains three complete canonical models and a complete OptimizationRequest, ready to use with the existing API. `template-verification.json` contains measured summaries, all per-node metrics, runtimes and search outcomes. `backend/scripts/verify_templates.py` regenerates that evidence.

## C. QA checklist and release evidence

### Verified

- [x] All five baselines validate with Astra's existing executable-model validator and run through the unchanged engine.
- [x] All fifteen scenario models use duration 240 and seed 42; every baseline identifies its engineered bottleneck.
- [x] Added-resource scenarios reduce completed-entity average waiting and increase completed counts for all five demonstrations at the default seed.
- [x] The finite-lobby alternative shows equal completions with fewer rejections and higher waiting/backlog.
- [x] All five optimization requests run 9 simulations; every recommendation is one of the tested feasible candidates.
- [x] Conservation and utilization bounds are tested; existing reproducibility/event-derived metric tests remain passing.
- [x] 37 frontend tests pass, including worst-case black/white underlay Regular glass text contrast in light/dark, action contrast and chart/control-boundary contrast.
- [x] 249 backend tests pass with local PostgreSQL, including immutable version reads and cross-account denial.
- [x] Frontend TypeScript and ESLint pass; production build verified.
- [x] Desktop playback and run dialog inspected in the browser; light-mode results inspected; mobile 390×844 overflow checked and transport overlap corrected.
- [x] Run dialog Escape/cancel restores focus to Run; native inputs and slider expose accessible names; exact timeline end reconciles 79 completions,33 rejections and 7 remaining in Bank.
- [x] Nodes are opaque and have `backdrop-filter:none` in computed browser styles.

### Required broader release checks — not represented as completed

- [ ] Full end-to-end screen-reader exercise with VoiceOver and NVDA, including keyboard creation, connection, deletion and error-to-node focus.
- [ ] Every screen at 320,390,768,1024,1440 and 1920 px;200% browser zoom; long translated labels and long saved names.
- [ ] Full OS Reduce Transparency / Increase Contrast / Reduce Motion and Windows forced-colors sweep across Safari, Chrome and Firefox. CSS and local preference fallbacks are implemented; exhaustive cross-browser verification is not claimed.
- [ ] Record frame times and GPU/compositing cost on a midrange device with 1,000-node and 5,000-node models. Bounded playback unit tests do not establish a 60 FPS claim.
- [ ] Inspect Clear material over actual rich media before shipping any use; it is intentionally unused on analytical screens.
- [ ] Verify production deployment configuration and migration state in the target environment. No deployment was performed.

### Pixel-perfection acceptance checklist

- [ ] Shared baselines: header labels, icon centers, field labels and numeric units align on the 4 px grid.
- [ ] No mismatched outer/inner corners;28−12=16 and 20−8=12 where surfaces nest.
- [ ] No chart, data table, node, connector label or metric card acquires a filter through a later selector.
- [ ] No glass panel sits over another live blur layer; transient overlays replace the underlying material pass.
- [ ] Focus rings remain visible outside clipped cards; no focus target is hidden by sticky bars.
- [ ] All actions have 44 px hit regions; small visible port glyphs retain an equivalent keyboard action.
- [ ] No accidental layout jump from a selected border; active state uses inset stroke or reserved space.
- [ ] Numbers use tabular figures; units stay beside values; unavailable values never appear as zero.
- [ ] Every graphic has labels or a table; utilization and bottleneck meaning survive monochrome viewing.
- [ ] Scrubbing never mutates saved metrics; partial work at the horizon remains visible.
- [ ] No growth in filter count as node count increases; no blur-radius or full-canvas displacement animation.
- [ ] “Draft,” “read-only,” “settings mismatch,” and “limited to configurations tested” remain unambiguous in both themes.

Repository-wide Python lint also reports six pre-existing unused-import/redefinition findings in `health.py` and `test_e2e_workflow.py`; changed Python files are linted separately. A pre-existing Starlette/httpx deprecation warning remains in backend tests. Neither is presented as a clean repository-wide lint result.

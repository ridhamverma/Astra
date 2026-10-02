# Deterministic bottleneck analysis

Astra ranks Process stages from actual utilization, resource waiting, and directly
upstream Queue measurements. No LLM, network service, API key, or additional
simulation is used. Call `analyze_bottlenecks(model, node_metrics)` directly from
Python, or inspect `simulate(model).bottleneck_analysis`.

## Method: utilization_pressure_v1

For each Process:

- `U`: measured busy resource time / (resources × simulation duration).
- `W`: measured average resource waiting time from Process metrics.
- `S`: measured average completed service duration. If no completed service is
  available, use the canonical configured mean service time as a **reference**,
  explicitly labeled `configured`; this is not presented as a measurement.
- `Q`: sum of time-weighted average queue lengths of Queues directly feeding
  this Process.
- `R`: measured/configured resource count.
- `L`: rejected entities / total arrivals across those directly feeding Queues.

```
wait_pressure  = W / (W + S)
queue_pressure = Q / (Q + R)
pressure       = max(wait_pressure, queue_pressure, L)
score          = U × pressure
```

Unavailable pressure signals contribute no positive evidence; their raw evidence
stays null rather than becoming a fabricated measurement. Utilization is clamped
to [0, 1] to guard floating-point round-off. Scores are calculated at full precision
and formatted only for display.

### Why these scales and combination?

This first method deliberately avoids arbitrary fitted weights and normalization
by the busiest peer. A Process should not score differently just because an idle
stage is added elsewhere in the graph.

`W/(W+S)` compares time lost waiting with time spent receiving service. One service
duration of waiting gives pressure 0.5. `Q/(Q+R)` compares sustained backlog with
available resource slots; one waiting entity per resource also gives pressure
0.5. Both are dimensionless, monotonically increasing, bounded signals with
operationally understandable scales. Rejection fraction captures finite-capacity
loss, including zero-capacity queues where no waiting queue can accumulate.

Taking the **maximum** keeps the strongest observed congestion signal. Adding
Queue wait to Process wait would count the same resource wait twice; combining
all these correlated signals additively would also inflate the score. Multiplying
by utilization requires congestion and busy capacity to corroborate one another.
An 81% busy stage with no waits, backlog, or rejections therefore has score zero.

These choices are an explicit, explainable engineering heuristic. They are not
empirically calibrated weights or a probability that a stage is the true cause.
Any positive top score yields a **candidate**, with no arbitrary overload threshold.
A small score means weak evidence, even when it ranks first. The panel reports the
score and raw measurements so the user can assess that distinction.

## Attribution and evidence

Only `Queue → Process` edges contribute upstream Queue evidence. That matches
Astra's engine: such a Queue waits while acquiring its downstream Process resource.
A Queue connected through a Delay, Decision, or another Process is not attributed
to every descendant. The current engine does not model downstream blocking that
holds an upstream Process resource; unrestricted ancestor aggregation would blame
stages that did not cause that queue's wait.

Process mean/max resource waits already include requests made from directly
feeding Queues as well as direct Process entries. They are the primary waiting
signal; queue waiting averages are also reported separately for explanation.

For multiple feeding Queues, their time-weighted average lengths can be summed
because their waiting entities are disjoint. The reported **maximum queue length**
is the largest individual recorded queue peak. Individual peaks are not summed:
without synchronized observations that would invent a simultaneous combined peak.
The detailed evidence names each Queue and includes its mean/max waiting,
time-weighted mean length, peak, horizon backlog, rejection count, and arrivals.

Maximum waiting and queue length are shown as burst evidence, but do not increase
the score by themselves. A single extreme observation should not dominate sustained
averages. Waiting averages exclude unfinished waits; queue averages and
`waiting_at_end` still capture long waits continuing through the horizon. Without
an explicit Queue, pending Process requests have no separate persisted queue-length
metric, so an entirely unfinished resource-wait population can be underdetected.
Use an explicit upstream Queue when that evidence matters.

## Stable output and empty outcomes

Ranks sort by descending score, then utilization, then mean resource wait, and
finally ascending stable node ID. The same canonical graph and metrics always
produce identical results, regardless of node, edge, or metric-map iteration order.
No random draw or wall-clock time is used.

The result includes `primaryBottleneck`, `score`, `reasons`, `ranked`, `notes`, and
the method version. `primaryBottleneck` is null for:

- `no_congestion`: ranked Process stages have no positive corroborating congestion.
- `insufficient_data`: metrics are absent/incomplete and no candidate is supported.
- `not_applicable`: the graph has no Process stages.

Missing metrics produce explicit notes. Idle and uncongested stages remain in the
ranking with zero scores, but are never forced into a primary bottleneck label.

## API, history, and frontend

Standalone `/api/v1/simulations/run` results contain `bottleneckAnalysis`.
Project/scenario run and history responses contain `bottleneck_analysis` (with
`primaryBottleneck` inside). Saved runs are analyzed from their immutable model
version and compact measured metrics, including runs saved before Phase 13.
No database migration, stored event log, or simulation rerun is needed.

The Analytics view contains **Bottleneck Analysis**, numerical evidence, ranked
Processes, reasons, and expandable scoring details. **View on canvas** selects
and focuses the primary Process. The builder highlights it only when the canvas
is clean and its model version matches the analyzed run. Editing the model removes
the highlight and disables the focus action until a matching run is available.
Playback highlights the immutable run's primary Process regardless of later editor
changes. Highlight flags are presentation data and are excluded by the canonical
model serializer.

## Verification

- `cd backend && .venv/bin/python -m pytest -q`
- `cd frontend && npm test && npm run typecheck && npm run build`

Tests cover manually calculated scores, no double counting, real congestion and
resource improvement, finite-queue rejection, unfinished-service fallback,
direct Process waits, missing metrics, idle/no-Process models, attribution boundaries,
multi-queue aggregation, exact ties, order invariance, time scaling, outlier peaks,
API equivalence, and saved-version history analysis without rerunning the engine.
The frontend serializer test checks that highlighting cannot alter the domain model.

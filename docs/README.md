# Architecture and model contract

The intended boundary is: the Next.js interface calls FastAPI; FastAPI validates requests and delegates to independent domain modules; PostgreSQL stores durable project data. The simulation engine is callable without an HTTP server. AI and optimization are later phases and will consume validated models and measured simulation results.

## One model for every component

`backend/app/schemas/simulation.py` is the runtime source of truth for Astra's model JSON. `frontend/types/simulation.ts` mirrors its wire shape for the visual editor. `simulation-model.schema.json` is generated from Pydantic for external consumers and AI structured output; regenerate it from `backend/` with:

```bash
.venv/bin/python -m scripts.export_simulation_schema
```

The generated JSON Schema describes fields and node variants. Cross-field and graph rules, such as uniform bounds and Decision probability totals, are enforced by Pydantic when a complete model is validated.

The examples in `examples/` are valid instances of this same format. Coordinates in `position` are canvas coordinates. All simulation times use one model-defined unit, such as minutes; every timing field in a model must use that same unit. Duration is strictly positive and seed is an integer.

Node `type` values are exactly `source`, `queue`, `process`, `decision`, `delay`, and `sink`. Their `config` objects are specific to each type. Source, Process, and Delay support `constant`, `exponential`, and `uniform` timing. Uniform timing requires explicit minimum and maximum values; the supplied mean must equal their midpoint. Other distributions must omit bounds. Time means must be positive; a uniform minimum may be zero. A Queue capacity of `null` means unlimited, while `0` means no waiting space. Only `fifo` is supported. Costs are nonnegative.

Every edge has `id`, `source`, and `target`. Outgoing Decision edges also have `probability` values in `[0, 1]` totaling 1 within `0.000001`. Other edges must omit probability. Decisions require at least two outgoing routes. Other nodes may have at most one outgoing edge, and Sinks have none. Node and edge IDs share one namespace and must be unique. Edges must refer to existing nodes; each model needs at least one Source and one Sink.

Schema validation permits unfinished disconnected graphs during editing; it does not claim that a simulation can execute every accepted graph. The engine adds execution checks for cycles and paths that end before a Sink.

## Execution rules

`app.simulation.simulate(model)` accepts the canonical Pydantic model or equivalent JSON data. It traverses outgoing edges for any acyclic model with executable paths to Sinks. A preflight check raises `CyclicModelError` for cycles and `UnsupportedModelError` for dead ends or incoming Source edges. The versioned API invokes this same standalone function for `/run`.

Each Source creates its first entity at simulated time 0. Each later arrival follows a sampled interarrival interval. SimPy's clock jumps between arrivals, resource grants, service completions, and delays. The simulation horizon is exclusive: an event scheduled exactly at `duration` is not processed. Entities already in service or waiting at that horizon remain active. Separate random streams derived from the model seed govern arrivals, service, Decision routing, and delays; this makes repeated runs reproducible and keeps arrival draws stable when service settings change.

An explicit Queue before a Process holds entities until that Process grants a resource. SimPy resource requests preserve FIFO order. Queue capacity counts waiting spots, so an entity may pass through a zero-capacity Queue if a resource is immediately free. If all waiting spots are full, the entity is rejected at that Queue and receives a `queue_rejected` event. A Queue connected to a non-Process node passes entities through immediately because there is no resource to wait for. Process nodes can run up to their configured resource count concurrently. Delay nodes hold entities without reserving a Process resource. Decision nodes use the probabilities on their outgoing edges. Sink nodes complete entities.

The event log records `entity_created`, `node_enter`, `queue_enter`, `queue_wait_started`, `queue_exit`, `queue_rejected`, `service_requested`, `service_started`, `service_completed`, `node_exit`, and `entity_completed`, with time, entity ID, and node ID for each event. The result includes completed, rejected, and still-active entities. Queue waiting time covers entities that exited the Queue; pending waits are excluded from its wait average. Process waiting time covers entities that started service and includes time spent in an immediately preceding Queue. Process service time covers completed services only. Busy resource time includes service performed up to the horizon, even for services still active at that point.

The engine caps a run at 10,000 generated entities or 200,000 logged events and raises `SimulationLimitError` if either bound is exceeded. This prevents accidental runaway runs from extremely short interarrival intervals or long paths.

## Metric formulas and result shape

`app/simulation/metrics.py` derives the result from event timestamps. `app/simulation/results.py` defines its Pydantic wire schema, and `simulation-result.schema.json` is generated from that schema with `.venv/bin/python -m scripts.export_result_schema` from `backend/`. All model times are **simulated minutes**. The result uses `simulationId`, `summary`, `nodeMetrics`, `timeSeries`, `events`, and `entities`. `simulationId` is a stable fingerprint of the complete model, so identical seeded models produce identical IDs and results.

- **Completion rate:** completed entities / generated entities. It is a ratio from 0 to 1.
- **Cycle time:** completion time − creation time, for completed entities. The summary reports its average and maximum.
- **System waiting time:** for each completed entity, sum the Queue waits and any direct Process resource waits on its path. A Queue feeding a Process and that Process's request represent one wait and are counted once. The summary reports the average and maximum across completed entities; unfinished entities are excluded.
- **Throughput (`summary.throughput`), per simulated hour:** completed entities × 60 / simulation duration in minutes.
- **Queue waiting time:** queue exit time − queue entry time, for entities that left the Queue. The maximum uses the same completed waits.
- **Time-weighted average Queue length:** area under the waiting-count step function / full simulation duration. Each interval contributes its current waiting count × elapsed time. Rejected entities and entities admitted directly to a free Process do not occupy a waiting spot.
- **Average Process service time:** average of service completion time − service start time, for completed services.
- **Total busy resource time:** sum of completed service intervals plus the elapsed portion of every service still active at the horizon.
- **Resource utilization:** total busy resource time / (resource count × full simulation duration).

The Queue series in `timeSeries.queue_lengths` records waiting count changes and the final horizon count. `timeSeries.cumulative_completed` records completion steps and the final count. Both include a zero baseline at time 0. These are event-derived series with one final value per timestamp, suitable for step charts. Project run history stores these lightweight series with summary and node metrics, but does not store event logs. `nodeMetrics` currently contains entries for Queue and Process nodes; system completion is in `summary`.

## Simulation API

`POST /api/v1/simulations/validate` checks the model and executable graph without running it. It returns `valid` and a list of issues with `code`, `path`, and `message`. `POST /api/v1/simulations/run` executes the standalone engine and returns its result. Run errors use an `error` object with a code, message, and issue details. The codes are `invalid_graph`, `invalid_configuration`, `unsupported_input`, `failed_simulation`, and `internal_server_error`. Malformed JSON and unsupported input return HTTP 400; invalid models and known simulation-limit failures return HTTP 422; unexpected server failures return a sanitized HTTP 500 response.

The API allows at most 100 nodes, 300 edges, 10,080 simulated minutes, and 100 resources per Process. An explicit Source entity cap cannot exceed 10,000. The engine also stops a run after 10,000 generated entities or 200,000 logged events. These bounds prevent accidental runaway requests while leaving the engine callable directly from Python. Raw stack traces stay in server logs and are never sent in API responses.

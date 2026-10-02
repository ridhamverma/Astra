# Simulation playback

Run a model, then open **Playback**. Play, Pause, and Reset reuse the completed
run's event timeline. Speeds are 1×, 5×, 10×, and 20×; 1× advances one simulated
minute per real second. Switching workspace views or hiding the browser tab pauses
playback. Reset clears the playback clock, cursor, and occupancy, retaining the
run and selected speed. The simulation results never change during playback.

## Data flow

The frontend requests `include_timeline: true` when creating a project run.
The response includes the exact saved canonical model version and its ordered
events. Existing history endpoints continue returning compact analytics. Events
are not stored in PostgreSQL; a page reload requires a new run to prepare playback.
No playback control calls the backend. The SimPy engine is unchanged.

`TimelinePlayer` advances a forward event cursor, preserving order for events with
equal timestamps. Active entities and node occupancy are updated incrementally.
Completion and rejection remove an entity from active state. Downstream service
requests made from a Queue leave the entity located in that Queue until its
Process entry event. Queue counts represent waiting entities, and Process counts
separate waiting from service.

Instant graph connections have identical exit/entry timestamps. A short 0.4-minute
presentation interpolation follows their connected route. This is a visual cue,
not modeled travel time: occupancy, clock, analytics, and backend events retain
their original values. Delay and service durations come from the recorded events.

## Performance

Each frame consumes at most 4,000 events. When it falls behind, subsequent frames
catch up before reporting the target clock time. Rendering is limited to 80 active
markers plus 80 recent transfer markers. Node counts include all entities even
when individual markers are omitted. Completed/rejected entities are removed
from active memory. Elapsed wall time is capped after browser suspension, and
animation frames are cancelled when paused, hidden, or unmounted.

## Verification

- `cd frontend && npm run test:playback`
- `cd frontend && npm run typecheck && npm run build`
- `cd backend && .venv/bin/python -m pytest -q`

Tests cover equal-time ordering, Queue/Process occupancy, rejection, reset,
unchanged input events, equivalent replay across speeds, and 20,000 simultaneous
entities with bounded consumption and markers. A PostgreSQL API test compares
transient playback events to direct simulation and verifies the exact requested
model version while history remains compact.

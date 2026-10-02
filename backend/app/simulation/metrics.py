"""Metrics derived from the event timeline produced by the SimPy engine."""

from dataclasses import dataclass, field
from hashlib import sha256

from app.simulation.bottlenecks import analyze_bottlenecks
from app.schemas.simulation import ProcessNode, QueueNode, SimulationModel
from app.simulation.results import (
    Entity,
    ProcessMetrics,
    QueueMetrics,
    SimulationEvent,
    SimulationResult,
    SimulationSummary,
    SimulationTimeSeries,
    TimeSeriesPoint,
)


def _average(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _record_step(points: list[TimeSeriesPoint], time: float, value: int) -> None:
    """Keep one final value per event time, plus the initial zero baseline."""
    if len(points) > 1 and points[-1].time == time:
        points[-1].value = value
    else:
        points.append(TimeSeriesPoint(time=time, value=value))


@dataclass
class _QueueTrace:
    entered_at: dict[str, float] = field(default_factory=dict)
    waiting: set[str] = field(default_factory=set)
    waits: list[float] = field(default_factory=list)
    arrivals: int = 0
    exited: int = 0
    rejected: int = 0
    maximum_length: int = 0
    area: float = 0.0
    last_time: float = 0.0
    points: list[TimeSeriesPoint] = field(default_factory=lambda: [TimeSeriesPoint(time=0, value=0)])

    def advance(self, time: float) -> None:
        # Queue length is a step function. Its time-weighted area is the sum of
        # length * elapsed time between consecutive changes.
        self.area += len(self.waiting) * (time - self.last_time)
        self.last_time = time

    def change_length(self, time: float) -> None:
        self.maximum_length = max(self.maximum_length, len(self.waiting))
        _record_step(self.points, time, len(self.waiting))


@dataclass
class _ProcessTrace:
    requested_at: dict[str, float] = field(default_factory=dict)
    active_since: dict[str, float] = field(default_factory=dict)
    waits: list[float] = field(default_factory=list)
    service_times: list[float] = field(default_factory=list)
    services_started: int = 0
    completed_busy_time: float = 0.0


def build_result(
    model: SimulationModel,
    events: list[SimulationEvent],
    entities: list[Entity],
) -> SimulationResult:
    """Calculate the result from actual event timestamps and the model horizon.

    All model times are simulated minutes. Throughput is completions / (minutes / 60).
    Waiting and service averages include only finished waits/services. Busy time
    includes the observed portion of services still active at the horizon.
    """
    duration = model.simulation.duration
    queues = {node.id: _QueueTrace() for node in model.nodes if isinstance(node, QueueNode)}
    processes = {node.id: _ProcessTrace() for node in model.nodes if isinstance(node, ProcessNode)}
    queue_to_process = {edge.source: edge.target for edge in model.edges if edge.source in queues and edge.target in processes}
    queued_requests: set[tuple[str, str]] = set()
    created_at: dict[str, float] = {}
    cycle_times: list[float] = []
    entity_waits: dict[str, float] = {}
    completed_waits: list[float] = []
    completed = 0
    rejected = 0
    completion_points = [TimeSeriesPoint(time=0, value=0)]

    for event in events:
        entity_id = event.entity_id
        node_id = event.node_id
        time = event.time

        if event.type == "entity_created":
            created_at[entity_id] = time
        elif event.type == "entity_completed":
            completed += 1
            cycle_times.append(time - created_at[entity_id])
            completed_waits.append(entity_waits.get(entity_id, 0.0))
            _record_step(completion_points, time, completed)
        elif event.type == "queue_enter":
            queue = queues[node_id]
            queue.arrivals += 1
            queue.entered_at[entity_id] = time
        elif event.type == "queue_wait_started":
            queue = queues[node_id]
            queue.advance(time)
            queue.waiting.add(entity_id)
            queue.change_length(time)
        elif event.type == "queue_exit":
            queue = queues[node_id]
            if entity_id in queue.waiting:
                queue.advance(time)
                queue.waiting.remove(entity_id)
                queue.change_length(time)
            queue.exited += 1
            wait = time - queue.entered_at.pop(entity_id)
            queue.waits.append(wait)
            entity_waits[entity_id] = entity_waits.get(entity_id, 0.0) + wait
            if node_id in queue_to_process:
                queued_requests.add((entity_id, queue_to_process[node_id]))
        elif event.type == "queue_rejected":
            queue = queues[node_id]
            queue.rejected += 1
            rejected += 1
            queue.entered_at.pop(entity_id)
        elif event.type == "service_requested":
            processes[node_id].requested_at[entity_id] = time
        elif event.type == "service_started":
            process = processes[node_id]
            process.services_started += 1
            wait = time - process.requested_at.pop(entity_id)
            process.waits.append(wait)
            # A Queue immediately before this Process already counted the same
            # resource wait; direct Process requests still count here.
            if (entity_id, node_id) not in queued_requests:
                entity_waits[entity_id] = entity_waits.get(entity_id, 0.0) + wait
            queued_requests.discard((entity_id, node_id))
            process.active_since[entity_id] = time
        elif event.type == "service_completed":
            process = processes[node_id]
            service_time = time - process.active_since.pop(entity_id)
            process.service_times.append(service_time)
            process.completed_busy_time += service_time

    node_metrics: dict[str, ProcessMetrics | QueueMetrics] = {}
    queue_points: dict[str, list[TimeSeriesPoint]] = {}
    for node in model.nodes:
        if isinstance(node, QueueNode):
            queue = queues[node.id]
            queue.advance(duration)
            _record_step(queue.points, duration, len(queue.waiting))
            queue_points[node.id] = queue.points
            node_metrics[node.id] = QueueMetrics(
                total_arrivals=queue.arrivals,
                total_exited=queue.exited,
                rejected_entities=queue.rejected,
                average_waiting_time=_average(queue.waits),
                maximum_waiting_time=max(queue.waits) if queue.waits else None,
                average_queue_length=queue.area / duration,
                maximum_queue_length=queue.maximum_length,
                waiting_at_end=len(queue.waiting),
            )
        elif isinstance(node, ProcessNode):
            process = processes[node.id]
            busy_time = process.completed_busy_time + sum(
                duration - start for start in process.active_since.values()
            )
            node_metrics[node.id] = ProcessMetrics(
                resource_count=node.config.resource_count,
                services_started=process.services_started,
                entities_processed=len(process.service_times),
                total_busy_resource_time=busy_time,
                # Utilization uses all configured servers and the full horizon.
                resource_utilization=busy_time / (node.config.resource_count * duration),
                average_service_time=_average(process.service_times),
                average_waiting_time=_average(process.waits),
                maximum_waiting_time=max(process.waits) if process.waits else None,
            )

    _record_step(completion_points, duration, completed)
    run_hash = sha256(model.model_dump_json().encode()).hexdigest()[:16]
    return SimulationResult(
        simulation_id=f"{model.id}-{run_hash}",
        summary=SimulationSummary(
            total_generated=len(created_at),
            total_completed=completed,
            total_rejected=rejected,
            in_system_at_end=len(created_at) - completed - rejected,
            completion_rate=completed / len(created_at) if created_at else 0.0,
            average_cycle_time=_average(cycle_times),
            maximum_cycle_time=max(cycle_times) if cycle_times else None,
            # Sum all completed queue and resource waits for each completed entity.
            # Unfinished entities are excluded, as with cycle time.
            average_waiting_time=_average(completed_waits),
            maximum_waiting_time=max(completed_waits) if completed_waits else None,
            throughput=completed * 60 / duration,
        ),
        node_metrics=node_metrics,
        time_series=SimulationTimeSeries(
            queue_lengths=queue_points,
            cumulative_completed=completion_points,
        ),
        events=events,
        entities=entities,
        bottleneck_analysis=analyze_bottlenecks(model, node_metrics),
    )

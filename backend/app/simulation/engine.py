"""Standalone SimPy engine for acyclic Astra process graphs."""

from collections import defaultdict, deque
from random import Random
from time import monotonic
from typing import Any

import simpy

from app.schemas.simulation import (
    DecisionNode,
    DelayNode,
    Edge,
    ProcessNode,
    QueueNode,
    SimulationModel,
    SimulationNode,
    SinkNode,
    SourceNode,
)
from app.simulation.distributions import sample_duration
from app.simulation.metrics import build_result
from app.simulation.results import Entity, EventType, SimulationEvent, SimulationResult

MAX_ENTITIES_PER_RUN = 10_000
MAX_EVENTS_PER_RUN = 200_000
MAX_RUN_SECONDS = 10


class UnsupportedModelError(ValueError):
    """A valid Astra graph lacks a route needed for execution."""


class CyclicModelError(ValueError):
    """A graph contains a cycle, which this engine cannot execute."""


class SimulationLimitError(RuntimeError):
    """A run exceeded a safety limit on generated entities or events."""


def _compile_graph(model: SimulationModel) -> tuple[dict[str, SimulationNode], dict[str, list[Edge]]]:
    nodes = {node.id: node for node in model.nodes}
    outgoing: dict[str, list[Edge]] = defaultdict(list)
    indegree = {node.id: 0 for node in model.nodes}
    for edge in model.edges:
        outgoing[edge.source].append(edge)
        indegree[edge.target] += 1

    ready = deque(node_id for node_id, count in indegree.items() if count == 0)
    visited = 0
    while ready:
        node_id = ready.popleft()
        visited += 1
        for edge in outgoing[node_id]:
            indegree[edge.target] -= 1
            if indegree[edge.target] == 0:
                ready.append(edge.target)
    if visited != len(nodes):
        raise CyclicModelError("cycle detected in simulation graph; cyclic models are not supported")

    for node in model.nodes:
        if isinstance(node, SourceNode) and any(edge.target == node.id for edge in model.edges):
            raise UnsupportedModelError(f"Source node '{node.id}' cannot have incoming edges")
        if not isinstance(node, SinkNode) and not outgoing[node.id]:
            raise UnsupportedModelError(f"node '{node.id}' has no outgoing path to a Sink")
    reachable = set()
    pending = [node.id for node in model.nodes if isinstance(node, SourceNode)]
    while pending:
        node_id = pending.pop()
        if node_id in reachable:
            continue
        reachable.add(node_id)
        pending.extend(edge.target for edge in outgoing[node_id])
    unreachable = sorted(set(nodes) - reachable)
    if unreachable:
        raise UnsupportedModelError("nodes disconnected from every Source: " + ", ".join(unreachable))
    return nodes, outgoing


def validate_executable_model(model: SimulationModel | dict[str, Any]) -> SimulationModel:
    """Validate the canonical schema and graph execution rules without running it."""
    parsed = SimulationModel.model_validate(model)
    _compile_graph(parsed)
    return parsed


def simulate(model: SimulationModel | dict[str, Any]) -> SimulationResult:
    """Execute an acyclic canonical model without starting FastAPI.

    Sources create their first entity at time 0. The duration boundary is
    exclusive, so events scheduled exactly at duration are not processed.
    """
    started = monotonic()
    parsed = validate_executable_model(model)
    nodes, outgoing = _compile_graph(parsed)
    env = simpy.Environment()
    seed_stream = Random(parsed.simulation.seed)
    arrival_rng = Random(seed_stream.getrandbits(64))
    service_rng = Random(seed_stream.getrandbits(64))
    routing_rng = Random(seed_stream.getrandbits(64))
    delay_rng = Random(seed_stream.getrandbits(64))

    processes = {
        node.id: simpy.Resource(env, capacity=node.config.resource_count)
        for node in parsed.nodes
        if isinstance(node, ProcessNode)
    }
    queue_waiting = {node.id: 0 for node in parsed.nodes if isinstance(node, QueueNode)}
    entities: list[Entity] = []
    events: list[SimulationEvent] = []

    def log(event_type: EventType, entity: Entity, node_id: str) -> None:
        if len(events) % 1024 == 0 and monotonic() - started > MAX_RUN_SECONDS:
            raise SimulationLimitError(f"simulation exceeded {MAX_RUN_SECONDS} seconds of execution time")
        if len(events) >= MAX_EVENTS_PER_RUN:
            raise SimulationLimitError(f"simulation exceeded {MAX_EVENTS_PER_RUN} logged events")
        events.append(SimulationEvent(time=env.now, type=event_type, entity_id=entity.id, node_id=node_id))

    def next_node(node_id: str) -> str:
        return outgoing[node_id][0].target

    def choose_route(node_id: str) -> str:
        draw = routing_rng.random()
        cumulative = 0.0
        routes = outgoing[node_id]
        for edge in routes:
            cumulative += edge.probability or 0.0
            if draw < cumulative:
                return edge.target
        return routes[-1].target  # Handles the allowed probability-sum tolerance.

    def traverse(entity: Entity, first_node_id: str):
        node_id = first_node_id
        reserved: tuple[str, simpy.resources.resource.Request] | None = None

        while True:
            node = nodes[node_id]
            entity.current_node = node_id
            log("node_enter", entity, node_id)

            if isinstance(node, SourceNode):
                log("node_exit", entity, node_id)
                node_id = next_node(node_id)

            elif isinstance(node, QueueNode):
                log("queue_enter", entity, node_id)
                target_id = next_node(node_id)
                target = nodes[target_id]

                if isinstance(target, ProcessNode):
                    request = processes[target_id].request()
                    waiting = not request.triggered
                    if waiting:
                        if node.config.capacity is not None and queue_waiting[node_id] >= node.config.capacity:
                            request.cancel()
                            entity.rejected_at = env.now
                            entity.status = "rejected"
                            log("queue_rejected", entity, node_id)
                            log("node_exit", entity, node_id)
                            return
                        queue_waiting[node_id] += 1
                        log("queue_wait_started", entity, node_id)
                    log("service_requested", entity, target_id)
                    yield request
                    if waiting:
                        queue_waiting[node_id] -= 1
                    reserved = (target_id, request)

                log("queue_exit", entity, node_id)
                log("node_exit", entity, node_id)
                node_id = target_id

            elif isinstance(node, ProcessNode):
                if reserved is not None:
                    reserved_id, request = reserved
                    if reserved_id != node_id:
                        raise RuntimeError("reserved resource does not match the next Process")
                    reserved = None
                else:
                    log("service_requested", entity, node_id)
                    request = processes[node_id].request()
                    yield request

                log("service_started", entity, node_id)
                duration = sample_duration(
                    service_rng,
                    node.config.service_distribution,
                    node.config.mean_service_time,
                    node.config.minimum_service_time,
                    node.config.maximum_service_time,
                )
                yield env.timeout(duration)
                log("service_completed", entity, node_id)
                processes[node_id].release(request)
                log("node_exit", entity, node_id)
                node_id = next_node(node_id)

            elif isinstance(node, DecisionNode):
                target_id = choose_route(node_id)
                log("node_exit", entity, node_id)
                node_id = target_id

            elif isinstance(node, DelayNode):
                delay = sample_duration(
                    delay_rng,
                    node.config.distribution,
                    node.config.mean_delay,
                    node.config.minimum_delay,
                    node.config.maximum_delay,
                )
                yield env.timeout(delay)
                log("node_exit", entity, node_id)
                node_id = next_node(node_id)

            elif isinstance(node, SinkNode):
                log("node_exit", entity, node_id)
                entity.completed_at = env.now
                entity.status = "completed"
                log("entity_completed", entity, node_id)
                return

    def generate(source: SourceNode):
        created_here = 0
        while env.now < parsed.simulation.duration:
            if source.config.max_entities is not None and created_here >= source.config.max_entities:
                break
            if len(entities) >= MAX_ENTITIES_PER_RUN:
                raise SimulationLimitError(f"simulation exceeded {MAX_ENTITIES_PER_RUN} generated entities")
            entity = Entity(id=f"entity-{len(entities) + 1}", created_at=env.now, current_node=source.id)
            entities.append(entity)
            created_here += 1
            log("entity_created", entity, source.id)
            env.process(traverse(entity, source.id))
            interval = sample_duration(
                arrival_rng,
                source.config.distribution,
                source.config.mean_interarrival_time,
                source.config.minimum_interarrival_time,
                source.config.maximum_interarrival_time,
            )
            yield env.timeout(max(interval, 1e-9))

    for node in parsed.nodes:
        if isinstance(node, SourceNode):
            env.process(generate(node))
    env.run(until=parsed.simulation.duration)

    result = build_result(parsed, events, entities)
    if monotonic() - started > MAX_RUN_SECONDS:
        raise SimulationLimitError(f"simulation exceeded {MAX_RUN_SECONDS} seconds of execution time")
    return result

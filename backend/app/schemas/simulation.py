"""Canonical JSON model for Astra process-flow simulations.

This module validates model data only. It does not execute a simulation.
"""

from collections import Counter, defaultdict
from math import isclose
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, PositiveInt, model_validator


PositiveTime: TypeAlias = Annotated[FiniteFloat, Field(gt=0)]
NonnegativeNumber: TypeAlias = Annotated[FiniteFloat, Field(ge=0)]
Identifier: TypeAlias = Annotated[str, Field(min_length=1, max_length=128)]
Label: TypeAlias = Annotated[str, Field(min_length=1, max_length=200)]

Probability: TypeAlias = Annotated[FiniteFloat, Field(ge=0, le=1)]
Distribution: TypeAlias = Literal["constant", "exponential", "uniform"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Position(StrictModel):
    x: Annotated[FiniteFloat, Field(ge=-1_000_000, le=1_000_000)]
    y: Annotated[FiniteFloat, Field(ge=-1_000_000, le=1_000_000)]


def validate_uniform(
    distribution: Distribution,
    mean: float,
    minimum: float | None,
    maximum: float | None,
    label: str,
) -> None:
    if distribution != "uniform":
        if minimum is not None or maximum is not None:
            raise ValueError(f"{label} bounds are only valid for uniform distribution")
        return

    if minimum is None or maximum is None:
        raise ValueError(f"uniform {label} requires minimum and maximum bounds")
    if minimum >= maximum:
        raise ValueError(f"uniform {label} minimum must be less than maximum")
    if not isclose(mean, (minimum + maximum) / 2, rel_tol=1e-6, abs_tol=1e-9):
        raise ValueError(f"uniform {label} mean must equal the midpoint of its bounds")


class SourceConfig(StrictModel):
    distribution: Distribution
    mean_interarrival_time: PositiveTime
    minimum_interarrival_time: NonnegativeNumber | None = None
    maximum_interarrival_time: PositiveTime | None = None
    max_entities: PositiveInt | None = None

    @model_validator(mode="after")
    def check_uniform_bounds(self) -> "SourceConfig":
        validate_uniform(
            self.distribution,
            self.mean_interarrival_time,
            self.minimum_interarrival_time,
            self.maximum_interarrival_time,
            "interarrival time",
        )
        return self


class QueueConfig(StrictModel):
    capacity: Annotated[int, Field(ge=0)] | None
    discipline: Literal["fifo"]


class ProcessConfig(StrictModel):
    resource_count: PositiveInt
    service_distribution: Distribution
    mean_service_time: PositiveTime
    minimum_service_time: NonnegativeNumber | None = None
    maximum_service_time: PositiveTime | None = None
    cost_per_resource: NonnegativeNumber | None = None

    @model_validator(mode="after")
    def check_uniform_bounds(self) -> "ProcessConfig":
        validate_uniform(
            self.service_distribution,
            self.mean_service_time,
            self.minimum_service_time,
            self.maximum_service_time,
            "service time",
        )
        return self


class DecisionConfig(StrictModel):
    routing: Literal["probability"]


class DelayConfig(StrictModel):
    distribution: Distribution
    mean_delay: PositiveTime
    minimum_delay: NonnegativeNumber | None = None
    maximum_delay: PositiveTime | None = None

    @model_validator(mode="after")
    def check_uniform_bounds(self) -> "DelayConfig":
        validate_uniform(
            self.distribution,
            self.mean_delay,
            self.minimum_delay,
            self.maximum_delay,
            "delay",
        )
        return self


class SinkConfig(StrictModel):
    pass


class BaseNode(StrictModel):
    id: Identifier
    name: Label
    position: Position


class SourceNode(BaseNode):
    type: Literal["source"]
    config: SourceConfig


class QueueNode(BaseNode):
    type: Literal["queue"]
    config: QueueConfig


class ProcessNode(BaseNode):
    type: Literal["process"]
    config: ProcessConfig


class DecisionNode(BaseNode):
    type: Literal["decision"]
    config: DecisionConfig


class DelayNode(BaseNode):
    type: Literal["delay"]
    config: DelayConfig


class SinkNode(BaseNode):
    type: Literal["sink"]
    config: SinkConfig


SimulationNode: TypeAlias = Annotated[
    SourceNode | QueueNode | ProcessNode | DecisionNode | DelayNode | SinkNode,
    Field(discriminator="type"),
]


class Edge(StrictModel):
    id: Identifier
    source: Identifier
    target: Identifier
    probability: Probability | None = None
    sourceHandle: str | None = None


class SimulationSettings(StrictModel):
    duration: PositiveTime
    seed: Annotated[int, Field(ge=-2_147_483_648, le=2_147_483_647)]


class SimulationModel(StrictModel):
    id: Identifier
    name: Label
    simulation: SimulationSettings
    nodes: list[SimulationNode]
    edges: list[Edge]

    @model_validator(mode="after")
    def validate_graph(self) -> "SimulationModel":
        node_ids = [node.id for node in self.nodes]
        edge_ids = [edge.id for edge in self.edges]
        duplicates = sorted(identifier for identifier, count in Counter(node_ids + edge_ids).items() if count > 1)
        if duplicates:
            raise ValueError(f"duplicate node or edge IDs: {', '.join(duplicates)}")

        nodes_by_id = {node.id: node for node in self.nodes}
        if not any(node.type == "source" for node in self.nodes):
            raise ValueError("model requires at least one Source node")
        if not any(node.type == "sink" for node in self.nodes):
            raise ValueError("model requires at least one Sink node")

        outgoing: dict[str, list[Edge]] = defaultdict(list)
        for edge in self.edges:
            if edge.source not in nodes_by_id:
                raise ValueError(f"edge '{edge.id}' references missing source node '{edge.source}'")
            if edge.target not in nodes_by_id:
                raise ValueError(f"edge '{edge.id}' references missing target node '{edge.target}'")
            outgoing[edge.source].append(edge)

        for node in self.nodes:
            routes = outgoing[node.id]
            if node.type == "decision":
                if len(routes) < 2:
                    raise ValueError(f"Decision node '{node.id}' requires at least two outgoing routes")
                if any(edge.probability is None for edge in routes):
                    raise ValueError(f"Decision node '{node.id}' requires a probability on every outgoing edge")
                total = sum(edge.probability for edge in routes if edge.probability is not None)
                if not isclose(total, 1.0, rel_tol=0, abs_tol=1e-6):
                    raise ValueError(f"Decision node '{node.id}' probabilities must total approximately 1")
            else:
                if any(edge.probability is not None for edge in routes):
                    raise ValueError(f"non-Decision node '{node.id}' cannot assign edge probabilities")
                if node.type == "sink" and routes:
                    raise ValueError(f"Sink node '{node.id}' cannot have outgoing edges")
                if len(routes) > 1:
                    raise ValueError(f"non-Decision node '{node.id}' cannot have multiple outgoing edges")
        return self

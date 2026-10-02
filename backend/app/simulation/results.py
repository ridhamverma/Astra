"""Structured outputs from a discrete-event simulation run."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from app.schemas.bottlenecks import BottleneckAnalysis


EventType = Literal[
    "entity_created",
    "node_enter",
    "service_started",
    "service_completed",
    "node_exit",
    "entity_completed",
    "queue_enter",
    "queue_exit",
    "queue_rejected",
    "queue_wait_started",
    "service_requested",
]


class Entity(BaseModel):
    id: str
    created_at: float
    current_node: str
    completed_at: float | None = None
    rejected_at: float | None = None
    status: Literal["active", "completed", "rejected"] = "active"


class SimulationEvent(BaseModel):
    time: float
    type: EventType
    entity_id: str
    node_id: str


class SimulationSummary(BaseModel):
    total_generated: int
    total_completed: int
    total_rejected: int
    in_system_at_end: int
    completion_rate: float
    average_cycle_time: float | None
    maximum_cycle_time: float | None
    average_waiting_time: float | None
    maximum_waiting_time: float | None
    throughput: float

    @property
    def throughput_per_hour(self) -> float:
        """The canonical throughput value is completions per simulated hour."""
        return self.throughput


class ProcessMetrics(BaseModel):
    resource_count: int
    services_started: int
    entities_processed: int
    total_busy_resource_time: float
    resource_utilization: float
    average_service_time: float | None
    average_waiting_time: float | None
    maximum_waiting_time: float | None

    @property
    def services_completed(self) -> int:
        """Compatibility with the Phase 3/4 Python result attribute."""
        return self.entities_processed


class QueueMetrics(BaseModel):
    total_arrivals: int
    total_exited: int
    rejected_entities: int
    average_waiting_time: float | None
    maximum_waiting_time: float | None
    average_queue_length: float
    maximum_queue_length: int
    waiting_at_end: int

    @property
    def entered(self) -> int:
        return self.total_arrivals

    @property
    def exited(self) -> int:
        return self.total_exited

    @property
    def rejected(self) -> int:
        return self.rejected_entities

    @property
    def maximum_length(self) -> int:
        return self.maximum_queue_length


class TimeSeriesPoint(BaseModel):
    time: float
    value: int


class SimulationTimeSeries(BaseModel):
    queue_lengths: dict[str, list[TimeSeriesPoint]]
    cumulative_completed: list[TimeSeriesPoint]


class SimulationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    simulation_id: str = Field(alias="simulationId")
    summary: SimulationSummary
    node_metrics: dict[str, ProcessMetrics | QueueMetrics] = Field(alias="nodeMetrics")
    time_series: SimulationTimeSeries = Field(alias="timeSeries")
    events: list[SimulationEvent]
    entities: list[Entity]
    bottleneck_analysis: BottleneckAnalysis = Field(alias="bottleneckAnalysis")

"""Deterministic diagnostic output; independent of HTTP and AI providers."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class QueueEvidence(BaseModel):
    node_id: str
    name: str
    average_waiting_time: float | None
    maximum_waiting_time: float | None
    average_queue_length: float
    maximum_queue_length: int
    waiting_at_end: int
    rejected_entities: int
    total_arrivals: int


class BottleneckEvidence(BaseModel):
    utilization: float
    average_waiting_time: float | None
    maximum_waiting_time: float | None
    reference_service_time: float
    service_time_basis: Literal["measured", "configured"]
    average_queue_length: float | None
    maximum_queue_length: int | None
    waiting_at_end: int | None
    rejected_entities: int | None
    normalized_waiting: float
    normalized_queue: float
    rejection_fraction: float
    congestion_pressure: float
    upstream_queues: list[QueueEvidence]


class RankedBottleneck(BaseModel):
    node_id: str
    name: str
    score: float
    evidence: BottleneckEvidence
    reasons: list[str]


class BottleneckAnalysis(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
    method: Literal["utilization_pressure_v1"] = "utilization_pressure_v1"
    status: Literal["detected", "no_congestion", "insufficient_data", "not_applicable"]
    primary_bottleneck: str | None = Field(alias="primaryBottleneck")
    score: float
    reasons: list[str]
    ranked: list[RankedBottleneck]
    notes: list[str]

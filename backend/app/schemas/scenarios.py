"""Scenario metadata wraps the existing canonical model, never a competing graph."""
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, StringConstraints
from app.schemas.projects import RunRead
from app.schemas.simulation import SimulationModel

ScenarioName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ScenarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ScenarioName
    model: dict[str, Any]


class ScenarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ScenarioName | None = None
    model: dict[str, Any] | None = None


class ScenarioDuplicate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ScenarioName


class ScenarioRead(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    model_version: int
    model: SimulationModel
    latest_run: RunRead | None
    created_at: datetime
    updated_at: datetime


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    baseline_id: UUID
    scenario_id: UUID


class MetricDifference(BaseModel):
    key: str
    label: str
    unit: str
    baseline: float | None
    scenario: float | None
    absolute_difference: float | None
    percentage_difference: float | None


class ScenarioComparison(BaseModel):
    baseline: ScenarioRead
    scenario: ScenarioRead
    duration: float
    seed: int
    metrics: list[MetricDifference]

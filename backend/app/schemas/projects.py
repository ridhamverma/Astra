"""Project storage and compact run-history API shapes."""

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from app.schemas.drafts import SimulationDraft

from app.schemas.simulation import SimulationModel
from app.schemas.bottlenecks import BottleneckAnalysis
from app.simulation.results import ProcessMetrics, QueueMetrics, SimulationSummary, SimulationTimeSeries, SimulationEvent


ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ProjectName
    description: str | None = Field(default=None, max_length=10000)
    model: dict[str, Any] | None = None


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ProjectName | None = None
    expected_version: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=10000)
    model: dict[str, Any] | None = None


class ProjectSummary(BaseModel):
    id: UUID
    name: str
    description: str | None
    user_id: UUID | None
    latest_version: int | None
    created_at: datetime
    updated_at: datetime
    last_accessed_at: datetime | None = None
    run_count: int = 0
    last_run_at: datetime | None = None
    status: str = "needs_review"
    model: SimulationDraft | None = None


class ProjectDetail(ProjectSummary):
    model: SimulationDraft | None


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_version: int | None = Field(default=None, ge=1)
    include_timeline: bool = False


class RunRead(BaseModel):
    is_scenario: bool = False
    scenario_id: UUID | None = None
    id: UUID
    project_id: UUID
    model_version: int
    seed: int
    duration: float
    summary: SimulationSummary
    node_metrics: dict[str, ProcessMetrics | QueueMetrics]
    time_series: SimulationTimeSeries
    created_at: datetime
    bottleneck_analysis: BottleneckAnalysis


class RunPlayback(RunRead):
    """Transient execution response; timelines are never persisted."""

    model: SimulationModel
    events: list[SimulationEvent]

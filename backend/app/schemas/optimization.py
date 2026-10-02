"""Bounded single-parameter grid search over the canonical Astra model."""
from typing import Annotated, Literal

from pydantic import Field, FiniteFloat, StrictInt, model_validator

from app.schemas.simulation import SimulationModel, StrictModel
from app.simulation.results import SimulationSummary, ProcessMetrics, QueueMetrics

ObjectiveMetric = Literal['average_waiting_time', 'maximum_waiting_time', 'throughput', 'completion_rate', 'average_cycle_time']
ResourceValue = Annotated[StrictInt, Field(ge=1, le=100)]

class OptimizationRequest(StrictModel):
    base_model: SimulationModel
    variable_node: str = Field(min_length=1)
    variable_parameter: Literal['resource_count'] = 'resource_count'
    min: ResourceValue
    max: ResourceValue
    step: ResourceValue = 1
    objective_metric: ObjectiveMetric = 'average_waiting_time'
    operator: Literal['<=', '>='] = '<='
    target: Annotated[FiniteFloat, Field(ge=0)]
    cost_objective: Literal['minimize_resource_cost'] | None = None
    max_additional_resources: Annotated[StrictInt, Field(ge=0, le=99)] | None = None
    replications: Annotated[StrictInt, Field(ge=1, le=10)] = 3

    @model_validator(mode='after')
    def check_bounds(self):
        if self.min > self.max:
            raise ValueError('Search minimum must not exceed maximum')
        if self.objective_metric == 'completion_rate' and self.target > 1:
            raise ValueError('Completion rate target must be a fraction from 0 to 1')
        return self

class MetricStatistics(StrictModel):
    mean: float | None
    minimum: float | None
    maximum: float | None
    standard_deviation: float | None
    observations: int

class ReplicationMetrics(StrictModel):
    seed: int
    summary: SimulationSummary
    node_metrics: dict[str, ProcessMetrics | QueueMetrics]

class Configuration(StrictModel):
    node_id: str
    parameter: Literal['resource_count'] = 'resource_count'
    value: int

class CandidateResult(StrictModel):
    configuration: Configuration
    status: Literal['feasible', 'infeasible']
    infeasible_reasons: list[str]
    objective: MetricStatistics
    summary_metrics: dict[str, MetricStatistics]
    node_metrics: dict[str, dict[str, MetricStatistics]]
    replications: list[ReplicationMetrics]
    resource_cost: float | None
    total_resource_cost: float | None
    additional_cost: float | None
    rank: int | None = None

class MetricImprovement(StrictModel):
    baseline_value: float | None
    recommended_value: float | None
    absolute_difference: float | None
    percentage_difference: float | None
    improvement: float | None

class OptimizationResult(StrictModel):
    baseline: CandidateResult
    tested_candidates: list[CandidateResult]
    recommended: CandidateResult | None
    metric_improvement: MetricImprovement | None
    additional_cost: float | None
    seeds: list[int]
    simulation_runs: int
    tested_configurations: int
    objective_metric: ObjectiveMetric
    operator: Literal['<=', '>=']
    target: float
    cost_objective: Literal['minimize_resource_cost'] | None
    recommendation_reason: str
    notes: list[str]

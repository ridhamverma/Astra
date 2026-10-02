"""Standalone deterministic grid search: each measurement comes from SimPy.

Feasibility requires the target in EVERY replication, not merely its mean.
Feasible configurations rank by cost (optional), then objective mean in the
operator's direction, then resource count. No LLM or HTTP dependency exists.
"""
from math import isfinite
from statistics import mean, stdev
from time import monotonic

from app.schemas.optimization import (
    CandidateResult, Configuration, MetricImprovement, MetricStatistics,
    OptimizationRequest, OptimizationResult, ReplicationMetrics,
)
from app.schemas.simulation import ProcessNode, SimulationModel
from app.simulation import SimulationLimitError, simulate, validate_executable_model
from app.simulation.results import SimulationSummary

MAX_CONFIGURATIONS = 25
MAX_SIMULATION_RUNS = 100
MAX_SEARCH_SECONDS = 30
SUMMARY_FIELDS = tuple(SimulationSummary.model_fields)
METRIC_LABELS = {
    'average_waiting_time': ('average waiting time', 'min'),
    'maximum_waiting_time': ('maximum waiting time', 'min'),
    'average_cycle_time': ('average cycle time', 'min'),
    'throughput': ('throughput', 'entities/hr'),
    'completion_rate': ('completion rate', '%'),
}

class OptimizationError(ValueError):
    pass

class OptimizationExecutionError(RuntimeError):
    pass


def statistics(values: list[float | int | None]) -> MetricStatistics:
    observed = [float(value) for value in values if value is not None]
    return MetricStatistics(mean=mean(observed) if observed else None,
                            minimum=min(observed) if observed else None,
                            maximum=max(observed) if observed else None,
                            standard_deviation=stdev(observed) if len(observed) > 1 else None,
                            observations=len(observed))


def optimize(request: OptimizationRequest) -> OptimizationResult:
    """Evaluate deep copies, keeping the input graph and its configuration intact."""
    model = validate_executable_model(request.base_model)
    if len(model.nodes) > 100 or len(model.edges) > 300 or model.simulation.duration > 10080:
        raise OptimizationError('Base model exceeds simulation size or duration limits')
    processes = [node for node in model.nodes if isinstance(node, ProcessNode)]
    if any(node.config.resource_count > 100 for node in processes):
        raise OptimizationError('Each Process supports at most 100 resources')
    node = next((node for node in processes if node.id == request.variable_node), None)
    if node is None:
        raise OptimizationError('Select an existing Process node to vary its resource_count')
    if request.cost_objective and node.config.cost_per_resource is None:
        raise OptimizationError('Minimizing resource cost requires cost_per_resource on the selected Process')
    baseline_value = node.config.resource_count
    grid = list(range(request.min, request.max + 1, request.step))
    values = list(dict.fromkeys([baseline_value, *grid]))
    if len(values) > MAX_CONFIGURATIONS:
        raise OptimizationError(f'At most {MAX_CONFIGURATIONS} distinct configurations, including baseline, are allowed')
    if len(values) * request.replications > MAX_SIMULATION_RUNS:
        raise OptimizationError(f'At most {MAX_SIMULATION_RUNS} simulation runs are allowed; narrow the grid or reduce replications')
    if model.simulation.seed + request.replications - 1 > 2_147_483_647:
        raise OptimizationError("Replication seeds exceed the supported 32-bit range; reduce the base seed")
    seeds = [model.simulation.seed + index for index in range(request.replications)]
    label, unit = METRIC_LABELS[request.objective_metric]
    metric_scale = 100 if request.objective_metric == 'completion_rate' else 1
    target_description = f"{label} {request.operator} {request.target * metric_scale:g} {unit}"
    started = monotonic()
    results = {}
    for value in values:
        replications = []
        for seed in seeds:
            if monotonic() - started > MAX_SEARCH_SECONDS:
                raise OptimizationExecutionError('Optimization exceeded its time budget; narrow the grid or reduce duration/replications')
            candidate = model.model_copy(deep=True)
            candidate.simulation.seed = seed
            candidate_node = next(n for n in candidate.nodes if n.id == node.id)
            candidate_node.config.resource_count = value
            candidate = SimulationModel.model_validate(candidate.model_dump(mode='json'))
            try:
                measured = simulate(candidate)
            except SimulationLimitError as error:
                raise OptimizationExecutionError('A candidate exceeded simulation safety limits; reduce duration or arrival volume') from error
            if monotonic() - started > MAX_SEARCH_SECONDS:
                raise OptimizationExecutionError('Optimization exceeded its time budget; narrow the grid or reduce duration/replications')
            replications.append(ReplicationMetrics(seed=seed, summary=measured.summary, node_metrics=measured.node_metrics))
            # Events/entities are transient and are not retained in optimization results.
            del measured
        summary = {key: statistics([getattr(rep.summary, key) for rep in replications]) for key in SUMMARY_FIELDS}
        node_metrics = {}
        for node_id, metrics in replications[0].node_metrics.items():
            node_metrics[node_id] = {key: statistics([getattr(rep.node_metrics[node_id], key) for rep in replications]) for key in type(metrics).model_fields}
        objective = summary[request.objective_metric]
        reasons = []
        if request.max_additional_resources is not None and value - baseline_value > request.max_additional_resources:
            reasons.append(f'{value - baseline_value} additional resources exceed the limit of {request.max_additional_resources}')
        for replication in replications:
            metric = getattr(replication.summary, request.objective_metric)
            if metric is None:
                reasons.append(f'Seed {replication.seed}: objective is unavailable (no completed-entity observation)')
            elif not (metric <= request.target if request.operator == '<=' else metric >= request.target):
                reasons.append(f'Seed {replication.seed}: {label} = {metric * metric_scale:.6g} {unit} does not satisfy {request.operator} {request.target * metric_scale:g} {unit}')
        cost = value * node.config.cost_per_resource if node.config.cost_per_resource is not None else None
        total_cost = sum((value if process.id == node.id else process.config.resource_count) * process.config.cost_per_resource for process in processes) if all(process.config.cost_per_resource is not None for process in processes) else None
        additional = (value - baseline_value) * node.config.cost_per_resource if node.config.cost_per_resource is not None else None
        if any(amount is not None and not isfinite(amount) for amount in (cost, total_cost, additional)):
            raise OptimizationError('Configured resource costs exceed the supported numeric range')
        results[value] = CandidateResult(configuration=Configuration(node_id=node.id, value=value),
            status='infeasible' if reasons else 'feasible', infeasible_reasons=reasons, objective=objective,
            summary_metrics=summary, node_metrics=node_metrics, replications=replications,
            resource_cost=cost, total_resource_cost=total_cost, additional_cost=additional)
    def ranking(item):
        objective = item.objective.mean
        directional = objective if request.operator == '<=' else -objective
        return ((item.resource_cost,) if request.cost_objective else ()) + (directional, item.configuration.value)
    feasible = sorted((results[value] for value in grid if results[value].status == 'feasible'), key=ranking)
    for rank, item in enumerate(feasible, 1): item.rank = rank
    recommended = feasible[0] if feasible else None
    baseline = results[baseline_value]
    improvement = None
    if recommended:
        before, after = baseline.objective.mean, recommended.objective.mean
        difference = after - before if before is not None and after is not None else None
        improvement = MetricImprovement(baseline_value=before, recommended_value=after, absolute_difference=difference,
            percentage_difference=difference / abs(before) * 100 if difference is not None and before != 0 else None,
            improvement=(-difference if request.operator == '<=' else difference) if difference is not None else None)
        preference = 'lowest configured resource cost, then best objective mean and fewest resources' if request.cost_objective else 'best objective mean, then fewest resources'
        reason = f'{node.name}: {recommended.configuration.value} resources met {target_description} in all {request.replications} replications and ranked first by {preference} among feasible grid candidates.'
    else:
        reason = 'No tested configuration satisfied the target in every replication and the additional-resource constraint. No configuration is recommended.'
    notes = [
        'Results summarize real simulations with the same duration and seed list for every configuration. Baseline is evaluated even when outside the grid and reused when also in the grid. Only grid values are eligible for recommendation.',
        'Feasibility checks every replication. Aggregate means weight replications equally; sample standard deviation is unavailable for one observation.',
        'Waiting and cycle-time averages cover completed entities. Inspect completion, rejection and remaining-entity metrics alongside waiting results.',
        'The recommendation is best among tested values under these seeds, horizon and objective; it is not a global optimum or a statistical guarantee.',
        'Resource costs are configured amounts per resource for a common modeled period, in user-defined units; they are not inferred hourly rates. Additional cost covers only the varied Process. Total cost is unavailable if any Process has no configured cost.',
    ]
    return OptimizationResult(baseline=baseline, tested_candidates=[results[value] for value in grid], recommended=recommended,
        metric_improvement=improvement, additional_cost=recommended.additional_cost if recommended else None,
        seeds=seeds, simulation_runs=len(values)*request.replications, tested_configurations=len(values),
        objective_metric=request.objective_metric, operator=request.operator, target=request.target,
        cost_objective=request.cost_objective, recommendation_reason=reason, notes=notes)


# Operational grid search (Phase 16)

## Scope

The first optimizer varies one **Process.resource_count** parameter over an integer grid. It executes the standalone SimPy simulator, without AI, database writes, Optuna or Bayesian optimization. All other graph configuration is preserved. Unsupported parameters fail clearly instead of being silently edited.

`optimize(OptimizationRequest(...))` is callable from Python without FastAPI. `POST /api/v1/optimize` accepts the same structured request, with `base_model` using the canonical Astra schema. Models need not be saved to search them.

```json
{
  "base_model": {"id":"clinic", "name":"Clinic", "simulation":{"duration":480,"seed":42}, "nodes":[], "edges":[]},
  "variable_node":"doctor",
  "variable_parameter":"resource_count",
  "min":3,
  "max":5,
  "step":1,
  "objective_metric":"average_waiting_time",
  "operator":"<=",
  "target":15,
  "max_additional_resources":2,
  "replications":3,
  "cost_objective":"minimize_resource_cost"
}
```

The abbreviated graph above must be replaced with an actual valid Source-to-Sink model. `docs/examples/doctor-capacity.json` is a runnable example. Objective metrics: average/maximum waiting time, average cycle time, throughput (completed entities/hour), or completion rate (fraction 0–1). Operators: `<=` and `>=`. The UI displays completion targets as percentages and converts them to fractions in requests.

## Evaluation and reproducibility

1. Validate the canonical graph, selected Process, integer range, limits and optional cost requirement.
2. Generate `min, min+step, ...` while values are `<= max`. Max is included only if aligned with the step.
3. Evaluate the baseline even if it is outside that grid. Reuse its real measurements if its value also occurs in the grid. **Only grid values are eligible for recommendation.**
4. Deep-copy the model for every replication, change the selected resource count, set the seed, revalidate and run SimPy. Do not mutate the caller's model.
5. Use `base_seed + replication_index` for every configuration, with identical duration and seed lists. Repeat requests are deterministic. This controls seeds; because the engine shares random sampling across events, it does not promise identical arrival/service samples when event order differs between configurations.
6. Collect real summary and node metrics; discard transient entities/event logs. Evaluate constraints and rank feasible candidates.

Default replications: 3, maximum 10. Metrics include mean, observed minimum/maximum, sample standard deviation and observation count. Means give equal weight to replications, not pooled entities. Missing observations remain null; one observation has no sample deviation. Per-replication metrics and seeds are returned for inspection.

## Feasibility and ranking

A candidate is feasible only if **every replication** has an observed objective satisfying the operator/target, and its resource increase is at most `max_additional_resources` when supplied. A good mean cannot conceal a failed replication. Even candidates violating the addition constraint are simulated and shown as infeasible; no invented metrics or skipped candidates appear.

Without a cost objective, feasible candidates rank by objective mean in the operator's direction (`<=`: smaller; `>=`: larger), then fewest resources. With `minimize_resource_cost`, they rank first by configured cost, then objective mean, then fewest resources. The target remains mandatory. Ties are deterministic. The baseline is not privileged; it can win if it is a grid candidate. No feasible candidate means a null recommendation, not a guess.

Waiting and cycle times describe completed entities; short horizons, rejection and unfinished work can affect them. The UI also shows completed, rejected and remaining counts. A recommendation is best among the searched values under the chosen objective, seeds and horizon; multiple replications are descriptive evidence, not a statistical confidence guarantee or a global optimum.

## Cost semantics

`cost_per_resource` is the existing canonical optional Process field. It represents a configured amount per resource for a common modeled period, in user-defined units. Astra does **not** infer a currency, hourly rate or multiply it by duration.

- `resource_cost`: selected Process resources × its configured unit cost.
- `additional_cost`: (candidate resources − baseline resources) × selected Process unit cost. Negative amounts represent savings.
- `total_resource_cost`: sum over all Process stages; null if any Process cost is unknown.

Cost minimization requires a known cost for the varied Process. Other fixed Process costs cannot change its ranking, so a recommendation and known marginal cost remain possible when the total is unknown. Zero is a valid configured cost; missing values are not treated as zero. Numeric overflow is rejected.

## Response and safeguards

The response includes baseline configuration, every grid candidate, replication metrics, aggregate node/summary metrics, feasible status with explicit reasons, feasible ranks, recommendation and rationale, seeds, configuration/run counts and costs. `metric_improvement` reports baseline/recommended means, signed absolute difference (recommended minus baseline), signed percentage difference and improvement in the operator's direction. Percentage difference is null for a zero/unknown baseline.

Limits: 25 unique configurations including baseline, 100 simulations total, 10 replications, resources 1–100, and existing API model/duration/entity/event limits. A 30-second wall-clock budget is checked before and after each simulator call; a single call is additionally bounded by engine entity/event limits. Errors fail the request explicitly rather than recommending from a partial grid. Optimization doesn't save scenarios or runs automatically.

## UI and verification

Open Simulator → **Optimization**, choose a Process, set the grid and target, optionally select cost minimization, then **Run grid search**. The panel displays rationale, baseline/candidate table, variation, utilization, counts, costs, replication evidence and a chart. **Apply to builder** changes only the selected resource count. Save/Run remains a separate action. Editing the graph makes prior results stale and disables applying until a fresh search.

Deterministic Doctor fixture (60 minutes, arrivals every 2 minutes, service 5 minutes): resources 1/2/3 produce mean completed-entity waits 15/5/0 minutes and throughput 11/22/28 per hour. For target wait ≤5 and cost 100/resource, cost minimization selects 2 resources, additional cost 100, rather than the more expensive 3-resource candidate. Tests compare every replication to a direct simulator call and cover seed repeatability, constraints, null observations, ties, out-of-grid baseline, zero costs, partial costs, malformed requests, limits and API equivalence.

The live browser workflow was also verified against FastAPI: three configurations across seeds 42, 43 and 44 executed nine simulations and selected two Doctor resources at the five-minute waiting target. Applying the recommendation changed the canvas resource count; the previous search then became stale and its Apply button was disabled. No scenario was overwritten during verification. See `phase16-optimization-verification.png` for the measured recommendation and candidate table.

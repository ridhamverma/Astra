"""Starter promises must be supported by the unchanged executable engine."""
import json
from pathlib import Path
import pytest
from app.schemas.optimization import OptimizationRequest
from app.optimization.grid_search import optimize
from app.simulation import simulate, validate_executable_model
from app.schemas.simulation import SimulationModel

DATA = Path(__file__).resolve().parents[2] / 'docs/liquid-glass/templates'
BOTTLENECKS = {'hospital':'doctor','bank':'counter','restaurant':'kitchen','warehouse':'packing','customer-service':'specialist'}

@pytest.mark.parametrize('name,node', BOTTLENECKS.items())
def test_baseline_insight_and_scenarios(name,node):
    results = {}
    for variant in ('baseline','add-one','alternative'):
        model = validate_executable_model(SimulationModel.model_validate_json((DATA/name/f'{variant}.json').read_text()))
        assert model.simulation.duration == 240 and model.simulation.seed == 42
        assert all(n.position.x % 4 == n.position.y % 4 == 0 for n in model.nodes)
        result = simulate(model)
        s = result.summary
        assert s.total_generated == s.total_completed + s.total_rejected + s.in_system_at_end
        assert all(0 <= m.resource_utilization <= 1 for m in result.node_metrics.values() if hasattr(m,'resource_utilization'))
        results[variant] = result
    assert results['baseline'].bottleneck_analysis.primary_bottleneck == node
    assert results['add-one'].summary.average_waiting_time < results['baseline'].summary.average_waiting_time
    assert results['add-one'].summary.total_completed > results['baseline'].summary.total_completed
    if name == 'bank':
        assert results['alternative'].summary.total_completed == results['baseline'].summary.total_completed
        assert results['alternative'].summary.total_rejected < results['baseline'].summary.total_rejected
        assert results['alternative'].summary.average_waiting_time > results['baseline'].summary.average_waiting_time

@pytest.mark.parametrize('name', BOTTLENECKS)
def test_optimization_preset_has_a_feasible_tested_option(name):
    request = OptimizationRequest.model_validate(json.loads((DATA/name/'optimization.json').read_text()))
    result = optimize(request)
    assert result.seeds == [42,43,44]
    assert result.recommended is not None
    assert result.recommended in result.tested_candidates
    assert result.recommended.status == 'feasible'

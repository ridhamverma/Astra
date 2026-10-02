"""Validate recommendations against real repeated DES runs and hand-calculated cases."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.optimization import optimize, OptimizationError, OptimizationExecutionError
from app.schemas.optimization import OptimizationRequest
from app.simulation import simulate, SimulationLimitError

ENDPOINT='/api/v1/optimize'

def payload(**changes):
    model=json.loads((Path(__file__).resolve().parents[2]/'docs/examples/doctor-capacity.json').read_text())
    body=dict(base_model=model,variable_node='doctor',variable_parameter='resource_count',min=1,max=3,step=1,objective_metric='average_waiting_time',operator='<=',target=15,replications=3,max_additional_resources=2)
    body.update(changes)
    return body

def process(model): return next(n for n in model['nodes'] if n['id']=='doctor')

def test_real_grid_manual_expected_metrics_and_immutable_model():
    body=payload(); before=deepcopy(body); request=OptimizationRequest.model_validate(body)
    result=optimize(request)
    assert body==before and request.base_model.model_dump(mode='json')['nodes'][2]['config']['resource_count']==1
    assert [c.objective.mean for c in result.tested_candidates]==[15,5,0]
    assert [c.summary_metrics['throughput'].mean for c in result.tested_candidates]==[11,22,28]
    assert result.seeds==[42,43,44] and result.simulation_runs==9
    assert result.recommended.configuration.value==3
    assert result.metric_improvement.improvement==15
    assert result.additional_cost is None
    for candidate in result.tested_candidates:
        for rep in candidate.replications:
            model=deepcopy(before['base_model']); process(model)['config']['resource_count']=candidate.configuration.value; model['simulation']['seed']=rep.seed
            measured=simulate(model)
            assert rep.summary==measured.summary
            assert rep.node_metrics==measured.node_metrics
    assert optimize(request)==result


def test_cost_minimization_selects_least_cost_feasible_resources():
    body=payload(target=5,cost_objective='minimize_resource_cost')
    process(body['base_model'])['config']['cost_per_resource']=100
    result=optimize(OptimizationRequest.model_validate(body))
    assert [c.status for c in result.tested_candidates]==['infeasible','feasible','feasible']
    assert result.recommended.configuration.value==2
    assert result.recommended.resource_cost==200 and result.recommended.total_resource_cost==200
    assert result.additional_cost==100
    assert result.metric_improvement.absolute_difference==-10
    assert result.metric_improvement.percentage_difference==pytest.approx(-66.6666667)


def test_unknown_cost_never_guessed_and_zero_cost_valid():
    body=payload(cost_objective='minimize_resource_cost')
    with pytest.raises(OptimizationError,match='cost_per_resource'): optimize(OptimizationRequest.model_validate(body))
    process(body['base_model'])['config']['cost_per_resource']=0
    result=optimize(OptimizationRequest.model_validate(body))
    assert result.recommended.resource_cost==0 and result.additional_cost==0


def test_additional_resource_constraint_with_real_candidate_metrics():
    body=payload(target=0,max_additional_resources=1)
    result=optimize(OptimizationRequest.model_validate(body))
    assert result.recommended is None and result.metric_improvement is None
    best=result.tested_candidates[-1]
    assert best.objective.mean==0 and best.status=='infeasible'
    assert 'additional resources' in best.infeasible_reasons[0]
    assert result.simulation_runs==9


def test_no_feasible_or_unobserved_objective():
    body=payload(target=0,max=2)
    assert optimize(OptimizationRequest.model_validate(body)).recommended is None
    body['base_model']['simulation']['duration']=1
    result=optimize(OptimizationRequest.model_validate(body))
    assert result.baseline.objective.mean is None and result.recommended is None
    assert all(c.objective.observations==0 for c in result.tested_candidates)


def test_baseline_outside_grid_is_measured_but_not_recommended():
    body=payload(min=2,max=3,target=15,cost_objective='minimize_resource_cost')
    process(body['base_model'])['config']['cost_per_resource']=100
    result=optimize(OptimizationRequest.model_validate(body))
    assert result.baseline.configuration.value==1 and result.baseline.status=='feasible'
    assert result.recommended.configuration.value==2
    assert result.tested_configurations==3 and result.simulation_runs==9


def test_step_and_maximize_throughput():
    body=payload(min=1,max=4,step=2,objective_metric='throughput',operator='>=',target=20)
    result=optimize(OptimizationRequest.model_validate(body))
    assert [c.configuration.value for c in result.tested_candidates]==[1,3]
    assert result.recommended.configuration.value==3
    assert result.metric_improvement.improvement==17


def test_zero_baseline_relative_difference_is_unavailable():
    body=payload(min=1,max=3,objective_metric='average_waiting_time',operator='>=',target=5,max_additional_resources=None)
    process(body['base_model'])['config']['resource_count']=3
    result=optimize(OptimizationRequest.model_validate(body))
    assert result.baseline.objective.mean==0
    assert result.recommended.configuration.value==1
    assert result.metric_improvement.percentage_difference is None


def test_stochastic_replications_have_controlled_seeds_and_sample_statistics():
    body=payload(target=100)
    body['base_model']['nodes'][0]['config']['distribution']='exponential'
    process(body['base_model'])['config']['service_distribution']='exponential'
    request=OptimizationRequest.model_validate(body)
    first=optimize(request); second=optimize(request)
    assert first==second
    assert first.baseline.objective.standard_deviation > 0
    for candidate in first.tested_candidates: assert [r.seed for r in candidate.replications]==first.seeds


def test_mean_cannot_hide_failing_replication():
    body=payload(target=100)
    body['base_model']['nodes'][0]['config']['distribution']='exponential'
    process(body['base_model'])['config']['service_distribution']='exponential'
    observed=optimize(OptimizationRequest.model_validate(body))
    body['target']=observed.baseline.objective.mean
    result=optimize(OptimizationRequest.model_validate(body))
    assert result.baseline.objective.maximum > body['target']
    assert result.baseline.status=='infeasible'


@pytest.mark.parametrize('changes',[{'min':0},{'max':101},{'step':0},{'min':4,'max':3},{'replications':0},{'replications':11},{'min':1.5},{'step':True},{'target':-1},{'variable_parameter':'python'},{'objective_metric':'cost'},{'operator':'=='},{'objective_metric':'completion_rate','target':90}])
def test_invalid_requests(changes):
    with pytest.raises(ValidationError): OptimizationRequest.model_validate(payload(**changes))


@pytest.mark.parametrize('changes',[{'min':1,'max':26},{'min':1,'max':11,'replications':10},{'variable_node':'missing'},{'variable_node':'waiting'}])
def test_search_limits_and_variable_validation(changes):
    with pytest.raises(OptimizationError): optimize(OptimizationRequest.model_validate(payload(**changes)))


def test_single_replication_has_no_estimated_deviation():
    result=optimize(OptimizationRequest.model_validate(payload(replications=1)))
    assert result.baseline.objective.standard_deviation is None
    assert result.simulation_runs==3


def test_resource_cost_overflow_rejected():
    body=payload(); process(body['base_model'])['config']['cost_per_resource']=1e308
    with pytest.raises(OptimizationError,match='numeric range'): optimize(OptimizationRequest.model_validate(body))


def test_api_equals_standalone_no_ai_no_event_logs():
    body=payload(); response=TestClient(create_app()).post(ENDPOINT,json=body)
    assert response.status_code==200,response.text
    assert response.json()==optimize(OptimizationRequest.model_validate(body)).model_dump(mode='json')
    assert 'events' not in response.text and 'entities":[' not in response.text
    assert response.json()['recommended']['configuration']['value']==3


def test_api_reports_invalid_graph_configuration_and_failed_runs(monkeypatch):
    client=TestClient(create_app())
    assert client.post(ENDPOINT,json=payload(min=0)).status_code==422
    body=payload(); body['base_model']['edges'][0]['target']='unknown'
    assert client.post(ENDPOINT,json=body).json()['error']['code']=='invalid_graph'
    def fail(model): raise SimulationLimitError('test limit')
    monkeypatch.setattr('app.optimization.grid_search.simulate',fail)
    response=client.post(ENDPOINT,json=payload())
    assert response.status_code==422 and response.json()['error']['code']=='failed_optimization'
    assert 'Traceback' not in response.text


def test_wall_clock_budget(monkeypatch):
    ticks=iter([0,31])
    monkeypatch.setattr('app.optimization.grid_search.monotonic',lambda:next(ticks))
    with pytest.raises(OptimizationExecutionError,match='time budget'): optimize(OptimizationRequest.model_validate(payload()))

def test_ties_choose_fewest_resources():
    body=payload(target=0)
    body['base_model']['nodes'][0]['config']['mean_interarrival_time']=10
    process(body['base_model'])['config']['mean_service_time']=2
    result=optimize(OptimizationRequest.model_validate(body))
    assert [c.objective.mean for c in result.tested_candidates]==[0,0,0]
    assert result.recommended.configuration.value==1


def test_unknown_other_process_cost_preserves_known_marginal_cost():
    body=payload(target=5,cost_objective='minimize_resource_cost')
    process(body['base_model'])['config']['cost_per_resource']=100
    model=body['base_model']
    sink=next(n for n in model['nodes'] if n['type']=='sink')
    auxiliary={'id':'auxiliary','name':'Auxiliary','type':'process','position':{'x':600,'y':0},'config':{'resource_count':1,'service_distribution':'constant','mean_service_time':1}}
    model['nodes'].append(auxiliary)
    next(e for e in model['edges'] if e['source']=='doctor')['target']='auxiliary'
    model['edges'].append({'id':'aux-exit','source':'auxiliary','target':sink['id']})
    result=optimize(OptimizationRequest.model_validate(body))
    assert result.recommended.configuration.value==2
    assert result.recommended.total_resource_cost is None
    assert result.additional_cost==100


def test_replication_seed_overflow_rejected_before_simulation(monkeypatch):
    body = payload()
    body['base_model']['simulation']['seed'] = 2147483647
    def unexpected(_):
        pytest.fail("No candidate should run when replication seeds overflow")
    monkeypatch.setattr('app.optimization.grid_search.simulate', unexpected)
    with pytest.raises(OptimizationError, match='32-bit'):
        optimize(OptimizationRequest.model_validate(body))

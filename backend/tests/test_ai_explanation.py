from test_persistence import test_database as test_database
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app.ai.explanation import build_supported_findings, explain_results
from app.ai.provider import get_model_provider
from app.api.simulation_validation import ApiProblem
from app.config import Settings
from app.schemas.projects import RunRead
from app.schemas.simulation import SimulationModel
from app.simulation import simulate
from test_persistence import client_for

ENDPOINT = '/api/v1/ai/explain-results'
class SelectingProvider:
    def __init__(self, outputs=None): self.outputs, self.calls = outputs, []
    async def generate(self, instructions, prompt, schema, feedback):
        facts = json.loads(prompt)
        self.calls.append((instructions, facts, schema, feedback))
        if self.outputs is not None: return self.outputs[min(len(self.calls)-1, len(self.outputs)-1)]
        ids = [f['id'] for f in facts['supported_findings']]
        selected = ['overview','bottleneck']
        if 'comparison' in ids: selected += ['comparison','difference:average_waiting_time','difference:throughput']
        else: selected += [key for key in ['system_wait','cycle'] if key in ids]
        return json.dumps({'finding_ids':selected})

def measured(resources=1, duration=60, project_id=None):
    model = json.loads((Path(__file__).resolve().parents[2]/'docs/examples/doctor-capacity.json').read_text())
    model['simulation']['duration'] = duration
    next(n for n in model['nodes'] if n['type']=='process')['config']['resource_count'] = resources
    model = SimulationModel.model_validate(model)
    result = simulate(model)
    run = RunRead(id=uuid4(),project_id=project_id or uuid4(),model_version=1,seed=model.simulation.seed,duration=model.simulation.duration,summary=result.summary,node_metrics=result.node_metrics,time_series=result.time_series,bottleneck_analysis=result.bottleneck_analysis,created_at=datetime.now(timezone.utc))
    return run,model

def test_actual_measured_evidence():
    run,model=measured(); provider=SelectingProvider()
    result=asyncio.run(explain_results(run,model,provider))
    catalogue={f.id:f for f in build_supported_findings(run,model)}
    assert result.explanation=='\n\n'.join(catalogue[f.id].text for f in result.findings)
    primary=next(f for f in result.findings if f.id=='bottleneck')
    assert run.bottleneck_analysis.primary_bottleneck=='doctor'
    assert next(f for f in primary.evidence if f.id=='primary_util').value==run.node_metrics['doctor'].resource_utilization
    assert run.summary.average_waiting_time==15
    assert next(f for f in result.findings if f.id=='system_wait').evidence[0].value==15
    assert 'cost' not in json.dumps(provider.calls[0][1]).lower()
    assert 'events' not in provider.calls[0][1]

@pytest.mark.parametrize('output',[
 '{}','not json',
 '{"finding_ids":["overview","bottleneck"],"explanation":"Doctor utilization is 99%"}',
 '{"finding_ids":["overview","bottleneck"],"cost":1000}',
 '{"finding_ids":["overview","bottleneck"],"confidence":0.99}',
 '{"finding_ids":["overview","bottleneck"],"recommendations":["Add five doctors"]}',
 '{"finding_ids":["overview","invented_metric"]}',
 '{"finding_ids":["overview","overview"]}',
 '{"finding_ids":["cycle","system_wait"]}',
 '{"finding_ids":["overview","bottleneck","cycle","system_wait","unfinished","queue:waiting","process:doctor"]}',
])
def test_unsupported_claims_repaired(output):
    run,model=measured(); provider=SelectingProvider([output,'{"finding_ids":["overview","bottleneck"]}'])
    result=asyncio.run(explain_results(run,model,provider))
    assert len(provider.calls)==2 and provider.calls[1][3]
    assert [f.id for f in result.findings]==['overview','bottleneck']
    assert '99%' not in result.explanation and 'Add five doctors' not in result.explanation

def test_retry_limit():
    run,model=measured(); provider=SelectingProvider(['{}'])
    with pytest.raises(ApiProblem) as error: asyncio.run(explain_results(run,model,provider))
    assert error.value.code=='invalid_ai_output' and len(provider.calls)==3

def test_no_congestion_is_not_overload():
    run,model=measured(3)
    findings={f.id:f for f in build_supported_findings(run,model)}
    assert run.bottleneck_analysis.primary_bottleneck is None
    assert 'detected no congestion signal' in findings['bottleneck'].text
    assert 'does not establish spare capacity' in findings['bottleneck'].text

def test_missing_waits_not_zero():
    run,model=measured(duration=1)
    assert run.summary.average_waiting_time is None
    catalogue={f.id:f for f in build_supported_findings(run,model)}
    assert 'system_wait' not in catalogue and 'cycle' not in catalogue
    assert 'completed 0' in catalogue['overview'].text

def test_comparison_arithmetic_and_sources():
    baseline,_=measured(); run,model=measured(3,project_id=baseline.project_id)
    result=asyncio.run(explain_results(run,model,SelectingProvider(),baseline))
    finding=next(f for f in result.findings if f.id=='difference:average_waiting_time')
    assert 'decreased from 15 min to 0 min' in finding.text and 'difference of 15 min' in finding.text
    assert [f.run_id for f in finding.evidence]==[baseline.id,run.id]
    assert next(f for f in result.findings if f.id=='comparison').evidence[1].run_id==baseline.id
    assert 'proof of which configuration change caused it' in finding.text

@pytest.mark.parametrize('change',['duration','seed','project','same_run'])
def test_unfair_comparison_rejected_before_ai(change):
    baseline,_=measured(); run,model=measured(3,project_id=baseline.project_id)
    if change=='duration': baseline.duration+=1
    if change=='seed': baseline.seed+=1
    if change=='project': baseline.project_id=uuid4()
    if change=='same_run': baseline.id=run.id
    provider=SelectingProvider()
    with pytest.raises(ApiProblem): asyncio.run(explain_results(run,model,provider,baseline))
    assert not provider.calls

def test_zero_and_unknown_baseline():
    baseline,_=measured(3); run,model=measured(project_id=baseline.project_id)
    facts={f.id:f for f in build_supported_findings(run,model,baseline)}
    assert 'increased from 0 min to 15 min' in facts['difference:average_waiting_time'].text
    assert 'infinity' not in facts['difference:average_waiting_time'].text
    baseline.summary.average_cycle_time=None
    assert 'difference:average_cycle_time' not in {f.id for f in build_supported_findings(run,model,baseline)}

def test_api_saved_version_not_edited_canvas(test_database,monkeypatch):
    client=client_for(test_database); _,model=measured()
    project=client.post('/api/v1/projects',json={'name':'Explanation source','model':model.model_dump(mode='json')}).json()
    run=client.post(f"/api/v1/projects/{project['id']}/runs",json={}).json()
    changed=model.model_dump(mode='json')
    next(n for n in changed['nodes'] if n['type']=='process').update(name='Renamed later',config={'resource_count':3,'service_distribution':'constant','mean_service_time':5})
    assert client.put(f"/api/v1/projects/{project['id']}",json={'model':changed}).status_code==200
    def forbidden(*args,**kwargs): raise AssertionError('Explanation must not run simulation')
    monkeypatch.setattr('app.api.routes.projects.simulate',forbidden)
    provider=SelectingProvider(); client.app.dependency_overrides[get_model_provider]=lambda:provider
    response=client.post(ENDPOINT,json={'run_id':run['id']})
    assert response.status_code==200,response.text
    assert response.json()['model_version']==1 and 'Doctor' in response.json()['explanation']
    assert 'Renamed later' not in response.text
    assert client.get(f"/api/v1/runs/{run['id']}").json()['summary']==run['summary']
    assert client.post(ENDPOINT,json={'run_id':run['id'],'summary':{'throughput':999}}).status_code==400
    assert client.post(ENDPOINT,json={'run_id':str(uuid4())}).status_code==404

def test_outage_preserves_manual_simulation(test_database):
    client=client_for(test_database); _,model=measured()
    project=client.post('/api/v1/projects',json={'name':'AI outage','model':model.model_dump(mode='json')}).json()
    run=client.post(f"/api/v1/projects/{project['id']}/runs",json={}).json()
    client.app.dependency_overrides[get_model_provider]=lambda:SelectingProvider(['{}'])
    assert client.post(ENDPOINT,json={'run_id':run['id']}).status_code==502
    assert client.get('/health').status_code==200
    assert client.post('/api/v1/simulations/run',json=model.model_dump(mode='json')).status_code==200

def test_missing_key_is_optional(monkeypatch, test_database):
    monkeypatch.setattr('app.ai.provider.get_settings',lambda:Settings(_env_file=None,gemini_api_key=None))
    client=client_for(test_database); _,model=measured()
    project=client.post('/api/v1/projects',json={'name':'Missing key','model':model.model_dump(mode='json')}).json()
    run=client.post(f"/api/v1/projects/{project['id']}/runs",json={}).json()
    assert client.post(ENDPOINT,json={'run_id':str(uuid4())}).status_code==404
    response=client.post(ENDPOINT,json={'run_id':run['id']})
    assert response.status_code==503 and response.json()['error']['code']=='ai_unavailable'
    assert client.get('/health').status_code==200

def test_api_comparison_uses_exact_saved_runs(test_database):
    client=client_for(test_database); _,model=measured()
    project=client.post('/api/v1/projects',json={'name':'Comparison explanation','model':model.model_dump(mode='json')}).json()
    baseline=client.post(f"/api/v1/projects/{project['id']}/runs",json={}).json()
    changed=model.model_dump(mode='json')
    next(n for n in changed['nodes'] if n['type']=='process')['config']['resource_count']=3
    client.put(f"/api/v1/projects/{project['id']}",json={'model':changed})
    candidate=client.post(f"/api/v1/projects/{project['id']}/runs",json={}).json()
    provider=SelectingProvider(); client.app.dependency_overrides[get_model_provider]=lambda:provider
    response=client.post(ENDPOINT,json={'run_id':candidate['id'],'baseline_run_id':baseline['id']})
    assert response.status_code==200,response.text
    assert response.json()['run_id']==candidate['id'] and response.json()['baseline_run_id']==baseline['id']
    assert 'decreased from 15 min to 0 min' in response.json()['explanation']
    changed['simulation']['seed']=43
    client.put(f"/api/v1/projects/{project['id']}",json={'model':changed})
    mismatched=client.post(f"/api/v1/projects/{project['id']}/runs",json={}).json()
    before=len(provider.calls)
    assert client.post(ENDPOINT,json={'run_id':mismatched['id'],'baseline_run_id':baseline['id']}).status_code==409
    assert len(provider.calls)==before

def test_total_timeout_is_bounded(monkeypatch):
    original=asyncio.timeout
    monkeypatch.setattr('app.ai.explanation.asyncio.timeout',lambda _:original(0.01))
    class SlowProvider:
        async def generate(self,*args):
            await asyncio.sleep(1)
            return '{"finding_ids":["overview","bottleneck"]}'
    run,model=measured()
    with pytest.raises(ApiProblem) as error: asyncio.run(explain_results(run,model,SlowProvider()))
    assert error.value.status_code==503 and error.value.code=='ai_unavailable'

def test_oversized_facts_do_not_reach_provider():
    run,model=measured()
    next(n for n in model.nodes if n.type=='process').name='x'*100001
    provider=SelectingProvider()
    with pytest.raises(ApiProblem) as error: asyncio.run(explain_results(run,model,provider))
    assert error.value.code=='invalid_configuration' and not provider.calls

import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from app.simulation.engine import simulate

def node(id, kind, name, x, y, config):
    return dict(id=id, type=kind, name=name, position=dict(x=x,y=y), config=config)
model = dict(id='playback-clinic', name='Clinic playback example', simulation=dict(duration=24,seed=42), nodes=[
    node('entrance','source','Clinic entrance',0,180,dict(distribution='constant',mean_interarrival_time=1,max_entities=8)),
    node('waiting','queue','Reception waiting',360,180,dict(capacity=None,discipline='fifo')),
    node('nurse','process','Nurse assessment',720,180,dict(resource_count=1,service_distribution='constant',mean_service_time=2)),
    node('route','decision','Follow-up needed?',1080,180,dict(routing='probability')),
    node('observe','delay','Observation lounge',1440,0,dict(distribution='constant',mean_delay=3)),
    node('exit','sink','Clinic exit',1800,180,{})
], edges=[dict(id=id,source=a,target=b,**extra) for id,a,b,extra in [
    ('e1','entrance','waiting',{}),('e2','waiting','nurse',{}),('e3','nurse','route',{}),
    ('yes','route','observe',dict(sourceHandle='yes',probability=.5)),('no','route','exit',dict(sourceHandle='no',probability=.5)),('e6','observe','exit',{})
]])
result=simulate(model).model_dump(mode='json',by_alias=False)
assert {e['node_id'] for e in result['events'] if e['type']=='node_enter'} == {n['id'] for n in model['nodes']}
branches=[]
for id in {e['entity_id'] for e in result['events']}:
    route=[e['node_id'] for e in result['events'] if e['entity_id']==id and e['type']=='node_enter']
    branches.append('observe' in route)
assert any(branches) and not all(branches)
run={k:result[k] for k in ['summary','node_metrics','time_series','events','bottleneck_analysis']}
run['bottleneck_analysis']['primaryBottleneck'] = run['bottleneck_analysis'].pop('primary_bottleneck')
run.update(id='development-clinic-42',project_id='development-only',scenario_id=None,model_version=1,seed=42,duration=24,created_at='2026-10-09T00:00:00Z',model=model)
Path(__file__).with_name('clinic-playback.json').write_text(json.dumps(run,indent=2)+'\n')

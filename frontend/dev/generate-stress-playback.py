import sys,json,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2] / 'backend'))
from app.simulation.engine import simulate
base=json.loads(Path(__file__).with_name('clinic-playback.json').read_text())
model=copy.deepcopy(base['model']);model['id']='stress-clinic';model['name']='Engine-generated playback stress';model['simulation']['duration']=30
nodes=[];edges=[]
for i in range(14):
    for n in model['nodes']:
        n=copy.deepcopy(n);n['id']=f"{i}-{n['id']}";n['position']['y']+=i*260
        if n['type']=='source':n['config'].update(max_entities=100,mean_interarrival_time=.02)
        if n['type']=='process':n['config']['mean_service_time']=.2
        nodes.append(n)
    for e in model['edges']:
        e=copy.deepcopy(e);e['id']=f"{i}-{e['id']}";e['source']=f"{i}-{e['source']}";e['target']=f"{i}-{e['target']}";edges.append(e)
model['nodes']=nodes;model['edges']=edges
result=simulate(model).model_dump(mode='json',by_alias=False)
run={k:result[k] for k in ['summary','node_metrics','time_series','events','bottleneck_analysis']}
run['bottleneck_analysis']['primaryBottleneck']=run['bottleneck_analysis'].pop('primary_bottleneck')
run.update(id='development-stress-42',project_id='development-only',scenario_id=None,model_version=1,seed=42,duration=30,created_at=base['created_at'],model=model)
Path(__file__).with_name('stress-playback.json').write_text(json.dumps(run,separators=(',',':'))+'\n')
print('Stress fixture:',len(run['events']),'real events;',run['summary']['total_generated'],'entities')

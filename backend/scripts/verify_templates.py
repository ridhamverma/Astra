import json, time
from pathlib import Path
from app.simulation import simulate,validate_executable_model
from app.schemas.simulation import SimulationModel
from app.schemas.optimization import OptimizationRequest
from app.optimization.grid_search import optimize
root=Path(__file__).resolve().parents[2]
p=root/'docs/liquid-glass/templates';report={}
for d in sorted(p.iterdir()):
 if not d.is_dir():continue
 report[d.name]={}
 for variant in ['baseline','add-one','alternative']:
  model=validate_executable_model(SimulationModel.model_validate_json((d/f'{variant}.json').read_text()))
  start=time.perf_counter();result=simulate(model);elapsed=(time.perf_counter()-start)*1000
  report[d.name][variant]={'milliseconds':round(elapsed,2),'summary':result.summary.model_dump(),'bottleneck':result.bottleneck_analysis.primary_bottleneck,'nodes':{k:v.model_dump() for k,v in result.node_metrics.items()}}
 req=OptimizationRequest.model_validate_json((d/'optimization.json').read_text());r=optimize(req)
 report[d.name]['optimization']={'resources':r.recommended.configuration.value if r.recommended else None,'seeds':r.seeds,'runs':r.simulation_runs,'candidates':[{'resources':v.configuration.value,'status':v.status,'mean':v.objective.mean} for v in r.tested_candidates]}
(root/'docs/liquid-glass/template-verification.json').write_text(json.dumps(report,indent=2)+'\n')
for name,variants in report.items():
 print(name)
 for v,r in variants.items():
  if v=='optimization':print(v,r);continue
  s=r['summary'];print(v, r['bottleneck'], 'wait',round(s['average_waiting_time'],2),'generated',s['total_generated'],'completed',s['total_completed'],'rejected',s['total_rejected'],'remaining',s['in_system_at_end'],'ms',r['milliseconds'])

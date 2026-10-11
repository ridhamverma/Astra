const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function harness(fetch, timers={setTimeout,clearTimeout}, window) {
 const modules=new Map();
 function load(name){
  if(modules.has(name))return modules.get(name);
  const exports={};modules.set(name,exports);
  const source=fs.readFileSync(path.join(__dirname,'..',name+'.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require','fetch','setTimeout','clearTimeout','window',js)(exports,p=>load(p.startsWith('@/')?p.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(name),p))),fetch,timers.setTimeout,timers.clearTimeout,window);
  return exports;
 }
 return {load,api:load('services/api')};
}
test('identical simultaneous writes use one request; later intentional writes still execute',async()=>{
 let release,calls=0;
 const h=harness(async()=>{calls++;return new Promise(resolve=>{release=()=>resolve(new Response('{"ok":true}'));});});
 const first=h.api.request('/projects',h.api.json({name:'A'})),second=h.api.request('/projects',h.api.json({name:'A'}));
 assert.equal(calls,1);release();assert.deepEqual(await first,await second);
 const next=h.api.request('/projects',h.api.json({name:'A'}));assert.equal(calls,2);release();await next;
});
test('network, invalid JSON, and malformed API error details are handled consistently',async()=>{
 for(const body of [new Error('offline'),new Response('invalid'),new Response(JSON.stringify({error:{message:'Invalid',details:[null,{path:5},{code:'invalid',path:'model',message:'Fix it'}]}}),{status:422})]){
  const h=harness(async()=>{if(body instanceof Error)throw body;return body;});
  await assert.rejects(h.api.request('/broken'),error=>{assert.ok(error instanceof h.api.ApiRequestError);assert.ok(error.message);assert.equal(error.issues.length,body.status===422?1:0);return true;});
 }
});
test('timeout covers pending network operations and clears its timer',async()=>{
 let expire,cleared=false;
 const h=harness((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))),{setTimeout:fn=>{expire=fn;return 1;},clearTimeout:()=>{cleared=true;}});
 const request=h.api.request('/pending');expire();await assert.rejects(request,/timed out/);assert.ok(cleared);
});
test('project services pin runs and reject lost edits, exclude scenario history, and reset version tokens on logout',async()=>{
 const calls=[];let currentVersion=2;
 const h=harness(async(url,options)=>{
  calls.push({url,body:options.body?JSON.parse(options.body):null,headers:options.headers});
  if(url.endsWith('/access'))return new Response(null,{status:204});
  if(url.endsWith('/runs'))return new Response(JSON.stringify([{id:'baseline',is_scenario:false,scenario_id:null},{id:'deleted-scenario',is_scenario:true,scenario_id:null},{id:'scenario',is_scenario:true,scenario_id:'s'}]));
  return new Response(JSON.stringify({id:'p/a',latest_version:currentVersion,model:null}));
 });
 h.api.setCsrfToken('session-1');const projects=h.load('services/projects').projectsApi;
 await projects.get('p/a');await projects.update('p/a','A',{});await projects.run('p/a');
 assert.equal(calls.find(c=>c.body?.expected_version).body.expected_version,2);
 assert.equal(calls.find(c=>c.body?.include_timeline).body.model_version,2);
 assert.equal(calls.find(c=>c.body?.include_timeline).headers.get('X-Astra-CSRF'),'session-1');
 assert.deepEqual((await projects.runs('p/a')).map(r=>r.id),['baseline']);
 h.api.setCsrfToken('');await projects.update('p/a','B',{});assert.equal(calls.at(-1).body.expected_version,undefined);
 currentVersion=null;await projects.get('p/a');await projects.update('p/a','Blank',{});assert.equal(calls.at(-1).body.expected_version,0);
});
test('scenario services carry snapshot versions through edits and runs',async()=>{
 const calls=[];const h=harness(async(url,options)=>{calls.push({url,body:options.body?JSON.parse(options.body):null});return new Response(JSON.stringify(url.endsWith('/scenarios')?[{id:'s',model_version:3}]:{id:'s',model_version:4}));});
 const api=h.load('services/scenarios').scenariosApi;
 await api.list('p');await api.update('s',{model:{}});await api.run('s');
 assert.equal(calls[1].body.expected_version,3);assert.equal(calls[2].body.model_version,4);
});
test('a delayed unauthorized response from an old session cannot log out a newly authenticated user',async()=>{
 let release,events=0;
 const h=harness(()=>new Promise(resolve=>{release=()=>resolve(new Response('{}',{status:401}));}),undefined,{dispatchEvent:()=>events++});
 h.api.setCsrfToken('old-session');const stale=h.api.request('/projects');h.api.setCsrfToken('new-session');
 release();await assert.rejects(stale,h.api.ApiRequestError);assert.equal(events,0);
 const current=h.api.request('/projects');release();await assert.rejects(current,h.api.ApiRequestError);assert.equal(events,1);
});

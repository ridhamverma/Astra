const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const source = fs.readFileSync(path.join(__dirname, '../lib', `${name}.ts`), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  new Function('exports','require',js)(exports, p => load(p.replace('./','')));
  return exports;
}
const { TimelinePlayer, visualJourneys, MARKER_LIMIT } = load('playback');
const { playbackLayout, STATION_CAPACITY } = load('playback-layout');
const fixture = require('../dev/clinic-playback.json');
const event = (time,type,node_id,entity_id='a') => ({ time,type,node_id,entity_id });

test('engine fixture covers all six kinds, both chosen branches, and exact completion totals', () => {
  assert.equal(new Set(fixture.model.nodes.map(n=>n.type)).size,6);
  const player = new TimelinePlayer(fixture.events,fixture.duration);
  player.advance(fixture.duration);
  assert.equal(player.completed,fixture.summary.total_completed);
  assert.equal(player.rejected,fixture.summary.total_rejected);
  assert.equal(player.active.size,fixture.summary.in_system_at_end);
  const chosen = new Set();
  for (const id of new Set(fixture.events.map(e=>e.entity_id))) {
    const nodes = fixture.events.filter(e=>e.entity_id===id && e.type==='node_enter').map(e=>e.node_id);
    chosen.add(nodes[nodes.indexOf('route')+1]);
  }
  assert.deepEqual([...chosen].sort(),['exit','observe']);
});

test('queue FIFO survives repeated state updates; service slots are stable and reused', () => {
  const p = new TimelinePlayer([
    event(0,'entity_created','queue','a'),event(0,'entity_created','queue','b'),
    event(1,'service_requested','process','a'),event(2,'node_enter','process','a'),event(2,'service_started','process','a'),
    event(3,'node_enter','process','b'),event(3,'service_started','process','b'),
    event(4,'entity_completed','exit','a'),event(4,'entity_created','process','c'),event(4,'service_started','process','c')
  ],10);
  p.advance(1); assert.deepEqual(p.atNode('queue').map(e=>e.id),['a','b']);
  p.advance(3); assert.equal(p.active.get('a').serviceSlot,0); assert.equal(p.active.get('b').serviceSlot,1);
  p.advance(4); assert.equal(p.active.get('b').serviceSlot,1); assert.equal(p.active.get('c').serviceSlot,0);
});

test('instantaneous multihop journey follows ordered engine branches with one person, even after completion', () => {
  const p = new TimelinePlayer([event(1,'entity_created','process'),event(2,'node_enter','decision'),event(2,'node_enter','sink'),event(2,'entity_completed','sink')],10);
  p.advance(2.1);
  assert.equal(p.completed,1); assert.equal(p.active.size,0);
  let journeys = visualJourneys(p);
  assert.equal(journeys.length,1); assert.equal(journeys[0].leg.target,'decision');
  p.advance(2.3); assert.equal(visualJourneys(p)[0].leg.target,'sink');
  p.advance(2.5); assert.equal(visualJourneys(p).length,0);
  p.seek(2.1); assert.deepEqual(visualJourneys(p),journeys);
});

test('later transfers replace earlier ones; end-of-run transitions are bounded', () => {
  const p = new TimelinePlayer([event(0,'entity_created','source'),event(1,'node_enter','queue'),event(1.1,'node_enter','process'),event(1.9,'node_enter','sink'),event(1.9,'entity_completed','sink')],2);
  p.advance(1.15); assert.equal(visualJourneys(p).length,1); assert.equal(visualJourneys(p)[0].leg.source,'queue');
  p.advance(2); assert.equal(visualJourneys(p).length,0);
});

test('delay occupancy and release are authoritative throughout visual movement', () => {
  const p = new TimelinePlayer(fixture.events,fixture.duration);
  const enter = fixture.events.find(e=>e.type==='node_enter' && e.node_id==='observe');
  const leave = fixture.events.find(e=>e.entity_id===enter.entity_id && e.type==='node_exit' && e.node_id==='observe');
  p.seek(enter.time+.1); assert.equal(p.active.get(enter.entity_id).nodeId,'observe');
  p.seek(leave.time); assert.equal(p.active.has(enter.entity_id),false);
  assert.equal(p.completedByNode.get('exit'),p.completed);
});

test('crowds have exact overflow and reduced motion uses only station positions', () => {
  const nodes=Array.from({length:20},(_,i)=>({id:`n${i}`,type:'queue',position:{x:i*300,y:0},config:{capacity:null,discipline:'fifo'}}));
  const events=nodes.flatMap(n=>Array.from({length:15},(_,i)=>event(0,'entity_created',n.id,`${n.id}-${i}`)));
  const p=new TimelinePlayer(events,10); p.advance(1);
  const plan=playbackLayout(p,nodes,true);
  assert.equal(plan.journeys.length,0); assert.equal(plan.slots.length,MARKER_LIMIT);
  assert.equal([...plan.overflow.values()].reduce((a,b)=>a+b,0),300-MARKER_LIMIT);
  assert.equal(plan.slots.filter(s=>s.entity.nodeId==='n0').length,STATION_CAPACITY);
});

test('pause reads are immutable, clock increments and seek/reset yield identical visual state', () => {
  const p=new TimelinePlayer(fixture.events,fixture.duration);
  p.seek(7.15); const state=JSON.stringify(playbackLayout(p,fixture.model.nodes));
  assert.equal(JSON.stringify(playbackLayout(p,fixture.model.nodes)),state);
  p.reset(); for(let t=0;t<7.15;t+=.03)p.advance(t); p.advance(7.15);
  assert.equal(JSON.stringify(playbackLayout(p,fixture.model.nodes)),state);
  p.seek(15);p.seek(7.15);assert.equal(JSON.stringify(playbackLayout(p,fixture.model.nodes)),state);
});

test('motion samples rendered curves by arc length and connects station interiors continuously', () => {
  const { sampleSceneJourney } = load('playback-layout');
  const radius=10, length=Math.PI*radius/2;
  const curve={length,sample: d=>({x:10+radius*Math.sin(d/radius),y:radius*(1-Math.cos(d/radius))})};
  const start={x:0,y:0},end={x:30,y:10};
  const total=10+length+10;
  assert.deepEqual(sampleSceneJourney([curve],start,end,0),{x:0,y:0,facing:1});
  const midway=sampleSceneJourney([curve],start,end,(10+length/2)/total);
  assert.ok(Math.abs(midway.x-(10+radius/Math.sqrt(2)))<1e-9);
  assert.ok(Math.abs(midway.y-(10-radius/Math.sqrt(2)))<1e-9);
  const finish=sampleSceneJourney([curve],start,end,1);
  assert.ok(Math.abs(finish.x-30)<1e-9 && Math.abs(finish.y-10)<1e-9 && finish.facing>0);
  const a=sampleSceneJourney([curve],start,end,(10-1e-6)/total),b=sampleSceneJourney([curve],start,end,(10+1e-6)/total);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<3e-6);
});

test('cached curve samples preserve endpoints and avoid native geometry work per frame',()=>{
 const {cacheScenePath}=load('playback-layout');let calls=0;const curve=cacheScenePath({getTotalLength:()=>100,getPointAtLength:d=>{calls++;return {x:d,y:d/2};}});const measured=calls;assert.deepEqual(curve.sample(0),{x:0,y:0});assert.deepEqual(curve.sample(100),{x:100,y:50});assert.deepEqual(curve.sample(31),{x:31,y:15.5});for(let i=0;i<10000;i++)curve.sample(i%100);assert.equal(calls,measured);
});

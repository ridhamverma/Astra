const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(name){const out={};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,`../lib/${name}.ts`),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out);return out;}
const {TimelinePlayer}=load('playback'),{aggregateEventTicks,playbackShortcut}=load('playback-timeline');
const fixture=require('../dev/clinic-playback.json');
const state=p=>JSON.stringify({time:p.time,index:p.index,completed:p.completed,rejected:p.rejected,arrived:p.arrived,active:[...p.active],occupancy:[...p.occupancy],routes:[...p.routes],transfers:p.transfers});
test('checkpoint seek matches sequential replay in either direction including equal-time prefixes and final gaps',()=>{
 const events=Array.from({length:70},(_,i)=>fixture.events.map(e=>({...e,time:e.time+i*24,entity_id:`${i}-${e.entity_id}`}))).flat();
 const p=new TimelinePlayer(events,1700);p.prepareSnapshots();
 for(const t of [0,3.1,700,1500,1,1680,400,4,1664.1,1700]){const sequential=new TimelinePlayer(events,1700);while(!sequential.advance(t)){}while(!p.seek(t)){}assert.equal(state(p),state(sequential),`at ${t}`);}
});
test('single-event stepping preserves every equal-time backend event without duplication',()=>{
 const p=new TimelinePlayer(fixture.events,24);p.step(1);assert.equal(p.index,1);assert.equal(p.time,0);assert.equal(p.arrived,1);
 for(let i=0;i<14;i++)p.step(1);assert.equal(p.index,15);for(let i=0;i<15;i++)p.step(-1);assert.equal(p.index,0);assert.equal(p.active.size,0);
});
test('tick aggregation bounds output and preserves arrivals/completions/rejections',()=>{
 const events=Array.from({length:10000},(_,i)=>({time:i/100,type:['entity_created','entity_completed','queue_rejected'][i%3],node_id:'n',entity_id:`e${i}`}));
 const ticks=aggregateEventTicks(events,100,100);assert.ok(ticks.length<=300);assert.equal(ticks.reduce((n,t)=>n+t.count,0),10000);assert.equal(new Set(ticks.map(t=>t.kind)).size,3);
});
test('keyboard mapping uses ten simulation seconds expressed in minutes',()=>{assert.equal(playbackShortcut('ArrowLeft'),'previous');assert.equal(playbackShortcut('ArrowRight',true),'forward10');assert.equal(playbackShortcut(' '),'toggle');assert.equal(playbackShortcut('R'),'reset');assert.equal(playbackShortcut('Escape'),'clear');assert.equal(playbackShortcut('a'),null);});
const {entityInformation,indexEntityEvents}=load('playback-information');
test('realized routing counts are engine-selected connections, including both decision branches',()=>{const p=new TimelinePlayer(fixture.events,24);p.advance(24);const {routeKey}=load('playback');const yes=p.routes.get(routeKey('route','observe')),no=p.routes.get(routeKey('route','exit'));assert.ok(yes>0&&no>0);assert.equal(yes+no,fixture.summary.total_completed);p.seek(0);assert.equal(p.routes.get(routeKey('route','observe')),undefined);});
test('entity inspector totals closed and open intervals from requests and service events',()=>{const index=indexEntityEvents(fixture.events);const info=entityInformation(index.get('entity-8'),fixture.events.length,24);assert.equal(info.service,2);assert.equal(info.wait,7);assert.ok(info.inSystem>=9);assert.equal(info.status,'completed');assert.equal(info.route.at(-1),'exit');});
test('operational palette meets text and component contrast against the playback surface',()=>{
 const {PLAYBACK_DESIGN:d}=load('playback-design');const luminance=hex=>{const a=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
 for(const key of ['text','secondary','waiting','service','transfer','rejected','completed'])assert.ok(contrast(d[key],d.surface)>=4.5,key);
 assert.ok(contrast(d.border,d.surface)>=3);assert.ok(contrast(d.track,d.surface)>=3);
});

test('exact log selection restores the requested prefix and service completion releases its slot',()=>{
 const p=new TimelinePlayer(fixture.events,24);
 for(const count of [80,1,100,10,0,155]){p.seekIndex(count);const sequential=new TimelinePlayer(fixture.events,24);if(count)sequential.advance(fixture.events[count-1].time,count);assert.equal(p.index,count);assert.equal(state(p),state(sequential));}
 const end=fixture.events.findIndex(e=>e.type==='service_completed');p.seekIndex(end+1);const e=p.active.get(fixture.events[end].entity_id);assert.equal(e.state,'present');assert.equal(e.serviceSlot,undefined);
});

test('event-prefix exits release station occupancy once while preserving entity identity for the next hop',()=>{
 const p=new TimelinePlayer(fixture.events,24);const count=fixture.events.findIndex(e=>e.type==='queue_exit')+1;p.seekIndex(count);const entity=p.active.get(fixture.events[count-1].entity_id);assert.equal(entity.departing,true);assert.equal(p.atNode(entity.nodeId).length,0);assert.equal(p.occupancy.get(entity.nodeId).present,0);const created=entity.createdAt;p.step(1);assert.equal(p.occupancy.get(entity.nodeId).present,0);p.step(1);assert.equal(p.active.get(entity.id).createdAt,created);assert.equal(p.active.get(entity.id).departing,undefined);
});

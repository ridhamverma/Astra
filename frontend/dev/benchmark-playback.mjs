import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const out={};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(here,'../lib/playback.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out);
const {TimelinePlayer}=out;
const fixture=JSON.parse(fs.readFileSync(path.join(here,'clinic-playback.json'),'utf8'));
const events=Array.from({length:100},(_,i)=>fixture.events.map(e=>({...e,time:e.time+i*24,entity_id:`${i}-${e.entity_id}`}))).flat();
const p=new TimelinePlayer(events,2400);const prepare=performance.now();p.prepareSnapshots();const build=performance.now()-prepare;
const samples=[];for(let i=0;i<400;i++){const t=((i*7919)%240000)/100;const start=performance.now();p.seek(t);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);console.log(JSON.stringify({events:events.length,snapshotBuildMs:build,maxSeekMs:samples.at(-1),p95SeekMs:samples[Math.floor(samples.length*.95)]},null,2));

if (samples.at(-1) >= 50) throw new Error('Playback seek exceeded the 50 ms target');

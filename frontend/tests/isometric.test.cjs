const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const projection={};
new Function('exports',ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../lib/isometric.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(projection);
const {projectModelPosition:projectFloor,unprojectModelPosition:unprojectFloor,isometricRoute,stationSlot}=projection;
test('builder presentation round trips saved positions and screen drag deltas on both floor axes',()=>{
 for(const point of [{x:0,y:0},{x:352,y:-280},{x:-1400,y:320},{x:.125,y:234.56}]) {
  const copy={...point}, screen=projectFloor(point), restored=unprojectFloor(screen);
  assert.ok(Math.abs(restored.x-point.x)<1e-9);assert.ok(Math.abs(restored.y-point.y)<1e-9);assert.deepEqual(point,copy);
  const drag=unprojectFloor({x:screen.x+80,y:screen.y-32});
  const actual=projectFloor(drag);assert.ok(Math.abs(actual.x-screen.x-80)<1e-9);assert.ok(Math.abs(actual.y-screen.y+32)<1e-9);
 }
});
test('projected routes meet ports exactly and stay finite for reverse and coincident connections',()=>{
 for(const end of [{x:800,y:240},{x:-100,y:650},{x:40,y:20}]) {
  const start={x:40,y:20};const route=isometricRoute({sourceX:start.x,sourceY:start.y,targetX:end.x,targetY:end.y});
  const numbers=route.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
  assert.ok(numbers.every(Number.isFinite));assert.ok(Math.abs(numbers[0]-start.x)<1e-9);assert.ok(Math.abs(numbers[1]-start.y)<1e-9);
  assert.ok(Math.abs(numbers.at(-2)-end.x)<1e-9);assert.ok(Math.abs(numbers.at(-1)-end.y)<1e-9);
 }
 assert.equal(new Set(Array.from({length:6},(_,i)=>JSON.stringify(stationSlot(i)))).size,6);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exported = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/optimization.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText)(exported);
const model=JSON.parse(fs.readFileSync(path.join(__dirname,'../../docs/examples/doctor-capacity.json'),'utf8'));
test('applying a recommendation changes only canonical Process resource count',()=>{
 const before=JSON.stringify(model); const updated=exported.applyResourceConfiguration(model,'doctor',3);
 assert.equal(JSON.stringify(model),before);
 const expected=JSON.parse(before); expected.nodes.find(n=>n.id==='doctor').config.resource_count=3;
 assert.deepEqual(updated,expected);
});
test('stale or unsupported recommendation targets and values are rejected',()=>{
 for (const value of [0,101,1.5,NaN]) assert.throws(()=>exported.applyResourceConfiguration(model,'doctor',value));
 for (const id of ['missing','arrivals']) assert.throws(()=>exported.applyResourceConfiguration(model,id,3));
});

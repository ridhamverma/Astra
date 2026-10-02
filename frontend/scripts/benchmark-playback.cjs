// Uses real backend events; does not animate or fabricate simulation measurements.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const source = fs.readFileSync(path.join(__dirname, '../lib/playback.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
const exported = {}; new Function('exports', compiled)(exported);
const { TimelinePlayer, FRAME_EVENT_LIMIT, MARKER_LIMIT } = exported;
const input = JSON.parse(fs.readFileSync(process.argv[2] ?? '/tmp/astra-phase19-timeline.json', 'utf8'));
const times = []; let frames = 0; const frameTimes = [];
for (let sample = 0; sample < 5; sample++) {
  const player = new TimelinePlayer(input.events, input.duration);
  let count = 0; const started = performance.now();
  let done = false;
  while (!done) {
    const before = player.index; const frameStarted = performance.now();
    done = player.advance(input.duration);
    assert(player.index - before <= FRAME_EVENT_LIMIT);
    assert(player.markers().length <= MARKER_LIMIT);
    frameTimes.push(performance.now() - frameStarted); count++;
  }
  times.push(performance.now() - started); frames = count;
  assert.equal(player.completed, input.expected_completed);
  assert.equal(player.index, input.events.length);
  player.reset(); assert.equal(player.index, 0);
}
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
const report = { events: input.events.length, samples:5, frames_per_replay:frames, median_replay_ms:percentile(times,.5), p95_frame_cpu_ms:percentile(frameTimes,.95), max_frame_cpu_ms:Math.max(...frameTimes), event_budget:FRAME_EVENT_LIMIT, marker_limit:MARKER_LIMIT, environment:'Node.js algorithm benchmark; excludes React rendering and browser paint' };
const output = process.argv[3] ?? '../docs/playback-performance-results.json';
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));

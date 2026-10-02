const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const exportsObject = {};
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../lib/playback.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2017,
  },
}).outputText;
new Function("exports", compiled)(exportsObject);
const { TimelinePlayer, MARKER_LIMIT, FRAME_EVENT_LIMIT } = exportsObject;
const event = (time, type, node_id, entity_id = "e1") => ({
  time,
  type,
  node_id,
  entity_id,
});
const events = [
  event(0, "entity_created", "source"),
  event(0, "node_enter", "queue"),
  event(0, "queue_wait_started", "queue"),
  event(0, "service_requested", "doctor"),
  event(5, "queue_exit", "queue"),
  event(5, "node_exit", "queue"),
  event(5, "node_enter", "doctor"),
  event(5, "service_started", "doctor"),
  event(7, "service_completed", "doctor"),
  event(7, "node_exit", "doctor"),
  event(7, "node_enter", "sink"),
  event(7, "entity_completed", "sink"),
];

test("equal-time order, downstream requests preserve queue location, and completion", () => {
  const player = new TimelinePlayer(events, 10);
  player.advance(0);
  assert.deepEqual(player.occupancy.get("queue"), {
    present: 1,
    waiting: 1,
    serving: 0,
  });
  assert.equal(player.active.get("e1").nodeId, "queue");
  player.advance(5);
  assert.equal(player.active.get("e1").state, "serving");
  assert.equal(player.occupancy.get("queue").present, 0);
  player.advance(10);
  assert.equal(player.completed, 1);
  assert.equal(player.active.size, 0);
});

test("different clock increments and reset replay produce identical state without mutating events", () => {
  const original = JSON.stringify(events);
  for (const speed of [1, 5, 10, 20]) {
    const player = new TimelinePlayer(events, 10);
    for (let time = 0; time < 10; time += speed / 10) player.advance(time);
    player.advance(10);
    assert.equal(player.completed, 1);
    assert.equal(player.index, events.length);
    player.reset();
    assert.equal(player.index, 0);
    assert.equal(player.active.size, 0);
    player.advance(10);
    assert.equal(player.completed, 1);
  }
  assert.equal(JSON.stringify(events), original);
});

test("rejected entities leave active state even when node_exit follows rejection", () => {
  const player = new TimelinePlayer(
    [
      event(0, "entity_created", "source"),
      event(0, "node_enter", "queue"),
      event(0, "queue_rejected", "queue"),
      event(0, "node_exit", "queue"),
    ],
    10,
  );
  player.advance(10);
  assert.equal(player.rejected, 1);
  assert.equal(player.active.size, 0);
});

test("large equal-time logs have bounded per-frame consumption and markers, exact aggregate counts", () => {
  const large = Array.from({ length: 20000 }, (_, i) =>
    event(0, "entity_created", "queue", `e${i}`),
  );
  const player = new TimelinePlayer(large, 10);
  assert.equal(player.advance(10), false);
  assert.equal(player.index, FRAME_EVENT_LIMIT);
  assert.equal(player.time, 0);
  while (!player.advance(10)) {}
  assert.equal(player.active.size, 20000);
  assert.equal(player.markers().length, MARKER_LIMIT);
  assert.equal(player.occupancy.get("queue").present, 20000);
});

test("seeking backwards replays the same immutable timeline and remains budget bounded", () => {
  const events = [
    { time: 1, type: "entity_created", entity_id: "one", node_id: "source" },
    { time: 2, type: "entity_completed", entity_id: "one", node_id: "sink" },
  ];
  const before = JSON.stringify(events),
    player = new TimelinePlayer(events, 5);
  assert.equal(player.seek(5, 1), false);
  assert.equal(player.index, 1);
  assert.equal(player.seek(5, 1), true);
  assert.equal(player.completed, 1);
  assert.equal(player.seek(1), true);
  assert.equal(player.completed, 0);
  assert.equal(player.active.size, 1);
  assert.equal(JSON.stringify(events), before);
});

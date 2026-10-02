const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const path = require("node:path");
const exported = {};
new Function(
  "exports",
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../lib/builder-presentation.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2017,
      },
    },
  ).outputText,
)(exported);
const configs = {
  source: { mean_interarrival_time: 5 },
  queue: { capacity: 24 },
  process: { mean_service_time: 12, resource_count: 3 },
  decision: { routing: "probability" },
  delay: { mean_delay: 30 },
  sink: {},
};
const nodes = Object.entries(configs).map(([type, config]) => ({
  id: type,
  type,
  data: { name: type, config },
}));
const edges = [
  { source: "decision", sourceHandle: "yes", data: { probability: 0.7 } },
  { source: "decision", sourceHandle: "no", data: { probability: 0.3 } },
];
for (const node of nodes)
  test(`${node.type} has exactly two stable rows before a run`, () => {
    const rows = exported.nodeRows(node, null, null, edges, nodes);
    assert.equal(rows.length, 2);
    assert.ok(
      rows.every(
        ([label, value]) =>
          typeof label === "string" && typeof value === "string",
      ),
    );
    if (node.type === "source") assert.equal(rows[1][1], "--");
    if (node.type === "delay")
      assert.deepEqual(rows, [
        ["Configured", "30 min"],
        ["Avg hold", "--"],
      ]);
    if (node.type === "sink")
      assert.deepEqual(rows, [
        ["Rate", "--"],
        ["Completed", "--"],
      ]);
    if (node.type === "decision")
      assert.deepEqual(rows, [
        ["Yes", "70%"],
        ["No", "30%"],
      ]);
  });
test("configured delay and measured hold remain separate, and runtime totals reconcile", () => {
  const run = {
    id: "run",
    duration: 60,
    summary: { total_generated: 14, total_completed: 12 },
    node_metrics: {
      process: {
        resource_count: 3,
        total_busy_resource_time: 90,
        resource_utilization: 0.5,
      },
    },
    events: [
      { node_id: "delay", entity_id: "a", type: "node_enter", time: 2 },
      { node_id: "delay", entity_id: "a", type: "node_exit", time: 34 },
    ],
  };
  assert.equal(exported.averageUtilization(run), "50");
  assert.deepEqual(
    exported.nodeRows(
      nodes.find((n) => n.type === "delay"),
      run,
      run,
      edges,
      nodes,
    ),
    [
      ["Configured", "30 min"],
      ["Avg hold", "32 min"],
    ],
  );
  assert.deepEqual(
    exported.nodeRows(
      nodes.find((n) => n.type === "sink"),
      run,
      null,
      edges,
      nodes,
    ),
    [
      ["Rate", "12 / hr"],
      ["Completed", "12"],
    ],
  );
  assert.equal(configs.delay.mean_delay, 30);
});

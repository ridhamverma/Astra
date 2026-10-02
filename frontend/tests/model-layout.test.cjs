const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const exported = {};
new Function(
  "exports",
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "../lib/model-layout.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2017,
      },
    },
  ).outputText,
)(exported);
for (const name of ["bank", "hospital", "simple"])
  test(`generated ${name} layout preserves parameters and places every edge forward`, () => {
    const model = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, `../../docs/examples/${name}.json`),
        "utf8",
      ),
    );
    const before = JSON.stringify(model);
    const result = exported.layoutGeneratedModel(model);
    assert.equal(JSON.stringify(model), before);
    assert.deepEqual(result.edges, model.edges);
    assert.deepEqual(result.simulation, model.simulation);
    assert.deepEqual(
      result.nodes.map(({ position, ...rest }) => rest),
      model.nodes.map(({ position, ...rest }) => rest),
    );
    for (const edge of result.edges)
      assert.ok(
        result.nodes.find((n) => n.id === edge.source).position.x <
          result.nodes.find((n) => n.id === edge.target).position.x,
      );
    assert.equal(
      new Set(result.nodes.map((n) => JSON.stringify(n.position))).size,
      result.nodes.length,
    );
    assert.deepEqual(exported.layoutGeneratedModel(model), result);
  });
test("new main flow uses 104px gaps, with a raised branch and centered merge", () => {
  const kinds = ["source", "queue", "process", "decision", "delay", "sink"];
  const nodes = kinds.map((type, i) => ({
    id: type,
    type,
    name: type,
    position: { x: i * 10, y: i * 10 },
    config: {},
  }));
  const edges = [
    ["source", "queue"],
    ["queue", "process"],
    ["process", "decision"],
    ["decision", "delay"],
    ["decision", "sink"],
    ["delay", "sink"],
  ].map(([source, target], i) => ({ id: String(i), source, target }));
  const result = exported.layoutGeneratedModel({
    nodes,
    edges,
    simulation: { duration: 60, seed: 42 },
  });
  assert.equal(
    result.nodes[1].position.x - result.nodes[0].position.x - 248,
    104,
  );
  assert.equal(result.nodes.find((n) => n.id === "delay").position.y, -112);
  assert.equal(result.nodes.find((n) => n.id === "sink").position.y, 0);
  assert.ok(
    result.nodes
      .filter((n) => n.id !== "delay")
      .every((n) => n.position.y === 0),
  );
});

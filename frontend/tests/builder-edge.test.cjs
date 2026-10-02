const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const path = require("node:path");
const flow = require("@xyflow/react");
const exported = {};
new Function(
  "exports",
  "require",
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../lib/builder-edge-geometry.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2017,
      },
    },
  ).outputText,
)(exported, require);
const points = {
  sourceX: 248,
  sourceY: 56,
  targetX: 352,
  targetY: 56,
  sourcePosition: flow.Position.Right,
  targetPosition: flow.Position.Left,
};
test("new straight edges retain the true midpoint and visible arrow clearance", () => {
  const result = exported.builderEdgeGeometry(points);
  assert.equal(result.x, 300);
  assert.equal(result.y, 56);
  assert.ok(result.x - 28 - points.sourceX >= 16);
  assert.ok(points.targetX - result.x - 28 >= 16);
  assert.ok(result.path.endsWith("344,56") || result.path.includes("344"));
});
test("short saved gaps use a raised midpoint without moving nodes", () => {
  const saved = { ...points, targetX: 260 };
  const result = exported.builderEdgeGeometry(saved);
  assert.equal(result.y, -28);
  assert.ok(result.y + 12 <= -16);
  assert.equal(saved.sourceX, 248);
  assert.equal(saved.targetX, 260);
  assert.ok(!result.path.includes("NaN"));
});
test("Decision branches leave right before curving and remain finite", () => {
  const branch = { ...points, sourceY: 39.2, targetY: -56 };
  const result = exported.builderEdgeGeometry(branch);
  assert.ok(result.path.startsWith("M256"));
  assert.ok(!result.path.includes("NaN"));
});
test("offset legacy cards keep their label above both card surfaces", () => {
  const result = exported.builderEdgeGeometry({
    ...points,
    targetX: 260,
    targetY: 16,
  });
  assert.equal(result.y, -68);
  assert.ok(result.y + 12 <= 16 - 56 - 16);
  assert.ok(!result.path.includes("NaN"));
});
test("protruding handles in narrow legacy gaps do not put labels on cards", () => {
  const result = exported.builderEdgeGeometry({
    ...points,
    targetX: 244,
    targetY: 40,
  });
  assert.equal(result.y, -44);
  assert.ok(!result.path.includes("NaN"));
});

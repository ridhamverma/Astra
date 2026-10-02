const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const exported = {};
const source = fs.readFileSync(
  require("node:path").join(__dirname, "../lib/simulation-editor.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2017,
  },
}).outputText;
new Function("exports", compiled)(exported);

test("bottleneck highlighting and canvas selection cannot enter the canonical model", () => {
  const canonical = {
    id: "doctor",
    name: "Doctor demo",
    simulation: { duration: 60, seed: 42 },
    nodes: [
      {
        id: "s",
        type: "source",
        name: "Source",
        position: { x: 0, y: 0 },
        config: { distribution: "constant", mean_interarrival_time: 2 },
      },
      {
        id: "p",
        type: "process",
        name: "Doctor",
        position: { x: 240, y: 0 },
        config: {
          resource_count: 1,
          service_distribution: "constant",
          mean_service_time: 5,
        },
      },
      {
        id: "end",
        type: "sink",
        name: "Sink",
        position: { x: 480, y: 0 },
        config: {},
      },
    ],
    edges: [
      { id: "sp", source: "s", target: "p" },
      { id: "pe", source: "p", target: "end" },
    ],
  };
  const nodes = exported.toEditorNodes(canonical.nodes).map((node) => ({
    ...node,
    selected: true,
    data: { ...node.data, bottleneck: node.id === "p" },
  }));
  const serialized = exported.toSimulationModel(
    canonical.id,
    canonical.name,
    canonical.simulation,
    nodes,
    exported.toEditorEdges(canonical.edges),
  );
  assert.deepEqual(serialized, canonical);
  assert.equal(JSON.stringify(serialized).includes("bottleneck"), false);
});

test("legacy Decision handle IDs migrate deterministically and survive save/reopen", () => {
  const nodes = [
    {
      id: "d",
      type: "decision",
      name: "Decision",
      position: { x: 0, y: 0 },
      config: { routing: "probability" },
    },
  ];
  const legacy = [
    {
      id: "yes-link",
      source: "d",
      target: "hold",
      probability: 0.7,
      sourceHandle: "source-bottom",
    },
    {
      id: "no-link",
      source: "d",
      target: "end",
      probability: 0.3,
      sourceHandle: "source-top",
    },
  ];
  const migrated = exported.toEditorEdges(legacy, nodes);
  assert.deepEqual(
    migrated.map((edge) => edge.sourceHandle),
    ["yes", "no"],
  );
  const model = exported.toSimulationModel(
    "m",
    "m",
    { duration: 60, seed: 42 },
    exported.toEditorNodes(nodes),
    migrated,
  );
  assert.deepEqual(
    exported.toEditorEdges(model.edges, nodes).map((edge) => edge.sourceHandle),
    ["yes", "no"],
  );
  assert.deepEqual(model.nodes[0].position, { x: 0, y: 0 });
});

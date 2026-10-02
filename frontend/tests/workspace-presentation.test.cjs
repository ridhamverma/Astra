const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function readModule(file) {
  const exported = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(fs.readFileSync(path.join(__dirname, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2017,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
  )(exported, require);
  return exported;
}
const ui = readModule("../components/simulator/workspace-shell.tsx"),
  presentation = readModule("../lib/workspace-presentation.ts");
const fields = {
  minimum: "1",
  maximum: "3",
  step: "1",
  replications: "3",
  target: "15",
  additional: "",
  percentage: false,
};
test("optimization validation identifies field errors without changing valid request values", () => {
  assert.deepEqual(presentation.validateOptimizationFields(fields), {});
  const invalid = presentation.validateOptimizationFields({
    ...fields,
    minimum: "5",
    maximum: "3",
    step: "0",
    replications: "0",
    target: "-1",
    additional: "1.5",
  });
  assert.ok(invalid.maximum);
  assert.ok(invalid.step);
  assert.ok(invalid.replications);
  assert.ok(invalid.target);
  assert.ok(invalid.additional);
  assert.ok(
    presentation.validateOptimizationFields({
      ...fields,
      target: "101",
      percentage: true,
    }).target,
  );
  assert.ok(
    presentation.validateOptimizationFields({ ...fields, minimum: "" }).minimum,
  );
});
test("measured changes use direction and text and do not guess utilization desirability", () => {
  assert.equal(presentation.measuredChange("throughput", 3).label, "Improved");
  assert.equal(
    presentation.measuredChange("average_waiting_time", -2).label,
    "Improved",
  );
  assert.equal(presentation.measuredChange("total_rejected", 4).label, "Worse");
  assert.equal(
    presentation.measuredChange("resource_utilization", 2).label,
    "Changed",
  );
  assert.equal(presentation.measuredChange("throughput", 0).label, "Unchanged");
  assert.equal(
    presentation.measuredChange("throughput", null).label,
    "Unavailable",
  );
});
test("all workspace views share shell classes and a visible text save status", () => {
  for (const view of [
    "builder",
    "analytics",
    "playback",
    "scenarios",
    "optimization",
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(
        ui.WorkspaceShell,
        {
          view,
          status: React.createElement(ui.WorkspaceStatusBar, {
            counts: { nodes: 6, edges: 5 },
            dirty: false,
            saving: false,
            disabled: true,
            onSave: () => {},
          }),
        },
        React.createElement("header", null, "Workspace"),
      ),
    );
    assert.match(html, /astra-builder-screen/);
    assert.match(html, /Saved/);
    assert.match(html, /aria-label="Project status"/);
    assert.match(html, /disabled=""/);
    assert.equal((html.match(/<header>/g) || []).length, 1);
  }
});
test("KPI glass cards keep measured units next to values and unavailable values unadorned", () => {
  const html = renderToStaticMarkup(
    React.createElement(ui.WorkspaceKpiCard, {
      label: "Throughput",
      value: "14.0",
      unit: "/hr",
      hint: "Completed per simulated hour",
    }),
  );
  assert.match(html, /astra-stat-card glass/);
  assert.match(html, /14.0/);
  assert.match(html, /astra-stat-unit/);
  assert.match(html, /Completed per simulated hour/);
  const empty = renderToStaticMarkup(
    React.createElement(ui.WorkspaceKpiCard, {
      label: "Wait",
      value: "—",
      unit: "min",
      hint: "No observations",
    }),
  );
  assert.ok(!empty.includes("astra-stat-unit"));
});
test("result tables provide a keyboard accessible scrolling region and scoped headers", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ui.WorkspaceTable,
      { label: "Results" },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          null,
          React.createElement("th", { scope: "col" }, "Metric"),
        ),
      ),
    ),
  );
  assert.match(html, /role="region"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /scope="col"/);
});

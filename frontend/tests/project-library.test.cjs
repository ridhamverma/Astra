const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const library = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/project-library.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText)(library);
const project = (id, changes = {}) => ({ id, name: `Model ${id}`, description: null, updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', last_accessed_at: null, last_run_at: null, model: null, run_count: 0, status: 'needs_review', ...changes });

test('Recents includes only three projects ordered by open, edit, and simulation activity', () => {
  const projects = [project('a'), project('b', { last_accessed_at: '2026-01-06T00:00:00Z' }), project('c', { updated_at: '2026-01-04T00:00:00Z' }), project('d', { last_run_at: '2026-01-05T00:00:00Z' })];
  assert.deepEqual(library.recentProjects(projects).map(p => p.id), ['b', 'd', 'c']);
  assert.deepEqual(projects.map(p => p.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(library.recentProjects([]), []);
});
test('Search, status, inferred process type, and updated range combine without hiding other library records', () => {
  const projects = [project('a', { name: 'Order Fulfillment', status: 'completed', updated_at: '2026-01-06T00:00:00Z' }), project('b', { name: 'Older Fulfillment', status: 'completed' }), project('c', { name: 'Hospital', status: 'completed' })];
  assert.equal(library.filterProjects(projects, library.defaultFilters).length, 3);
  assert.deepEqual(library.filterProjects(projects, { ...library.defaultFilters, search: 'fulfill', type: 'Fulfillment', status: 'completed', updated: '1' }, Date.parse('2026-01-06T12:00:00Z')).map(p => p.id), ['a']);
  assert.deepEqual(library.filterProjects(projects, { ...library.defaultFilters, status: 'failed' }), []);
});
test('Alphabetical, creation, and run-count sorting use actual data and deterministic ties', () => {
  const projects = [project('b', { name: 'Zulu', run_count: 4 }), project('a', { name: 'Alpha', created_at: '2026-01-02T00:00:00Z', run_count: 1 }), project('c', { name: 'Charlie', run_count: 8 })];
  assert.deepEqual(library.filterProjects(projects, { ...library.defaultFilters, sort: 'name_asc' }).map(p => p.id), ['a','c','b']);
  assert.deepEqual(library.filterProjects(projects, { ...library.defaultFilters, sort: 'name_desc' }).map(p => p.id), ['b','c','a']);
  assert.deepEqual(library.filterProjects(projects, { ...library.defaultFilters, sort: 'runs' }).map(p => p.id), ['c','b','a']);
  assert.equal(library.filterProjects(projects, { ...library.defaultFilters, sort: 'created' })[0].id, 'a');
});

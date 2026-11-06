const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const { __test } = require('../../ReceiveFromMasterGo/src/ui/mgPackage.js');

const white = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
const dark = [{ type: 'SOLID', color: { r: 0.24, g: 0.24, b: 0.24 } }];

test('full-cover text colors resolve before instance inheritance', () => {
  const nodes = {
    label: { id: 'label', type: 'TEXT', characters: 'LABEL', paintRef: 'old',
      fontRuns: [{ start: 0, end: 5 }], styledRuns: [{ start: 0, end: 5, paintRef: 'white' }] },
    'copy/label': { id: 'copy/label', templateRef: 'label', type: 'TEXT' },
    'edited/label': { id: 'edited/label', templateRef: 'label', type: 'TEXT', paintRef: 'dark' }
  };
  __test.resolveTextPaintRefs(nodes, { old: dark, white, dark });
  __test.inheritFromTemplate(nodes);
  assert.equal(nodes.label.paintRef, 'white');
  assert.equal(nodes['copy/label'].paintRef, 'white');
  assert.equal(nodes['edited/label'].paintRef, 'dark');
});

test('partial and mixed color runs retain their individual ranges', () => {
  const nodes = {
    a: { type: 'TEXT', characters: 'LABEL', paintRef: 'old', fontRuns: [{}], styledRuns: [{ start: 1, end: 5, paintRef: 'white' }] },
    b: { type: 'TEXT', characters: 'LABEL', paintRef: 'old', fontRuns: [{}, {}], styledRuns: [{ start: 0, end: 5, paintRef: 'white' }] }
  };
  __test.resolveTextPaintRefs(nodes, { white });
  assert.equal(nodes.a.paintRef, 'old');
  assert.equal(nodes.b.paintRef, 'old');
});

test('reflected edge-constrained paths keep the origin on the resized edge', () => {
  const nodes = {
    master: { id: 'master', type: 'FRAME', w: 408, h: 20, containerMeta: { subtype: 'COMPONENT' } },
    line: { id: 'line', parent: 'master', type: 'VECTOR', rawType: 'VECTOR', w: 408, h: 0,
      x: 408, y: 11.5, relativeTransform: [[-1, 0, 408], [0, -1, 11.5]], constraintH: 2, constraintV: 3 },
    copy: { id: 'copy', type: 'FRAME', w: 247, h: 20, templateRef: 'master', containerMeta: { subtype: 'INSTANCE' } }
  };
  __test.expandTemplateInstances(nodes, { master: ['line'] });
  assert.equal(nodes['copy/line'].w, 247);
  assert.equal(nodes['copy/line'].x, 247);
  assert.deepEqual(nodes['copy/line'].relativeTransform, [[-1, 0, 247], [0, -1, 11.5]]);
});

test('geometry endpoint enum 7 preserves the hollow ring', () => {
  const missing = [255, 255, 255, 255, 15];
  const bytes = Uint8Array.from([2, 1, 1, 4, 0, ...missing, ...missing, 1, 2, 0, 0,
    3, 0, 4, 0, 5, 2, 5, 0, 7, 7, 0, 1, 127, 0, 0, 0, 5, 1, 0, 6, 1, 0]);
  const geometry = __test.decodeGeometryBlob(bytes, 0);
  assert.equal(geometry.vertices[0].strokeCap, 'RING');
  assert.equal(geometry.vertices[1].strokeCap, 'NONE');
});

test('unsupported endpoint geometry keeps enclosing instances editable', () => {
  const record = (id, type, childIds = [], extra = {}) => ({ id, childIds, props: { type }, ...extra });
  const records = [record('master', 'COMPONENT', ['path']), record('path', 'VECTOR', [], {
    props: { type: 'VECTOR', vectorNetwork: { vertices: [{ strokeCap: 'RING' }] } }
  }), record('copy', 'FRAME', ['copy/path'], { mainComponentId: 'master' }), record('copy/path', 'VECTOR', [], {
    props: { type: 'VECTOR', vectorNetwork: { vertices: [{ strokeCap: 'RING' }] } }
  })];
  __test.markStructuralInstanceFallbacks(records);
  assert.equal(records[2].instanceStructureFallback, true);
});

const ringSource = fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/appliers/vectorRings.ts'), 'utf8');
const ringJs = esbuild.transformSync(ringSource.replace(/export /g, ''), { loader: 'ts' }).code;
const createRings = new Function(ringJs + ';return createRingCapGeometry;')();

test('hollow caps trim the stroke outside the transparent center and preserve its logical box', () => {
  const network = { vertices: [{ x: 0, y: 0, strokeCap: 'RING' }, { x: 100, y: 0, strokeCap: 'NONE' }],
    segments: [{ start: 0, end: 1, tangentStart: { x: 30, y: 0 }, tangentEnd: { x: 0, y: 0 } }], regions: [] };
  const result = createRings(network, 1.35, { width: 100, height: 0 });
  assert.deepEqual(result.rings, [{ x: 0, y: 0, radius: 3.915, filled: false }]);
  assert.ok(Math.abs(result.network.vertices[0].x - 3.915) < 0.0001);
  assert.deepEqual(result.network.vertices.slice(-2).map(v => [v.x, v.y]), [[0, 0], [100, 0]]);
  assert.equal(result.network.vertices[1].x, 100);
  assert.equal(network.vertices[0].strokeCap, 'RING');
  assert.equal(network.vertices[0].x, 0);
});

test('vertical end caps trim the terminal curve and preserve the opposite end', () => {
  const network = { vertices: [{ x: 0, y: 0, strokeCap: 'NONE' }, { x: 0, y: 100, strokeCap: 'RING' }],
    segments: [{ start: 0, end: 1 }], regions: [] };
  const result = createRings(network, 2, { width: 0, height: 100 });
  assert.deepEqual(result.rings, [{ x: 0, y: 100, radius: 5.8, filled: false }]);
  assert.ok(Math.abs(result.network.vertices[1].y - 94.2) < 0.0001);
  assert.equal(result.network.vertices[0].y, 0);
});

const containerSource = fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/appliers/container.ts'), 'utf8');
const containerStart = containerSource.indexOf('export async function finalizeGroupShell(');
const containerEnd = containerSource.indexOf('export async function restoreBooleanOperationTree(', containerStart);
const containerJs = esbuild.transformSync(containerSource.slice(containerStart, containerEnd).replace('export ', ''), { loader: 'ts' }).code;

test('reflected groups preserve child matrices inside an editable frame', async () => {
  const child = { relativeTransform: [[-1, 0, 250], [0, 1, 120]] };
  const shell = { children: [child] };
  const finalize = new Function('hasFiniteTransform', 'createBooleanFrameFallbackProps', containerJs + ';return finalizeGroupShell;')(
    t => Array.isArray(t), data => ({ ...data, type: 'FRAME', clipsContent: false }));
  const transform = [[-1, 0, 1100], [0, 1, 229]];
  await finalize(shell, { layout: { relativeTransform: transform } }, async (node, props) => {
    assert.equal(node, shell);
    assert.equal(props.type, 'FRAME');
    node.relativeTransform = props.layout.relativeTransform;
  });
  assert.deepEqual(shell.relativeTransform, transform);
  assert.deepEqual(child.relativeTransform, [[-1, 0, 250], [0, 1, 120]]);
});

test('filled circular caps retain their native radius and solid center', () => {
  const network = { vertices: [{ x: 0, y: 0, strokeCap: 'ROUND_ARROW' }, { x: 100, y: 0 }],
    segments: [{ start: 0, end: 1 }], regions: [] };
  const result = createRings(network, 1.5, { width: 100, height: 0 });
  assert.deepEqual(result.rings, [{ x: 0, y: 0, radius: 4.35, filled: true }]);
});

test('reflected frame shells have source bounds before constrained children are created', () => {
  const start = containerSource.indexOf('export function createContainerShellFrameProps(');
  const end = containerSource.indexOf('export function createFinalizedContainerProps(', start);
  const js = esbuild.transformSync(containerSource.slice(start, end).replace('export ', ''), { loader: 'ts' }).code;
  const create = new Function('hasFiniteTransform', 'createBooleanFrameFallbackProps', 'hasNonTranslationTransform', js + ';return createContainerShellFrameProps;')(
    t => Array.isArray(t), data => data, () => true);
  const data = { layout: { width: 286, height: 80.5, relativeTransform: [[-1, 0, 1100], [0, 1, 229]] } };
  assert.equal(create(data).layout, data.layout);
});

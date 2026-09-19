const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const output = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../../ReceiveFromMasterGo/src/appliers/connector.ts')],
  bundle: true, format: 'cjs', platform: 'node', write: false
});
const mod = { exports: {} };
new Function('module', 'exports', output.outputFiles[0].text)(mod, mod.exports);
const { applyConnectorTextFallback: apply } = mod.exports;

function connector(childIds) {
  return { name: '连接线 2', props: { type: 'CONNECTOR', name: '连接线 2' }, childIds };
}
function text(characters) {
  return { props: { type: 'TEXT', characters }, childIds: [] };
}

test('connector text is consumed as a name suffix, preserving the vector and source records', () => {
  const record = connector(['label']);
  const layers = { label: text('七宗罪') };
  const original = JSON.stringify({ record, layers });
  const node = { type: 'VECTOR', name: '连接线 2', vectorNetwork: { vertices: [1, 2] } };
  assert.equal(1 + apply(node, record, layers), 2);
  assert.equal(node.name, '连接线 2_text in line: 七宗罪');
  assert.deepEqual(node.vectorNetwork.vertices, [1, 2]);
  assert.equal(JSON.stringify({ record, layers }), original);
  assert.equal('children' in node, false);
  apply(node, record, { label: text('新的实例文字') });
  assert.equal(node.name, '连接线 2_text in line: 新的实例文字');
});

test('multiple, multiline and empty labels preserve their text and child order', () => {
  const node = { type: 'VECTOR', name: 'line' };
  assert.equal(apply(node, connector(['b', 'a']), { a: text(''), b: text('检查\n成功') }), 2);
  assert.equal(node.name, '连接线 2_text in line: 检查\n成功 | ');
});

test('only leaf text records on connector vectors are intentionally consumed', () => {
  const node = { type: 'VECTOR', name: 'original' };
  const layers = { shape: { props: { type: 'RECTANGLE' } }, malformed: text(undefined),
    nested: { props: { type: 'TEXT', characters: 'nested' }, childIds: ['other'] } };
  assert.equal(apply(node, connector(['missing', 'shape', 'malformed', 'nested']), layers), 0);
  assert.equal(node.name, 'original');
  assert.equal(apply(node, { ...connector(['label']), props: { type: 'VECTOR' } }, { label: text('text') }), 0);
  assert.equal(apply({ type: 'FRAME', name: 'frame' }, connector(['label']), { label: text('text') }), 0);
  assert.equal(apply(node, connector([]), {}), 0);
});

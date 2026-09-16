const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');

const source = fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/appliers/container.ts'), 'utf8');
const start = source.indexOf('function applyOuterBooleanPaint(');
const end = source.indexOf('export function composeSingleBooleanChildTransform(', start);
const js = esbuild.transformSync(source.slice(start, end), {loader: 'ts'}).code;
const apply = new Function('safeSetFills', 'normalizeImageFills', 'safeSetStrokes', 'normalizeImageStrokes', 'safeSet',
  js + '; return applyOuterBooleanPaint;')(
  (node, fills) => { node.fills = fills; }, fills => fills,
  (node, strokes) => { node.strokes = strokes; }, strokes => strokes,
  (node, key, value) => { node[key] = value; });
const solid = value => ({type: 'SOLID', color: {r: value, g: value, b: value}});

test('promoted 0915 ellipsis retains the dark outer boolean fill over the gray inner fill', () => {
  const child = {type: 'BOOLEAN_OPERATION', fills: [solid(216 / 255)]};
  apply(child, {geometry: {fills: [solid(0.2)]}});
  assert.deepEqual(child.fills, [solid(0.2)]);
});

test('promotion keeps child paint when no visible outer paint is available', () => {
  const child = {type: 'BOOLEAN_OPERATION', fills: [solid(0.2)]};
  apply(child, {geometry: {fills: [{...solid(1), visible: false}]}});
  assert.deepEqual(child.fills, [solid(0.2)]);
});

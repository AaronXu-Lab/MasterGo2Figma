const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const source = fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/appliers/svgFallback.ts'), 'utf8');
const compiled = esbuild.transformSync(source, {loader: 'ts', format: 'cjs'}).code;
const mod = {exports: {}};
new Function('module', 'exports', compiled)(mod, mod.exports);
const {unwrapSingleVectorSvg} = mod.exports;

function fixture(mirrored = false) {
  const transform = [[mirrored ? -1 : 1, 0, mirrored ? 375 : 0], [0, 1, 187]];
  const child = {type: 'VECTOR', width: 198, height: 42,
    relativeTransform: [[mirrored ? -1 : 1, 0, mirrored ? 198 : 9], [0, 1, mirrored ? 0 : 12]],
    vectorNetwork: {regions: [{loops: [[0, 1, 2, 3, 4]]}]}, effects: [{type: 'DROP_SHADOW'}]};
  const root = {children: [child], width: 230, height: 74, removed: false,
    parent: {appendChild(node) { this.promoted = node; }}, remove() { this.removed = true; }};
  const data = {vectorFallback: 'svgMissingRegions', layout: {width: 198, height: 42, relativeTransform: transform}};
  return {root, child, data};
}

test('shadow-padded SVG promotes its full-size vector, retaining SVG regions', () => {
  const {root, child, data} = fixture();
  assert.equal(unwrapSingleVectorSvg(root, data), child);
  assert.equal(child.height, 42);
  assert.equal(child.vectorNetwork.regions.length, 1);
  assert.equal(root.parent.promoted, child);
  assert.equal(root.removed, true);
});

test('mirrored SVG path is promoted so source transform replaces the embedded mirror', () => {
  const {root, child, data} = fixture(true);
  assert.equal(unwrapSingleVectorSvg(root, data), child);
  assert.equal(root.removed, true);
});

test('compound SVGs and paths in a different local coordinate system keep their wrapper', () => {
  for (const alter of [
    x => { x.root.children.push({...x.child}); },
    x => { x.child.width = 180; },
    x => { x.child.relativeTransform[0][0] = -1; },
    x => { x.data.vectorFallback = 'other'; }
  ]) {
    const x = fixture();
    alter(x);
    assert.equal(unwrapSingleVectorSvg(x.root, x.data), x.root);
    assert.equal(x.root.removed, false);
  }
});

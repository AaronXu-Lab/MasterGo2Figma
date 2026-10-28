const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('../../SendToFigma/node_modules/esbuild');
const root = path.resolve(__dirname, '../..');
const output = esbuild.buildSync({
  stdin: { contents: `
    export { getUniversalProperty } from './SendToFigma/src/serializers/universal';
    export { createFallbackNodeJson } from './SendToFigma/src/nodeSerializer';
    export { applyUniversalProperties } from './ReceiveFromMasterGo/src/appliers/universal';
  `, resolveDir: root }, bundle: true, format: 'cjs', platform: 'node', write: false
});
const loaded = { exports: {} };
new Function('module', 'exports', 'require', output.outputFiles[0].text)(loaded, loaded.exports, require);
const { getUniversalProperty, createFallbackNodeJson, applyUniversalProperties } = loaded.exports;

test('outline and alpha mask coverage survive normal and fallback JSON export into the receiver', async () => {
  for (const serialize of [getUniversalProperty, createFallbackNodeJson]) {
    for (const outline of [true, false]) {
      const source = { type: 'RECTANGLE', isMask: true, isMaskOutline: outline, opacity: 0.5 };
      const props = JSON.parse(JSON.stringify(serialize(source)));
      const expected = outline ? 'VECTOR' : 'ALPHA';
      assert.equal(props.blend.maskType, expected);
      const node = { type: 'RECTANGLE', maskType: 'ALPHA' };
      await applyUniversalProperties(node, { blend: props.blend });
      assert.equal(node.isMask, true);
      assert.equal(node.maskType, expected);
      assert.equal(node.opacity, 0.5);
    }
  }
});

test('absent, inaccessible or invalid mask flags never guess alpha coverage', () => {
  const unreadable = { type: 'RECTANGLE', isMask: true, get isMaskOutline() { throw Error('old host'); } };
  for (const serialize of [getUniversalProperty, createFallbackNodeJson]) {
    for (const source of [unreadable, { isMask: true }, { isMask: true, isMaskOutline: 0 },
      { isMask: true, isMaskOutline: null }, { isMask: false, isMaskOutline: true }]) {
      const blend = JSON.parse(JSON.stringify(serialize(source))).blend;
      assert.equal(Object.hasOwn(blend, 'maskType'), false);
    }
  }
});

test('old ZIP mask records keep the receiving host default', async () => {
  const node = { type: 'RECTANGLE', maskType: 'VECTOR' };
  await applyUniversalProperties(node, { blend: { isMask: true } });
  assert.equal(node.maskType, 'VECTOR');
});

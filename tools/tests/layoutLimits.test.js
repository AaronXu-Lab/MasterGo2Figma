const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const fs = require('node:fs');
const src = fs.readFileSync(require.resolve('../../shared/layoutLimits.ts'), 'utf8');
const js = esbuild.transformSync(src, {loader:'ts',format:'cjs'}).code;
const mod = {exports:{}};
new Function('module','exports',js)(mod,mod.exports);
const normalize = mod.exports.normalizeMasterGoSizeLimit;

test('unset MasterGo size limits clear Figma bounds instead of clamping to 1px', () => {
  assert.equal(normalize(0), null);
  assert.equal(normalize(null), null);
  assert.equal(normalize(undefined), undefined);
  for (const value of [74, 0.5, 1024]) assert.equal(normalize(value), value);
  for (const value of [-1, NaN, Infinity, '0']) assert.equal(normalize(value), undefined);
});

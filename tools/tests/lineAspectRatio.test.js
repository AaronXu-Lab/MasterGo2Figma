const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('../../ReceiveFromMasterGo/node_modules/esbuild');
const source = fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/deferredLayout.ts'), 'utf8');
const js = esbuild.transformSync(source.slice(source.indexOf('export function applyAspectRatioLock('))
  .replace('export ', ''), { loader: 'ts' }).code;
const apply = new Function(js + ';return applyAspectRatioLock;')();

function node(width, height, targetAspectRatio = null) {
  return { width, height, targetAspectRatio, locks: 0, unlocks: 0,
    lockAspectRatio() { this.locks++; this.targetAspectRatio = { x: this.width, y: this.height }; },
    unlockAspectRatio() { this.unlocks++; this.targetAspectRatio = null; }
  };
}

test('zero-axis paths retain independent length constraints', () => {
  for (const [width, height] of [[408, 0], [0, 408]]) {
    const path = node(width, height);
    apply(path, true, { width, height });
    assert.equal(path.locks, 0);
    assert.equal(path.targetAspectRatio, null);
  }
});

test('source zero-axis dimensions clear a ratio on a clamped Figma vector', () => {
  const path = node(408, 0.0001, { x: 408, y: 0.0001 });
  apply(path, true, { width: 408, height: 0 });
  assert.equal(path.locks, 0);
  assert.equal(path.unlocks, 1);
  assert.equal(path.targetAspectRatio, null);
});

test('two-dimensional artwork retains proportional resizing', () => {
  const artwork = node(120, 80);
  apply(artwork, true, { width: 120, height: 80 });
  assert.equal(artwork.locks, 1);
  assert.deepEqual(artwork.targetAspectRatio, { x: 120, y: 80 });
  apply(artwork, false, { width: 120, height: 80 });
  assert.equal(artwork.unlocks, 1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../../ReceiveFromMasterGo/src/ui/mgPackage.js');

function fixture(scale = 0.486, width = 121.5, height = 29.16) {
  const frame = (id, subtype, w, h, extra = {}) => ({
    id, type: 'FRAME', rawType: 'FRAME', isRawRecord: true, w, h,
    hasExplicitW: true, hasExplicitH: true, x: 0, y: 0,
    containerMeta: { subtype }, ...extra
  });
  const nodes = {
    '1:1': frame('1:1', 'COMPONENT', 135, 32.4, { trailer: { scaleFactor: 0.54 } }),
    '1:2': { id: '1:2', parent: '1:1', type: 'TEXT', rawType: 'TEXT',
      isRawRecord: true, w: 43.2, h: 21.6, x: 45.9, y: 5.4, textStyleRef: 'base' },
    '1:3': frame('1:3', 'INSTANCE', width, height, {
      parent: '2:1', templateRef: '1:1', trailer: { scaleFactor: scale }
    }),
    '1:3/1:2': { id: '1:3/1:2', parent: '1:3', type: 'TEXT', rawType: 'TEXT',
      isRawRecord: true, templateRef: '1:2', w: 39, h: 20, x: 41.25, y: 4.58,
      textStyleRef: 'override', characters: 'GND', hasExplicitW: true, hasExplicitH: true,
      hasExplicitSize: true, hasExplicitTransform: true, hasExplicitX: true, hasExplicitY: true },
    '2:1': frame('2:1', 'COMPONENT', 1887, 646),
    '2:2': frame('2:2', 'INSTANCE', 1887, 646, { templateRef: '2:1' })
  };
  const children = { '1:1': ['1:2'], '1:3': ['1:3/1:2'], '2:1': ['1:3'] };
  return { nodes, children };
}

test('instance scale accounts for an already-scaled master when both axes corroborate it', () => {
  const { nodes, children } = fixture();
  __test.expandTemplateInstances(nodes, children);
  assert.ok(Math.abs(nodes['1:3'].effScale - 0.9) < 1e-6);
  assert.ok(Math.abs(nodes['2:2/1:3'].effScale - 0.9) < 1e-6);
  assert.equal(nodes['1:3'].trailer.scaleFactor, 0.486);
  assert.equal(nodes['1:1'].w, 135);
});

test('relative hints and nonuniform resized instances retain their stored scale', () => {
  for (const [scale, width, height] of [[0.9, 121.5, 29.16], [0.486, 160, 29.16]]) {
    const { nodes, children } = fixture(scale, width, height);
    __test.expandTemplateInstances(nodes, children);
    assert.equal(nodes['1:3'].effScale, scale);
  }
});

test('nested clones preserve text already materialized in an override parent', () => {
  const { nodes, children } = fixture();
  __test.expandTemplateInstances(nodes, children);
  const child = nodes['2:2/1:3/1:2'];
  assert.equal(child.w, 39);
  assert.equal(child.h, 20);
  assert.equal(child.x, 41.25);
  assert.equal(child.y, 4.58);
  const props = __test.nativeProps(child, nodes, {}, {}, {
    override: { fontSize: 16.038, family: 'Montserrat', styleName: 'Bold' }
  }, {});
  assert.ok(Math.abs(props.fontSize - 16.038) < 1e-6);
});

test('an additional outer scale applies once to materialized nested text', () => {
  const { nodes, children } = fixture();
  nodes['2:2'].w /= 2;
  nodes['2:2'].h /= 2;
  nodes['2:2'].trailer = { scaleFactor: 0.5 };
  __test.expandTemplateInstances(nodes, children);
  const nested = nodes['2:2/1:3'];
  const child = nodes['2:2/1:3/1:2'];
  assert.ok(Math.abs(nested.effScale - 0.45) < 1e-6);
  assert.equal(child.w, 19.5);
  assert.equal(child.h, 10);
  const props = __test.nativeProps(child, nodes, {}, {}, {
    override: { fontSize: 16.038, family: 'Montserrat', styleName: 'Bold' }
  }, {});
  assert.ok(Math.abs(props.fontSize - 8.019) < 1e-6);
});

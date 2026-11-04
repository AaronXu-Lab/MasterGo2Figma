const test = require("node:test");
const assert = require("node:assert/strict");
const { validateV2Package } = require("../../ReceiveFromMasterGo/src/ui/packageValidation.js");

const encode = value => new TextEncoder().encode(JSON.stringify(value));
function fixture(records) {
  return {
    "manifest.json": encode({ schema: "mastergo2figma.package.v2", version: 2, pages: [{ id: "p", pageFile: "pages/p/index.json", layerCount: records.length }], stats: { layerCount: records.length }, assets: {} }),
    "pages/p/index.json": encode({ rootNodeIds: ["root"], layerChunks: ["pages/p/layers.json"] }),
    "pages/p/layers.json": encode({ schema: "mastergo2figma.layers.v2", version: 2, records })
  };
}

test("accepts a symmetric reachable v2 package", () => {
  const records = [
    { id: "root", parentId: null, index: 0, childIds: ["child"], props: {} },
    { id: "child", parentId: "root", index: 0, childIds: [], props: {} }
  ];
  const result = validateV2Package(fixture(records));
  assert.equal(result.ok, true);
  assert.match(result.canonicalDigest, /^fnv1a32:[0-9a-f]{8}$/);
});

test("rejects duplicate and dangling records", () => {
  const duplicate = [{ id: "root", parentId: null, index: 0, childIds: [], props: {} }, { id: "root", parentId: null, index: 0, childIds: [], props: {} }];
  assert.equal(validateV2Package(fixture(duplicate)).ok, false);
  const dangling = [{ id: "root", parentId: null, index: 0, childIds: ["missing"], props: {} }];
  assert.equal(validateV2Package(fixture(dangling)).ok, false);
});

test("canonical digest ignores timestamps, chunk paths, and asset aliases", () => {
  function assetFixture(alias, prefix, exportedAt) {
    const records = [{
      id: "root",
      parentId: null,
      index: 0,
      childIds: [],
      props: { geometry: { fills: [{ type: "IMAGE", imageRef: alias }] } }
    }];
    const entries = {
      "manifest.json": encode({
        schema: "mastergo2figma.package.v2",
        version: 2,
        exportedAt,
        pages: [{ id: "p", name: "Page", pageFile: `${prefix}/index.json`, layerCount: 1 }],
        stats: { layerCount: 1 },
        assets: { [alias]: { path: `${prefix}/${alias}.png` } }
      }),
      [`${prefix}/index.json`]: encode({ rootNodeIds: ["root"], layerChunks: [`${prefix}/layers.json`] }),
      [`${prefix}/layers.json`]: encode({ schema: "mastergo2figma.layers.v2", version: 2, records }),
      [`${prefix}/${alias}.png`]: Uint8Array.from([1, 2, 3, 4])
    };
    return entries;
  }

  const first = validateV2Package(assetFixture("asset-a", "pages/a", "2026-01-01T00:00:00Z"));
  const second = validateV2Package(assetFixture("asset-b", "renamed/b", "2026-07-10T00:00:00Z"));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.canonicalDigest, second.canonicalDigest);
});

function legacyDigest(value) {
  function stable(item) {
    if (Array.isArray(item)) return '[' + item.map(stable).join(',') + ']';
    if (!item || typeof item !== 'object') return JSON.stringify(item);
    return '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + stable(item[key])).join(',') + '}';
  }
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(stable(value))) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return 'fnv1a32:' + hash.toString(16).padStart(8, '0');
}

test('incremental digest matches legacy bytes with Unicode, nested props and tree order', () => {
  const root = { id: 'root', parentId: null, index: 0, childIds: ['a', 'b'], props: { z: null, a: ['中文😀', '\ud800', '\"\\\n', false, 1.25] } };
  const a = { id: 'a', parentId: 'root', index: 0, childIds: [], props: { text: 'x'.repeat(16380) + '😀尾' } };
  const b = { id: 'b', parentId: 'root', index: 1, childIds: [], props: {} };
  const result = validateV2Package(fixture([b, root, a]));
  assert.equal(result.ok, true);
  assert.equal(result.canonicalDigest, legacyDigest({
    schema: 'mastergo2figma.package.v2', version: 2, documentId: null, scope: '',
    pages: [{ id: 'p', name: '', rootNodeIds: ['root'], records: [root, a, b] }],
    assetContentDigests: []
  }));
});

test('digest encodes bounded pieces rather than concatenating the whole package', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  let maxEncodedLength = 0;
  class BoundedEncoder extends TextEncoder {
    encode(value) {
      maxEncodedLength = Math.max(maxEncodedLength, value.length);
      assert.ok(value.length <= 16 * 1024, 'document-sized encoding allocation');
      return super.encode(value);
    }
  }
  const sandbox = { TextDecoder, TextEncoder: BoundedEncoder, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../ReceiveFromMasterGo/src/ui/packageValidation.js'), 'utf8'), sandbox);
  const records = [{ id: 'root', parentId: null, childIds: [], props: {} }];
  for (let i = 0; i < 300; i++) {
    records[0].childIds.push('child' + i);
    records.push({ id: 'child' + i, parentId: 'root', index: i, childIds: [], props: { text: '中文😀'.repeat(200) } });
  }
  const entries = fixture(records);
  const result = sandbox.module.exports.validateV2Package(entries);
  assert.equal(result.ok, true);
  assert.equal(result.canonicalDigest, validateV2Package(entries).canonicalDigest);
  assert.ok(maxEncodedLength > 0);
});

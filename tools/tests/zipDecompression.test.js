const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const zlib = require("node:zlib");
const esbuild = require("../../ReceiveFromMasterGo/node_modules/esbuild");

const bundle = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, "../../ReceiveFromMasterGo/ui-src/zipDecompression.js")],
  bundle: true,
  format: "cjs",
  platform: "browser",
  write: false,
  logLevel: "silent"
}).outputFiles[0].text;

function loadDecoder(nativeDecoder) {
  const module = { exports: {} };
  new Function("module", "exports", "DecompressionStream", "console", bundle)(
    module, module.exports, nativeDecoder, { warn() {} }
  );
  return module.exports.decompressZipEntry;
}

const payload = Buffer.from("MasterGo 中文图层\n".repeat(1000));

test("supported hosts continue using native deflate-raw", async () => {
  let calls = 0;
  const decode = loadDecoder(class {
    constructor(format) {
      assert.equal(format, "deflate-raw");
      calls++;
      return new DecompressionStream(format);
    }
  });
  assert.deepEqual(Buffer.from(await decode(zlib.deflateRawSync(payload), payload.length)), payload);
  assert.equal(calls, 1);
});

for (const [name, nativeDecoder] of [
  ["missing API", undefined],
  ["unsupported format", class { constructor() { throw new TypeError("unsupported format"); } }],
  ["stream failure", class {
    constructor() {
      return new TransformStream({ transform() { throw new Error("native decode failed"); } });
    }
  }]
]) {
  test(`local fallback restores identical bytes with ${name}`, async () => {
    const decode = loadDecoder(nativeDecoder);
    for (const options of [{ level: 0 }, { strategy: zlib.constants.Z_FIXED }, { level: 9 }]) {
      assert.deepEqual(Buffer.from(await decode(zlib.deflateRawSync(payload, options), payload.length)), payload);
    }
    assert.equal((await decode(zlib.deflateRawSync(Buffer.alloc(0)), 0)).length, 0);
  });
}

test("native and fallback paths reject incorrect declared sizes", async () => {
  for (const nativeDecoder of [DecompressionStream, undefined]) {
    await assert.rejects(loadDecoder(nativeDecoder)(zlib.deflateRawSync(payload), payload.length + 1), /尺寸不一致/);
  }
});

test("invalid compressed data still fails instead of passing through", async () => {
  for (const nativeDecoder of [DecompressionStream, undefined]) {
    await assert.rejects(loadDecoder(nativeDecoder)(new Uint8Array([7]), 100), /ZIP 解压失败/);
  }
});

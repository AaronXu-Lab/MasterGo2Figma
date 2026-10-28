const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const esbuild = require("../../ReceiveFromMasterGo/node_modules/esbuild");
const { readZipDirectory } = require("../../shared/zipArchive.js");
const { readZipEntries } = require("../read_zip_entries.js");

const enginePath = path.resolve(__dirname, "../../ReceiveFromMasterGo/ui-src/engine.js");
const bundle = esbuild.buildSync({
  stdin: {
    contents: fs.readFileSync(enginePath, "utf8") + "\nexport { readZipEntries as readArchive };",
    resolveDir: path.dirname(enginePath),
    sourcefile: enginePath
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["heic-to/csp"],
  write: false,
  logLevel: "silent"
});
const engine = { exports: {} };
new Function("module", "exports", "require", bundle.outputFiles[0].text)(engine, engine.exports, require);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Tiny, non-private archives model MasterGo's per-image ZIP64 extra fields.
function archive(files, { zip64End = false, comment = Buffer.alloc(0) } = {}) {
  const localParts = [], centralParts = [], centralEntryOffsets = [];
  let localOffset = 0, centralLength = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const method = file.method || 0;
    const compressed = method === 8 ? zlib.deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(45, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const fields = file.zip64Fields || [];
    let extra = Buffer.alloc(0);
    if (fields.length) {
      const values = { uncompressedSize: data.length, compressedSize: compressed.length, localOffset };
      extra = Buffer.alloc(4 + fields.length * 8);
      extra.writeUInt16LE(1);
      extra.writeUInt16LE(fields.length * 8, 2);
      let cursor = 4;
      for (const key of ["uncompressedSize", "compressedSize", "localOffset"]) {
        if (!fields.includes(key)) continue;
        extra.writeBigUInt64LE(BigInt(values[key]), cursor);
        cursor += 8;
      }
    }
    if (file.extra !== undefined) extra = file.extra;
    // An unrelated timestamp before ZIP64 exercises extra-field traversal.
    if (file.extraPrefix) extra = Buffer.concat([file.extraPrefix, extra]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(45, 4);
    central.writeUInt16LE(45, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(fields.includes("compressedSize") ? 0xffffffff : compressed.length, 20);
    central.writeUInt32LE(fields.includes("uncompressedSize") ? 0xffffffff : data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(fields.includes("localOffset") ? 0xffffffff : localOffset, 42);
    centralEntryOffsets.push(centralLength);
    centralParts.push(central, name, extra);
    centralLength += central.length + name.length + extra.length;
    localOffset += local.length + name.length + compressed.length;
  }
  const centralOffset = localOffset;
  const tail = [];
  if (zip64End) {
    const end64 = Buffer.alloc(56);
    end64.writeUInt32LE(0x06064b50);
    end64.writeBigUInt64LE(44n, 4);
    end64.writeUInt16LE(45, 12);
    end64.writeUInt16LE(45, 14);
    end64.writeBigUInt64LE(BigInt(files.length), 24);
    end64.writeBigUInt64LE(BigInt(files.length), 32);
    end64.writeBigUInt64LE(BigInt(centralLength), 40);
    end64.writeBigUInt64LE(BigInt(centralOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50);
    locator.writeBigUInt64LE(BigInt(centralOffset + centralLength), 8);
    locator.writeUInt32LE(1, 16);
    tail.push(end64, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(zip64End ? 0xffff : files.length, 8);
  end.writeUInt16LE(zip64End ? 0xffff : files.length, 10);
  end.writeUInt32LE(zip64End ? 0xffffffff : centralLength, 12);
  end.writeUInt32LE(zip64End ? 0xffffffff : centralOffset, 16);
  end.writeUInt16LE(comment.length, 20);
  tail.push(end, comment);
  return {
    bytes: Buffer.concat([...localParts, ...centralParts, ...tail]),
    centralOffset,
    centralEntryOffsets: centralEntryOffsets.map(offset => centralOffset + offset)
  };
}

async function assertConsumers(t, fixture, expected) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m2f-zip-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "sample.mg");
  fs.writeFileSync(filePath, fixture.bytes);
  const nodeEntries = readZipEntries(filePath);
  const bytes = fixture.bytes;
  const uiEntries = await engine.exports.readArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  for (const entries of [nodeEntries, uiEntries]) {
    assert.deepEqual(Object.keys(entries), Object.keys(expected));
    for (const [name, data] of Object.entries(expected)) assert.deepEqual(Buffer.from(entries[name]), Buffer.from(data));
  }
}

test("ordinary stored and deflated entries keep their exact payloads in UI and Node", async t => {
  await assertConsumers(t, archive([
    { name: "document", data: "native document" },
    { name: "images/压缩.png", data: "compressed image bytes", method: 8 }
  ]), { document: "native document", "images/压缩.png": "compressed image bytes" });
});

test("MasterGo ZIP64 image sizes do not include subsequent images or the directory", async t => {
  const fixture = archive([
    { name: "document", data: "native document" },
    { name: "images/first.png", data: "first PNG", zip64Fields: ["uncompressedSize", "compressedSize"], extraPrefix: Buffer.from([0x55, 0x54, 1, 0, 0]) },
    { name: "images/second.png", data: "second PNG", zip64Fields: ["uncompressedSize", "compressedSize"] }
  ]);
  await assertConsumers(t, fixture, { document: "native document", "images/first.png": "first PNG", "images/second.png": "second PNG" });
});

for (const fields of [["compressedSize"], ["uncompressedSize"], ["localOffset"], ["compressedSize", "localOffset"]]) {
  test(`ZIP64 fields are conditional: ${fields.join(", ")}`, async t => {
    await assertConsumers(t, archive([{ name: "image.png", data: "image payload", zip64Fields: fields }]), { "image.png": "image payload" });
  });
}

test("ZIP64 end records resolve directory counts, size and offset", async t => {
  await assertConsumers(t, archive([{ name: "image.png", data: "image payload", method: 8, zip64Fields: ["uncompressedSize", "compressedSize", "localOffset"] }], { zip64End: true }), { "image.png": "image payload" });
});

test("archive views honor byteOffset and ignore a false footer signature in the comment", () => {
  const fixture = archive([{ name: "image.png", data: "image payload" }], { comment: Buffer.from("comment PK\x05\x06 with trailing text") });
  const wrapped = Buffer.concat([Buffer.alloc(13), fixture.bytes, Buffer.alloc(7)]);
  const view = wrapped.subarray(13, 13 + fixture.bytes.length);
  const [entry] = readZipDirectory(view);
  assert.equal(Buffer.from(view.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)).toString(), "image payload");
});

test("missing or truncated ZIP64 sizes fail before any entry is sliced", () => {
  for (const extra of [Buffer.alloc(0), Buffer.from([1, 0, 8, 0, 1, 0, 0, 0, 0, 0, 0, 0])]) {
    const fixture = archive([{ name: "image.png", data: "image payload", zip64Fields: ["uncompressedSize", "compressedSize"], extra }]);
    assert.throws(() => readZipDirectory(fixture.bytes), /ZIP/);
  }
});

test("unsafe ZIP64 integers and out-of-archive payloads are rejected", () => {
  const unsafe = archive([{ name: "image.png", data: "image payload", zip64Fields: ["uncompressedSize"] }]);
  unsafe.bytes.writeBigUInt64LE(2n ** 53n, unsafe.centralOffset + 46 + Buffer.byteLength("image.png") + 4);
  assert.throws(() => readZipDirectory(unsafe.bytes), /ZIP64/);
  const outside = archive([{ name: "image.png", data: "image payload" }]);
  outside.bytes.writeUInt32LE(10000, outside.centralOffset + 20);
  outside.bytes.writeUInt32LE(10000, outside.centralOffset + 24);
  assert.throws(() => readZipDirectory(outside.bytes), /范围/);
});

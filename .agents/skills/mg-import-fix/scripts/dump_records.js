#!/usr/bin/env node
// Dump decoded records from a .mg (via the repo's live mgPackage.js) and a
// baseline zip into JSON files for record-by-record diffing.
//
// Usage: node .agents/skills/mg-import-fix/scripts/dump_records.js <file.mg> <baseline.zip> <outDir>
//   actual_records.json   = native .mg decode (what the plugin would import)
//   expected_records.json = SendToFigma baseline zip
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { readZipEntries } = require("../../../../tools/read_zip_entries.js");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const [mgArg, zipArg, outArg] = process.argv.slice(2);
if (!mgArg || !zipArg || !outArg) {
  console.error("Usage: node dump_records.js <file.mg> <baseline.zip> <outDir>");
  process.exit(2);
}
const mgPath = path.resolve(REPO_ROOT, mgArg);
const zipPath = path.resolve(REPO_ROOT, zipArg);
const outDir = path.resolve(outArg);

const textDecoder = new TextDecoder("utf-8");
function decodeUtf8(bytes) { return textDecoder.decode(bytes); }


function loadPackageRecords(entries) {
  const manifest = JSON.parse(decodeUtf8(entries["manifest.json"]));
  const recordsById = {};
  for (const page of manifest.pages) {
    const pageIndex = JSON.parse(decodeUtf8(entries[page.pageFile]));
    for (const chunkPath of pageIndex.layerChunks) {
      const chunk = JSON.parse(decodeUtf8(entries[chunkPath]));
      for (const record of chunk.records) {
        if (!recordsById[record.id]) recordsById[record.id] = { ...record, pageId: page.id, pageName: page.name };
      }
    }
  }
  return recordsById;
}

const mgPackagePath = path.join(REPO_ROOT, "ReceiveFromMasterGo", "src", "ui", "mgPackage.js");
const mgPackageSource = fs.readFileSync(mgPackagePath, "utf8");
const sandbox = {
  console, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, DataView, Date, RegExp,
  JSON, Math, Number, String, Boolean, Object, Array, Error, Promise, setTimeout, clearTimeout,
  window: {}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(mgPackageSource, sandbox, { filename: mgPackagePath });

const mgEntries = sandbox.window.MasterGoMg.convertMgPackageToV2Entries(readZipEntries(mgPath), path.basename(mgPath));
const actual = loadPackageRecords(mgEntries);
const expected = loadPackageRecords(readZipEntries(zipPath));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "actual_records.json"), JSON.stringify(actual, null, 1));
fs.writeFileSync(path.join(outDir, "expected_records.json"), JSON.stringify(expected, null, 1));
console.log("actual:", Object.keys(actual).length, "expected:", Object.keys(expected).length, "->", outDir);

"use strict";

const fs = require("node:fs");
const zlib = require("node:zlib");
const { readZipDirectory } = require("../shared/zipArchive.js");

function readZipEntries(filePath) {
  const bytes = fs.readFileSync(filePath);
  const entries = Object.create(null);
  for (const entry of readZipDirectory(bytes)) {
    if (entry.name.endsWith("/")) continue;
    const compressed = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    let content;
    if (entry.method === 0) content = compressed;
    else if (entry.method === 8) content = zlib.inflateRawSync(compressed);
    else throw new Error("暂不支持此 ZIP 压缩方式");
    if (content.length !== entry.uncompressedSize) throw new Error("ZIP 解压后的文件尺寸不一致");
    entries[entry.name] = content;
  }
  return entries;
}

module.exports = { readZipEntries };

"use strict";

const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const UINT32_RANGE = 0x100000000;

function requireRange(view, offset, length, limit = view.byteLength) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      offset < 0 || length < 0 || offset > limit || length > limit - offset) {
    throw new Error("ZIP 数据范围损坏或文件不完整");
  }
}

function readUint64(view, offset, limit) {
  requireRange(view, offset, 8, limit);
  const value = view.getUint32(offset, true) + view.getUint32(offset + 4, true) * UINT32_RANGE;
  if (!Number.isSafeInteger(value)) throw new Error("ZIP64 数值超出可精确读取的范围");
  return value;
}

function findEndOfCentralDirectory(view) {
  const first = Math.max(0, view.byteLength - 22 - UINT16_MAX);
  for (let offset = view.byteLength - 22; offset >= first; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 &&
        offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) return offset;
  }
  throw new Error("不是有效的 ZIP 文件");
}

function readDirectoryLocation(view) {
  const endOffset = findEndOfCentralDirectory(view);
  const disk = view.getUint16(endOffset + 4, true);
  const directoryDisk = view.getUint16(endOffset + 6, true);
  let diskEntries = view.getUint16(endOffset + 8, true);
  let entryCount = view.getUint16(endOffset + 10, true);
  let size = view.getUint32(endOffset + 12, true);
  let offset = view.getUint32(endOffset + 16, true);
  let limit = endOffset;
  if (disk !== 0 || directoryDisk !== 0) throw new Error("暂不支持分卷 ZIP 文件");

  if (entryCount === UINT16_MAX || diskEntries === UINT16_MAX ||
      size === UINT32_MAX || offset === UINT32_MAX) {
    const locator = endOffset - 20;
    requireRange(view, locator, 20);
    if (view.getUint32(locator, true) !== 0x07064b50) throw new Error("ZIP64 目录定位信息缺失");
    if (view.getUint32(locator + 4, true) !== 0 || view.getUint32(locator + 16, true) !== 1) {
      throw new Error("暂不支持分卷 ZIP 文件");
    }
    const zip64 = readUint64(view, locator + 8);
    requireRange(view, zip64, 56, locator);
    if (view.getUint32(zip64, true) !== 0x06064b50) throw new Error("ZIP64 目录损坏");
    const recordSize = readUint64(view, zip64 + 4, locator);
    if (recordSize < 44) throw new Error("ZIP64 目录损坏");
    requireRange(view, zip64 + 12, recordSize, locator);
    if (view.getUint32(zip64 + 16, true) !== 0 || view.getUint32(zip64 + 20, true) !== 0) {
      throw new Error("暂不支持分卷 ZIP 文件");
    }
    diskEntries = readUint64(view, zip64 + 24, locator);
    entryCount = readUint64(view, zip64 + 32, locator);
    size = readUint64(view, zip64 + 40, locator);
    offset = readUint64(view, zip64 + 48, locator);
    limit = zip64;
  }

  if (diskEntries !== entryCount) throw new Error("暂不支持分卷 ZIP 文件");
  requireRange(view, offset, size, limit);
  if (entryCount > Math.floor(size / 46)) throw new Error("ZIP 目录条目数量损坏");
  return { offset, size, entryCount };
}

function resolveZip64Entry(view, extraOffset, extraLength, entry) {
  if (entry.uncompressedSize !== UINT32_MAX && entry.compressedSize !== UINT32_MAX &&
      entry.localOffset !== UINT32_MAX && entry.disk !== UINT16_MAX) return;

  const limit = extraOffset + extraLength;
  let offset = extraOffset;
  while (offset < limit) {
    requireRange(view, offset, 4, limit);
    const tag = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    offset += 4;
    requireRange(view, offset, size, limit);
    if (tag === 0x0001) {
      const end = offset + size;
      // APPNOTE 4.5.3: only sentinel-marked fields occur, in this order.
      for (const key of ["uncompressedSize", "compressedSize", "localOffset"]) {
        if (entry[key] !== UINT32_MAX) continue;
        entry[key] = readUint64(view, offset, end);
        offset += 8;
      }
      if (entry.disk === UINT16_MAX) {
        requireRange(view, offset, 4, end);
        entry.disk = view.getUint32(offset, true);
      }
      return;
    }
    offset += size;
  }
  throw new Error("ZIP64 文件尺寸或偏移信息缺失");
}

// Shared by the browser importer and Node diagnostics. Offsets are relative to
// this byte view, including when the caller supplies a Buffer/subarray.
function readZipDirectory(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = readDirectoryLocation(view);
  const directoryEnd = directory.offset + directory.size;
  const decoder = new TextDecoder("utf-8");
  const result = [];
  let offset = directory.offset;
  for (let i = 0; i < directory.entryCount; i++) {
    requireRange(view, offset, 46, directoryEnd);
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP 中央目录损坏");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameOffset = offset + 46;
    requireRange(view, nameOffset, nameLength + extraLength + commentLength, directoryEnd);
    const entry = {
      name: decoder.decode(bytes.subarray(nameOffset, nameOffset + nameLength)),
      flags: view.getUint16(offset + 8, true),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      disk: view.getUint16(offset + 34, true),
      localOffset: view.getUint32(offset + 42, true),
      dataStart: 0
    };
    resolveZip64Entry(view, nameOffset + nameLength, extraLength, entry);
    if (entry.disk !== 0) throw new Error("暂不支持分卷 ZIP 文件");
    if (entry.flags & 0x41) throw new Error("暂不支持加密 ZIP 文件");
    requireRange(view, entry.localOffset, 30, directory.offset);
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error("ZIP 本地文件头损坏");
    if (view.getUint16(entry.localOffset + 8, true) !== entry.method) throw new Error("ZIP 压缩方式信息不一致");
    const localNameLength = view.getUint16(entry.localOffset + 26, true);
    const localExtraLength = view.getUint16(entry.localOffset + 28, true);
    entry.dataStart = entry.localOffset + 30 + localNameLength + localExtraLength;
    requireRange(view, entry.dataStart, entry.compressedSize, directory.offset);
    if (entry.method === 0 && entry.compressedSize !== entry.uncompressedSize) throw new Error("ZIP 文件尺寸信息不一致");
    result.push(entry);
    offset = nameOffset + nameLength + extraLength + commentLength;
  }
  return result;
}

module.exports = { readZipDirectory };

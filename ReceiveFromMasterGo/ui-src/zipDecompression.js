import { inflateSync } from "fflate";

// Keep the native path for current clients. Older plugin hosts may expose
// DecompressionStream without supporting deflate-raw; no OS sniffing is needed.
export async function decompressZipEntry(compressed, expectedSize) {
  let content;
  try {
    if (typeof DecompressionStream !== "function") throw new Error("原生解压不可用");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    content = new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (nativeError) {
    try {
      content = inflateSync(compressed);
    } catch (fallbackError) {
      console.warn("ZIP decompression failed", { nativeError, fallbackError });
      throw new Error("ZIP 解压失败，文件可能已损坏或不完整");
    }
  }
  if (content.length !== expectedSize) throw new Error("ZIP 解压后的文件尺寸不一致");
  return content;
}

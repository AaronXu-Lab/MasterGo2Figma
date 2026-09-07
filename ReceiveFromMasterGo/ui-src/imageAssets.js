// Figma's plugin image API cannot decode HEIF. Keep decoding in the UI,
// bundled locally (CSP build: no eval, workers or CDN). Ordinary assets pass
// through unchanged; conversion is sequential so large photos do not overlap.
export async function prepareImageAssetBytes(bytes, path, convertHeic = defaultConvertHeic) {
  const isHeif = /\.hei[cf]$/i.test(path) ||
    (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp" &&
      /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(String.fromCharCode(...bytes.subarray(8, 12))));
  if (!isHeif) return bytes;
  try {
    return await convertHeic(bytes);
  } catch (error) {
    // Stream the original asset so the main thread records its usual missing
    // image detail. A conversion failure must not abort the page or next asset.
    console.warn("Unable to convert HEIF image:", path, error);
    return bytes;
  }
}

async function defaultConvertHeic(bytes) {
  const { heicTo } = await import("heic-to/csp");
  const png = await heicTo({ blob: new Blob([bytes], { type: "image/heic" }), type: "image/png" });
  return new Uint8Array(await png.arrayBuffer());
}

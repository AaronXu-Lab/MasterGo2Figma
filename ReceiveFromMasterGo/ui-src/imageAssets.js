// Figma's plugin image API cannot decode HEIF or WebP. Keep decoding in the UI,
// bundled locally (CSP build: no eval, workers or CDN). Ordinary assets pass
// through unchanged; conversion is sequential so large photos do not overlap.
export async function prepareImageAssetBytes(bytes, path, convertHeic = defaultConvertHeic, convertWebp = defaultConvertWebp) {
  const isHeif = /\.hei[cf]$/i.test(path) ||
    (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp" &&
      /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(String.fromCharCode(...bytes.subarray(8, 12))));
  // Older exports labeled WebP bytes as .bin; trust the RIFF/WEBP signature.
  const isWebp = bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  if (!isHeif && !isWebp) return bytes;
  try {
    return await (isWebp ? convertWebp(bytes) : convertHeic(bytes));
  } catch (error) {
    // Stream the original asset so the main thread records its usual missing
    // image detail. A conversion failure must not abort the page or next asset.
    console.warn("Unable to convert image:", path, error);
    return bytes;
  }
}

async function defaultConvertWebp(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/webp" }));
  const canvas = document.createElement("canvas");
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion canvas is unavailable");
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to encode PNG")), "image/png");
    });
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function defaultConvertHeic(bytes) {
  const { heicTo } = await import("heic-to/csp");
  const png = await heicTo({ blob: new Blob([bytes], { type: "image/heic" }), type: "image/png" });
  return new Uint8Array(await png.arrayBuffer());
}

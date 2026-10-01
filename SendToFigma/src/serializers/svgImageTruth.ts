import { parseAttributes, parseSvgTransform } from "./svgGradientTruth";

export interface SvgImageTruth {
    imageTransform: number[][];
    dataUri: string;
}

// Read only the unambiguous single-image pattern emitted for a leaf paint.
// The pattern origin is the node's export offset; its contents are local to
// that tile. Preserve the source image instead of flattening the node.
export function parseSvgImageTruth(svg: string, width: number, height: number): SvgImageTruth | null {
    if (!(width > 0) || !(height > 0)) return null;
    const patterns: RegExpExecArray[] = [];
    const patternRe = /<pattern\b([^>]*)>([\s\S]*?)<\/pattern>/g;
    let match: RegExpExecArray | null;
    while ((match = patternRe.exec(svg))) patterns.push(match);
    if (patterns.length !== 1) return null;
    const attrs = parseAttributes(patterns[0][1]);
    if (attrs.patternunits !== "userSpaceOnUse" || attrs.patterntransform ||
        (attrs.patterncontentunits && attrs.patterncontentunits !== "userSpaceOnUse") ||
        Math.abs(Number(attrs.width) - width) > 0.015 || Math.abs(Number(attrs.height) - height) > 0.015) return null;
    const body = patterns[0][2];
    const images: RegExpExecArray[] = [];
    const imageRe = /<image\b([^>]*)\/?\s*>/g;
    while ((match = imageRe.exec(body))) images.push(match);
    if (images.length !== 1 || /<(?:g|use)\b/.test(body)) return null;
    const img = parseAttributes(images[0][1]);
    const dataUri = img["xlink:href"] || img.href || "";
    if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(dataUri)) return null;
    const iw = Number(img.width), ih = Number(img.height);
    const x = Number(img.x || 0), y = Number(img.y || 0);
    const m = parseSvgTransform(img.transform);
    if (!m || ![iw, ih, x, y].every(Number.isFinite) || !(iw > 0 && ih > 0)) return null;
    const a = m[0][0] * iw / width, b = m[0][1] * ih / width;
    const c = m[1][0] * iw / height, d = m[1][1] * ih / height;
    const tx = (m[0][0] * x + m[0][1] * y + m[0][2]) / width;
    const ty = (m[1][0] * x + m[1][1] * y + m[1][2]) / height;
    const det = a * d - b * c;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
    return {
        dataUri,
        imageTransform: [[d / det, -b / det, (b * ty - d * tx) / det],
            [-c / det, a / det, (c * tx - a * ty) / det]]
    };
}

export function decodeImageDataUri(uri: string, byteLimit: number): Uint8Array | null {
    const match = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
    if (!match || match[1].length % 4 !== 0) return null;
    const data = match[1];
    const length = data.length / 4 * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
    if (length <= 0 || length > byteLimit) return null;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const bytes = new Uint8Array(length);
    let accumulator = 0, bits = 0, offset = 0;
    for (let i = 0; i < data.length && data[i] !== "="; i++) {
        accumulator = (accumulator << 6) | alphabet.indexOf(data[i]);
        bits += 6;
        if (bits >= 8) { bits -= 8; bytes[offset++] = (accumulator >> bits) & 255; }
    }
    return bytes;
}

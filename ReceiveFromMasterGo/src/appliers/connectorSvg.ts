// Preserve the source logical box while positioning the rendered stroke/arrow
// outline at its native render-bound offset. Never stretch it to the box.
export function localConnectorSvg(data: any): string | null {
  const source = data?.connectorSvg;
  if (data?.sourceType !== "CONNECTOR" || typeof source?.markup !== "string" ||
      (data.blend?.opacity ?? 1) !== 1 || data.blend?.effects?.length) return null;
  const outer = source.markup.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i);
  if (!outer || /<(?:image|filter|mask|clipPath|text)\b/i.test(source.markup)) return null;
  const view = outer[1].match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  const box = view?.[1].trim().split(/[\s,]+/).map(Number);
  const { width, height } = data.layout || {};
  const offset = source.offset;
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[0] !== 0 || box[1] !== 0 ||
      ![width,height,offset?.x,offset?.y,source.width,source.height].every(Number.isFinite) ||
      width <= 0 || height <= 0 || Math.abs(box[2] - source.width) >= 1 ||
      Math.abs(box[3] - source.height) >= 1) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${offset.x},${offset.y})">${outer[2]}</g></svg>`;
}

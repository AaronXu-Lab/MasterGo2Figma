// Native ellipse SVGs contain endpoint rounding unavailable in ArcData.
// Only consume a viewport proven to match the original local box. A host SVG
// already includes axis reflections; undo them inside the wrapper before the
// normal property applier restores the source transform on the wrapper.
export function localEllipseArcSvg(data: any): string | null {
  if (data?.sourceType !== 'ELLIPSE' || typeof data.arcSvgMarkup !== 'string') return null;
  if ((data.blend?.opacity ?? 1) !== 1 || data.blend?.effects?.length) return null;
  const svg = data.arcSvgMarkup;
  const outer = svg.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i);
  if (!outer || /<(?:image|filter|mask|clipPath)\b/i.test(svg)) return null;
  const view = outer[1].match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  const box = view?.[1].trim().split(/[\s,]+/).map(Number);
  const layout = data.layout;
  const m = layout?.relativeTransform;
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[0] !== 0 || box[1] !== 0 ||
      !Number.isFinite(layout?.width) || !Number.isFinite(layout?.height) ||
      Math.abs(box[2] - layout.width) > 0.01 || Math.abs(box[3] - layout.height) > 0.01 ||
      !(box[2] > 0) || !(box[3] > 0) || !m ||
      ![m[0]?.[0],m[0]?.[1],m[1]?.[0],m[1]?.[1]].every(Number.isFinite) ||
      Math.abs(m[0][1]) > 1e-6 || Math.abs(m[1][0]) > 1e-6 ||
      Math.abs(Math.abs(m[0][0]) - 1) > 1e-6 || Math.abs(Math.abs(m[1][1]) - 1) > 1e-6) return null;
  const sx = m[0][0] < 0 ? -1 : 1, sy = m[1][1] < 0 ? -1 : 1;
  const tx = sx < 0 ? box[2] : 0, ty = sy < 0 ? box[3] : 0;
  return `<svg${outer[1]}><g transform="matrix(${sx},0,0,${sy},${tx},${ty})">${outer[2]}</g></svg>`;
}

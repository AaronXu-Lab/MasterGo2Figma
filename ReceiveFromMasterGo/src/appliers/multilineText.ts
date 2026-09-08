// Figma adds inter-line baseline leading when adjacent lines have different
// font sizes, even with identical fixed line heights. MasterGo uses independent
// fixed line boxes. Keep those lines editable inside a transparent frame.
export function getFixedMixedTextLines(data: any): any[] | null {
  const text = data?.characters;
  const lineHeight = data?.lineHeight;
  const segments = data?.styledTextSegments;
  if (typeof text !== 'string' || !text.includes('\n') || text.includes('\r') ||
      data.textAutoResize !== 'WIDTH_AND_HEIGHT' || lineHeight?.unit !== 'PIXELS' ||
      !(lineHeight.value > 0) || !Array.isArray(segments) ||
      data.blend?.isMask || !(data.layout?.width > 0) ||
      (data.paragraphSpacing || 0) !== 0 || (data.paragraphIndent || 0) !== 0) return null;
  const lines = text.split('\n');
  if (lines.some(line => !line) || Math.abs(data.layout?.height - lines.length * lineHeight.value) > 0.015 ||
      !Number.isFinite(data.layout?.height)) return null;
  if (segments.some(segment => segment.lineHeight &&
      (segment.lineHeight.unit !== 'PIXELS' || segment.lineHeight.value !== lineHeight.value))) return null;
  let offset = 0;
  const result = lines.map(characters => {
    const start = offset;
    offset += characters.length + 1;
    const runs = segments.filter(s => s.end > start && s.start < offset - 1)
      .map(s => ({ ...s, start: Math.max(0, s.start - start), end: Math.min(characters.length, s.end - start) }));
    return { characters, styledTextSegments: runs };
  });
  // Only uniform-size explicit lines need this fallback; leave wrapping and
  // mixed sizes within a line on the ordinary native text path.
  const sizes = result.map(line => {
    let covered = 0;
    for (const run of line.styledTextSegments) {
      if (run.start !== covered) return null;
      covered = run.end;
    }
    if (covered !== line.characters.length) return null;
    const sizes = new Set(line.styledTextSegments.map((s: any) => s.fontSize ?? data.fontSize));
    return sizes.size === 1 ? [...sizes][0] : null;
  });
  return sizes.indexOf(null) >= 0 || new Set(sizes).size < 2 ? null : result;
}

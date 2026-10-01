// Older MasterGo ZIPs expose complete styled ranges in Unicode code points.
// Figma range APIs use UTF-16. Only convert an unambiguous complete cover;
// partial or already UTF-16 ranges must retain their original meaning.
export function normalizeCompleteTextRanges<T extends { start: number; end: number }>(characters: string, ranges: T[]): T[] {
  const codePoints = Array.from(characters);
  if (codePoints.length === characters.length || !ranges.length) return ranges;
  let end = 0;
  for (const range of ranges) {
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start !== end || range.end <= range.start) return ranges;
    end = range.end;
  }
  if (end !== codePoints.length) return ranges;
  const offsets = [0];
  for (const character of codePoints) offsets.push(offsets[offsets.length - 1] + character.length);
  return ranges.map(range => ({ ...range, start: offsets[range.start], end: offsets[range.end] }));
}

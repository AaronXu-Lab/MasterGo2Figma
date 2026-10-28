import { ImportTextListRange } from "../../../shared/types";

type MasterGoListRange = {
  start: number;
  end: number;
  type: "ORDERED" | "BULLETED" | "NONE";
  level: number;
};

// Observed native ordered-list marker. Do not strip arbitrary private-use
// glyphs, or infer a list from this character without public listStyles data.
const MASTERGO_ORDERED_LIST_MARKER = "\u{F0010}";

function readListRanges(entries: any, length: number): MasterGoListRange[] {
  if (!Array.isArray(entries)) return [];
  const result: MasterGoListRange[] = [];
  for (const entry of entries) {
    if (!entry || !Number.isInteger(entry.start) || !Number.isInteger(entry.end) ||
        entry.start < 0 || entry.end <= entry.start || entry.end > length ||
        ["ORDERED", "BULLETED", "NONE"].indexOf(entry.type) < 0 ||
        !Number.isInteger(entry.level) || entry.level < 0 || entry.level > 4) continue;
    result.push({ start: entry.start, end: entry.end, type: entry.type, level: entry.level });
  }
  result.sort((a, b) => a.start - b.start);
  // Conflicting metadata cannot safely authorize deleting a character.
  for (let i = 1; i < result.length; i++) {
    if (result[i].start < result[i - 1].end) return [];
  }
  return result;
}

export function normalizeExportTextRanges(characters: string, segments: any[] | undefined, listStyles: any) {
  // Both public MasterGo APIs use Unicode code-point indices, whereas Figma
  // ranges use UTF-16 code units. Map boundaries once, including deletions.
  const points = Array.from(characters);
  const lists = readListRanges(listStyles, points.length);
  const offsets = [0];
  const kept: string[] = [];
  let listIndex = 0;
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    while (listIndex < lists.length && lists[listIndex].end <= i) listIndex++;
    const list = lists[listIndex];
    const paragraphStart = i === 0 || /[\n\r\u2029]/.test(points[i - 1]);
    const marker = paragraphStart && points[i] === MASTERGO_ORDERED_LIST_MARKER &&
      list && list.type === "ORDERED" && list.start <= i && list.end > i;
    if (!marker) {
      kept.push(points[i]);
      length += points[i].length;
    }
    offsets.push(length);
  }
  const styledTextSegments = segments?.map(segment => ({
    ...segment, start: offsets[segment.start], end: offsets[segment.end]
  })).filter(segment => segment.end > segment.start);
  const textListRanges: ImportTextListRange[] = lists.map(list => ({
    start: offsets[list.start],
    end: offsets[list.end],
    type: list.type === "BULLETED" ? "UNORDERED" : list.type,
    indentation: list.level
  }));
  return {
    characters: kept.join(""),
    ...(styledTextSegments?.length ? { styledTextSegments, textRangeUnit: "UTF16" } : {}),
    ...(textListRanges.length ? { textListRanges } : {})
  };
}

import { ImportLayerRecord } from "../../shared/types";

// Older v2 exports omitted wrapping. Recover it only from complete, ordered
// rows: a horizontal reset plus a non-overlapping next row, never overflow alone.
export function restoreLegacyWrapLayout(layers: { [id: string]: ImportLayerRecord }): number {
  let restored = 0;
  for (const id of Object.keys(layers)) {
    const record = layers[id];
    const layout = record.props && record.props.layout;
    if (!layout || layout.layoutMode !== "HORIZONTAL" || layout.layoutWrap !== undefined) continue;
    const children = (record.childIds || []).map(id => layers[id]);
    if (children.some(child => !child || !child.props)) continue;
    const flow = children.filter(child => child.props.scence?.visible !== false &&
      child.props.layout?.layoutPositioning !== "ABSOLUTE").map(child => child.props.layout);
    if (flow.length < 3 || flow.some(box => !box ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 || box.height <= 0 || Math.abs(box.rotation || 0) > 0.01)) continue;
    const tolerance = 0.1;
    const first = flow[0];
    let rowY = first.y;
    let rowBottom = first.y + first.height;
    let previousRight = first.x + first.width;
    let rowCount = 1;
    const gaps: number[] = [];
    let valid = true;
    for (const box of flow.slice(1)) {
      if (Math.abs(box.y - rowY) <= tolerance && box.x >= previousRight - tolerance) {
        rowBottom = Math.max(rowBottom, box.y + box.height);
        previousRight = box.x + box.width;
        rowCount++;
      } else if (rowCount >= 2 && Math.abs(box.x - first.x) <= tolerance && box.y >= rowBottom - tolerance) {
        gaps.push(Math.max(0, box.y - rowBottom));
        rowY = box.y;
        rowBottom = box.y + box.height;
        previousRight = box.x + box.width;
        rowCount = 1;
      } else {
        valid = false;
        break;
      }
    }
    if (!valid || !gaps.length || gaps.some(gap => Math.abs(gap - gaps[0]) > tolerance)) continue;
    layout.layoutWrap = "WRAP";
    if (layout.counterAxisSpacing === undefined) layout.counterAxisSpacing = gaps[0];
    restored++;
  }
  return restored;
}

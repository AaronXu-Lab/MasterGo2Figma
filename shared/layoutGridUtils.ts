// Convert MasterGo's grid vocabulary to Figma's layout-grid properties.
export function normalizeLayoutGrids(grids: any): any[] {
  if (!Array.isArray(grids)) return [];
  const result: any[] = [];
  for (const grid of grids) {
    if (!grid || typeof grid !== "object") continue;
    const pattern = grid.pattern || grid.gridType;
    if (["GRID", "ROWS", "COLUMNS"].indexOf(pattern) < 0) continue;
    const common = {
      pattern,
      visible: grid.visible ?? grid.isVisible ?? true,
      color: grid.color
        ? { r: grid.color.r, g: grid.color.g, b: grid.color.b, a: grid.color.a }
        : { r: 1, g: 0, b: 0, a: 0.1 }
    };
    const sectionSize = grid.sectionSize == null ? undefined : grid.sectionSize;
    if (pattern === "GRID") { result.push({ ...common, sectionSize: sectionSize ?? 10 }); continue; }
    const alignment = ({ LEFT: "MIN", RIGHT: "MAX" } as any)[grid.alignment] || grid.alignment || "STRETCH";
    result.push({ ...common, alignment, count: grid.count, gutterSize: grid.gutterSize,
      offset: grid.offset ?? 0, ...(sectionSize === undefined || alignment === "STRETCH" ? {} : { sectionSize }) });
  }
  return result;
}

// MasterGo uses zero for an unset size limit. Figma uses null; applying zero
// as a maximum clamps otherwise valid auto-layout containers to one pixel.
export function normalizeMasterGoSizeLimit(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === 0) return null;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

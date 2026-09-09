// ZIP has no native mask-render flag. A translucent black alpha mask inside
// a background-blurred group controls coverage; painting it again adds a gray
// veil to the backdrop (0909). Explicit native flags remain authoritative.
export function isBackdropCoverageMask(fills: any, strokes: any, effects: any): boolean {
  if (!Array.isArray(effects) || !effects.some((fx: any) =>
    fx.type === "BACKGROUND_BLUR" && fx.visible !== false && fx.radius > 0)) return false;
  const visible = (paints: any) => Array.isArray(paints) ? paints.filter((p: any) =>
    p && p.visible !== false && (p.opacity === undefined || p.opacity > 0)) : [];
  // White strokes contribute coverage at the frosted edge too. They must
  // not force the black mask fill to be painted as a separate veil.
  if (visible(strokes).some((p: any) => p.type !== "SOLID" ||
      p.color?.r !== 1 || p.color?.g !== 1 || p.color?.b !== 1)) return false;
  const paints = visible(fills);
  return paints.length === 1 && paints[0].type === "SOLID" &&
    paints[0].opacity > 0 && paints[0].opacity < 1 &&
    paints[0].color?.r === 0 && paints[0].color?.g === 0 && paints[0].color?.b === 0;
}

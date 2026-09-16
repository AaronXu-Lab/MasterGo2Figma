// A filled vector exported as SVG may have a shadow-padded viewport and a
// mirrored path. Use its actual path when it is already in the source node's
// local coordinate system; the regular property applier restores placement and
// effects once. Keep ambiguous/compound SVGs on the existing wrapper path.
export function unwrapSingleVectorSvg(root: FrameNode, data: any): SceneNode {
  if (data?.vectorFallback !== "svgMissingRegions" || root.children.length !== 1) return root;
  const child = root.children[0];
  if (child.type !== "VECTOR" || !root.parent || !("appendChild" in root.parent)) return root;
  const layout = data.layout;
  const transform = layout?.relativeTransform;
  if (!transform || ![layout.width, layout.height].every(Number.isFinite)) return root;
  const tolerance = 0.01;
  if (Math.abs(child.width - layout.width) > tolerance || Math.abs(child.height - layout.height) > tolerance) return root;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      if (!Number.isFinite(transform[row]?.[col]) ||
          Math.abs(child.relativeTransform[row][col] - transform[row][col]) > 1e-5) return root;
    }
  }
  root.parent.appendChild(child);
  root.remove();
  return child;
}

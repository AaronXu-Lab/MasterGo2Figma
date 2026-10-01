import { isOutOfMemoryError } from "../../shared/utils";

const MAX_CONNECTOR_SVG_BYTES = 128 * 1024;
const MAX_CONNECTOR_CACHE_BYTES = 2 * 1024 * 1024;
let cache: { [id: string]: any } = {};
let cacheBytes = 0;

export function clearConnectorSvgCache() { cache = {}; cacheBytes = 0; }
export function takeConnectorSvg(id: string) {
  const value = cache[id];
  if (value) { cacheBytes -= value.markup.length; delete cache[id]; }
  return value;
}

// Capture before the main serialization pass puts pressure on the host heap.
// Straight connectors already have exact endpoints and need no native export.
export async function captureConnectorSvg(node: any): Promise<void> {
  if (node.type !== "CONNECTOR" || node.width <= 1 || node.height <= 1 ||
      node.opacity !== 1 || cacheBytes >= MAX_CONNECTOR_CACHE_BYTES) return;
  if (node.text && node.text.characters) return;
  const m = node.absoluteTransform;
  if (!m || m[0][0] !== 1 || m[0][1] !== 0 || m[1][0] !== 0 || m[1][1] !== 1) return;
  try {
    const markup = await node.exportAsync({ format: "SVG" });
    if (typeof markup !== "string" || markup.length > MAX_CONNECTOR_SVG_BYTES ||
        cacheBytes + markup.length > MAX_CONNECTOR_CACHE_BYTES) return;
    const bounds = node.absoluteRenderBounds;
    if (!bounds || ![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)) return;
    cache[node.id] = { markup, offset: { x: bounds.x - m[0][2], y: bounds.y - m[1][2] },
      width: bounds.width, height: bounds.height };
    cacheBytes += markup.length;
  } catch (error) {
    if (isOutOfMemoryError(error)) throw error;
    console.warn("[MasterGo2Figma] Connector SVG unavailable", node.id, String(error));
  }
}

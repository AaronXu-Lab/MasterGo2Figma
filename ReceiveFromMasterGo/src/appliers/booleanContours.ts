const COINCIDENT_ENDPOINT_TOLERANCE = 1e-3;

// MasterGo implicitly fills a contour whose distinct end vertices coincide.
// Figma boolean operands require an explicit closed region. Only repair one
// simple, connected chain with sub-millipixel endpoint separation; genuine open
// paths, branches, disconnected geometry and existing regions stay untouched.
export function closeCoincidentBooleanContour(network: any): any {
  if (!network || !Array.isArray(network.vertices) || !Array.isArray(network.segments) ||
      network.segments.length < 3 || network.regions?.length) return network;
  const vertices = network.vertices;
  const segments = network.segments;
  const edges = new Map<number, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (![segment.start, segment.end].every(index => Number.isInteger(index) &&
        index >= 0 && index < vertices.length) || segment.start === segment.end) return network;
    for (const index of [segment.start, segment.end]) {
      const vertex = vertices[index];
      if (!Number.isFinite(vertex?.x) || !Number.isFinite(vertex?.y)) return network;
      const incident = edges.get(index) || [];
      incident.push(i);
      if (incident.length > 2) return network;
      edges.set(index, incident);
    }
  }
  const ends = [...edges].filter(([, incident]) => incident.length === 1).map(([index]) => index);
  if (ends.length !== 2) return network;
  const first = vertices[ends[0]], last = vertices[ends[1]];
  if (Math.hypot(first.x - last.x, first.y - last.y) > COINCIDENT_ENDPOINT_TOLERANCE) return network;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const index of edges.keys()) {
    const vertex = vertices[index];
    minX = Math.min(minX, vertex.x); minY = Math.min(minY, vertex.y);
    maxX = Math.max(maxX, vertex.x); maxY = Math.max(maxY, vertex.y);
  }
  const width = maxX - minX, height = maxY - minY;
  if (width * height <= COINCIDENT_ENDPOINT_TOLERANCE ** 2) return network;
  const loop: number[] = [];
  const visited = new Set<number>();
  let current = ends[0];
  while (true) {
    const next = edges.get(current)?.find(index => !visited.has(index));
    if (next === undefined) break;
    visited.add(next);
    loop.push(next);
    const segment = segments[next];
    current = segment.start === current ? segment.end : segment.start;
  }
  if (visited.size !== segments.length || current !== ends[1]) return network;
  loop.push(segments.length);
  return {
    ...network,
    segments: [...segments, { start: ends[1], end: ends[0] }],
    regions: [{ windingRule: "EVENODD", loops: [loop] }]
  };
}

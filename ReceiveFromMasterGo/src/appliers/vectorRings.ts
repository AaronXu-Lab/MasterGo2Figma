type Point = { x: number; y: number };
type Ring = Point & { radius: number; filled: boolean };
const pendingRings = new Map<string, { node: VectorNode; rings: Ring[] }>();

export function resetVectorRings() {
    pendingRings.clear();
}

function mix(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function splitCurve(points: Point[], t: number): Point[] {
    const a = mix(points[0], points[1], t), b = mix(points[1], points[2], t), c = mix(points[2], points[3], t);
    const d = mix(a, b, t), e = mix(b, c, t);
    return [mix(d, e, t), e, c, points[3]];
}

function curveLength(points: Point[], end: number): number {
    let previous = points[0], length = 0;
    for (let i = 1; i <= 32; i++) {
        const next = splitCurve(points, end * i / 32)[0];
        length += Math.hypot(next.x - previous.x, next.y - previous.y);
        previous = next;
    }
    return length;
}

// Preserve the logical box while trimming the stroke outside each hollow cap.
// 保留逻辑尺寸，并把描边起止位置裁到空心端点的外缘。
export function createRingCapGeometry(network: any, weight: number, layout: any): { network: any; rings: Ring[] } {
    if (!network?.vertices?.some((v: any) => v.strokeCap === "RING" || v.strokeCap === "ROUND_ARROW") || !(weight > 0)) {
        return { network, rings: [] };
    }
    const next = JSON.parse(JSON.stringify(network));
    const rings: Ring[] = [];
    for (let index = 0; index < next.vertices.length; index++) {
        const vertex = next.vertices[index];
        if (vertex.strokeCap !== "RING" && vertex.strokeCap !== "ROUND_ARROW") continue;
        const filled = vertex.strokeCap === "ROUND_ARROW";
        vertex.strokeCap = "NONE";
        const incident = next.segments.filter((s: any) => s.start === index || s.end === index);
        if (incident.length !== 1) continue;
        const segment = incident[0], reversed = segment.end === index;
        const start = next.vertices[segment.start], end = next.vertices[segment.end];
        const ts = segment.tangentStart || { x: 0, y: 0 }, te = segment.tangentEnd || { x: 0, y: 0 };
        let points = [{ x: start.x, y: start.y }, { x: start.x + ts.x, y: start.y + ts.y },
            { x: end.x + te.x, y: end.y + te.y }, { x: end.x, y: end.y }];
        if (reversed) points.reverse();
        const radius = weight * 2.9;
        rings.push({ x: vertex.x, y: vertex.y, radius, filled });
        const distance = Math.min(radius, curveLength(points, 1) / 2);
        let low = 0, high = 1;
        for (let i = 0; i < 24; i++) {
            const t = (low + high) / 2;
            if (curveLength(points, t) < distance) low = t; else high = t;
        }
        points = splitCurve(points, (low + high) / 2);
        if (reversed) points.reverse();
        start.x = points[0].x; start.y = points[0].y;
        end.x = points[3].x; end.y = points[3].y;
        segment.tangentStart = { x: points[1].x - start.x, y: points[1].y - start.y };
        segment.tangentEnd = { x: points[2].x - end.x, y: points[2].y - end.y };
    }
    if (rings.length && Number.isFinite(layout?.width) && Number.isFinite(layout?.height)) {
        for (const point of [{ x: 0, y: 0 }, { x: layout.width, y: layout.height }]) {
            const index = next.vertices.length;
            next.vertices.push({ ...point, strokeCap: "NONE" });
            next.segments.push({ start: index, end: index });
        }
    }
    return { network: next, rings };
}

export function queueVectorRings(node: VectorNode, rings: Ring[]) {
    if (rings.length) pendingRings.set(node.id, { node, rings });
}

// Add editable endpoint circles after page layout has settled.
// 在页面布局稳定后添加可编辑的空心端点圆。
export function renderVectorRings(): number {
    let count = 0;
    for (const { node, rings } of pendingRings.values()) {
        if (node.removed) continue;
        const parent = node.parent;
        if (!parent || !("insertChild" in parent)) continue;
        for (const ring of rings) {
            const circle = figma.createEllipse();
            parent.insertChild(parent.children.indexOf(node) + 1, circle);
            circle.name = ring.filled ? "Endpoint circle" : "Endpoint ring";
            circle.setPluginData("mastergoEndpointRing", "true");
            circle.resize(ring.radius * 2, ring.radius * 2);
            circle.fills = ring.filled ? node.strokes : [];
            circle.strokes = ring.filled ? [] : node.strokes;
            circle.strokeWeight = node.strokeWeight as number;
            circle.strokeAlign = "CENTER";
            circle.opacity = node.opacity;
            circle.visible = node.visible;
            if ("layoutMode" in parent && parent.layoutMode !== "NONE") circle.layoutPositioning = "ABSOLUTE";
            const transform = node.relativeTransform;
            const x = ring.x - ring.radius, y = ring.y - ring.radius;
            circle.relativeTransform = [[transform[0][0], transform[0][1], transform[0][2] + transform[0][0] * x + transform[0][1] * y],
                [transform[1][0], transform[1][1], transform[1][2] + transform[1][0] * x + transform[1][1] * y]];
            count++;
        }
    }
    pendingRings.clear();
    return count;
}

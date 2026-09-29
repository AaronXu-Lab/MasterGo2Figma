// Figma ellipses cannot round arc corners. Preserve MasterGo's editable
// geometry as a cubic vector network, with radius on the four arc endpoints.
export function roundedArcNetwork(data: any): any | null {
  const arc = data.arcData;
  const radius = Number(data.arcCornerRadius);
  const width = Number(data.layout?.width), height = Number(data.layout?.height);
  if (!arc || !(radius > 0) || !(width > 0) || !(height > 0)) return null;
  const sweep = arc.endingAngle - arc.startingAngle;
  if (!Number.isFinite(sweep) || Math.abs(sweep) < 1e-8 || Math.abs(sweep) >= Math.PI * 2 - 1e-6) return null;
  const vertices: any[] = [], segments: any[] = [];
  const cx = width / 2, cy = height / 2;
  const point = (a: number, scale: number) => ({ x: cx + cx * scale * Math.cos(a), y: cy + cy * scale * Math.sin(a) });
  const add = (p: any, cornerRadius = 0) => { vertices.push({ ...p, cornerRadius }); return vertices.length - 1; };
  const line = (start: number, end: number) => segments.push({ start, end });
  const curve = (startAngle: number, delta: number, scale: number) => {
    const count = Math.ceil(Math.abs(delta) / (Math.PI / 2));
    const step = delta / count;
    let previous = add(point(startAngle, scale), radius);
    const first = previous;
    for (let i = 1; i <= count; i++) {
      const a = startAngle + step * (i - 1), b = startAngle + step * i;
      const next = add(point(b, scale), i === count ? radius : 0);
      const k = 4 / 3 * Math.tan(step / 4);
      segments.push({ start: previous, end: next,
        tangentStart: { x: -cx * scale * Math.sin(a) * k, y: cy * scale * Math.cos(a) * k },
        tangentEnd: { x: cx * scale * Math.sin(b) * k, y: -cy * scale * Math.cos(b) * k } });
      previous = next;
    }
    return [first, previous];
  };
  const outer = curve(arc.startingAngle, sweep, 1);
  let loop: number[];
  const outerCount = segments.length;
  if (arc.innerRadius > 0) {
    const inner = curve(arc.endingAngle, -sweep, arc.innerRadius);
    const curveCount = segments.length;
    line(outer[1], inner[0]); line(inner[1], outer[0]);
    loop = [...Array(outerCount).keys(), curveCount,
      ...Array.from({ length: curveCount - outerCount }, (_, i) => outerCount + i)];
    loop.push(curveCount + 1);
  } else {
    const center = add({x:cx,y:cy}, radius);
    line(outer[1], center); line(center, outer[0]);
    loop = segments.map((_: any, i: number) => i);
  }
  return { vertices, segments, regions: [{ windingRule: 'NONZERO', loops: [loop] }] };
}

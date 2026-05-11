import type { Point, Shape, Transform } from "./types";

const deg2rad = (d: number) => (d * Math.PI) / 180;

export function transformPoint(p: Point, t: Transform): Point {
  let x = p.x;
  let y = p.y;
  if (t.flipX) x = -x;
  if (t.flipY) y = -y;
  const r = deg2rad(t.rotation || 0);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s + t.x, y: x * s + y * c + t.y };
}

export function shapeWorldVertices(shape: Shape): Point[] {
  return shape.vertices.map((v) => transformPoint(v, shape.transform));
}

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
};

export function shapeBounds(shape: Shape): Bounds {
  const pts = shapeWorldVertices(shape);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Centered rectangle vertices in local inches.
export function rectVertices(wIn: number, hIn: number): Point[] {
  const w = wIn / 2;
  const h = hIn / 2;
  return [
    { x: -w, y: -h }, { x: w, y: -h },
    { x: w, y: h }, { x: -w, y: h },
  ];
}

// L-shape: full bbox outerW × outerH with a notch removed from top-right.
// Mirror/rotate after creation to orient elsewhere.
export function lShapeVertices(outerW: number, outerH: number, notchW: number, notchH: number): Point[] {
  const w = outerW / 2;
  const h = outerH / 2;
  return [
    { x: -w, y: -h },
    { x: w - notchW, y: -h },
    { x: w - notchW, y: -h + notchH },
    { x: w, y: -h + notchH },
    { x: w, y: h },
    { x: -w, y: h },
  ];
}

// Letters: A, B, …, Z, AA, AB, …
export function letterLabel(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Edge-snap: align moving shape's bbox edges/center to other shapes' edges.
export function edgeSnap(
  moving: Shape,
  others: Shape[],
  thresholdIn: number
): { dx: number; dy: number; snappedX: number | null; snappedY: number | null } {
  const b = shapeBounds(moving);
  const candidatesX: Array<{ delta: number; target: number }> = [];
  const candidatesY: Array<{ delta: number; target: number }> = [];

  for (const o of others) {
    if (o.id === moving.id) continue;
    const ob = shapeBounds(o);
    for (const m of [b.minX, b.maxX, b.cx]) {
      for (const t of [ob.minX, ob.maxX, ob.cx]) {
        candidatesX.push({ delta: t - m, target: t });
      }
    }
    for (const m of [b.minY, b.maxY, b.cy]) {
      for (const t of [ob.minY, ob.maxY, ob.cy]) {
        candidatesY.push({ delta: t - m, target: t });
      }
    }
  }

  let bestX = { delta: 0, target: null as number | null };
  let bestY = { delta: 0, target: null as number | null };
  let dxAbs = Infinity;
  let dyAbs = Infinity;

  for (const c of candidatesX) {
    if (Math.abs(c.delta) < thresholdIn && Math.abs(c.delta) < dxAbs) {
      bestX = c;
      dxAbs = Math.abs(c.delta);
    }
  }
  for (const c of candidatesY) {
    if (Math.abs(c.delta) < thresholdIn && Math.abs(c.delta) < dyAbs) {
      bestY = c;
      dyAbs = Math.abs(c.delta);
    }
  }

  return {
    dx: bestX.target != null ? bestX.delta : 0,
    dy: bestY.target != null ? bestY.delta : 0,
    snappedX: bestX.target,
    snappedY: bestY.target,
  };
}

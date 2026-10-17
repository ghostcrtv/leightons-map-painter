/**
 * Pure geometry helpers for the map (no DOM, no canvas) so they can be unit-tested.
 *
 * Coordinates here are "world units": the projected flat map, WORLD_WIDTH units wide.
 */

export type Ring = [number, number][];
/** One polygon = outer ring followed by any holes. */
export type PlanarPolygon = Ring[];

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const emptyBBox = (): BBox => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

export function ringBBox(ring: Ring, into: BBox = emptyBBox()): BBox {
  for (const [x, y] of ring) {
    if (x < into.minX) into.minX = x;
    if (y < into.minY) into.minY = y;
    if (x > into.maxX) into.maxX = x;
    if (y > into.maxY) into.maxY = y;
  }
  return into;
}

export function polygonBBox(poly: PlanarPolygon): BBox {
  // The outer ring bounds the polygon; holes are inside it.
  return ringBBox(poly[0] ?? []);
}

export function unionBBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export const bboxWidth = (b: BBox) => b.maxX - b.minX;
export const bboxHeight = (b: BBox) => b.maxY - b.minY;

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function bboxContains(b: BBox, x: number, y: number): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

/** Signed shoelace area of a ring (absolute value is what we use). */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return sum / 2;
}

/** Planar area of a polygon in world units², holes subtracted. */
export function polygonArea(poly: PlanarPolygon): number {
  if (poly.length === 0) return 0;
  let area = Math.abs(ringArea(poly[0]));
  for (let i = 1; i < poly.length; i++) area -= Math.abs(ringArea(poly[i]));
  return Math.max(0, area);
}

function expand(b: BBox, fraction: number, minPad: number): BBox {
  const px = Math.max(bboxWidth(b) * fraction, minPad);
  const py = Math.max(bboxHeight(b) * fraction, minPad);
  return { minX: b.minX - px, minY: b.minY - py, maxX: b.maxX + px, maxY: b.maxY + py };
}

/**
 * Group a country's polygons into "flag clusters".
 *
 * One flag is stretched across each cluster. Nearby pieces (a coastline's islands,
 * an archipelago) share one flag; far-away pieces (Alaska, Hawaii, French Guiana)
 * get their own, so each piece shows a recognisable flag instead of a sliver.
 *
 * Returns arrays of polygon indices, largest cluster first.
 */
export function clusterPolygons(polys: PlanarPolygon[], gapFraction = 0.15, minPad = 0.4): number[][] {
  const boxes = polys.map(polygonBBox);
  const areas = polys.map(polygonArea);
  const order = polys.map((_, i) => i).sort((a, b) => areas[b] - areas[a]);
  const assigned = new Array<boolean>(polys.length).fill(false);
  const clusters: { members: number[]; box: BBox; area: number }[] = [];

  for (const seed of order) {
    if (assigned[seed]) continue;
    assigned[seed] = true;
    const members = [seed];
    let box = boxes[seed];
    let grew = true;
    while (grew) {
      grew = false;
      const reach = expand(box, gapFraction, minPad);
      for (const i of order) {
        if (assigned[i] || !bboxIntersects(reach, boxes[i])) continue;
        assigned[i] = true;
        members.push(i);
        box = unionBBox(box, boxes[i]);
        grew = true;
      }
    }
    clusters.push({ members, box, area: members.reduce((s, i) => s + areas[i], 0) });
  }
  return clusters.sort((a, b) => b.area - a.area).map((c) => c.members);
}

/**
 * Where to draw a flag so it covers a cluster's bounding box.
 *
 * The flag is stretched toward the shape's proportions, but never more than
 * `maxStretch` times its natural aspect, so it stays recognisable. Beyond that
 * it is scaled up to "cover" the box (edges of the flag get cropped).
 */
export function fitFlagRect(box: BBox, flagAspect = 4 / 3, maxStretch = 1.6): Rect {
  const bw = Math.max(bboxWidth(box), 1e-9);
  const bh = Math.max(bboxHeight(box), 1e-9);
  const boxAspect = bw / bh;
  const aspect = Math.min(Math.max(boxAspect, flagAspect / maxStretch), flagAspect * maxStretch);
  let w: number, h: number;
  if (aspect >= boxAspect) {
    h = bh;
    w = h * aspect;
  } else {
    w = bw;
    h = w / aspect;
  }
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

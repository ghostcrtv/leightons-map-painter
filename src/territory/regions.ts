/**
 * Region tools for simulations (Phase 4): who borders whom, where two countries meet, and
 * how to turn "this patch of land" into map actions. Pure logic on the TerritoryGrid
 * (no drawing), so it is unit-tested.
 *
 * Map changes are always expressed as ordinary paint/fill actions, so the map drawing and
 * the measuring grid can never disagree, and undo/redo/saves keep working.
 */
import { WATER, type TerritoryGrid } from './TerritoryGrid';

export type Piece =
  | { kind: 'paint'; owner: string; circles: number[]; within?: string }
  | { kind: 'fill'; id: string; owner?: string };

const DIRS8 = [-1, 1, 0, 0, -1, -1, 1, 1];
const DIRS8Y = [0, 0, -1, 1, -1, 1, -1, 1];

/** Is the country tracked by one point (too small for the grid)? */
const isTinyTracked = (g: TerritoryGrid, code: number) => g.tinyOwner[code] !== 0;

/** Cell index of a world point. */
export function cellAt(g: TerritoryGrid, x: number, y: number): number {
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell)));
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell)));
  return r * g.cols + c;
}

/** World point at the centre of a cell. */
export function cellCenter(g: TerritoryGrid, i: number): [number, number] {
  return [((i % g.cols) + 0.5) * g.cell, (Math.floor(i / g.cols) + 0.5) * g.cell];
}

/** Starting cells for a country: every cell it owns, plus the points of tiny countries it owns. */
function sources(g: TerritoryGrid, code: number): number[] {
  const out: number[] = [];
  const cur = g.current;
  for (let i = 0; i < cur.length; i++) if (cur[i] === code) out.push(i);
  for (let t = 1; t <= g.count; t++) if (g.tinyOwner[t] === code) out.push(cellAt(g, g.tinyPoint[t][0], g.tinyPoint[t][1]));
  return out;
}

/** Owner of a cell, counting tiny countries sitting on it (they "own" their point). */
function ownersNearPoint(g: TerritoryGrid, x: number, y: number, radiusCells: number, into: Set<number>) {
  const c0 = Math.floor(x / g.cell);
  const r0 = Math.floor(y / g.cell);
  for (let r = r0 - radiusCells; r <= r0 + radiusCells; r++) {
    if (r < 0 || r >= g.rows) continue;
    for (let c = c0 - radiusCells; c <= c0 + radiusCells; c++) {
      if (c < 0 || c >= g.cols) continue;
      const v = g.current[r * g.cols + c];
      if (v) into.add(v);
    }
  }
}

/** Countries whose land touches this country's land right now. */
export function touching(g: TerritoryGrid, code: number): Set<number> {
  const out = new Set<number>();
  const { cols, rows, current: cur } = g;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] !== code) continue;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    for (let k = 0; k < 8; k++) {
      const rr = r + DIRS8Y[k];
      const cc = c + DIRS8[k];
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      const v = cur[rr * cols + cc];
      if (v !== WATER && v !== code) out.add(v);
    }
  }
  // Tiny countries: next to whoever owns the land around their point.
  for (let t = 1; t <= g.count; t++) {
    const owner = g.tinyOwner[t];
    if (!owner) continue;
    const [x, y] = g.tinyPoint[t];
    const near = new Set<number>();
    ownersNearPoint(g, x, y, 2, near);
    if (owner === code) near.forEach((v) => v !== code && out.add(v));
    else if (near.has(code)) out.add(owner);
  }
  out.delete(code);
  return out;
}

let bfsDist: Int32Array | null = null;
let bfsQueue: Int32Array | null = null;

/**
 * Spread out from a country's land (over land and sea) and report what it reaches.
 * `stop(cell, owner, dist)` returns true to stop. Distances are in cells.
 */
function spread(g: TerritoryGrid, code: number, visit: (cell: number, owner: number, dist: number) => boolean) {
  const n = g.cols * g.rows;
  if (!bfsDist || bfsDist.length !== n) {
    bfsDist = new Int32Array(n);
    bfsQueue = new Int32Array(n);
  }
  const dist = bfsDist;
  const q = bfsQueue!;
  dist.fill(-1);
  let head = 0;
  let tail = 0;
  for (const s of sources(g, code)) {
    if (dist[s] !== -1) continue;
    dist[s] = 0;
    q[tail++] = s;
  }
  const { cols, rows, current: cur } = g;
  while (head < tail) {
    const i = q[head++];
    const d = dist[i];
    const owner = cur[i];
    if (owner !== code && visit(i, owner, d)) return;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    for (let k = 0; k < 8; k++) {
      const rr = r + DIRS8Y[k];
      const cc = c + DIRS8[k];
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      const j = rr * cols + cc;
      if (dist[j] !== -1) continue;
      dist[j] = d + 1;
      q[tail++] = j;
    }
  }
}

/** The countries closest to this one across the sea (for islands with no land neighbours). */
export function closest(g: TerritoryGrid, code: number, extraCells = 6): number[] {
  const found = new Map<number, number>();
  let first = -1;
  spread(g, code, (_i, owner, d) => {
    if (first >= 0 && d > first + extraCells) return true;
    if (owner !== WATER) {
      if (first < 0) first = d;
      if (!found.has(owner)) found.set(owner, d);
    }
    return false;
  });
  // Tiny countries near the coast we reached count too.
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
}

/** Neighbours for a "random opponent": touching countries, or else the closest ones. */
export function neighboursOf(g: TerritoryGrid, code: number): number[] {
  const t = touching(g, code);
  return t.size ? [...t] : closest(g, code);
}

/**
 * The cell of `target`'s land closest to `from`'s land (where an attack from `from` lands
 * first). With `rand`, picks a random one of the equally close cells, so attacks happen all
 * along a border instead of always at the same spot.
 */
export function frontCell(g: TerritoryGrid, from: number, target: number, rand?: () => number): number | null {
  const found: number[] = [];
  let best = -1;
  spread(g, from, (i, owner, d) => {
    if (best >= 0 && d > best) return true;
    if (owner === target) {
      best = d;
      found.push(i);
      if (!rand) return true;
    }
    return false;
  });
  if (found.length) return rand ? found[Math.min(found.length - 1, Math.floor(rand() * found.length))] : found[0];
  if (isTinyTracked(g, target) && g.tinyOwner[target] === target) {
    const [x, y] = g.tinyPoint[target];
    return cellAt(g, x, y);
  }
  return null;
}

/** Real km² of one cell (scaled to the real size of the country it belongs to on the real Earth). */
export function cellKm2(g: TerritoryGrid, i: number): number {
  const orig = g.original[i];
  if (!orig || !g.gridKm2[orig]) return 0;
  return (g.rowKm2[(i / g.cols) | 0] / g.gridKm2[orig]) * g.realKm2[orig];
}

/** Number of cells a country owns now. */
export function cellCount(g: TerritoryGrid, code: number): number {
  let n = 0;
  for (let i = 0; i < g.current.length; i++) if (g.current[i] === code) n++;
  return n;
}

/**
 * Random sample of up to `per` cells owned by each listed country (one pass over the grid).
 * Tiny countries with no cells get their point.
 */
export function sampleCells(g: TerritoryGrid, codes: number[], per: number, rand: () => number): Map<number, [number, number][]> {
  const want = new Set(codes);
  const seen = new Map<number, number>();
  const picks = new Map<number, number[]>();
  for (const c of codes) {
    seen.set(c, 0);
    picks.set(c, []);
  }
  const cur = g.current;
  for (let i = 0; i < cur.length; i++) {
    const v = cur[i];
    if (!v || !want.has(v)) continue;
    const n = seen.get(v)! + 1;
    seen.set(v, n);
    const arr = picks.get(v)!;
    if (arr.length < per) arr.push(i);
    else {
      const k = Math.floor(rand() * n);
      if (k < per) arr[k] = i;
    }
  }
  const out = new Map<number, [number, number][]>();
  for (const c of codes) {
    const pts = picks.get(c)!.map((i) => cellCenter(g, i));
    for (let t = 1; t <= g.count && pts.length < per; t++) if (g.tinyOwner[t] === c) pts.push([...g.tinyPoint[t]] as [number, number]);
    out.set(c, pts);
  }
  return out;
}

/** Is there sea next to this country's land? */
export function isCoastal(g: TerritoryGrid, code: number): boolean {
  const { cols, rows, current: cur } = g;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] !== code) continue;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) return true;
    if (!cur[i - 1] || !cur[i + 1] || !cur[i - cols] || !cur[i + cols]) return true;
  }
  return isTinyTracked(g, code); // tiny places are mostly islands or coastal specks
}

/** Direction (unit vector) from a point toward the nearest sea, searching outward. */
export function seaDirection(g: TerritoryGrid, x: number, y: number, maxCells = 200): [number, number] | null {
  const c0 = Math.floor(x / g.cell);
  const r0 = Math.floor(y / g.cell);
  for (let d = 1; d <= maxCells; d++) {
    let best: [number, number] | null = null;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c = Math.round(c0 + Math.cos(a) * d);
      const r = Math.round(r0 + Math.sin(a) * d);
      if (r < 0 || r >= g.rows || c < 0 || c >= g.cols) continue;
      if (g.current[r * g.cols + c] === WATER) {
        best = [Math.cos(a), Math.sin(a)];
        break;
      }
    }
    if (best) return best;
  }
  return null;
}

// ---------------------------------------------------------------- land changes

/**
 * The land taken in a partial win: a lumpy blob (a big circle plus a few smaller ones, so
 * it looks like a natural border, not a perfect circle) starting where the two sides meet
 * and leaning into the loser's land. The blob is grown until it covers `km2` real km² of
 * the loser's land. Returns the cells, the blob's circles (flat [x, y, r…], world units),
 * its middle and its overall radius.
 */
export function biteShape(g: TerritoryGrid, loser: number, front: [number, number], km2: number, rand: () => number) {
  const xs: number[] = [];
  const ys: number[] = [];
  const idx: number[] = [];
  const w: number[] = [];
  let cx = 0;
  let cy = 0;
  let total = 0;
  const cur = g.current;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] !== loser) continue;
    const [x, y] = cellCenter(g, i);
    const k = cellKm2(g, i);
    xs.push(x);
    ys.push(y);
    idx.push(i);
    w.push(k);
    cx += x * k;
    cy += y * k;
    total += k;
  }
  // Lean into the loser's land (toward the middle of what it owns).
  let ix = 0;
  let iy = 0;
  if (total > 0) {
    ix = cx / total - front[0];
    iy = cy / total - front[1];
    const len = Math.hypot(ix, iy);
    if (len > 1e-6) {
      ix /= len;
      iy /= len;
    } else ix = iy = 0;
  }
  // Template: one main circle and 4–6 smaller ones around it (sizes relative to 1).
  const tpl: [number, number, number][] = [[ix * 0.45, iy * 0.45, 1]];
  const n = 4 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.9;
    const d = 0.55 + rand() * 0.35;
    tpl.push([ix * 0.45 + Math.cos(a) * d, iy * 0.45 + Math.sin(a) * d, 0.4 + rand() * 0.3]);
  }
  const inside = (j: number, scale: number) => {
    for (const [ox, oy, r] of tpl) {
      const dx = xs[j] - (front[0] + ox * scale);
      const dy = ys[j] - (front[1] + oy * scale);
      if (dx * dx + dy * dy <= r * r * scale * scale) return true;
    }
    return false;
  };
  const areaAt = (scale: number) => {
    let a = 0;
    for (let j = 0; j < xs.length; j++) if (inside(j, scale)) a += w[j];
    return a;
  };
  let lo = 0;
  let hi = Math.max(g.cell * 2, Math.hypot(g.cols * g.cell, g.rows * g.cell) / 2);
  for (let it = 0; it < 26; it++) {
    const mid = (lo + hi) / 2;
    if (areaAt(mid) < km2) lo = mid;
    else hi = mid;
  }
  const scale = Math.max(hi, g.cell * 1.5);
  const cells: number[] = [];
  let got = 0;
  for (let j = 0; j < xs.length; j++) {
    if (inside(j, scale)) {
      cells.push(idx[j]);
      got += w[j];
    }
  }
  const circles: number[] = [];
  let radius = 0;
  const mx = front[0] + ix * 0.45 * scale;
  const my = front[1] + iy * 0.45 * scale;
  for (const [ox, oy, r] of tpl) {
    const x = front[0] + ox * scale;
    const y = front[1] + oy * scale;
    circles.push(round(x), round(y), round(r * scale));
    radius = Math.max(radius, Math.hypot(x - mx, y - my) + r * scale);
  }
  return { cells, circles, center: [mx, my] as [number, number], radius, km2: got };
}

/** Circles covering a set of cells, in blocks (kept to about `maxCircles` circles). */
function blockCircles(g: TerritoryGrid, cells: number[], maxCircles = 1200): number[] {
  for (let b = 2; ; b *= 2) {
    const blocks = new Set<number>();
    for (const i of cells) {
      const r = (i / g.cols) | 0;
      const c = i - r * g.cols;
      blocks.add(Math.floor(r / b) * 1e6 + Math.floor(c / b));
    }
    if (blocks.size <= maxCircles || b >= 64) {
      const size = b * g.cell;
      const out: number[] = [];
      for (const k of blocks) {
        const br = Math.floor(k / 1e6);
        const bc = k - br * 1e6;
        const x = (bc + 0.5) * size;
        const y = (br + 0.5) * size;
        out.push(round(x), round(y), round(size * 0.72));
      }
      return out;
    }
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Map actions that give these cells (all owned by `loser` now) to `winner`.
 *   - a whole real country taken → one 'fill' (exact borders)
 *   - a round bite → one circle per real country it touches, when that's exact
 *   - anything else → small circles in blocks
 * `ids[code]` = country id. Tiny countries owned by the loser inside the area are included.
 */
export function piecesFor(
  g: TerritoryGrid,
  ids: string[],
  cells: number[],
  winner: number,
  loser: number,
  /** The bite's circles (flat [x, y, r…]): used directly where they are exact. */
  shape?: number[],
): Piece[] {
  const byOrig = new Map<number, number[]>();
  for (const i of cells) {
    const o = g.original[i];
    let arr = byOrig.get(o);
    if (!arr) byOrig.set(o, (arr = []));
    arr.push(i);
  }
  const origCount = new Map<number, number>();
  for (let i = 0; i < g.original.length; i++) {
    const o = g.original[i];
    if (byOrig.has(o)) origCount.set(o, (origCount.get(o) ?? 0) + 1);
  }
  const W = ids[winner];
  const pieces: Piece[] = [];
  const handledTiny = new Set<number>();
  const fill = (x: number) => {
    pieces.push(x === winner ? { kind: 'fill', id: ids[x] } : { kind: 'fill', id: ids[x], owner: W });
    handledTiny.add(x);
  };
  for (const [x, list] of byOrig) {
    if (list.length === origCount.get(x) && (!isTinyTracked(g, x) || g.tinyOwner[x] === loser || g.tinyOwner[x] === x)) {
      fill(x);
      continue;
    }
    if (shape && shapeIsExact(g, x, loser, shape)) {
      pieces.push({ kind: 'paint', owner: W, circles: shape.slice(), within: ids[x] });
      continue;
    }
    // Cover the smaller side: the cells being taken, or (fill + give the rest back).
    const rest = origCount.get(x)! - list.length;
    if (list.length <= rest * 1.5) {
      pieces.push({ kind: 'paint', owner: W, circles: blockCircles(g, list), within: ids[x] });
    } else {
      fill(x);
      const others = new Map<number, number[]>();
      for (let i = 0; i < g.original.length; i++) {
        if (g.original[i] !== x) continue;
        const v = g.current[i];
        if (v === loser) continue;
        let arr = others.get(v);
        if (!arr) others.set(v, (arr = []));
        arr.push(i);
      }
      for (const [z, zc] of others) pieces.push({ kind: 'paint', owner: ids[z], circles: blockCircles(g, zc), within: ids[x] });
    }
  }
  // Tiny countries the loser owns inside the area.
  for (let t = 1; t <= g.count; t++) {
    if (g.tinyOwner[t] !== loser || handledTiny.has(t)) continue;
    const [tx, ty] = g.tinyPoint[t];
    const inside = shape ? inCircles(shape, tx, ty) : true;
    if (inside) fill(t);
  }
  return pieces;
}

function inCircles(c: number[], x: number, y: number) {
  for (let i = 0; i < c.length; i += 3) if ((x - c[i]) ** 2 + (y - c[i + 1]) ** 2 <= c[i + 2] * c[i + 2]) return true;
  return false;
}

/** True if every cell of real country `x` inside the circles is owned by the loser (so the circles are exact). */
function shapeIsExact(g: TerritoryGrid, x: number, loser: number, c: number[]) {
  for (let k = 0; k < c.length; k += 3) {
    const d = { x: c[k], y: c[k + 1], r: c[k + 2] };
    const r0 = Math.max(0, Math.floor((d.y - d.r) / g.cell));
    const r1 = Math.min(g.rows - 1, Math.floor((d.y + d.r) / g.cell));
    const rr = d.r * d.r;
    for (let r = r0; r <= r1; r++) {
      const dy = (r + 0.5) * g.cell - d.y;
      const half = rr - dy * dy;
      if (half < 0) continue;
      const span = Math.sqrt(half);
      const c0 = Math.max(0, Math.ceil((d.x - span) / g.cell - 0.5));
      const c1 = Math.min(g.cols - 1, Math.floor((d.x + span) / g.cell - 0.5));
      for (let cc = c0; cc <= c1; cc++) {
        const i = r * g.cols + cc;
        if (g.original[i] === x && g.current[i] !== loser) return false;
      }
    }
  }
  return true;
}

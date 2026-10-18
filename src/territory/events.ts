/**
 * Map changes for world events (Phase 4/5 simulations): rebellions, coasts growing, seas
 * rising. Pure logic on the Territory/grid (no drawing), unit-tested. Each returns an
 * ordinary action to apply, so undo, saving and the history log just work.
 */
import type { Action, Territory } from './Territory';
import { WATER } from './TerritoryGrid';
import { cellCenter, cellKm2, piecesFor } from './regions';

const round = (v: number) => Math.round(v * 1000) / 1000;

export interface RebellionCandidate {
  /** The country that wants its land back. */
  id: string;
  /** Who holds most of it now. */
  from: string;
  /** How much of its real land the occupier holds (0–1). */
  share: number;
  km2: number;
}

/** Countries with a big part of their real land held by another country. */
export function rebellionCandidates(t: Territory, minShare = 0.25): RebellionCandidate[] {
  const g = t.grid;
  const total = new Map<number, number>();
  const held = new Map<number, number>(); // key = orig * 65536 + occupier
  for (let i = 0; i < g.original.length; i++) {
    const o = g.original[i];
    if (!o) continue;
    total.set(o, (total.get(o) ?? 0) + 1);
    const c = g.current[i];
    if (c && c !== o) held.set(o * 65536 + c, (held.get(o * 65536 + c) ?? 0) + 1);
  }
  const best = new Map<number, { occ: number; n: number }>();
  for (const [k, n] of held) {
    const o = Math.floor(k / 65536);
    const occ = k % 65536;
    if (!best.has(o) || best.get(o)!.n < n) best.set(o, { occ, n });
  }
  const out: RebellionCandidate[] = [];
  for (const [o, { occ, n }] of best) {
    const share = n / (total.get(o) ?? 1);
    const id = t.idOf(o);
    const from = t.idOf(occ);
    if (!id || !from || share < minShare) continue;
    out.push({ id, from, share, km2: (t.statsFor(id)?.originalKm2 ?? 0) * share });
  }
  // Tiny countries held by someone (tracked by one point).
  for (let code = 1; code <= g.count; code++) {
    const owner = g.tinyOwner[code];
    if (!owner || owner === code || owner > g.count) continue;
    const id = t.idOf(code);
    const from = t.idOf(owner);
    if (id && from && !out.some((c) => c.id === id)) out.push({ id, from, share: 1, km2: t.statsFor(id)?.originalKm2 ?? 0 });
  }
  return out.sort((a, b) => b.km2 - a.km2);
}

/** `id` takes back its real land from `from`. Returns the action, or null if there's nothing to take. */
export function planRebellion(t: Territory, id: string, from: string): Extract<Action, { kind: 'rebellion' }> | null {
  const g = t.grid;
  const x = t.codeOf(id);
  const w = t.codeOf(from);
  if (!x || !w) return null;
  const cells: number[] = [];
  let km2 = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < g.original.length; i++) {
    if (g.original[i] !== x || g.current[i] !== w) continue;
    cells.push(i);
    km2 += cellKm2(g, i);
    const [cx, cy] = cellCenter(g, i);
    sx += cx;
    sy += cy;
  }
  const tinyHeld = g.tinyOwner[x] === w;
  if (!cells.length && !tinyHeld) return null;
  const ids = ['', ...Array.from({ length: g.count }, (_, k) => t.idOf(k + 1) ?? '')];
  const pieces = cells.length ? piecesFor(g, ids, cells, x, w) : [];
  if (tinyHeld && !pieces.some((p) => p.kind === 'fill' && p.id === id)) pieces.push({ kind: 'fill', id });
  if (tinyHeld) km2 += t.statsFor(id)?.originalKm2 ?? 0;
  const at: [number, number] = cells.length ? [round(sx / cells.length), round(sy / cells.length)] : [...g.tinyPoint[x]];
  return { kind: 'rebellion', id, from, pieces, km2: Math.round(km2), at };
}

/** Land cells of a country that touch the sea. */
function coastCells(t: Territory, code: number): number[] {
  const g = t.grid;
  const out: number[] = [];
  const { cols, rows, current: cur } = g;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] !== code) continue;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    if (r <= 0 || c <= 0 || r >= rows - 1 || c >= cols - 1) continue;
    if (cur[i - 1] === WATER || cur[i + 1] === WATER || cur[i - cols] === WATER || cur[i + cols] === WATER) out.push(i);
  }
  return out;
}

/**
 * A country grows new land along part of its coast (about 1–4% of its size, a lumpy strip).
 * Returns null if it has no coast.
 */
export function planCoastGrowth(t: Territory, id: string, rand: () => number): { action: Extract<Action, { kind: 'land' }>; at: [number, number] } | null {
  const g = t.grid;
  const code = t.codeOf(id);
  const coast = coastCells(t, code);
  if (!coast.length) return null;
  const i = coast[Math.floor(rand() * coast.length)];
  const r = (i / g.cols) | 0;
  const c = i - r * g.cols;
  // Which way is the sea?
  let dx = 0;
  let dy = 0;
  for (let k = -3; k <= 3; k++) {
    for (let m = -3; m <= 3; m++) {
      const j = (r + m) * g.cols + (c + k);
      if (j >= 0 && j < g.current.length && g.current[j] === WATER) {
        dx += k;
        dy += m;
      }
    }
  }
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const [x0, y0] = cellCenter(g, i);
  const km2Unit2 = g.rowKm2[r] / (g.cell * g.cell);
  const current = t.statsFor(id)?.currentKm2 ?? 10000;
  const target = Math.max(300, Math.min(120_000, current * (0.01 + rand() * 0.03)));
  const n = 3 + Math.floor(rand() * 3);
  // Each circle is about half in the sea: aim for target ≈ n × ½ × πr².
  const rad = Math.max(g.cell * 1.5, Math.sqrt((target * 2) / (n * Math.PI * km2Unit2)));
  const circles: number[] = [];
  for (let k = 0; k < n; k++) {
    const along = (k - (n - 1) / 2) * rad * 1.1;
    const out = rad * (0.35 + rand() * 0.4);
    circles.push(round(x0 + dx * out - dy * along), round(y0 + dy * out + dx * along), round(rad * (0.75 + rand() * 0.4)));
  }
  return { action: { kind: 'land', owner: id, circles, sim: true }, at: [round(x0 + dx * rad), round(y0 + dy * rad)] };
}

/** Seas rise: small bites out of coasts all over the world. */
export function planSeaRise(t: Territory, rand: () => number, count = 160): { action: Extract<Action, { kind: 'sea' }>; points: [number, number][] } | null {
  const g = t.grid;
  const picks: number[] = [];
  let seen = 0;
  const { cols, rows, current: cur } = g;
  for (let i = cols; i < cur.length - cols; i++) {
    if (cur[i] === WATER) continue;
    const c = i % cols;
    if (c === 0 || c === cols - 1) continue;
    if (cur[i - 1] !== WATER && cur[i + 1] !== WATER && cur[i - cols] !== WATER && cur[i + cols] !== WATER) continue;
    seen++;
    if (picks.length < count) picks.push(i);
    else {
      const k = Math.floor(rand() * seen);
      if (k < count) picks[k] = i;
    }
  }
  if (!picks.length || rows < 2) return null;
  const circles: number[] = [];
  const points: [number, number][] = [];
  for (const i of picks) {
    const [x, y] = cellCenter(g, i);
    circles.push(round(x), round(y), round(g.cell * (1.2 + rand() * 1.8)));
    points.push([x, y]);
  }
  return { action: { kind: 'sea', circles, sim: true }, points };
}

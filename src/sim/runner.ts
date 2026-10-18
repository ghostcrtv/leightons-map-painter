/**
 * Runs simulations: picks countries, works out the result (conflict.ts / disasters.ts),
 * moves the camera, plays the show on the map (shows.ts), changes the map at the dramatic
 * moment, and shows the result card. The map change is one normal undoable action.
 */
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import type { MapRenderer } from '../map/MapRenderer';
import { emptyBBox, type BBox } from '../map/geometry';
import { getStats } from '../stats/session';
import { getTerritory } from '../territory/session';
import type { Territory } from '../territory/Territory';
import { cellCenter, frontCell, isCoastal, neighboursOf, sampleCells, seaDirection } from '../territory/regions';
import { conflictOdds, resolveConflict, type Fighter } from './conflict';
import { DISASTER_BY_ID, likelyDisasters, pickDisaster, rollSeverity, type DisasterDef, type PlaceFacts } from './disasters';
import type { Effects, W } from './effects';
import { cryptoRand, pick, pickWeighted, type Rand } from './random';
import { playBattle, playDisaster } from './shows';
import type { SimReport } from './types';

let fx: Effects | null = null;
let renderer: MapRenderer | null = null;
let busy = false;
let lastConflict: { a: string; b: string } | null = null;
let lastDisaster: { id?: string; type?: string; random: boolean } | null = null;

const game = () => useGame.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Called by MapView once the map and effects layer exist. */
export function attachSimulation(r: MapRenderer | null, effects: Effects | null) {
  renderer = r;
  fx = effects;
}

export const isBusy = () => busy;
export const lastConflictPair = () => lastConflict;

// ---------------------------------------------------------------- who can take part

/** A country can fight / be hit if it's not a disputed area and still has land. */
export function playable(id: string): boolean {
  const c = game().countryById.get(id);
  const t = getTerritory();
  if (!c || c.disputed || !t) return false;
  return (t.statsFor(id)?.currentKm2 ?? 0) > 0 && !t.isConquered(id);
}

export function playableIds(): string[] {
  return game().countries.filter((c) => playable(c.id)).map((c) => c.id);
}

/** Power used in battles: the Power Score lowered by any disasters. */
export function battlePower(id: string): number {
  const base = getStats()?.power(id) ?? 10;
  const weak = getTerritory()?.weakness(id) ?? 0;
  return Math.round(base * (1 - weak) * 10) / 10;
}

function fighter(id: string): Fighter {
  return { id, power: battlePower(id), km2: getTerritory()?.statsFor(id)?.currentKm2 ?? 0 };
}

export function oddsFor(a: string, b: string) {
  return conflictOdds(fighter(a), fighter(b));
}

/** A random country. Bigger countries come up more often than tiny specks (but specks still can). */
export function randomNation(rand: Rand = cryptoRand, exclude?: string): string | null {
  const t = getTerritory();
  const list = playableIds()
    .filter((id) => id !== exclude)
    .map((id) => ({ item: id, weight: Math.pow(Math.max(1, t?.statsFor(id)?.currentKm2 ?? 1), 0.35) }));
  return list.length ? pickWeighted(list, rand) : null;
}

/** A random country that touches this one (or is closest across the sea). */
export function randomOpponent(id: string, rand: Rand = cryptoRand): string | null {
  const t = getTerritory();
  if (!t) return null;
  const options = neighboursOf(t.grid, t.codeOf(id))
    .map((c) => t.idOf(c))
    .filter((x): x is string => !!x && x !== id && playable(x));
  return options.length ? pick(options, rand) : randomNation(rand, id);
}

// ---------------------------------------------------------------- geography

export function placeFacts(id: string): PlaceFacts {
  const t = getTerritory();
  const lp = renderer?.labelPoint(id);
  const ll = lp ? renderer?.lonLat(lp[0], lp[1]) : null;
  return {
    id,
    lon: ll?.[0] ?? 0,
    lat: ll?.[1] ?? 0,
    coastal: t ? isCoastal(t.grid, t.codeOf(id)) : true,
    km2: t?.statsFor(id)?.currentKm2 ?? 0,
  };
}

export function likelyFor(id: string): DisasterDef[] {
  return likelyDisasters(placeFacts(id)).map((x) => x.def);
}

// ---------------------------------------------------------------- shared bits

const flagImages = new Map<string, HTMLImageElement>();
function flagImage(id: string): HTMLImageElement | null {
  const c = game().countryById.get(id);
  const url = c ? mapController.flagUrl(c.flag) : null;
  if (!url) return null;
  let img = flagImages.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    flagImages.set(url, img);
  }
  return img;
}

function colorOf(id: string) {
  return mapController.flagColor(game().countryById.get(id)?.flag ?? null);
}

function boxOf(pts: W[], into: BBox = emptyBBox()): BBox {
  const b = { ...into };
  for (const [x, y] of pts) {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

function pad(b: BBox, f: number, min: number): BBox {
  const w = Math.max(b.maxX - b.minX, min);
  const h = Math.max(b.maxY - b.minY, min);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { minX: cx - (w / 2) * (1 + f), maxX: cx + (w / 2) * (1 + f), minY: cy - (h / 2) * (1 + f), maxY: cy + (h / 2) * (1 + f) };
}

const inBox = (b: BBox) => (p: W) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;
const dist2 = (a: W, b: W) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Common start of every simulation: close windows, stop painting, show the banner. */
function begin(banner: Parameters<ReturnType<typeof game>['setSimBanner']>[0]) {
  const st = game();
  st.setSimView(null);
  st.setSimReport(null);
  st.setActionsOpen(false);
  st.setRankingsOpen(false);
  if (st.tool !== 'select') st.setTool('select');
  st.setSimBanner(banner);
}

function finish(report: SimReport | null) {
  const st = game();
  st.setSimBanner(null);
  if (report) st.setSimReport(report);
  busy = false;
}

// ---------------------------------------------------------------- conflict

export async function runConflict(a: string, b: string): Promise<void> {
  const t = getTerritory();
  if (busy || !t || a === b || !playable(a) || !playable(b)) return;
  busy = true;
  lastConflict = { a, b };
  try {
    await conflict(t, a, b);
  } catch (e) {
    console.error('Conflict simulation failed', e);
    finish(null);
  }
}

async function conflict(t: Territory, a: string, b: string) {
  const g = t.grid;
  const rand = cryptoRand;
  const A = fighter(a);
  const B = fighter(b);
  const result = resolveConflict(A, B, rand);
  const ca = t.codeOf(a);
  const cb = t.codeOf(b);

  // Where the two sides meet.
  const lpA = renderer?.labelPoint(a) ?? [0, 0];
  const lpB = renderer?.labelPoint(b) ?? [0, 0];
  const bFrontCell = frontCell(g, ca, cb, rand);
  const aFrontCell = bFrontCell !== null ? nearestOwned(t, bFrontCell, ca) : frontCell(g, cb, ca, rand);
  const aFront: W = aFrontCell !== null ? cellCenter(g, aFrontCell) : [lpA[0], lpA[1]];
  const bFront: W = bFrontCell !== null ? cellCenter(g, bFrontCell) : [lpB[0], lpB[1]];
  const samples = sampleCells(g, [ca, cb], 300, rand);
  const plan = result.outcome === 'peace' || !result.winner ? null : t.planBattle(result.winner, result.loser!, result.share, rand);
  const outcome = plan ? plan.action.outcome : 'peace';
  const winnerSide = result.winner === a ? 'a' : 'b';
  const loser = result.loser ?? b;
  const loserKm2Before = t.statsFor(loser)?.currentKm2 ?? 0;

  // Camera: both countries whole when they fit nicely; otherwise the area where they meet.
  const boxA = renderer?.countryBox(a);
  const boxB = renderer?.countryBox(b);
  const front = boxOf([aFront, bFront]);
  let box: BBox;
  const both = boxA && boxB ? boxOf([[boxA.minX, boxA.minY], [boxA.maxX, boxA.maxY], [boxB.minX, boxB.minY], [boxB.maxX, boxB.maxY]]) : null;
  const fits = (b2: BBox | null): b2 is BBox => !!b2 && b2.maxX - b2.minX < 260 && b2.maxY - b2.minY < 180;
  if (fits(both)) box = boxOf([[front.minX, front.minY], [front.maxX, front.maxY]], both);
  else {
    // Huge countries (or far apart): a window around the front line, big enough to see the action.
    const span = Math.max(30, Math.hypot(aFront[0] - bFront[0], aFront[1] - bFront[1]) * 1.3);
    const cx = (aFront[0] + bFront[0]) / 2;
    const cy = (aFront[1] + bFront[1]) / 2;
    box = { minX: cx - span / 2, maxX: cx + span / 2, minY: cy - span / 3, maxY: cy + span / 3 };
    const smaller = A.km2 < B.km2 ? boxA : boxB;
    if (smaller && fits(smaller)) box = boxOf([[smaller.minX, smaller.minY], [smaller.maxX, smaller.maxY]], box);
  }
  if (plan && outcome === 'partial') {
    const r = plan.radius;
    box = boxOf([[plan.center[0] - r, plan.center[1] - r], [plan.center[0] + r, plan.center[1] + r]], box);
  }
  box = pad(box, 0.15, 2);

  // Missiles fly between points on each side, mostly in the half nearer the other side.
  const view = inBox(box);
  const near = (pts: W[], ref: W) => {
    const seen = pts.filter(view).sort((p, q) => dist2(p, ref) - dist2(q, ref));
    return seen.slice(0, Math.max(6, Math.min(18, Math.ceil(seen.length * 0.5))));
  };
  let aPts = [aFront, ...near(samples.get(ca) ?? [], bFront)];
  let bPts = [bFront, ...near(samples.get(cb) ?? [], aFront)];

  begin({ kind: 'conflict', a, b });
  const winnerImg = result.winner ? flagImage(result.winner) : null;
  renderer?.flyToBox(box, 120, 750);
  await sleep(800);

  aPts = aPts.filter(view);
  bPts = bPts.filter(view);
  if (!aPts.length) aPts = [aFront];
  if (!bPts.length) bPts = [bFront];
  const loserCode = t.codeOf(loser);
  const loserPts = (samples.get(loserCode) ?? []).filter(view).slice(0, 12);
  let target: W = bFront;
  let targetPx = 40;
  if (plan && outcome === 'partial') {
    target = plan.center;
    if (renderer) {
      const [x0] = renderer.toScreen(plan.center[0], plan.center[1]);
      const [x1] = renderer.toScreen(plan.center[0] + plan.radius, plan.center[1]);
      targetPx = Math.max(20, Math.min(260, Math.abs(x1 - x0)));
    }
  } else if (plan) {
    const lp = renderer?.labelPoint(loser);
    target = lp && t.ownerAt(lp[0], lp[1]) === loser && view(lp) ? lp : loserPts[0] ?? (loser === a ? aFront : bFront);
  }

  let undoVersion: number | null = null;
  const apply = () => {
    if (plan) {
      t.apply(plan.action);
      undoVersion = t.version;
    }
  };
  const pa = Math.pow(Math.max(A.power, 1), 2);
  const pb = Math.pow(Math.max(B.power, 1), 2);

  if (fx) {
    await new Promise<void>((resolve) =>
      playBattle(fx!, {
        aPts,
        bPts,
        aColor: colorOf(a),
        bColor: colorOf(b),
        aFire: Math.max(0.2, Math.min(0.8, pa / (pa + pb))),
        outcome,
        winner: plan ? winnerSide : undefined,
        target,
        targetPx,
        loserPts: loserPts.length ? loserPts : [target],
        winnerFlag: winnerImg,
        winnerColors: result.winner ? [colorOf(result.winner)] : [],
        climax: apply,
        done: resolve,
      }),
    );
  } else apply();

  const km2 = plan ? (outcome === 'conquest' ? loserKm2Before : loserKm2Before - (t.statsFor(loser)?.currentKm2 ?? 0)) : 0;
  finish({
    kind: 'conflict',
    a,
    b,
    outcome,
    winner: plan ? result.winner : undefined,
    loser: plan ? result.loser : undefined,
    km2,
    share: outcome === 'conquest' ? 1 : result.share,
    upset: !!plan && result.upset,
    odds: result.odds,
    aPower: A.power,
    bPower: B.power,
    undoVersion,
  });
}

/** The cell of `code`'s land closest to cell `from` (searching outward in rings). */
function nearestOwned(t: Territory, from: number, code: number): number | null {
  const g = t.grid;
  const r0 = Math.floor(from / g.cols);
  const c0 = from - r0 * g.cols;
  for (let d = 1; d < 400; d++) {
    for (let r = r0 - d; r <= r0 + d; r++) {
      if (r < 0 || r >= g.rows) continue;
      const step = r === r0 - d || r === r0 + d ? 1 : 2 * d;
      for (let c = c0 - d; c <= c0 + d; c += step) {
        if (c >= 0 && c < g.cols && g.current[r * g.cols + c] === code) return r * g.cols + c;
      }
    }
  }
  return null;
}

/** A random country against a random neighbour. */
export function randomPair(rand: Rand = cryptoRand): { a: string; b: string } | null {
  const a = randomNation(rand);
  if (!a) return null;
  const b = randomOpponent(a, rand);
  return b ? { a, b } : null;
}

export async function runRandomConflict() {
  const p = randomPair();
  if (p) await runConflict(p.a, p.b);
}

/** Keep running random conflicts until switched off. */
export async function startAutoBattles() {
  const st = game();
  if (st.simAuto) return;
  st.setSimAuto(true);
  while (game().simAuto) {
    if (busy) {
      await sleep(300);
      continue;
    }
    const p = randomPair();
    if (!p) break;
    await runConflict(p.a, p.b);
    await sleep(2200);
  }
  game().setSimAuto(false);
}

export function stopAutoBattles() {
  game().setSimAuto(false);
}

// ---------------------------------------------------------------- disasters

/** `id`/`type` missing = random (a disaster that fits the place). */
export async function runDisaster(id?: string, type?: string): Promise<void> {
  const t = getTerritory();
  if (busy || !t) return;
  const target = id ?? randomNation();
  if (!target || !playable(target)) return;
  busy = true;
  lastDisaster = { id, type, random: !id };
  try {
    await disaster(t, target, type);
  } catch (e) {
    console.error('Disaster simulation failed', e);
    finish(null);
  }
}

export function rerunDisaster() {
  const d = lastDisaster;
  return d?.random ? runDisaster() : runDisaster(d?.id, d?.type);
}

async function disaster(t: Territory, id: string, type?: string) {
  const rand = cryptoRand;
  const def = (type && DISASTER_BY_ID.get(type)) || pickDisaster(placeFacts(id), rand);
  const severity = rollSeverity(def, rand);
  const before = battlePower(id);
  const g = t.grid;
  const code = t.codeOf(id);
  const lp = renderer?.labelPoint(id) ?? [0, 0];
  const mainBox = renderer?.countryBox(id) ?? pad(boxOf([lp]), 0, 4);

  begin({ kind: 'disaster', a: id, type: def.id });
  renderer?.flyToBox(pad(mainBox, 0.35, 1), 120, 750);
  await sleep(800);

  const view = inBox(pad(mainBox, 0.1, 0));
  const pts = (sampleCells(g, [code], 120, rand).get(code) ?? []).filter(view).slice(0, 12);
  const center: W = t.ownerAt(lp[0], lp[1]) === id ? [lp[0], lp[1]] : pts[0] ?? [lp[0], lp[1]];
  let R = 80;
  if (renderer) {
    const [x0, y0] = renderer.toScreen(mainBox.minX, mainBox.minY);
    const [x1, y1] = renderer.toScreen(mainBox.maxX, mainBox.maxY);
    R = Math.max(45, Math.min(220, Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2));
  }
  const sea = seaDirection(g, center[0], center[1]);

  let undoVersion: number | null = null;
  const apply = () => {
    t.apply({ kind: 'disaster', id, type: def.id, severity });
    undoVersion = t.version;
  };
  if (fx) {
    await new Promise<void>((resolve) =>
      playDisaster(fx!, { type: def.id, center, pts: pts.length ? pts : [center], R, seaDir: sea, climax: apply, done: resolve }),
    );
  } else apply();

  finish({ kind: 'disaster', id, type: def.id, severity, powerBefore: before, powerAfter: battlePower(id), undoVersion });
}

// ---------------------------------------------------------------- smoke over weakened countries

/** Keep the smoke columns in step with which countries are weakened (and where their land is). */
export function syncSmolder() {
  const t = getTerritory();
  if (!t || !fx) return;
  const ids = t.weakenedIds().filter((id) => (t.statsFor(id)?.currentKm2 ?? 0) > 0);
  if (!ids.length) {
    fx.setSmolder([]);
    return;
  }
  const codes = ids.map((id) => t.codeOf(id));
  // A fixed seed so the smoke doesn't jump around every time something changes.
  let s = 12345;
  const steady = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const samples = sampleCells(t.grid, codes, 2, steady);
  const points: { x: number; y: number; amount: number }[] = [];
  ids.forEach((id, i) => {
    const amount = t.weakness(id);
    const lp = renderer?.labelPoint(id);
    if (lp && t.ownerAt(lp[0], lp[1]) === id) points.push({ x: lp[0], y: lp[1], amount });
    for (const p of samples.get(codes[i]) ?? []) points.push({ x: p[0], y: p[1], amount: amount * 0.6 });
  });
  fx.setSmolder(points);
}

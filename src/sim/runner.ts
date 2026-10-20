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
import { cellCenter, frontCell, isCoastal, neighboursOf, sampleCells, seaDirection, seaPoint } from '../territory/regions';
import { conflictOdds, resolveConflict, type Fighter } from './conflict';
import { allyBonus, battleMarks, roleStrength, withMarks, type Marks, type Role } from './strength';
import { powerScore, type Ratings } from '../stats/ratings';
import type { Action } from '../territory/Territory';
import { DISASTER_BY_ID, likelyDisasters, pickCrazy, pickDisaster, rollSeverity, type DisasterDef, type PlaceFacts } from './disasters';
import type { Effects, W } from './effects';
import { cryptoRand, pick, pickWeighted, type Rand } from './random';
import { formatArea } from '../utils/format';
import { unlock } from '../game/achievements';
import { playBattle, playDisaster, playGrowth, playSeaRise } from './shows';
import { TITANIC_ROUTE, TitanicScene } from './crazy';
import { SoccerScene } from './eggs';
import { planCoastGrowth, planRebellion, planSeaRise, rebellionCandidates } from '../territory/events';
import { buildHistory } from './history';
import { sound } from '../audio/sound';
import type { SimReport } from './types';

let fx: Effects | null = null;
let renderer: MapRenderer | null = null;
let busy = false;
let lastConflict: { a: string; b: string } | null = null;
let lastDisaster: { id?: string; type?: string; random: boolean } | null = null;

const game = () => useGame.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round1 = (v: number) => Math.round(v * 10) / 10;

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

/** A country's ratings right now: the rating sheet plus any war damage in this world. */
export function effectiveRatings(id: string): Ratings {
  const base = getStats()?.get(id) ?? { attack: 10, defense: 20, money: 20, military: 10 };
  return withMarks(base, getTerritory()?.marksOf(id));
}

/** Power Score right now (war damage and disasters included). Used for badges and reports. */
export function battlePower(id: string): number {
  const weak = getTerritory()?.weakness(id) ?? 0;
  return Math.round(powerScore(effectiveRatings(id)) * (1 - weak) * 10) / 10;
}

/** Allies that would help `id` in a fight against `enemy` (not allies of both sides). */
export function helpingAllies(id: string, enemy: string): string[] {
  const t = getTerritory();
  if (!t) return [];
  return t.alliesOf(id).filter((x) => x !== enemy && !t.areAllies(x, enemy) && playable(x));
}

/** Battle strength of `id` in a role against `enemy`, including help from allies. */
export function strengthOf(id: string, role: Role, enemy: string) {
  const weak = getTerritory()?.weakness(id) ?? 0;
  const own = roleStrength(effectiveRatings(id), role, weak);
  const allies = helpingAllies(id, enemy);
  const bonus = allyBonus(allies.map((x) => roleStrength(effectiveRatings(x), role, getTerritory()?.weakness(x) ?? 0)));
  return { own, allies, bonus, total: own + bonus };
}

function fighter(id: string, role: Role, enemy: string): Fighter {
  return { id, power: strengthOf(id, role, enemy).total, km2: getTerritory()?.statsFor(id)?.currentKm2 ?? 0 };
}

/** Chances when `a` attacks `b`. */
export function oddsFor(a: string, b: string) {
  return conflictOdds(fighter(a, 'attacker', b), fighter(b, 'defender', a));
}

// ---------------------------------------------------------------- alliances

export function setAlliance(a: string, b: string, on: boolean) {
  const t = getTerritory();
  if (!t || a === b || t.areAllies(a, b) === on) return;
  t.apply({ kind: 'alliance', a, b, on });
  sound.play(on ? 'peace' : 'tick');
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
    .filter((x): x is string => !!x && x !== id && playable(x) && !t.areAllies(id, x));
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
/** How a simulation plays: normal, quick (inside a simulated year) or silent (no show at all). */
export interface Mode {
  quick?: boolean;
  silent?: boolean;
  /** World War: bigger results. */
  boost?: number;
}
/** Shown under the banner during a year / world war, e.g. "Year 3 · event 4 of 9". */
let bannerStep: string | undefined;
export function setBannerStep(s: string | undefined) {
  bannerStep = s;
}

/** Close windows and stop painting, so the map can be seen. */
function closeWindows() {
  const st = game();
  st.setSimView(null);
  st.setSimReport(null);
  st.setActionsOpen(false);
  st.setRankingsOpen(false);
  st.setHistoryOpen(false);
  st.setWorldsOpen(false);
  if (st.tool !== 'select') st.setTool('select');
}

function begin(banner: Parameters<ReturnType<typeof game>['setSimBanner']>[0]) {
  if (banner && bannerStep) banner = { ...banner, step: bannerStep };
  closeWindows();
  game().setSimBanner(banner);
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
  if (busy || !t || a === b || !playable(a) || !playable(b) || t.areAllies(a, b)) return;
  busy = true;
  lastConflict = { a, b };
  let report: SimReport | null = null;
  try {
    report = await conflict(t, a, b);
  } catch (e) {
    console.error('Conflict simulation failed', e);
  }
  finish(report);
}

/** Fly the camera and wait (shorter when quick). */
async function flyTo(box: BBox, mode: Mode) {
  if (mode.silent || !renderer) return;
  renderer.flyToBox(box, 120, mode.quick ? 420 : 750);
  await sleep(mode.quick ? 470 : 800);
}

/** Play a show at normal or quick speed. */
async function show(mode: Mode, play: (done: () => void) => void, apply: () => void) {
  if (mode.silent || !fx) {
    apply();
    return;
  }
  fx.speed = mode.quick ? 2.2 : 1;
  try {
    await new Promise<void>((resolve) => play(resolve));
  } finally {
    fx.speed = 1;
  }
}

export async function conflict(t: Territory, a: string, b: string, mode: Mode = {}): Promise<SimReport> {
  const g = t.grid;
  const rand = cryptoRand;
  const A = fighter(a, 'attacker', b);
  const B = fighter(b, 'defender', a);
  const alliesA = helpingAllies(a, b);
  const alliesB = helpingAllies(b, a);
  const result = resolveConflict(A, B, rand, mode.boost ?? 1);
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
  const winnerWasWeak = !!plan && t.weakness(result.winner!) > 0;

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

  if (!mode.silent) begin({ kind: 'conflict', a, b });
  const winnerImg = result.winner ? flagImage(result.winner) : null;
  await flyTo(box, mode);

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
  const m = battleMarks(outcome, result.share, result.upset);
  const apply = () => {
    if (plan) {
      const w = result.winner!;
      const l = result.loser!;
      const km2 = outcome === 'conquest' ? loserKm2Before : plan.km2;
      const marks: Record<string, Partial<Marks>> = { [w]: m.winner };
      if (outcome === 'partial') marks[l] = m.loser;
      t.apply({
        ...plan.action,
        attacker: a,
        defender: b,
        share: outcome === 'conquest' ? 1 : result.share,
        km2: Math.round(km2),
        at: [round1(target[0]), round1(target[1])],
        allies: [...alliesA, ...alliesB],
        upset: result.upset,
        marks,
      });
      if (!mode.silent && game().actionLevel === 'calm') sound.play('win'); // Normal/Epic shows play a trumpet fanfare
    } else {
      const mid: W = [(aFront[0] + bFront[0]) / 2, (aFront[1] + bFront[1]) / 2];
      t.apply({ kind: 'peace', a, b, at: [round1(mid[0]), round1(mid[1])], marks: { [a]: m.winner, [b]: m.loser } });
      if (!mode.silent) sound.play('peace');
    }
    undoVersion = t.version;
  };
  const pa = Math.pow(Math.max(A.power, 1), 2);
  const pb = Math.pow(Math.max(B.power, 1), 2);
  const aSea = mode.silent ? [] : seaNear(t, aFront, view);
  const bSea = mode.silent ? [] : seaNear(t, bFront, view);

  await show(
    mode,
    (done) =>
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
        aSea,
        bSea,
        climax: apply,
        done,
        level: game().actionLevel,
        // The full build-up (countdown, tug-of-war, stamps) only for a single battle you're watching.
        full: !mode.quick && !game().simAuto,
        aFlag: flagImage(a),
        bFlag: flagImage(b),
        upset: result.upset,
      }),
    apply,
  );

  const km2 = plan ? (outcome === 'conquest' ? loserKm2Before : loserKm2Before - (t.statsFor(loser)?.currentKm2 ?? 0)) : 0;
  return {
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
    recovered: winnerWasWeak,
    allies: [...alliesA, ...alliesB],
    damage: outcome === 'partial' ? { id: result.loser!, ...m.loser } : null,
  };
}

/** A spot of open sea near a point (for warships), if there is one on screen. */
function seaNear(t: Territory, p: W, view: (q: W) => boolean): W[] {
  const g = t.grid;
  const c0 = Math.floor(p[0] / g.cell);
  const r0 = Math.floor(p[1] / g.cell);
  for (let d = 4; d < 60; d += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c = Math.round(c0 + Math.cos(a) * d);
      const r = Math.round(r0 + Math.sin(a) * d);
      if (r < 2 || c < 2 || r >= g.rows - 2 || c >= g.cols - 2) continue;
      // Open water: the cell and its neighbours are all sea.
      let open = true;
      for (let m = -2; m <= 2 && open; m++) for (let n = -2; n <= 2 && open; n++) if (g.current[(r + m) * g.cols + c + n] !== 0) open = false;
      const q: W = [(c + 0.5) * g.cell, (r + 0.5) * g.cell];
      if (open && view(q)) return [q];
    }
  }
  return [];
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

/** `id`/`type` missing = random (a disaster that fits the place). `type` 'crazy' = a random crazy one. */
export async function runDisaster(id?: string, type?: string): Promise<void> {
  const t = getTerritory();
  if (busy || !t) return;
  const target = id ?? randomNation();
  if (!target || !playable(target)) return;
  busy = true;
  lastDisaster = { id, type, random: !id };
  let report: SimReport | null = null;
  try {
    report = await disaster(t, target, type);
  } catch (e) {
    console.error('Disaster simulation failed', e);
  }
  finish(report);
}

export function rerunDisaster() {
  const d = lastDisaster;
  return d?.random ? runDisaster(undefined, d.type === 'crazy' ? 'crazy' : undefined) : runDisaster(d?.id, d?.type);
}

export async function disaster(t: Territory, id: string, type?: string, mode: Mode = {}): Promise<SimReport> {
  const rand = cryptoRand;
  const def =
    (type && DISASTER_BY_ID.get(type)) ||
    (type === 'crazy' ? pickCrazy(placeFacts(id), rand) : pickDisaster(placeFacts(id), rand, game().crazyDisasters));
  const severity = rollSeverity(def, rand);
  const before = battlePower(id);
  const g = t.grid;
  const code = t.codeOf(id);
  const lp = renderer?.labelPoint(id) ?? [0, 0];
  const mainBox = renderer?.countryBox(id) ?? pad(boxOf([lp]), 0, 4);

  if (!mode.silent) begin({ kind: 'disaster', a: id, type: def.id });
  await flyTo(pad(mainBox, 0.35, 1), mode);

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
  const seaAt = sea ? seaPoint(g, center[0], center[1], sea) : null;

  let undoVersion: number | null = null;
  const apply = () => {
    t.apply({ kind: 'disaster', id, type: def.id, severity, at: [round1(center[0]), round1(center[1])] });
    undoVersion = t.version;
    if (!mode.silent) sound.play('sting');
  };
  await show(mode, (done) => playDisaster(fx!, { type: def.id, center, pts: pts.length ? pts : [center], R, seaDir: sea, seaAt, climax: apply, done, level: game().actionLevel, full: !mode.quick, severity }), apply);

  return { kind: 'disaster', id, type: def.id, severity, powerBefore: before, powerAfter: battlePower(id), undoVersion };
}

// ---------------------------------------------------------------- world events

const nameOf = (id: string) => game().countryById.get(id)?.name ?? id;

/** Countries that could rebel now (a big part of their land is held by someone else). */
export function rebels() {
  const t = getTerritory();
  return t ? rebellionCandidates(t).filter((c) => !game().countryById.get(c.id)?.disputed) : [];
}

/** A conquered country (or region) breaks free. */
export async function rebellion(t: Territory, id: string, from: string, mode: Mode = {}): Promise<SimReport | null> {
  const plan = planRebellion(t, id, from);
  if (!plan) return null;
  const g = t.grid;
  const at: W = plan.at ?? [500, 300];
  const s = sampleCells(g, [t.codeOf(from)], 200, cryptoRand);
  const region = plan.pieces.length ? [at] : [at];
  let box: BBox = pad(boxOf([[at[0] - 12, at[1] - 8], [at[0] + 12, at[1] + 8]]), 0, 4);
  const home = renderer?.countryBox(id);
  if (home && home.maxX - home.minX < 160) box = boxOf([[home.minX, home.minY], [home.maxX, home.maxY]], box);
  box = pad(box, 0.25, 3);
  if (!mode.silent) begin({ kind: 'disaster', a: id, emoji: '✊', text: `${nameOf(id)} rebels against ${nameOf(from)}!` });
  await flyTo(box, mode);
  const view = inBox(box);
  const occ = (s.get(t.codeOf(from)) ?? []).filter(view).sort((p, q) => dist2(p, at) - dist2(q, at)).slice(0, 12);
  const spread = Array.from({ length: 8 }, () => [at[0] + (Math.random() - 0.5) * 6, at[1] + (Math.random() - 0.5) * 4] as W);
  let undoVersion: number | null = null;
  const apply = () => {
    t.apply(plan);
    undoVersion = t.version;
    if (!mode.silent) sound.play('win');
  };
  await show(
    mode,
    (done) =>
      playBattle(fx!, {
        aPts: [...region, ...spread],
        bPts: occ.length ? occ : spread,
        aColor: colorOf(id),
        bColor: colorOf(from),
        aFire: 0.6,
        outcome: 'partial',
        winner: 'a',
        target: at,
        targetPx: 60,
        loserPts: occ,
        winnerFlag: flagImage(id),
        winnerColors: [colorOf(id)],
        climax: apply,
        done,
      }),
    apply,
  );
  return {
    kind: 'event',
    emoji: '✊',
    title: `${nameOf(id)} is free!`,
    text: `${nameOf(id)} rebelled and took back ${formatArea(plan.km2 ?? 0)} from ${nameOf(from)}.`,
    undoVersion,
    again: 'rebellion',
  };
}

export async function runRebellion(id?: string) {
  const t = getTerritory();
  if (busy || !t) return;
  const list = rebels();
  const c = id ? list.find((x) => x.id === id) : pickWeighted(list.map((x) => ({ item: x, weight: Math.sqrt(x.km2 + 1) })), cryptoRand);
  if (!c) {
    finish({ kind: 'event', emoji: '🙂', title: 'No rebellions', text: 'No country has lost enough land to rebel. Conquer something first!', undoVersion: null });
    return;
  }
  busy = true;
  let report: SimReport | null = null;
  try {
    report = await rebellion(t, c.id, c.from);
  } catch (e) {
    console.error('Rebellion failed', e);
  }
  finish(report);
}

/** A coastal country grows new land along its coast. */
export async function coastGrowth(t: Territory, id: string, mode: Mode = {}): Promise<SimReport | null> {
  const plan = planCoastGrowth(t, id, cryptoRand);
  if (!plan) return null;
  const before = t.statsFor(id)?.currentKm2 ?? 0;
  const c = plan.action.circles;
  const pts: W[] = [];
  for (let i = 0; i < c.length; i += 3) pts.push([c[i], c[i + 1]]);
  const r = Math.max(...pts.map((_, k) => c[k * 3 + 2]));
  const box = pad(boxOf(pts.map((p) => [p[0], p[1]] as W)), 1.2, Math.max(6, r * 7));
  if (!mode.silent) begin({ kind: 'disaster', a: id, emoji: '🏝️', text: `${nameOf(id)} builds new land!` });
  await flyTo(box, mode);
  let undoVersion: number | null = null;
  const apply = () => {
    t.apply(plan.action);
    undoVersion = t.version;
  };
  await show(mode, (done) => playGrowth(fx!, { at: plan.at, pts, climax: apply, done }), apply);
  const gained = (t.statsFor(id)?.currentKm2 ?? 0) - before;
  return { kind: 'event', emoji: '🏝️', title: `${nameOf(id)} grew!`, text: `${nameOf(id)} built ${formatArea(Math.max(0, gained))} of new land along its coast.`, undoVersion, again: 'coast' };
}

export async function runCoastGrowth(id?: string) {
  const t = getTerritory();
  if (busy || !t) return;
  const pickId = id ?? pick(playableIds().filter((x) => isCoastal(t.grid, t.codeOf(x))), cryptoRand);
  if (!pickId) return;
  busy = true;
  let report: SimReport | null = null;
  try {
    report = await coastGrowth(t, pickId);
  } catch (e) {
    console.error('Coast growth failed', e);
  }
  finish(report);
}

/** Seas rise and every coast loses a little land. */
export async function seaRise(t: Territory, mode: Mode = {}): Promise<SimReport | null> {
  const plan = planSeaRise(t, cryptoRand);
  if (!plan) return null;
  if (!mode.silent) {
    begin({ kind: 'disaster', a: '', emoji: '🌊', text: 'Sea levels are rising!' });
    renderer?.showWholeWorld();
    await sleep(mode.quick ? 450 : 800);
  }
  let undoVersion: number | null = null;
  const apply = () => {
    t.apply(plan.action);
    undoVersion = t.version;
  };
  await show(mode, (done) => playSeaRise(fx!, { points: plan.points, climax: apply, done }), apply);
  return { kind: 'event', emoji: '🌊', title: 'Seas rose!', text: 'Coasts all around the world lost a little land to the sea. Tiny islands may have disappeared!', undoVersion, again: 'sea' };
}

export async function runSeaRise() {
  const t = getTerritory();
  if (busy || !t) return;
  busy = true;
  let report: SimReport | null = null;
  try {
    report = await seaRise(t);
  } catch (e) {
    console.error('Sea rise failed', e);
  }
  finish(report);
}

/** Two neighbours become allies (or, sometimes, an alliance breaks up). */
async function allianceEvent(t: Territory, mode: Mode): Promise<boolean> {
  const breakUp = cryptoRand() < 0.3;
  if (breakUp) {
    const pairs: [string, string][] = [];
    for (const id of playableIds()) for (const x of t.alliesOf(id)) if (id < x) pairs.push([id, x]);
    if (pairs.length) {
      const [a, b] = pick(pairs, cryptoRand);
      t.apply({ kind: 'alliance', a, b, on: false });
      if (!mode.silent) {
        begin({ kind: 'disaster', a, emoji: '💔', text: `${nameOf(a)} and ${nameOf(b)} ended their alliance` });
        await sleep(1100);
      }
      return true;
    }
  }
  const p = randomPair();
  if (!p || t.areAllies(p.a, p.b)) return false;
  t.apply({ kind: 'alliance', a: p.a, b: p.b, on: true });
  if (!mode.silent) {
    begin({ kind: 'disaster', a: p.a, emoji: '🤝', text: `${nameOf(p.a)} and ${nameOf(p.b)} became allies` });
    sound.play('peace');
    await sleep(1100);
  }
  return true;
}

// ---------------------------------------------------------------- simulate 1 year

let skipRequested = false;
let stopRequested = false;
/** Skip the animations for the rest of the year (or world war). */
export function skipRun() {
  skipRequested = true;
}
export function stopRun() {
  stopRequested = true;
}

/** Snapshot of everyone's land, to find the year's biggest winner and loser. */
function landSnapshot(t: Territory) {
  const m = new Map<string, number>();
  for (const c of game().countries) m.set(c.id, t.statsFor(c.id)?.currentKm2 ?? 0);
  return m;
}

/** One random thing that can happen in a year. Returns false if nothing happened. */
async function randomEvent(t: Territory, mode: Mode): Promise<boolean> {
  const rebelList = rebels();
  const kinds = [
    { item: 'conflict', weight: 45 },
    { item: 'disaster', weight: 18 },
    { item: 'alliance', weight: 9 },
    { item: 'rebellion', weight: rebelList.length ? 12 : 0 },
    { item: 'coast', weight: 12 },
    { item: 'sea', weight: 3 },
  ];
  const kind = pickWeighted(kinds, cryptoRand);
  switch (kind) {
    case 'conflict': {
      const p = randomPair();
      if (!p || t.areAllies(p.a, p.b)) return false;
      await conflict(t, p.a, p.b, mode);
      return true;
    }
    case 'disaster': {
      const id = randomNation();
      if (!id) return false;
      await disaster(t, id, undefined, mode);
      return true;
    }
    case 'alliance':
      return allianceEvent(t, mode);
    case 'rebellion': {
      const c = pickWeighted(rebelList.map((x) => ({ item: x, weight: Math.sqrt(x.km2 + 1) })), cryptoRand);
      return !!(await rebellion(t, c.id, c.from, mode));
    }
    case 'coast': {
      const id = pick(playableIds().filter((x) => isCoastal(t.grid, t.codeOf(x))), cryptoRand);
      return !!(id && (await coastGrowth(t, id, mode)));
    }
    case 'sea':
      return !!(await seaRise(t, mode));
  }
  return false;
}

/** Simulate one year: 6–10 random events in a row, then a "year in review". One Undo takes it all back. */
export async function simulateYear() {
  const t = getTerritory();
  if (busy || !t) return;
  busy = true;
  skipRequested = stopRequested = false;
  closeWindows();
  const st = game();
  st.setSimRunning('year');
  const year = t.year() + 1;
  const before = landSnapshot(t);
  const mark = t.mark;
  const n = 6 + Math.floor(cryptoRand() * 5);
  let done = 0;
  try {
    for (let tries = 0; done < n && tries < n * 3 && !stopRequested; tries++) {
      setBannerStep(`📅 Year ${year} · event ${done + 1} of ${n}`);
      const happened = await randomEvent(t, skipRequested ? { silent: true } : { quick: true });
      if (happened) done++;
      if (skipRequested) await sleep(10);
    }
  } catch (e) {
    console.error('Year simulation failed', e);
  }
  setBannerStep(undefined);
  t.bundleYear(mark);
  const after = landSnapshot(t);
  let gainer: { id: string; km2: number } | undefined;
  let loser: { id: string; km2: number } | undefined;
  for (const [id, km2] of after) {
    const d = km2 - (before.get(id) ?? 0);
    if (d > 1 && (!gainer || d > gainer.km2)) gainer = { id, km2: d };
    if (d < -1 && (!loser || d < -loser.km2)) loser = { id, km2: -d };
  }
  const last = t.activeActions().at(-1)!;
  const entries = buildHistory([last], nameOf)
    .filter((e) => e.action.kind !== 'year')
    .map((e) => ({ emoji: e.emoji, text: e.text }));
  st.setSimRunning(null);
  sound.play('win');
  finish({ kind: 'year', year, entries, gainer, loser, stopped: stopRequested, undoVersion: t.version });
}

// ---------------------------------------------------------------- world war

/** Battles between neighbours, again and again, until one country rules the world (or Stop). */
export async function startWorldWar(fast: boolean) {
  const t = getTerritory();
  if (busy || !t) return;
  busy = true;
  skipRequested = stopRequested = false;
  closeWindows();
  const st = game();
  st.setSimRunning('war');
  let battles = 0;
  let champion: string | undefined;
  try {
    while (!stopRequested) {
      const alive = playableIds();
      if (alive.length <= 1) {
        champion = alive[0];
        break;
      }
      // Strong, big countries are more likely to start fights.
      const a = pickWeighted(alive.map((id) => ({ item: id, weight: Math.pow(battlePower(id), 2) * Math.pow((t.statsFor(id)?.currentKm2 ?? 1) + 1, 0.25) })), cryptoRand);
      const b = randomOpponent(a);
      if (!b || t.areAllies(a, b)) continue;
      battles++;
      setBannerStep(`🌍 World War · battle ${battles} · ${alive.length} countries left`);
      const silent = fast || skipRequested;
      await conflict(t, a, b, silent ? { silent: true, boost: 1.8 } : { quick: true, boost: 1.8 });
      if (silent) {
        st.setSimBanner({ kind: 'conflict', a, b, step: `🌍 World War · battle ${battles} · ${alive.length} countries left` });
        await sleep(120); // let the map redraw and taps (Stop!) through
      }
    }
  } catch (e) {
    console.error('World war failed', e);
  }
  setBannerStep(undefined);
  st.setSimRunning(null);
  const alive = playableIds();
  let leader: { id: string; km2: number } | undefined;
  for (const id of alive) {
    const km2 = t.statsFor(id)?.currentKm2 ?? 0;
    if (!leader || km2 > leader.km2) leader = { id, km2 };
  }
  if (champion) unlock('world-champion');
  if (champion && fx && renderer) {
    renderer.showWholeWorld();
    const lp = renderer.labelPoint(champion);
    if (lp) for (let i = 0; i < 4; i++) setTimeout(() => fx?.firework(lp as W, [colorOf(champion!), '#ffd34d', '#ffffff'], 1.4), 600 + i * 350);
    sound.play('win');
  }
  finish({ kind: 'war', battles, left: alive.length, leader, champion });
}

// ---------------------------------------------------------------- replays (history log)

/** Play a past event's show again. The map doesn't change. */
export async function replay(a: Action) {
  const t = getTerritory();
  if (busy || !t || !fx || !renderer) return;
  busy = true;
  unlock('history-buff');
  try {
    if (a.kind === 'battle' || a.kind === 'peace') {
      const first = a.kind === 'battle' ? a.attacker ?? a.winner : a.a;
      const second = a.kind === 'battle' ? a.defender ?? a.loser : a.b;
      const at: W = a.at ?? (renderer.labelPoint(second) as W) ?? [500, 300];
      const span = 30;
      let box: BBox = { minX: at[0] - span, maxX: at[0] + span, minY: at[1] - span * 0.66, maxY: at[1] + span * 0.66 };
      for (const id of [first, second]) {
        const b = renderer.countryBox(id);
        if (b && b.maxX - b.minX < 120) box = boxOf([[b.minX, b.minY], [b.maxX, b.maxY]], box);
      }
      begin({ kind: 'conflict', a: first, b: second });
      renderer.flyToBox(pad(box, 0.1, 2), 120, 750);
      await sleep(800);
      const view = inBox(box);
      const g = t.grid;
      const s = sampleCells(g, [t.codeOf(first), t.codeOf(second)], 200, cryptoRand);
      const near = (pts: W[]) => pts.filter(view).sort((p, q) => dist2(p, at) - dist2(q, at)).slice(0, 14);
      const spread = (n: number) => Array.from({ length: n }, () => [at[0] + (Math.random() - 0.5) * 8, at[1] + (Math.random() - 0.5) * 6] as W);
      let aPts = near(s.get(t.codeOf(first)) ?? []);
      let bPts = near(s.get(t.codeOf(second)) ?? []);
      if (!aPts.length) aPts = spread(6);
      if (!bPts.length) bPts = spread(6);
      const winnerSide = a.kind === 'battle' ? (a.winner === first ? 'a' : 'b') : undefined;
      await new Promise<void>((resolve) =>
        playBattle(fx!, {
          aPts,
          bPts,
          aColor: colorOf(first),
          bColor: colorOf(second),
          aFire: 0.5,
          outcome: a.kind === 'battle' ? a.outcome : 'peace',
          winner: winnerSide,
          target: at,
          targetPx: 60,
          loserPts: winnerSide === 'a' ? bPts : aPts,
          winnerFlag: a.kind === 'battle' ? flagImage(a.winner) : null,
          winnerColors: a.kind === 'battle' ? [colorOf(a.winner)] : [],
          climax: () => sound.play(a.kind === 'battle' ? 'win' : 'peace'),
          done: resolve,
        }),
      );
    } else if (a.kind === 'disaster') {
      const box = renderer.countryBox(a.id);
      const lp = renderer.labelPoint(a.id);
      const center: W = a.at ?? (lp as W) ?? [500, 300];
      begin({ kind: 'disaster', a: a.id, type: a.type });
      if (box) renderer.flyToBox(pad(box, 0.35, 1), 120, 750);
      await sleep(800);
      let R = 80;
      if (box) {
        const [x0, y0] = renderer.toScreen(box.minX, box.minY);
        const [x1, y1] = renderer.toScreen(box.maxX, box.maxY);
        R = Math.max(45, Math.min(220, Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2));
      }
      await new Promise<void>((resolve) =>
        playDisaster(fx!, { type: a.type, center, pts: [center], R, seaDir: seaDirection(t.grid, center[0], center[1]), climax: () => sound.play('sting'), done: resolve }),
      );
    }
  } finally {
    finish(null);
  }
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
  const samples = sampleCells(t.grid, codes, 6, steady);
  const points: { x: number; y: number; amount: number }[] = [];
  ids.forEach((id, i) => {
    const amount = t.weakness(id);
    const lp = renderer?.labelPoint(id);
    if (lp && t.ownerAt(lp[0], lp[1]) === id) points.push({ x: lp[0], y: lp[1], amount });
    // More smoke columns the more it is weakened.
    const extra = Math.round(amount * 10);
    for (const p of (samples.get(codes[i]) ?? []).slice(0, extra)) points.push({ x: p[0], y: p[1], amount: amount * 0.8 });
  });
  fx.setSmolder(points);
}

// ---------------------------------------------------------------- shh… a secret

/**
 * Searching "Titanic" plays the ship's voyage from Southampton to the iceberg (~6 s).
 * Nothing is saved and nothing stays on the map.
 */
export async function playTitanic() {
  if (busy || !fx || !renderer) return;
  const route = TITANIC_ROUTE.map(([lon, lat]) => renderer!.fromLonLat(lon, lat)).filter((p): p is [number, number] => !!p);
  if (route.length < 2) return;
  busy = true;
  try {
    closeWindows();
    game().setSimReport(null);
    renderer.flyToBox(pad(boxOf(route), 0.25, 10), 60, 750);
    await sleep(800);
    sound.play('horn');
    await new Promise<void>((resolve) => fx!.add(new TitanicScene(route, resolve)));
  } catch (e) {
    console.error('Titanic failed', e);
  }
  busy = false;
}

/** Searching "messi": a star footballer scores over Argentina and the crowd cheers (~5.5 s). */
export async function playSoccer() {
  if (busy || !fx || !renderer) return;
  const box = renderer.countryBox('AR');
  const lp = renderer.labelPoint('AR');
  if (!box || !lp) return;
  busy = true;
  try {
    closeWindows();
    game().setSimReport(null);
    renderer.flyToBox(pad(box, 0.15, 4), 150, 750);
    await sleep(800);
    await new Promise<void>((resolve) => fx!.add(new SoccerScene([lp[0], lp[1]], resolve)));
  } catch (e) {
    console.error('Soccer failed', e);
  }
  busy = false;
}

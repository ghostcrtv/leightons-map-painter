/**
 * Territory — the CURRENT world, as a list of actions on top of the original Earth.
 *
 *   original Earth (never changes) + [paint, fill, erase, reset Poland, …] = the world now
 *
 * Keeping actions (not a copy of the map) makes undo/redo exact, keeps saves small,
 * and lets the original borders be restored at any time. Pure logic: no drawing here.
 *
 * Simulations (Phase 4) add 'battle' (made of ordinary paint/fill pieces, so it draws, measures,
 * undoes and saves like any other change) and 'disaster' (weakens a country until a reset).
 * Phase 5 (land expansion) adds 'land'/'sea'.
 */
import { emptyBBox, type BBox } from '../map/geometry';
import { TerritoryGrid, type CountryStats, type GridDiff } from './TerritoryGrid';
import { biteShape, cellCount, frontCell, piecesFor, type Piece } from './regions';

/**
 * Circles are stored flat: [x, y, r, x, y, r, …] in world units.
 * `within`: the stroke only changes that country's real land (the country the stroke
 * entered first). Older saves have no `within` and paint any land.
 */
export type Action =
  | { kind: 'paint'; owner: string; circles: number[]; within?: string }
  | { kind: 'erase'; circles: number[]; within?: string }
  /** The whole of country `id` (its real borders) goes to `owner`, or back to itself if no owner. */
  | { kind: 'fill'; id: string; owner?: string }
  | { kind: 'resetCountry'; id: string }
  | { kind: 'resetWorld' }
  /** A simulated conflict's result: `winner` took land from `loser` (all of it, or a part). */
  | { kind: 'battle'; winner: string; loser: string; outcome: 'conquest' | 'partial'; pieces: Piece[] }
  /** A natural disaster: the country is weakened by `severity` (0–1) until it is reset. */
  | { kind: 'disaster'; id: string; type: string; severity: number };

/** The most a country can be weakened by disasters (60%). */
export const MAX_WEAKNESS = 0.6;

/** A planned battle result, ready to apply (see planBattle). */
export interface BattlePlan {
  action: Extract<Action, { kind: 'battle' }>;
  /** Where the attack lands (world units) and how big the area is. */
  center: [number, number];
  radius: number;
  km2: number;
}

/** A drawable piece of the current world (consecutive strokes by one owner are merged). */
export interface Layer {
  /** 'paint' = owner's flag over the shape · 'erase' = original countries back · 'resetCountry' */
  kind: 'paint' | 'erase' | 'resetCountry';
  /** Painting country (paint layers). */
  owner?: string;
  /** Only this country's real land is affected (locked strokes and fills). */
  within?: string;
  /** The shape is the whole of `within` (a fill), not brush circles. */
  whole?: boolean;
  /** Country put back to its real borders (resetCountry layers). */
  resetId?: string;
  circles: number[];
  box: BBox;
  /** Changes whenever the layer's shape changes (used to cache drawing paths). */
  key: string;
  /** resetCountry: earlier paint layers by that country, which this reset undoes. */
  absorbs?: Layer[];
}

interface Applied {
  action: Action;
  diff: GridDiff;
}

interface Stroke {
  id: number;
  kind: 'paint' | 'erase';
  owner?: string;
  within?: string;
  radius: number;
  circles: number[];
  diff: GridDiff;
  last: [number, number] | null;
}

/** What the map needs to draw a stroke while it is happening. */
export interface StrokeInfo {
  id: number;
  kind: 'paint' | 'erase';
  owner?: string;
  within?: string;
  circles: number[];
}

export const SAVE_FORMAT_VERSION = 1;

export interface SavedTerritory {
  formatVersion: number;
  actions: Action[];
}

export class Territory {
  private applied: Applied[] = [];
  private redoStack: Action[] = [];
  private stroke: Stroke | null = null;
  private strokeCounter = 0;
  private codeById: Map<string, number>;
  private idByCode: string[];
  private statsCache: { version: number; stats: CountryStats[] } | null = null;
  private layersCache: { version: number; withStroke: boolean; layers: Layer[] } | null = null;
  /** Bumps on every change; the map and UI watch it. */
  version = 0;
  private listeners = new Set<() => void>();

  constructor(
    readonly grid: TerritoryGrid,
    /** Country ids in grid order (code = index + 1). */
    ids: string[],
  ) {
    this.idByCode = ['', ...ids];
    this.codeById = new Map(ids.map((id, i) => [id, i + 1]));
  }

  // ------------------------------------------------------------ change events

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  // ------------------------------------------------------------ strokes (painting)

  /** Start a brush stroke. `radius` is in world units (set from the brush size and zoom). */
  beginStroke(kind: 'paint' | 'erase', radius: number, owner?: string) {
    this.cancelStroke();
    if (kind === 'paint' && (!owner || !this.codeById.has(owner))) return;
    this.stroke = {
      id: ++this.strokeCounter,
      kind,
      owner,
      radius,
      circles: [],
      diff: TerritoryGrid.emptyDiff(),
      last: null,
    };
  }

  /**
   * Keep the stroke inside one country's real land from now on. Called once, with the
   * first country the stroke touches that it can change (a painter's own land doesn't count).
   */
  lockStroke(id: string) {
    const s = this.stroke;
    if (!s || s.within || !this.codeById.has(id)) return;
    s.within = id;
  }

  get strokeLocked() {
    return !!this.stroke?.within;
  }

  /** Move the stroke's pen without painting (before it is locked to a country). */
  trackStroke(x: number, y: number) {
    if (this.stroke) this.stroke.last = [x, y];
  }

  /** Add a point to the stroke. Fills the gap from the last point so fast swipes stay solid. */
  extendStroke(x: number, y: number) {
    const s = this.stroke;
    if (!s) return;
    const step = s.radius * 0.45;
    const pts: [number, number][] = [];
    if (s.last) {
      const dx = x - s.last[0];
      const dy = y - s.last[1];
      const d = Math.hypot(dx, dy);
      if (d < step * 0.5 && s.circles.length) return;
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = s.circles.length ? 1 : 0; k <= n; k++) pts.push([s.last[0] + (dx * k) / n, s.last[1] + (dy * k) / n]);
    } else pts.push([x, y]);
    const owner = s.kind === 'paint' ? this.codeById.get(s.owner!)! : 0;
    const within = s.within ? this.codeById.get(s.within) : undefined;
    for (const [px, py] of pts) {
      s.circles.push(round(px), round(py), round(s.radius));
      this.grid.stampCircle(px, py, s.radius, owner, s.diff, within);
    }
    s.last = [x, y];
    this.changed();
  }

  /** Finish the stroke: it becomes one undoable action. */
  endStroke() {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    if (s.circles.length === 0) {
      this.changed();
      return;
    }
    const action: Action =
      s.kind === 'paint'
        ? { kind: 'paint', owner: s.owner!, circles: s.circles, within: s.within }
        : { kind: 'erase', circles: s.circles, within: s.within };
    this.applied.push({ action, diff: s.diff });
    this.redoStack = [];
    this.changed();
  }

  /** Throw the stroke away (e.g. a second finger touched down: the player wants to move the map). */
  cancelStroke() {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    this.grid.revert(s.diff);
    this.changed();
  }

  get painting() {
    return this.stroke !== null;
  }

  /** The stroke being painted right now, if any. */
  strokeInfo(): StrokeInfo | null {
    const s = this.stroke;
    return s ? { id: s.id, kind: s.kind, owner: s.owner, within: s.within, circles: s.circles } : null;
  }

  // ------------------------------------------------------------ other actions

  /** The whole country `id` goes to `owner` (or back to its real self when owner is undefined). */
  fill(id: string, owner?: string) {
    if (!this.codeById.has(id) || (owner && (!this.codeById.has(owner) || owner === id))) return;
    this.run(owner ? { kind: 'fill', id, owner } : { kind: 'fill', id });
  }

  resetCountry(id: string) {
    if (!this.codeById.has(id)) return;
    this.run({ kind: 'resetCountry', id });
  }

  resetWorld() {
    this.run({ kind: 'resetWorld' });
  }

  /** Apply a finished action (used by simulations). */
  apply(action: Action) {
    this.run(action);
  }

  private run(action: Action) {
    this.stroke && this.cancelStroke();
    this.applied.push({ action, diff: this.applyToGrid(action) });
    this.redoStack = [];
    this.changed();
  }

  private applyToGrid(a: Action): GridDiff {
    const diff = TerritoryGrid.emptyDiff();
    const g = this.grid;
    switch (a.kind) {
      case 'paint':
      case 'erase': {
        const owner = a.kind === 'paint' ? this.codeById.get(a.owner) ?? 0 : 0;
        if (a.kind === 'paint' && !owner) break;
        const within = a.within ? this.codeById.get(a.within) : undefined;
        for (let i = 0; i < a.circles.length; i += 3) g.stampCircle(a.circles[i], a.circles[i + 1], a.circles[i + 2], owner, diff, within);
        break;
      }
      case 'fill': {
        const code = this.codeById.get(a.id);
        if (code) g.fillCountry(code, a.owner ? this.codeById.get(a.owner) ?? code : code, diff);
        break;
      }
      case 'resetCountry': {
        const code = this.codeById.get(a.id);
        if (code) g.resetCountry(code, diff);
        break;
      }
      case 'resetWorld':
        g.resetAll(diff);
        break;
      case 'battle':
        for (const p of a.pieces) {
          const d = this.applyToGrid(p);
          diff.cells.push(...d.cells);
          diff.old.push(...d.old);
          diff.tiny.push(...d.tiny);
          diff.tinyOld.push(...d.tinyOld);
        }
        break;
      case 'disaster':
        break; // no land changes: see weakness()
    }
    return diff;
  }

  // ------------------------------------------------------------ undo / redo

  get canUndo() {
    return this.applied.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    this.stroke && this.cancelStroke();
    const last = this.applied.pop();
    if (!last) return;
    this.grid.revert(last.diff);
    this.redoStack.push(last.action);
    this.changed();
  }

  redo() {
    this.stroke && this.cancelStroke();
    const action = this.redoStack.pop();
    if (!action) return;
    this.applied.push({ action, diff: this.applyToGrid(action) });
    this.changed();
  }

  /** True if anything differs from the real Earth. */
  get changedFromEarth() {
    return this.layers(false).length > 0;
  }

  // ------------------------------------------------------------ reading the world

  /** What to draw on top of the original Earth, in order (optionally without the stroke in progress). */
  layers(withStroke = true): Layer[] {
    const c = this.layersCache;
    if (c && c.version === this.version && c.withStroke === withStroke) return c.layers;
    const layers: Layer[] = [];
    // Battles are drawn as the paint/fill pieces they are made of.
    const actions = this.applied.flatMap((a) => (a.action.kind === 'battle' ? (a.action.pieces as Action[]) : [a.action]));
    let start = 0;
    actions.forEach((a, i) => {
      if (a.kind === 'resetWorld') start = i + 1;
    });
    for (let i = start; i < actions.length; i++) {
      const a = actions[i];
      if (a.kind === 'paint' || a.kind === 'erase') {
        const owner = a.kind === 'paint' ? a.owner : undefined;
        const prev = layers[layers.length - 1];
        if (prev && prev.kind === a.kind && !prev.whole && prev.owner === owner && prev.within === a.within) {
          // Merge with the previous stroke by the same country in the same place (faster drawing).
          prev.circles = prev.circles.concat(a.circles);
          prev.box = circlesBox(a.circles, prev.box);
          prev.key = `${prev.key.split(':')[0]}:${prev.circles.length}`;
        } else {
          layers.push({
            kind: a.kind,
            owner,
            within: a.within,
            circles: a.circles.slice(),
            box: circlesBox(a.circles),
            key: `${i}:${a.circles.length}`,
          });
        }
      } else if (a.kind === 'fill') {
        layers.push({
          kind: a.owner ? 'paint' : 'erase',
          owner: a.owner,
          within: a.id,
          whole: true,
          circles: [],
          box: emptyBBox(),
          key: `${i}:fill`,
        });
      } else if (a.kind === 'resetCountry') {
        const absorbs = layers.filter((l) => l.kind === 'paint' && l.owner === a.id);
        layers.push({ kind: 'resetCountry', resetId: a.id, circles: [], box: emptyBBox(), key: `${i}:reset`, absorbs });
      }
    }
    const s = this.stroke;
    if (withStroke && s && s.circles.length) {
      layers.push({
        kind: s.kind,
        owner: s.owner,
        within: s.within,
        circles: s.circles,
        box: circlesBox(s.circles),
        key: `stroke${s.id}:${s.circles.length}`,
      });
    }
    this.layersCache = { version: this.version, withStroke, layers };
    return layers;
  }

  /** Territory numbers for a country (real km²). */
  statsFor(id: string): CountryStats | null {
    const code = this.codeById.get(id);
    if (!code) return null;
    if (this.statsCache?.version !== this.version) this.statsCache = { version: this.version, stats: this.grid.stats() };
    return this.statsCache.stats[code];
  }

  /** Who owns this world point now (country id), or null for water. Uses the measuring grid. */
  ownerAt(x: number, y: number): string | null {
    const code = this.grid.ownerAt(x, y);
    return code ? this.idByCode[code] : null;
  }

  /** Countries that have lost all their land. */
  isConquered(id: string) {
    const s = this.statsFor(id);
    return !!s && s.originalKm2 > 0 && s.currentKm2 <= s.originalKm2 * 0.001;
  }

  // ------------------------------------------------------------ simulations

  /** How weakened a country is by disasters (0 = not at all, up to MAX_WEAKNESS). Cleared by a reset. */
  weakness(id: string): number {
    return this.weaknessMap().get(id)?.amount ?? 0;
  }

  /** Disasters still weakening a country (newest last). */
  disastersOf(id: string): { type: string; severity: number }[] {
    return this.weaknessMap().get(id)?.hits ?? [];
  }

  /** Every weakened country. */
  weakenedIds(): string[] {
    return [...this.weaknessMap().keys()];
  }

  private weakCache: { version: number; map: Map<string, { amount: number; hits: { type: string; severity: number }[] }> } | null = null;

  private weaknessMap() {
    if (this.weakCache?.version === this.version) return this.weakCache.map;
    const map = new Map<string, { amount: number; hits: { type: string; severity: number }[] }>();
    for (const { action: a } of this.applied) {
      if (a.kind === 'resetWorld') map.clear();
      else if (a.kind === 'resetCountry') map.delete(a.id);
      else if (a.kind === 'disaster') {
        const e = map.get(a.id) ?? { amount: 0, hits: [] };
        e.hits.push({ type: a.type, severity: a.severity });
        e.amount = Math.min(MAX_WEAKNESS, e.amount + a.severity);
        map.set(a.id, e);
      }
    }
    this.weakCache = { version: this.version, map };
    return map;
  }

  /** Country code in the grid (index + 1), or 0. */
  codeOf(id: string): number {
    return this.codeById.get(id) ?? 0;
  }

  idOf(code: number): string | null {
    return this.idByCode[code] || null;
  }

  /**
   * Work out the land change for a won conflict (without applying it).
   * `share` = fraction of the loser's land taken (1 = conquer everything).
   * A tiny loser can't be split, so any win takes all of it.
   */
  planBattle(winner: string, loser: string, share: number, rand: () => number = Math.random): BattlePlan | null {
    const w = this.codeById.get(winner);
    const l = this.codeById.get(loser);
    if (!w || !l || w === l) return null;
    const g = this.grid;
    const loserKm2 = this.statsFor(loser)?.currentKm2 ?? 0;
    if (loserKm2 <= 0) return null;
    const ids = this.idByCode;
    const front = frontCell(g, w, l, rand);
    const center: [number, number] =
      front !== null ? [((front % g.cols) + 0.5) * g.cell, (Math.floor(front / g.cols) + 0.5) * g.cell] : g.tinyPoint[l];
    const all = share >= 1 || cellCount(g, l) < 15;
    if (all) {
      const cells: number[] = [];
      for (let i = 0; i < g.current.length; i++) if (g.current[i] === l) cells.push(i);
      const pieces = piecesFor(g, ids, cells, w, l);
      return { action: { kind: 'battle', winner, loser, outcome: 'conquest', pieces }, center, radius: 0, km2: loserKm2 };
    }
    const bite = biteShape(g, l, center, loserKm2 * share, rand);
    const pieces = piecesFor(g, ids, bite.cells, w, l, bite.circles);
    return { action: { kind: 'battle', winner, loser, outcome: 'partial', pieces }, center: bite.center, radius: bite.radius, km2: bite.km2 };
  }

  // ------------------------------------------------------------ saving

  toJSON(): SavedTerritory {
    return { formatVersion: SAVE_FORMAT_VERSION, actions: this.applied.map((a) => a.action) };
  }

  /** Rebuild the world from saved actions (original Earth + actions). */
  load(saved: SavedTerritory) {
    this.stroke && this.cancelStroke();
    this.grid.resetAll(TerritoryGrid.emptyDiff());
    this.applied = [];
    this.redoStack = [];
    for (const action of migrate(saved).actions) {
      if (!isValidAction(action, this.codeById)) continue;
      this.applied.push({ action, diff: this.applyToGrid(action) });
    }
    this.changed();
  }
}

/** Upgrade older save formats to the current one (only version 1 exists so far). */
export function migrate(saved: SavedTerritory): SavedTerritory {
  if (!saved || !Array.isArray(saved.actions)) return { formatVersion: SAVE_FORMAT_VERSION, actions: [] };
  return saved;
}

function isValidAction(a: Action, ids: Map<string, number>): boolean {
  if (a && typeof a === 'object' && a.kind === 'battle') {
    return (
      ids.has(a.winner) &&
      ids.has(a.loser) &&
      Array.isArray(a.pieces) &&
      a.pieces.every((p) => (p.kind === 'paint' || p.kind === 'fill') && isValidAction(p as Action, ids))
    );
  }
  if (a && typeof a === 'object' && a.kind === 'disaster') {
    return ids.has(a.id) && typeof a.type === 'string' && typeof a.severity === 'number' && a.severity >= 0 && a.severity <= 1;
  }
  if (!a || typeof a !== 'object') return false;
  const okWithin = (w?: string) => w === undefined || ids.has(w);
  switch (a.kind) {
    case 'paint':
      return ids.has(a.owner) && Array.isArray(a.circles) && a.circles.length % 3 === 0 && okWithin(a.within);
    case 'erase':
      return Array.isArray(a.circles) && a.circles.length % 3 === 0 && okWithin(a.within);
    case 'fill':
      return ids.has(a.id) && (a.owner === undefined || ids.has(a.owner));
    case 'resetCountry':
      return ids.has(a.id);
    case 'resetWorld':
      return true;
    default:
      return false;
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function circlesBox(c: number[], into: BBox = emptyBBox()): BBox {
  const b = { ...into };
  for (let i = 0; i < c.length; i += 3) {
    const r = c[i + 2];
    if (c[i] - r < b.minX) b.minX = c[i] - r;
    if (c[i + 1] - r < b.minY) b.minY = c[i + 1] - r;
    if (c[i] + r > b.maxX) b.maxX = c[i] + r;
    if (c[i + 1] + r > b.maxY) b.maxY = c[i + 1] + r;
  }
  return b;
}

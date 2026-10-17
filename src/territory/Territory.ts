/**
 * Territory — the CURRENT world, as a list of actions on top of the original Earth.
 *
 *   original Earth (never changes) + [paint, paint, erase, reset Poland, …] = the world now
 *
 * Keeping actions (not a copy of the map) makes undo/redo exact, keeps saves small,
 * and lets the original borders be restored at any time. Pure logic: no drawing here.
 *
 * Phase 4 (battles) adds a 'conquer' action; Phase 5 (land expansion) adds 'land'/'sea'.
 */
import { emptyBBox, type BBox } from '../map/geometry';
import { TerritoryGrid, type CountryStats, type GridDiff } from './TerritoryGrid';

/** Circles are stored flat: [x, y, r, x, y, r, …] in world units. */
export type Action =
  | { kind: 'paint'; owner: string; circles: number[] }
  | { kind: 'erase'; circles: number[] }
  | { kind: 'resetCountry'; id: string }
  | { kind: 'resetWorld' };

/** A drawable piece of the current world (consecutive strokes by one owner are merged). */
export interface Layer {
  kind: 'paint' | 'erase' | 'resetCountry';
  /** Painting country (paint layers). */
  owner?: string;
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
  kind: 'paint' | 'erase';
  owner?: string;
  radius: number;
  circles: number[];
  diff: GridDiff;
  last: [number, number] | null;
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
  private codeById: Map<string, number>;
  private idByCode: string[];
  private statsCache: { version: number; stats: CountryStats[] } | null = null;
  private layersCache: { version: number; layers: Layer[] } | null = null;
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
    this.stroke = { kind, owner, radius, circles: [], diff: TerritoryGrid.emptyDiff(), last: null };
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
      if (d < step * 0.5) return;
      const n = Math.ceil(d / step);
      for (let k = 1; k <= n; k++) pts.push([s.last[0] + (dx * k) / n, s.last[1] + (dy * k) / n]);
    } else pts.push([x, y]);
    const owner = s.kind === 'paint' ? this.codeById.get(s.owner!)! : 0;
    for (const [px, py] of pts) {
      s.circles.push(round(px), round(py), round(s.radius));
      this.grid.stampCircle(px, py, s.radius, owner, s.diff);
    }
    s.last = [x, y];
    this.changed();
  }

  /** Finish the stroke: it becomes one undoable action. */
  endStroke() {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    if (s.circles.length === 0) return;
    const action: Action =
      s.kind === 'paint' ? { kind: 'paint', owner: s.owner!, circles: s.circles } : { kind: 'erase', circles: s.circles };
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
    if (s.circles.length) this.changed();
  }

  get painting() {
    return this.stroke !== null;
  }

  // ------------------------------------------------------------ other actions

  resetCountry(id: string) {
    if (!this.codeById.has(id)) return;
    this.run({ kind: 'resetCountry', id });
  }

  resetWorld() {
    this.run({ kind: 'resetWorld' });
  }

  private run(action: Action) {
    this.cancelStroke();
    this.applied.push({ action, diff: this.applyToGrid(action) });
    this.redoStack = [];
    this.changed();
  }

  private applyToGrid(a: Action): GridDiff {
    const diff = TerritoryGrid.emptyDiff();
    const g = this.grid;
    switch (a.kind) {
      case 'paint': {
        const owner = this.codeById.get(a.owner) ?? 0;
        if (!owner) break;
        for (let i = 0; i < a.circles.length; i += 3) g.stampCircle(a.circles[i], a.circles[i + 1], a.circles[i + 2], owner, diff);
        break;
      }
      case 'erase':
        for (let i = 0; i < a.circles.length; i += 3) g.stampCircle(a.circles[i], a.circles[i + 1], a.circles[i + 2], 0, diff);
        break;
      case 'resetCountry': {
        const code = this.codeById.get(a.id);
        if (code) g.resetCountry(code, diff);
        break;
      }
      case 'resetWorld':
        g.resetAll(diff);
        break;
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
    this.cancelStroke();
    const last = this.applied.pop();
    if (!last) return;
    this.grid.revert(last.diff);
    this.redoStack.push(last.action);
    this.changed();
  }

  redo() {
    this.cancelStroke();
    const action = this.redoStack.pop();
    if (!action) return;
    this.applied.push({ action, diff: this.applyToGrid(action) });
    this.changed();
  }

  /** True if anything differs from the real Earth. */
  get changedFromEarth() {
    return this.layers().length > 0;
  }

  // ------------------------------------------------------------ reading the world

  /** What to draw on top of the original Earth, in order. */
  layers(): Layer[] {
    if (this.layersCache?.version === this.version) return this.layersCache.layers;
    const layers: Layer[] = [];
    const actions = this.applied.map((a) => a.action);
    let start = 0;
    actions.forEach((a, i) => {
      if (a.kind === 'resetWorld') start = i + 1;
    });
    for (let i = start; i < actions.length; i++) {
      const a = actions[i];
      if (a.kind === 'paint' || a.kind === 'erase') {
        const prev = layers[layers.length - 1];
        if (prev && prev.kind === a.kind && prev.owner === (a.kind === 'paint' ? a.owner : undefined)) {
          // Merge with the previous stroke by the same country (fewer layers = faster drawing).
          prev.circles = prev.circles.concat(a.circles);
          prev.box = circlesBox(a.circles, prev.box);
          prev.key = `${prev.key.split(':')[0]}:${prev.circles.length}`;
        } else {
          layers.push({
            kind: a.kind,
            owner: a.kind === 'paint' ? a.owner : undefined,
            circles: a.circles.slice(),
            box: circlesBox(a.circles),
            key: `${i}:${a.circles.length}`,
          });
        }
      } else if (a.kind === 'resetCountry') {
        const absorbs = layers.filter((l) => l.kind === 'paint' && l.owner === a.id);
        layers.push({ kind: 'resetCountry', resetId: a.id, circles: [], box: emptyBBox(), key: `${i}:reset`, absorbs });
      }
    }
    const s = this.stroke;
    if (s && s.circles.length) {
      layers.push({
        kind: s.kind,
        owner: s.owner,
        circles: s.circles,
        box: circlesBox(s.circles),
        key: `stroke:${s.circles.length}`,
      });
    }
    this.layersCache = { version: this.version, layers };
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

  // ------------------------------------------------------------ saving

  toJSON(): SavedTerritory {
    return { formatVersion: SAVE_FORMAT_VERSION, actions: this.applied.map((a) => a.action) };
  }

  /** Rebuild the world from saved actions (original Earth + actions). */
  load(saved: SavedTerritory) {
    this.cancelStroke();
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
  if (!a || typeof a !== 'object') return false;
  switch (a.kind) {
    case 'paint':
      return ids.has(a.owner) && Array.isArray(a.circles) && a.circles.length % 3 === 0;
    case 'erase':
      return Array.isArray(a.circles) && a.circles.length % 3 === 0;
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

/**
 * TerritoryGrid — who owns each patch of land. Pure logic (no DOM), so it is unit-tested.
 *
 * The flat map is divided into small square cells (about 13–20 km across).
 *   original[cell] = the country that owns it on the real Earth (never changes)
 *   current[cell]  = the country that owns it now
 * Cell value 0 = water; a country is (its index + 1).
 *
 * The grid is only used for MEASURING (territory %, km² gained/lost). The map itself is
 * drawn with smooth vector shapes, so borders stay crisp at any zoom.
 *
 * Areas are always scaled to each country's real area: if Germany owns 25% of Poland's
 * cells, Germany gained 25% of Poland's real km². So conquering all of Poland adds
 * exactly Poland's real size. Countries too small for the grid (Vatican, Monaco…)
 * are tracked by a single point instead.
 */
import type { PlanarPolygon } from '../map/geometry';

export const WATER = 0;
/** A tiny country (tracked by one point) that has sunk under the sea (eroded). */
export const SUNK = 0xffff;

export interface GridCountry {
  /** Flat polygons in world units (original borders). */
  polys: PlanarPolygon[];
  /** Real-world area in km². */
  realKm2: number;
  /** A point inside the country (for countries too small for the grid). */
  point: [number, number];
  /** A country with no land on the real Earth (custom countries): never tracked by a point. */
  virtual?: boolean;
}

export interface GridOptions {
  worldWidth: number;
  worldHeight: number;
  /** Cells across the whole map. */
  cols: number;
  countries: GridCountry[];
  /** Real km² of one square world unit at height y (the flat map stretches near the poles). */
  km2PerUnit2At: (y: number) => number;
}

/** A record of what one action changed, so it can be undone exactly. */
export interface GridDiff {
  cells: number[];
  old: number[];
  tiny: number[];
  tinyOld: number[];
}

export interface CountryStats {
  originalKm2: number;
  currentKm2: number;
  gainedKm2: number;
  lostKm2: number;
}

/** A country needs at least this much grid weight (in cells) to be measured by the grid. */
const MIN_CELLS = 3;

export class TerritoryGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly original: Uint16Array;
  readonly current: Uint16Array;
  /** Real km² of a cell in each row. */
  readonly rowKm2: Float64Array;
  /** Total weight (km² as measured by the grid) of each country's original cells, by code. */
  readonly gridKm2: Float64Array;
  readonly realKm2: Float64Array;
  /** Countries too small for the grid: their single point's owner, by code (0 = not tiny). */
  readonly tinyOwner: Uint16Array;
  readonly tinyPoint: [number, number][];
  readonly count: number;
  /**
   * Running totals, kept up to date cell by cell so measuring is instant:
   *   lostW[X]  = grid km² of X's real land that someone else owns now
   *   gained[Y] = real km² Y owns that belonged to other countries
   */
  private lostW: Float64Array;
  private gained: Float64Array;

  constructor(o: GridOptions) {
    this.cols = o.cols;
    this.cell = o.worldWidth / o.cols;
    this.rows = Math.ceil(o.worldHeight / this.cell);
    this.count = o.countries.length;
    this.original = new Uint16Array(this.cols * this.rows);
    this.rowKm2 = new Float64Array(this.rows);
    for (let r = 0; r < this.rows; r++) this.rowKm2[r] = o.km2PerUnit2At((r + 0.5) * this.cell) * this.cell * this.cell;

    o.countries.forEach((c, i) => {
      for (const poly of c.polys) this.fillPolygon(poly, i + 1);
    });

    this.gridKm2 = new Float64Array(this.count + 1);
    for (let r = 0; r < this.rows; r++) {
      const w = this.rowKm2[r];
      for (let i = r * this.cols, end = i + this.cols; i < end; i++) {
        const v = this.original[i];
        if (v) this.gridKm2[v] += w;
      }
    }
    this.realKm2 = new Float64Array(this.count + 1);
    this.tinyOwner = new Uint16Array(this.count + 1);
    this.tinyPoint = [];
    o.countries.forEach((c, i) => {
      const code = i + 1;
      this.realKm2[code] = c.realKm2;
      this.tinyPoint[code] = c.point;
      const avgCell = this.rowKm2[this.rowOf(c.point[1])] || 1;
      if (!c.virtual && this.gridKm2[code] < avgCell * MIN_CELLS) this.tinyOwner[code] = code;
    });
    this.current = this.original.slice();
    this.lostW = new Float64Array(this.count + 1);
    this.gained = new Float64Array(this.count + 1);
  }

  /** Change one cell and keep the running totals right. */
  private write(i: number, v: number) {
    const old = this.current[i];
    if (old === v) return;
    const orig = this.original[i];
    const w = this.rowKm2[(i / this.cols) | 0];
    // Real land counts as a share of its country's real size; brand-new land (from the sea) as its own area.
    const share = orig === WATER ? w : (w / this.gridKm2[orig]) * this.realKm2[orig];
    if (old !== orig) {
      this.lostW[orig] -= w;
      if (old !== WATER) this.gained[old] -= share;
    }
    if (v !== orig) {
      this.lostW[orig] += w;
      if (v !== WATER) this.gained[v] += share;
    }
    this.current[i] = v;
  }

  rowOf(y: number) {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
  }

  /** Scanline fill of one polygon (even-odd, so holes like Lesotho stay out of South Africa). */
  private fillPolygon(poly: PlanarPolygon, code: number) {
    const rowXs = new Map<number, number[]>();
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if (y1 === y2) continue;
        const yMin = Math.min(y1, y2);
        const yMax = Math.max(y1, y2);
        // Rows whose centre line lies in [yMin, yMax)
        const r0 = Math.max(0, Math.ceil(yMin / this.cell - 0.5));
        const r1 = Math.min(this.rows - 1, Math.ceil(yMax / this.cell - 0.5) - 1);
        for (let r = r0; r <= r1; r++) {
          const yc = (r + 0.5) * this.cell;
          const x = x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1);
          let xs = rowXs.get(r);
          if (!xs) rowXs.set(r, (xs = []));
          xs.push(x);
        }
      }
    }
    for (const [r, xs] of rowXs) {
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil(xs[k] / this.cell - 0.5));
        const c1 = Math.min(this.cols - 1, Math.ceil(xs[k + 1] / this.cell - 0.5) - 1);
        const base = r * this.cols;
        for (let c = c0; c <= c1; c++) this.original[base + c] = code;
      }
    }
  }

  static emptyDiff(): GridDiff {
    return { cells: [], old: [], tiny: [], tinyOld: [] };
  }

  private set(i: number, v: number, diff: GridDiff) {
    if (this.current[i] === v) return;
    diff.cells.push(i);
    diff.old.push(this.current[i]);
    this.write(i, v);
  }

  private setTiny(code: number, v: number, diff: GridDiff) {
    if (this.tinyOwner[code] === v) return;
    diff.tiny.push(code);
    diff.tinyOld.push(this.tinyOwner[code]);
    this.tinyOwner[code] = v;
  }

  /**
   * Paint (owner > 0) or restore (owner = 0, back to the real Earth) a circle.
   * Only land changes: painting never turns water into land (that's Land Expansion).
   * With `within`, only that country's real land changes.
   */
  stampCircle(cx: number, cy: number, radius: number, owner: number, diff: GridDiff, within?: number) {
    const cell = this.cell;
    const r0 = Math.max(0, Math.floor((cy - radius) / cell));
    const r1 = Math.min(this.rows - 1, Math.floor((cy + radius) / cell));
    const rr = radius * radius;
    for (let r = r0; r <= r1; r++) {
      const dy = (r + 0.5) * cell - cy;
      const half = rr - dy * dy;
      if (half < 0) continue;
      const span = Math.sqrt(half);
      const c0 = Math.max(0, Math.ceil((cx - span) / cell - 0.5));
      const c1 = Math.min(this.cols - 1, Math.floor((cx + span) / cell - 0.5));
      const base = r * this.cols;
      for (let c = c0; c <= c1; c++) {
        const i = base + c;
        const orig = this.original[i];
        if (within && orig !== within) continue;
        if (orig === WATER) {
          // Painting never covers the sea; erasing (not locked to a country) removes new land.
          if (!owner && !within && this.current[i] !== WATER) this.set(i, WATER, diff);
          continue;
        }
        this.set(i, owner || orig, diff);
      }
    }
    // Countries too small for the grid follow their single point.
    for (let code = 1; code <= this.count; code++) {
      if (!this.tinyOwner[code] || (within && code !== within)) continue;
      const p = this.tinyPoint[code];
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      if (dx * dx + dy * dy <= rr) this.setTiny(code, owner || code, diff);
    }
  }

  /** Calls fn(cellIndex) for every cell whose centre is inside the circle. */
  private eachInCircle(cx: number, cy: number, radius: number, fn: (i: number) => void) {
    const cell = this.cell;
    const r0 = Math.max(0, Math.floor((cy - radius) / cell));
    const r1 = Math.min(this.rows - 1, Math.floor((cy + radius) / cell));
    const rr = radius * radius;
    for (let r = r0; r <= r1; r++) {
      const dy = (r + 0.5) * cell - cy;
      const half = rr - dy * dy;
      if (half < 0) continue;
      const span = Math.sqrt(half);
      const c0 = Math.max(0, Math.ceil((cx - span) / cell - 0.5));
      const c1 = Math.min(this.cols - 1, Math.floor((cx + span) / cell - 0.5));
      for (let c = c0; c <= c1; c++) fn(r * this.cols + c);
    }
  }

  /** Erode: all land inside the circle (real or new) is lost to the sea. */
  sinkCircle(cx: number, cy: number, radius: number, diff: GridDiff) {
    this.eachInCircle(cx, cy, radius, (i) => {
      if (this.current[i] !== WATER) this.set(i, WATER, diff);
    });
    const rr = radius * radius;
    for (let t = 1; t <= this.count; t++) {
      if (!this.tinyOwner[t]) continue;
      const p = this.tinyPoint[t];
      if ((p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= rr) this.setTiny(t, SUNK, diff);
    }
  }

  /** New land: the sea inside the circle (where there was no land on the real Earth) becomes `owner`'s. */
  raiseCircle(cx: number, cy: number, radius: number, owner: number, diff: GridDiff) {
    this.eachInCircle(cx, cy, radius, (i) => {
      if (this.original[i] === WATER) this.set(i, owner, diff);
    });
  }

  /** All of a country's real land goes to `owner` (owner = the country itself puts it back). */
  fillCountry(code: number, owner: number, diff: GridDiff) {
    const o = this.original;
    for (let i = 0; i < o.length; i++) if (o[i] === code) this.set(i, owner, diff);
    if (this.tinyOwner[code]) this.setTiny(code, owner, diff);
  }

  /** Put one country back to its real borders: its own land returns, and land it took is given back. */
  resetCountry(code: number, diff: GridDiff) {
    for (let i = 0; i < this.current.length; i++) {
      const cur = this.current[i];
      const orig = this.original[i];
      if (cur !== orig && (cur === code || orig === code)) this.set(i, orig, diff);
    }
    for (let t = 1; t <= this.count; t++) {
      if (this.tinyOwner[t] && this.tinyOwner[t] !== t && (t === code || this.tinyOwner[t] === code)) this.setTiny(t, t, diff);
    }
  }

  /** Put the whole world back to the real Earth. */
  resetAll(diff: GridDiff) {
    for (let i = 0; i < this.current.length; i++) if (this.current[i] !== this.original[i]) this.set(i, this.original[i], diff);
    for (let t = 1; t <= this.count; t++) if (this.tinyOwner[t] && this.tinyOwner[t] !== t) this.setTiny(t, t, diff);
  }

  /** Give every cell currently owned by `from` to `to` (used by "Conquer entire country"). */
  transferAll(from: number, to: number, diff: GridDiff) {
    for (let i = 0; i < this.current.length; i++) if (this.current[i] === from) this.set(i, to, diff);
    for (let t = 1; t <= this.count; t++) if (this.tinyOwner[t] === from) this.setTiny(t, to, diff);
  }

  /** Undo a change exactly. */
  revert(diff: GridDiff) {
    for (let k = diff.cells.length - 1; k >= 0; k--) this.write(diff.cells[k], diff.old[k]);
    for (let k = diff.tiny.length - 1; k >= 0; k--) this.tinyOwner[diff.tiny[k]] = diff.tinyOld[k];
  }

  /** Who owns the land at a world point right now (0 = water). */
  ownerAt(x: number, y: number): number {
    const r = Math.floor(y / this.cell);
    const c = Math.floor(x / this.cell);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return WATER;
    return this.current[r * this.cols + c];
  }

  /** Territory numbers for every country, by code. Instant: uses the running totals. */
  stats(): CountryStats[] {
    const lostW = this.lostW;
    const gained = this.gained.slice();
    const out: CountryStats[] = [];
    for (let code = 0; code <= this.count; code++) {
      const real = this.realKm2[code] || 0;
      let lost = this.gridKm2[code] > 0 ? Math.max(0, (lostW[code] / this.gridKm2[code]) * real) : 0;
      if (this.tinyOwner[code]) lost = this.tinyOwner[code] !== code ? real : 0;
      out.push({ originalKm2: real, currentKm2: 0, gainedKm2: 0, lostKm2: lost });
    }
    for (let t = 1; t <= this.count; t++) {
      const owner = this.tinyOwner[t];
      if (owner && owner !== t && owner !== SUNK) gained[owner] += this.realKm2[t];
    }
    for (let code = 0; code <= this.count; code++) {
      const s = out[code];
      s.gainedKm2 = Math.max(0, gained[code]);
      s.currentKm2 = Math.max(0, s.originalKm2 - s.lostKm2 + s.gainedKm2);
    }
    return out;
  }
}

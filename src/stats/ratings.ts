/**
 * Country power ratings (Phase 3). Pure logic: no DOM, no storage — unit-tested.
 *
 * Four ratings, 1–100 each: attack, defense, money (resources), military.
 * Comprehensive Power Score = attack×25% + defense×25% + money×20% + military×30%, rounded.
 *
 * Ratings are approximate GAMEPLAY ESTIMATES (see scripts/make-stats.mjs), stored apart from
 * the map. Players can edit them; edits are kept as "overrides" on top of the defaults, so
 * "reset to starting ratings" is always possible and new default data never wipes edits.
 */

export interface Ratings {
  attack: number;
  defense: number;
  /** Money / resources: economy, industry, ability to pay for a war. */
  money: number;
  /** Overall military power: people, equipment, air, navy, technology, logistics. */
  military: number;
}

export type RatingKey = keyof Ratings;
export const RATING_KEYS: RatingKey[] = ['attack', 'defense', 'money', 'military'];

export const RATING_LABELS: Record<RatingKey, string> = {
  attack: 'Attack',
  defense: 'Defense',
  money: 'Money',
  military: 'Military',
};

/** How much each rating counts toward the Power Score (adds up to 1). */
export const POWER_WEIGHTS: Record<RatingKey, number> = { attack: 0.25, defense: 0.25, money: 0.2, military: 0.3 };

export function clampRating(v: number): number {
  if (!isFinite(v)) return 1;
  return Math.max(1, Math.min(100, Math.round(v)));
}

export function powerScore(r: Ratings): number {
  return Math.round(RATING_KEYS.reduce((sum, k) => sum + r[k] * POWER_WEIGHTS[k], 0));
}

export const STATS_FORMAT_VERSION = 1;

export interface SavedStats {
  formatVersion: number;
  /** Only the ratings the player changed. */
  overrides: Record<string, Partial<Ratings>>;
}

export interface RankRow {
  id: string;
  ratings: Ratings;
  power: number;
  rank: number;
}

export class StatsBook {
  private defaults = new Map<string, Ratings>();
  private overrides = new Map<string, Partial<Ratings>>();
  version = 0;
  private listeners = new Set<() => void>();
  private rankCache: { version: number; rows: RankRow[]; byId: Map<string, RankRow> } | null = null;

  /** Countries shown in rankings (custom-country slots that aren't used are left out). */
  private visible: Set<string> | null = null;

  setVisible(ids: string[] | null) {
    this.visible = ids ? new Set(ids) : null;
    this.changed();
  }

  /** `defaults`: id → [attack, defense, money, military] (public/data/stats.json). */
  constructor(defaults: Record<string, number[]>, private ids: string[]) {
    for (const id of ids) {
      const d = defaults[id] ?? (id.startsWith('custom-') ? [50, 50, 50, 50] : [10, 20, 20, 10]);
      this.defaults.set(id, { attack: clampRating(d[0]), defense: clampRating(d[1]), money: clampRating(d[2]), military: clampRating(d[3]) });
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  has(id: string) {
    return this.defaults.has(id);
  }

  get(id: string): Ratings {
    const d = this.defaults.get(id) ?? { attack: 1, defense: 1, money: 1, military: 1 };
    return { ...d, ...this.overrides.get(id) };
  }

  getDefault(id: string): Ratings {
    return { ...(this.defaults.get(id) ?? { attack: 1, defense: 1, money: 1, military: 1 }) };
  }

  power(id: string): number {
    return powerScore(this.get(id));
  }

  isEdited(id: string): boolean {
    const o = this.overrides.get(id);
    return !!o && Object.keys(o).length > 0;
  }

  /** Change one or more ratings for a country. */
  set(id: string, patch: Partial<Ratings>) {
    if (!this.defaults.has(id)) return;
    const d = this.defaults.get(id)!;
    const o = { ...this.overrides.get(id) };
    for (const k of RATING_KEYS) {
      if (patch[k] === undefined) continue;
      const v = clampRating(patch[k]!);
      if (v === d[k]) delete o[k];
      else o[k] = v;
    }
    if (Object.keys(o).length) this.overrides.set(id, o);
    else this.overrides.delete(id);
    this.changed();
  }

  /** Back to the starting ratings (one country, or everyone). */
  reset(id?: string) {
    if (id) this.overrides.delete(id);
    else this.overrides.clear();
    this.changed();
  }

  /** Everyone sorted by Power Score (ties: by military, then name order). Rank 1 = strongest. */
  ranking(): RankRow[] {
    return this.rankData().rows;
  }

  rankOf(id: string): number | null {
    return this.rankData().byId.get(id)?.rank ?? null;
  }

  private rankData() {
    if (this.rankCache?.version === this.version) return this.rankCache;
    const rows = this.ids.filter((id) => !this.visible || this.visible.has(id)).map((id) => {
      const ratings = this.get(id);
      return { id, ratings, power: powerScore(ratings), rank: 0 };
    });
    rows.sort((a, b) => b.power - a.power || b.ratings.military - a.ratings.military || a.id.localeCompare(b.id));
    rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].power === r.power ? rows[i - 1].rank : i + 1));
    this.rankCache = { version: this.version, rows, byId: new Map(rows.map((r) => [r.id, r])) };
    return this.rankCache;
  }

  toJSON(): SavedStats {
    return { formatVersion: STATS_FORMAT_VERSION, overrides: Object.fromEntries(this.overrides) };
  }

  load(saved: SavedStats | null | undefined) {
    this.overrides.clear();
    const o = saved && typeof saved === 'object' ? saved.overrides : null;
    if (o && typeof o === 'object') {
      for (const [id, patch] of Object.entries(o)) {
        if (!this.defaults.has(id) || !patch || typeof patch !== 'object') continue;
        const clean: Partial<Ratings> = {};
        for (const k of RATING_KEYS) if (typeof patch[k] === 'number') clean[k] = clampRating(patch[k]!);
        if (Object.keys(clean).length) this.overrides.set(id, clean);
      }
    }
    this.changed();
  }

  /** Apply many ratings at once (spreadsheet import) as ONE change. */
  applyMany(rows: { id: string; ratings: Partial<Ratings> }[]) {
    for (const { id, ratings } of rows) {
      if (!this.defaults.has(id)) continue;
      const d = this.defaults.get(id)!;
      const o = { ...this.overrides.get(id) };
      for (const k of RATING_KEYS) {
        if (ratings[k] === undefined) continue;
        const v = clampRating(ratings[k]!);
        if (v === d[k]) delete o[k];
        else o[k] = v;
      }
      if (Object.keys(o).length) this.overrides.set(id, o);
      else this.overrides.delete(id);
    }
    this.changed();
  }
}

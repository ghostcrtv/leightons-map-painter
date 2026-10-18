/**
 * Conflict simulation maths. Pure logic, unit-tested. All the tuning lives in CONFLICT below.
 *
 * How a conflict between A and B is decided (powers are Power Scores 1–100, lowered by
 * disasters: a country weakened by 20% fights at 80% of its power):
 *
 * 1. Peace chance: peace is likeliest when the two are evenly matched (up to ~30%), and
 *    rare (~8%) when one side is far stronger.
 * 2. Who wins: a smooth S-curve of the power gap. Equal powers = 50/50; 9 points ahead
 *    ≈ 73%; 20 ahead ≈ 90%. The underdog ALWAYS keeps at least a 2% chance (a "miracle").
 * 3. How much land: the winner takes a share of the loser's land. A bigger power gap means
 *    a bigger share, plus luck (×0.5 to ×1.5). Complete conquest is more likely with a big
 *    gap, and harder against a much bigger country. Underdog winners only take a little
 *    (complete upset conquests are almost impossible, but not quite!).
 */
import type { Rand } from './random';

export const CONFLICT = {
  /** Power points for the win chance to go from 50% to ~73% (bigger = more random). */
  spread: 9,
  /** The underdog always has at least this chance of winning. */
  minWinChance: 0.02,
  /** Peace chance = peaceMin + peaceEven × closeness (closeness 1 = equal powers). */
  peaceMin: 0.08,
  peaceEven: 0.22,
  /** How fast closeness drops as the power gap grows (power points). */
  peaceFalloff: 15,
  /** Complete conquest chance for a winner with a gap of m: conquerBase + conquerGap × (1 − e^(−m/30)). */
  conquerBase: 0.06,
  conquerGap: 0.5,
  /** An underdog winner's chance of conquering everything. */
  upsetConquer: 0.03,
  conquerMax: 0.75,
  /** Typical land share for a gap of m: shareBase + shareGap × (1 − e^(−m/30)); then × luck 0.5–1.5. */
  shareBase: 0.07,
  shareGap: 0.38,
  upsetShare: 0.05,
};

export interface Fighter {
  id: string;
  /** Power Score after weakness (can be fractional). */
  power: number;
  /** Land it owns now (real km²). */
  km2: number;
}

export interface ConflictOdds {
  aWins: number;
  bWins: number;
  peace: number;
}

export type ConflictOutcome = 'peace' | 'partial' | 'conquest';

export interface ConflictResult {
  outcome: ConflictOutcome;
  winner?: string;
  loser?: string;
  /** Share of the loser's land taken (1 = all). */
  share: number;
  /** The weaker side won. */
  upset: boolean;
  odds: ConflictOdds;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Chance that a country with power `pa` beats one with power `pb` (if they fight). */
export function winChance(pa: number, pb: number): number {
  const p = 1 / (1 + Math.exp(-(pa - pb) / CONFLICT.spread));
  return clamp(p, CONFLICT.minWinChance, 1 - CONFLICT.minWinChance);
}

export function peaceChance(pa: number, pb: number): number {
  return CONFLICT.peaceMin + CONFLICT.peaceEven * Math.exp(-Math.abs(pa - pb) / CONFLICT.peaceFalloff);
}

export function conflictOdds(a: Fighter, b: Fighter): ConflictOdds {
  const peace = peaceChance(a.power, b.power);
  const pa = winChance(a.power, b.power);
  return { aWins: (1 - peace) * pa, bWins: (1 - peace) * (1 - pa), peace };
}

/** Chance that the winner takes ALL of the loser's land. */
export function conquerChance(w: Fighter, l: Fighter): number {
  const m = w.power - l.power;
  let c = m > 0 ? CONFLICT.conquerBase + CONFLICT.conquerGap * (1 - Math.exp(-m / 30)) : CONFLICT.upsetConquer;
  // Swallowing a much bigger country is hard; a much smaller one is easier.
  const size = clamp(Math.pow(Math.max(w.km2, 1) / Math.max(l.km2, 1), 0.2), 0.35, 1.15);
  c *= size;
  return clamp(c, 0.005, CONFLICT.conquerMax);
}

/** Typical share of land taken in a partial win (before luck). */
export function typicalShare(w: Fighter, l: Fighter): number {
  const m = w.power - l.power;
  return m > 0 ? CONFLICT.shareBase + CONFLICT.shareGap * (1 - Math.exp(-m / 30)) : CONFLICT.upsetShare;
}

/** `boost` > 1 makes results bigger (World War mode: more land changes hands, more conquests). */
export function resolveConflict(a: Fighter, b: Fighter, rand: Rand, boost = 1): ConflictResult {
  const odds = conflictOdds(a, b);
  const r = rand();
  if (r < odds.peace) return { outcome: 'peace', share: 0, upset: false, odds };
  const aWon = r < odds.peace + odds.aWins;
  const [w, l] = aWon ? [a, b] : [b, a];
  const upset = w.power < l.power;
  if (rand() < Math.min(0.85, conquerChance(w, l) * boost)) return { outcome: 'conquest', winner: w.id, loser: l.id, share: 1, upset, odds };
  const luck = 0.5 + rand();
  const share = clamp(typicalShare(w, l) * luck * boost, 0.02, boost > 1 ? 0.8 : 0.7);
  return { outcome: 'partial', winner: w.id, loser: l.id, share, upset, odds };
}

/** Words used for land amounts (same as the "How much?" wheel). */
export function shareWord(share: number): 'Tiny' | 'Small' | 'Medium' | 'Large' | 'All' {
  if (share >= 1) return 'All';
  if (share < 0.06) return 'Tiny';
  if (share < 0.16) return 'Small';
  if (share < 0.33) return 'Medium';
  return 'Large';
}

/**
 * Battle strength from the four ratings. Pure logic, unit-tested; tuning in STRENGTH.
 *
 * The attacker (Nation 1) fights with mostly Attack + Military (+ some Money).
 * The defender (Nation 2) fights with mostly Defense + Military (+ some Money), plus a home
 * bonus, because defending your own land is easier.
 * Allies join in with a share of their own strength. Disasters weaken (× (1 − weakness)).
 * War damage ("marks") changes Military and Money until it heals over the years.
 */
import { clampRating, type Ratings } from '../stats/ratings';

export const STRENGTH = {
  attacker: { attack: 0.45, military: 0.35, money: 0.2 },
  defender: { defense: 0.45, military: 0.35, money: 0.2 },
  /** Extra points for fighting at home. */
  homeBonus: 4,
  /** Each ally adds this share of its own strength… */
  allyShare: 0.1,
  /** …up to this many points in total. */
  allyMax: 10,
  /** Each year, war damage heals this much (0.35 = 35% of what's left). */
  yearlyHeal: 0.35,
  /** War damage limits (points). */
  markMin: -40,
  markMax: 15,
};

export type Role = 'attacker' | 'defender';

export interface Marks {
  military: number;
  money: number;
}

/** Ratings with war damage applied (still 1–100). */
export function withMarks(r: Ratings, m?: Partial<Marks>): Ratings {
  return {
    ...r,
    military: clampRating(r.military + (m?.military ?? 0)),
    money: clampRating(r.money + (m?.money ?? 0)),
  };
}

/** Strength of one country in a role, before allies. */
export function roleStrength(r: Ratings, role: Role, weakness = 0): number {
  const base =
    role === 'attacker'
      ? r.attack * STRENGTH.attacker.attack + r.military * STRENGTH.attacker.military + r.money * STRENGTH.attacker.money
      : r.defense * STRENGTH.defender.defense + r.military * STRENGTH.defender.military + r.money * STRENGTH.defender.money + STRENGTH.homeBonus;
  return base * (1 - weakness);
}

/** Extra strength from allies (each ally fights in the same role, at a share of its strength). */
export function allyBonus(allyStrengths: number[]): number {
  return Math.min(STRENGTH.allyMax, allyStrengths.reduce((s, v) => s + v * STRENGTH.allyShare, 0));
}

/** War damage after a battle (points to add to each side's Military / Money). */
export function battleMarks(outcome: 'peace' | 'partial' | 'conquest', share: number, upset: boolean): { winner: Marks; loser: Marks; each?: Marks } {
  if (outcome === 'peace') return { winner: { military: 0, money: -1 }, loser: { military: 0, money: -1 } };
  if (outcome === 'conquest') return { winner: { military: upset ? 4 : 2, money: -2 }, loser: { military: 0, money: 0 } };
  return {
    winner: { military: upset ? 3 : 1, money: -1 },
    loser: { military: -Math.round(2 + 10 * share), money: -Math.round(1 + 5 * share) },
  };
}

/** Add war damage, keeping it within limits. */
export function addMarks(a: Marks, b: Partial<Marks>): Marks {
  const lim = (v: number) => Math.max(STRENGTH.markMin, Math.min(STRENGTH.markMax, v));
  return { military: lim(a.military + (b.military ?? 0)), money: lim(a.money + (b.money ?? 0)) };
}

/** One year passes: war damage heals part of the way back to zero. */
export function healMarks(m: Marks): Marks {
  const heal = (v: number) => (Math.abs(v) <= 1 ? 0 : Math.round(v * (1 - STRENGTH.yearlyHeal)));
  return { military: heal(m.military), money: heal(m.money) };
}

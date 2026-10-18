/**
 * Action wheels: spin to make a random decision. Add a new wheel by adding an entry to
 * WHEELS — the Actions menu lists them automatically.
 */
import type { CountryInfo } from '../data/countries';

export interface WheelOption {
  label: string;
  color: string;
  /** Set for country wheels: lets the result show the flag and fly to the country. */
  countryId?: string;
  /** Set for direction wheels: arrow angle in degrees (0 = up/North, clockwise). */
  arrow?: number;
}

export interface WheelContext {
  countries: CountryInfo[];
  /** Has the country got any land left? (conquered countries are left off the wheel) */
  hasLand: (id: string) => boolean;
  flagColor: (code: string | null) => string;
}

export interface WheelDef {
  id: string;
  title: string;
  /** One short line under the title in the menu. */
  blurb: string;
  emoji: string;
  options: (ctx: WheelContext) => WheelOption[];
}

const C = { red: '#e8463a', gold: '#ffcd3c', green: '#2fae5a', blue: '#2d7ff9', purple: '#8b5cf6', orange: '#f59e0b', teal: '#14b8a6', pink: '#ec4899' };

export const WHEELS: WheelDef[] = [
  {
    id: 'country',
    title: 'Country',
    blurb: 'Lands on a random country',
    emoji: '🌍',
    options: ({ countries, hasLand, flagColor }) =>
      countries
        .filter((c) => !c.disputed && hasLand(c.id))
        .map((c) => ({ label: c.name, color: flagColor(c.flag), countryId: c.id })),
  },
  {
    id: 'event',
    title: 'War · Land · Erode',
    blurb: 'What happens next?',
    emoji: '⚔️',
    options: () => [
      { label: 'War', color: C.red },
      { label: 'Land', color: C.green },
      { label: 'Erode', color: C.orange },
    ],
  },
  {
    id: 'amount',
    title: 'How much?',
    blurb: 'Tiny, small, medium, large or all',
    emoji: '📏',
    options: () => [
      { label: 'Tiny', color: C.teal },
      { label: 'Small', color: C.blue },
      { label: 'Medium', color: C.purple },
      { label: 'Large', color: C.pink },
      { label: 'All', color: C.red },
    ],
  },
  {
    id: 'direction',
    title: 'Direction',
    blurb: 'Which way?',
    emoji: '🧭',
    options: () =>
      ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'].map((label, i) => ({
        label,
        color: [C.blue, C.teal, C.green, C.gold, C.orange, C.red, C.pink, C.purple][i],
        arrow: i * 45,
      })),
  },
];

/** A fair random whole number from 0 to n-1 (uses the browser's crypto randomness). */
export function randomIndex(n: number): number {
  if (n <= 1) return 0;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n; // avoid bias
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}

/**
 * The wheel angle (degrees, clockwise) that puts option `index` under the pointer at the top,
 * after at least `turns` full spins from `from`. `wobble` (−0.5…0.5) lands off-centre in the
 * slice so it looks natural.
 */
export function landingAngle(from: number, index: number, count: number, turns = 6, wobble = 0): number {
  const slice = 360 / count;
  const target = -((index + 0.5 + wobble * 0.7) * slice);
  const base = from + turns * 360;
  const delta = (((target - base) % 360) + 360) % 360;
  return base + delta;
}

/** Which option is under the pointer for a given wheel angle (the reverse of landingAngle). */
export function optionAt(angle: number, count: number): number {
  const slice = 360 / count;
  const a = (((-angle) % 360) + 360) % 360;
  return Math.floor(a / slice) % count;
}

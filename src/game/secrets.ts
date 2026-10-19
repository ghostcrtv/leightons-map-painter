/**
 * Hidden things on the map (deliberately NOT in Help or anywhere in the UI):
 *
 * - THE MONKEY: a tiny monkey floating somewhere on the water (ocean, sea or big lake). Only
 *   visible when zoomed right in. Every "Reset whole world" moves him somewhere new.
 * - THE IMPOSSIBLE ISLAND: the tiniest island, always at Point Nemo — the spot in the ocean
 *   farthest from any land (48°52.6′S 123°23.6′W). Only visible when zoomed far in.
 *
 * Tapping one shows a little celebration (SecretPop). Nothing here changes the world or saves.
 */
import { readSetting, writeSetting } from '../utils/settings';
import { WATER, type TerritoryGrid } from '../territory/TerritoryGrid';
import { cellCenter } from '../territory/regions';

export type SecretKind = 'monkey' | 'island';

/** Point Nemo, [longitude, latitude]. */
export const IMPOSSIBLE_ISLAND: [number, number] = [-123.3933, -48.8767];

/** Zoom (×) needed to see them. The map's maximum is 300×. */
export const SECRET_ZOOM: Record<SecretKind, number> = { monkey: 150, island: 90 };

let monkey: [number, number] | null = readSetting<[number, number] | null>('monkeySpot', null);

export const monkeySpot = () => monkey;

/**
 * A random spot on open water: a water cell whose neighbours (2 cells around) are water too,
 * away from the far north and south edges of the map. `rand` is injectable for tests.
 */
export function pickWaterSpot(g: TerritoryGrid, rand: () => number = Math.random): [number, number] | null {
  const top = Math.floor(g.rows * 0.1);
  const bottom = Math.floor(g.rows * 0.85);
  const open = (c: number, r: number) => {
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr;
        const cc = (c + dc + g.cols) % g.cols;
        if (rr < 0 || rr >= g.rows || g.current[rr * g.cols + cc] !== WATER) return false;
      }
    return true;
  };
  for (let tries = 0; tries < 5000; tries++) {
    const r = top + Math.floor(rand() * (bottom - top));
    const c = Math.floor(rand() * g.cols);
    if (open(c, r)) return cellCenter(g, r * g.cols + c);
  }
  return null;
}

/** Move the monkey somewhere new (after the world is reset, or the first time). */
export function moveMonkey(g: TerritoryGrid) {
  const p = pickWaterSpot(g);
  if (!p) return;
  monkey = p;
  writeSetting('monkeySpot', p);
}

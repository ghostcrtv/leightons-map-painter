import { describe, expect, it } from 'vitest';
import { pickWaterSpot, IMPOSSIBLE_ISLAND } from '../src/game/secrets';
import type { TerritoryGrid } from '../src/territory/TerritoryGrid';
import { seeded } from '../src/sim/random';

/** A small fake map: land everywhere except a lake in the middle (rows 8–15, cols 10–29). */
function grid(lake = true) {
  const cols = 40, rows = 24;
  const current = new Uint16Array(cols * rows).fill(5);
  if (lake) for (let r = 8; r < 16; r++) for (let c = 10; c < 30; c++) current[r * cols + c] = 0;
  return { cols, rows, cell: 1, current } as unknown as TerritoryGrid;
}

describe('hidden monkey spot', () => {
  it('is always on open water, away from the shore', () => {
    const g = grid();
    const rand = seeded(4);
    for (let i = 0; i < 200; i++) {
      const p = pickWaterSpot(g, rand)!;
      const c = Math.floor(p[0]);
      const r = Math.floor(p[1]);
      expect(c).toBeGreaterThanOrEqual(12);
      expect(c).toBeLessThanOrEqual(27);
      expect(r).toBeGreaterThanOrEqual(10);
      expect(r).toBeLessThanOrEqual(13);
    }
  });
  it('gives up (null) when there is no water', () => {
    expect(pickWaterSpot(grid(false), seeded(1))).toBeNull();
  });
});

describe('the Impossible Island', () => {
  it('is at Point Nemo, in the far South Pacific', () => {
    expect(IMPOSSIBLE_ISLAND[0]).toBeCloseTo(-123.39, 1);
    expect(IMPOSSIBLE_ISLAND[1]).toBeCloseTo(-48.88, 1);
  });
});

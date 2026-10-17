import { describe, expect, it } from 'vitest';
import { TerritoryGrid } from '../src/territory/TerritoryGrid';
import { Territory } from '../src/territory/Territory';
import { formatTerritory } from '../src/utils/format';
import type { PlanarPolygon } from '../src/map/geometry';

const rect = (x: number, y: number, w: number, h: number): PlanarPolygon => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ],
];

/**
 * A tiny test world, 100 × 50 units, with 1 km² per square unit everywhere:
 *   A "Germany" (left), B "Poland" (right, same size), T "Vatican" (a speck inside A's sea)
 * Real areas are set like the real countries so the numbers read naturally.
 */
function makeWorld() {
  const grid = new TerritoryGrid({
    worldWidth: 100,
    worldHeight: 50,
    cols: 200,
    km2PerUnit2At: () => 1,
    countries: [
      { polys: [rect(10, 10, 20, 20)], realKm2: 357_000, point: [20, 20] }, // DE
      { polys: [rect(30, 10, 20, 20)], realKm2: 312_000, point: [40, 20] }, // PL
      { polys: [rect(80, 40, 0.1, 0.1)], realKm2: 0.44, point: [80.05, 40.05] }, // VA (too small for the grid)
    ],
  });
  return new Territory(grid, ['DE', 'PL', 'VA']);
}

const paint = (t: Territory, owner: string, x: number, y: number, r: number) => {
  t.beginStroke('paint', r, owner);
  t.extendStroke(x, y);
  t.endStroke();
};

describe('territory measuring', () => {
  it('starts at 100% for everyone', () => {
    const t = makeWorld();
    const de = t.statsFor('DE')!;
    expect(de.currentKm2).toBeCloseTo(357_000, -1);
    expect(de.gainedKm2).toBe(0);
    expect(de.lostKm2).toBe(0);
  });

  it('conquering ALL of Poland adds exactly Poland’s real size (187%)', () => {
    const t = makeWorld();
    paint(t, 'DE', 40, 20, 20); // a big brush covering all of Poland (and Germany's own land)
    const de = t.statsFor('DE')!;
    const pl = t.statsFor('PL')!;
    expect(de.gainedKm2).toBeCloseTo(312_000, -2);
    expect(Math.round((de.currentKm2 / de.originalKm2) * 100)).toBe(187);
    expect(pl.currentKm2).toBeLessThan(1);
    expect(t.isConquered('PL')).toBe(true);
  });

  it('painting over the sea changes nothing', () => {
    const t = makeWorld();
    paint(t, 'DE', 70, 40, 3);
    expect(t.statsFor('DE')!.gainedKm2).toBe(0);
  });

  it('captures tiny countries by their single point', () => {
    const t = makeWorld();
    paint(t, 'PL', 80, 40, 1);
    expect(t.statsFor('VA')!.currentKm2).toBe(0);
    expect(t.statsFor('PL')!.gainedKm2).toBeCloseTo(0.44);
  });
});

describe('undo, redo, erase and reset', () => {
  it('undo puts the world back exactly, redo does it again', () => {
    const t = makeWorld();
    paint(t, 'DE', 35, 20, 4);
    const after = t.statsFor('DE')!.currentKm2;
    expect(after).toBeGreaterThan(357_000);
    t.undo();
    expect(t.statsFor('DE')!.currentKm2).toBeCloseTo(357_000, -1);
    expect(t.canRedo).toBe(true);
    t.redo();
    expect(t.statsFor('DE')!.currentKm2).toBeCloseTo(after, 0);
  });

  it('erase gives land back to its real owner', () => {
    const t = makeWorld();
    paint(t, 'DE', 40, 20, 20);
    t.beginStroke('erase', 20);
    t.extendStroke(40, 20);
    t.endStroke();
    expect(t.statsFor('PL')!.currentKm2).toBeCloseTo(312_000, -1);
    expect(t.statsFor('DE')!.currentKm2).toBeCloseTo(357_000, -1);
  });

  it('reset country returns its land and gives back what it took', () => {
    const t = makeWorld();
    paint(t, 'PL', 15, 20, 3); // Poland takes a bit of Germany
    paint(t, 'DE', 45, 20, 3); // Germany takes a bit of Poland
    t.resetCountry('DE');
    expect(t.statsFor('DE')!.currentKm2).toBeCloseTo(357_000, -1);
    expect(t.statsFor('PL')!.currentKm2).toBeCloseTo(312_000, -1);
  });

  it('a cancelled stroke leaves no trace', () => {
    const t = makeWorld();
    t.beginStroke('paint', 5, 'DE');
    t.extendStroke(40, 20);
    t.cancelStroke();
    expect(t.statsFor('PL')!.lostKm2).toBe(0);
    expect(t.canUndo).toBe(false);
  });

  it('merges strokes by the same country into one drawing layer', () => {
    const t = makeWorld();
    paint(t, 'DE', 35, 20, 2);
    paint(t, 'DE', 36, 20, 2);
    paint(t, 'PL', 20, 20, 2);
    expect(t.layers().map((l) => l.owner)).toEqual(['DE', 'PL']);
  });
});

describe('saving', () => {
  it('rebuilds the same world from saved actions', () => {
    const t = makeWorld();
    paint(t, 'DE', 40, 20, 6);
    const saved = JSON.parse(JSON.stringify(t.toJSON()));
    const t2 = makeWorld();
    t2.load(saved);
    expect(t2.statsFor('DE')!.currentKm2).toBeCloseTo(t.statsFor('DE')!.currentKm2, 3);
  });

  it('ignores broken or unknown actions instead of crashing', () => {
    const t = makeWorld();
    t.load({ formatVersion: 1, actions: [{ kind: 'paint', owner: 'XX', circles: [1, 2, 3] }, { kind: 'nope' } as never] });
    expect(t.layers()).toHaveLength(0);
  });
});

describe('territory wording', () => {
  it('uses % up to 999%, then "× bigger"', () => {
    expect(formatTerritory(1)).toEqual({ big: '100%', note: 'of its real land' });
    expect(formatTerritory(1.87).big).toBe('187%');
    expect(formatTerritory(0.84).big).toBe('84%');
    expect(formatTerritory(12.4).big).toBe('12×');
    expect(formatTerritory(12.4).note).toBe('bigger than its real size');
    expect(formatTerritory(0).big).toBe('0%');
    expect(formatTerritory(1.004).big).toBe('100.4%');
  });
});

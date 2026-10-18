import { describe, expect, it } from 'vitest';
import { addMarks, allyBonus, battleMarks, healMarks, roleStrength, STRENGTH, withMarks } from '../src/sim/strength';
import { TerritoryGrid } from '../src/territory/TerritoryGrid';
import { Territory } from '../src/territory/Territory';
import { buildHistory } from '../src/sim/history';
import type { PlanarPolygon } from '../src/map/geometry';

const attacker = { attack: 95, defense: 40, money: 60, military: 70 };
const turtle = { attack: 30, defense: 95, money: 60, military: 70 };

describe('attacker and defender strength', () => {
  it('uses Attack for attacking and Defense (+ home bonus) for defending', () => {
    expect(roleStrength(attacker, 'attacker')).toBeGreaterThan(roleStrength(turtle, 'attacker'));
    expect(roleStrength(turtle, 'defender')).toBeGreaterThan(roleStrength(attacker, 'defender'));
    // Same ratings: defending is a little stronger (home bonus)
    const even = { attack: 70, defense: 70, money: 70, military: 70 };
    expect(roleStrength(even, 'defender') - roleStrength(even, 'attacker')).toBeCloseTo(STRENGTH.homeBonus, 5);
  });

  it('disasters weaken, allies help but only up to a limit', () => {
    expect(roleStrength(attacker, 'attacker', 0.5)).toBeCloseTo(roleStrength(attacker, 'attacker') / 2, 5);
    expect(allyBonus([50])).toBeCloseTo(5, 5);
    expect(allyBonus([90, 90, 90, 90])).toBe(STRENGTH.allyMax);
  });

  it('war damage changes Military and Money, stays in limits, and heals over the years', () => {
    expect(withMarks(attacker, { military: -10, money: -5 })).toMatchObject({ military: 60, money: 55 });
    let m = addMarks({ military: 0, money: 0 }, { military: -100 });
    expect(m.military).toBe(STRENGTH.markMin);
    m = { military: -20, money: -6 };
    for (let y = 0; y < 10; y++) m = healMarks(m);
    expect(m).toEqual({ military: 0, money: 0 });
    const big = battleMarks('partial', 0.5, false);
    const small = battleMarks('partial', 0.05, false);
    expect(big.loser.military).toBeLessThan(small.loser.military);
  });
});

const rect = (x: number, y: number, w: number, h: number): PlanarPolygon => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
function makeWorld() {
  const grid = new TerritoryGrid({
    worldWidth: 100, worldHeight: 50, cols: 200, km2PerUnit2At: () => 1,
    countries: [
      { polys: [rect(10, 10, 20, 20)], realKm2: 357_000, point: [20, 20] },
      { polys: [rect(30, 10, 20, 20)], realKm2: 312_000, point: [40, 20] },
      { polys: [rect(2, 10, 8, 20)], realKm2: 550_000, point: [6, 20] },
    ],
  });
  return new Territory(grid, ['DE', 'PL', 'FR']);
}

describe('the world’s story', () => {
  it('tracks alliances, war damage, peace and years — and undo takes them back', () => {
    const t = makeWorld();
    t.apply({ kind: 'alliance', a: 'DE', b: 'FR', on: true });
    expect(t.areAllies('FR', 'DE')).toBe(true);
    expect(t.alliesOf('DE')).toEqual(['FR']);
    t.apply({ ...t.planBattle('DE', 'PL', 0.3)!.action, marks: { PL: { military: -8, money: -3 } }, attacker: 'DE', defender: 'PL', share: 0.3, km2: 90000 });
    expect(t.marksOf('PL')).toEqual({ military: -8, money: -3 });
    t.apply({ kind: 'peace', a: 'DE', b: 'PL', marks: { DE: { money: -1 }, PL: { money: -1 } } });
    expect(t.marksOf('PL').money).toBe(-4);
    t.apply({ kind: 'year' });
    expect(t.marksOf('PL')).toEqual({ military: -5, money: -3 });
    expect(t.year()).toBe(1);
    t.undo();
    expect(t.year()).toBe(0);
    expect(t.marksOf('PL').military).toBe(-8);
    t.apply({ kind: 'alliance', a: 'DE', b: 'FR', on: false });
    expect(t.areAllies('DE', 'FR')).toBe(false);
  });

  it('a year can hold its events (applied together, undone together)', () => {
    const t = makeWorld();
    const battle = t.planBattle('PL', 'DE', 0.2)!.action;
    t.apply({ kind: 'year', events: [battle, { kind: 'disaster', id: 'FR', type: 'flood', severity: 0.1 }] });
    expect(t.statsFor('DE')!.lostKm2).toBeGreaterThan(30_000);
    expect(t.weakness('FR')).toBeCloseTo(0.1);
    const json = JSON.parse(JSON.stringify(t.toJSON()));
    t.undo();
    expect(t.statsFor('DE')!.lostKm2).toBe(0);
    const t2 = makeWorld();
    t2.load(json);
    expect(t2.statsFor('DE')!.lostKm2).toBeGreaterThan(30_000);
  });

  it('writes a readable history, grouped by year', () => {
    const t = makeWorld();
    t.apply({ kind: 'alliance', a: 'DE', b: 'FR', on: true });
    t.apply({ kind: 'year', events: [{ ...t.planBattle('DE', 'PL', 0.2)!.action, share: 0.2, km2: 60000 }] });
    const h = buildHistory(t.activeActions(), (id) => ({ DE: 'Germany', PL: 'Poland', FR: 'France' })[id] ?? id);
    expect(h.map((e) => [e.year, e.emoji])).toEqual([[0, '🤝'], [1, '⚔️'], [1, '📅']]);
    expect(h[1].text).toBe('Germany took a Medium piece of Poland (60,000 km²)');
  });
});

describe('bundling a year', () => {
  it('turns the year’s events into one action that undoes in one go', () => {
    const t = makeWorld();
    const mark = t.mark;
    t.apply(t.planBattle('DE', 'PL', 0.2)!.action);
    t.apply({ kind: 'disaster', id: 'FR', type: 'flood', severity: 0.1 });
    t.bundleYear(mark);
    expect(t.activeActions()).toHaveLength(1);
    expect(t.year()).toBe(1);
    expect(t.weakness('FR')).toBeCloseTo(0.1);
    t.undo();
    expect(t.statsFor('PL')!.lostKm2).toBe(0);
    expect(t.weakness('FR')).toBe(0);
    expect(t.year()).toBe(0);
  });
});

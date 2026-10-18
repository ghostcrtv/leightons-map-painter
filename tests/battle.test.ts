import { describe, expect, it } from 'vitest';
import { TerritoryGrid } from '../src/territory/TerritoryGrid';
import { Territory } from '../src/territory/Territory';
import { closest, frontCell, neighboursOf, touching } from '../src/territory/regions';
import type { PlanarPolygon } from '../src/map/geometry';

const rect = (x: number, y: number, w: number, h: number): PlanarPolygon => [
  [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
];

/** 100×50 world: DE | PL side by side, FR left of DE, an island IS out at sea, VA a speck inside DE. */
function makeWorld() {
  const grid = new TerritoryGrid({
    worldWidth: 100,
    worldHeight: 50,
    cols: 200,
    km2PerUnit2At: () => 1,
    countries: [
      { polys: [rect(10, 10, 20, 20)], realKm2: 357_000, point: [20, 20] }, // DE 1
      { polys: [rect(30, 10, 20, 20)], realKm2: 312_000, point: [40, 20] }, // PL 2
      { polys: [rect(2, 10, 8, 20)], realKm2: 550_000, point: [6, 20] }, // FR 3
      { polys: [rect(70, 20, 6, 6)], realKm2: 100_000, point: [73, 23] }, // IS 4 (island)
      { polys: [rect(15, 15, 0.1, 0.1)], realKm2: 0.44, point: [15.05, 15.05] }, // VA 5 (speck inside DE)
    ],
  });
  return new Territory(grid, ['DE', 'PL', 'FR', 'IS', 'VA']);
}

const ids = (t: Territory, codes: Iterable<number>) => [...codes].map((c) => t.idOf(c)).sort();

describe('neighbours', () => {
  it('finds touching countries, and the closest ones for islands', () => {
    const t = makeWorld();
    const g = t.grid;
    expect(ids(t, touching(g, t.codeOf('DE')))).toEqual(['FR', 'PL', 'VA']);
    expect(ids(t, touching(g, t.codeOf('VA')))).toEqual(['DE']);
    expect(touching(g, t.codeOf('IS')).size).toBe(0);
    expect(t.idOf(closest(g, t.codeOf('IS'))[0])).toBe('PL');
    expect(ids(t, neighboursOf(g, t.codeOf('IS')))).toContain('PL');
  });

  it('neighbours change when borders move', () => {
    const t = makeWorld();
    t.apply(t.planBattle('PL', 'DE', 1)!.action); // Poland conquers Germany (and the Vatican inside it)
    expect(ids(t, touching(t.grid, t.codeOf('FR')))).toEqual(['PL']);
  });

  it('finds where an attack lands first', () => {
    const t = makeWorld();
    const f = frontCell(t.grid, t.codeOf('DE'), t.codeOf('PL'))!;
    const x = ((f % t.grid.cols) + 0.5) * t.grid.cell;
    expect(x).toBeGreaterThan(30);
    expect(x).toBeLessThan(31);
  });
});

describe('battle results on the map', () => {
  it('a partial win takes about the planned share, next to the border, and undo restores it', () => {
    const t = makeWorld();
    const plan = t.planBattle('DE', 'PL', 0.25)!;
    expect(plan.action.outcome).toBe('partial');
    t.apply(plan.action);
    const pl = t.statsFor('PL')!;
    const de = t.statsFor('DE')!;
    expect(pl.lostKm2 / pl.originalKm2).toBeGreaterThan(0.2);
    expect(pl.lostKm2 / pl.originalKm2).toBeLessThan(0.32);
    expect(de.gainedKm2).toBeCloseTo(pl.lostKm2, -2);
    expect(t.ownerAt(31, 20)).toBe('DE'); // land by the border changed hands
    expect(t.ownerAt(49, 20)).toBe('PL'); // the far side didn't
    // Drawn as ordinary paint layers
    expect(t.layers().some((l) => l.kind === 'paint' && l.owner === 'DE' && l.within === 'PL')).toBe(true);
    t.undo();
    expect(t.statsFor('PL')!.lostKm2).toBe(0);
    expect(t.layers()).toEqual([]);
  });

  it('a conquest takes everything, including land the loser had taken', () => {
    const t = makeWorld();
    t.apply(t.planBattle('PL', 'DE', 0.3)!.action); // Poland takes a chunk of Germany first
    expect(t.statsFor('PL')!.gainedKm2).toBeGreaterThan(50_000);
    t.apply(t.planBattle('DE', 'PL', 1)!.action); // then Germany conquers Poland
    expect(t.isConquered('PL')).toBe(true);
    const de = t.statsFor('DE')!;
    expect(Math.round((de.currentKm2 / de.originalKm2) * 100)).toBe(187); // all of DE back + all of PL
  });

  it('a tiny country cannot be split, so any win takes it all', () => {
    const t = makeWorld();
    const plan = t.planBattle('DE', 'VA', 0.1)!;
    expect(plan.action.outcome).toBe('conquest');
    t.apply(plan.action);
    expect(t.isConquered('VA')).toBe(true);
  });

  it('saves and loads battles', () => {
    const t = makeWorld();
    t.apply(t.planBattle('DE', 'PL', 0.4)!.action);
    const json = JSON.parse(JSON.stringify(t.toJSON()));
    const t2 = makeWorld();
    t2.load(json);
    expect(t2.statsFor('PL')!.lostKm2).toBeCloseTo(t.statsFor('PL')!.lostKm2, 0);
  });
});

describe('disasters', () => {
  it('weaken a country until it is reset, up to 60%', () => {
    const t = makeWorld();
    t.apply({ kind: 'disaster', id: 'PL', type: 'flood', severity: 0.2 });
    expect(t.weakness('PL')).toBeCloseTo(0.2);
    expect(t.weakenedIds()).toEqual(['PL']);
    for (let i = 0; i < 5; i++) t.apply({ kind: 'disaster', id: 'PL', type: 'earthquake', severity: 0.2 });
    expect(t.weakness('PL')).toBeCloseTo(0.6);
    t.resetCountry('PL'); // resetting borders doesn't heal it…
    expect(t.weakness('PL')).toBeCloseTo(0.6);
    t.apply(t.planBattle('PL', 'DE', 0.1)!.action); // …but winning a battle does
    expect(t.weakness('PL')).toBe(0);
    t.undo();
    expect(t.weakness('PL')).toBeCloseTo(0.6);
    t.resetWorld();
    expect(t.weakness('PL')).toBe(0);
    t.apply({ kind: 'disaster', id: 'DE', type: 'tornado', severity: 0.1 });
    t.undo();
    expect(t.weakness('DE')).toBe(0);
    t.redo();
    expect(t.disastersOf('DE')).toEqual([{ type: 'tornado', severity: 0.1 }]);
    const t2 = makeWorld();
    t2.load(JSON.parse(JSON.stringify(t.toJSON())));
    expect(t2.weakness('DE')).toBeCloseTo(0.1);
    t2.resetWorld();
    expect(t2.weakenedIds()).toEqual([]);
  });

  it('ignores broken saved battles and disasters', () => {
    const t = makeWorld();
    t.load({
      formatVersion: 1,
      actions: [
        { kind: 'disaster', id: 'XX', type: 'flood', severity: 0.1 },
        { kind: 'disaster', id: 'DE', type: 'flood', severity: 5 },
        { kind: 'battle', winner: 'DE', loser: 'PL', outcome: 'partial', pieces: [{ kind: 'fill', id: 'NOPE' }] },
      ] as never,
    });
    expect(t.canUndo).toBe(false);
  });
});

describe('land tool: new land and erosion', () => {
  const stroke = (t: Territory, kind: 'land' | 'sea' | 'erase', x: number, y: number, r: number, owner?: string) => {
    t.beginStroke(kind, r, owner);
    t.extendStroke(x, y);
    t.endStroke();
  };

  it('new land is made only on the sea and counts toward the owner', () => {
    const t = makeWorld();
    stroke(t, 'land', 53, 20, 2, 'PL'); // just off Poland's coast (Poland ends at x=50)
    const pl = t.statsFor('PL')!;
    expect(pl.gainedKm2).toBeGreaterThan(5); // ~ the sea area covered (1 km² per unit here)
    expect(pl.gainedKm2).toBeLessThan(16); // a circle of radius 2 ≈ 12.6
    expect(pl.lostKm2).toBe(0);
    expect(t.ownerAt(53, 20)).toBe('PL');
    expect(t.statsFor('DE')!.lostKm2).toBe(0);
    expect(t.layers().at(-1)).toMatchObject({ kind: 'land', owner: 'PL' });
  });

  it('erosion turns land into sea, and the country shrinks', () => {
    const t = makeWorld();
    stroke(t, 'sea', 30, 20, 4); // right on the DE / PL border: both lose land
    expect(t.ownerAt(30, 20)).toBeNull();
    expect(t.statsFor('DE')!.lostKm2).toBeGreaterThan(1000);
    expect(t.statsFor('PL')!.lostKm2).toBeGreaterThan(1000);
    expect(t.statsFor('DE')!.gainedKm2).toBe(0);
    t.undo();
    expect(t.statsFor('DE')!.lostKm2).toBe(0);
  });

  it('erosion also sinks new land and tiny countries; reset brings them back', () => {
    const t = makeWorld();
    stroke(t, 'land', 53, 20, 2, 'PL');
    stroke(t, 'sea', 53, 20, 3);
    expect(t.statsFor('PL')!.gainedKm2).toBeCloseTo(0, 5);
    stroke(t, 'sea', 15, 15, 1); // the Vatican speck
    expect(t.isConquered('VA')).toBe(true);
    t.resetWorld();
    expect(t.isConquered('VA')).toBe(false);
    expect(t.statsFor('DE')!.lostKm2).toBe(0);
  });

  it('the eraser removes new land; resetting a country removes its new land and refills eroded land', () => {
    const t = makeWorld();
    stroke(t, 'land', 53, 20, 2, 'PL');
    stroke(t, 'erase', 53, 20, 3);
    expect(t.ownerAt(53, 20)).toBeNull();
    stroke(t, 'land', 53, 20, 2, 'PL');
    stroke(t, 'sea', 45, 20, 3);
    t.resetCountry('PL');
    expect(t.ownerAt(53, 20)).toBeNull();
    expect(t.ownerAt(45, 20)).toBe('PL');
    expect(t.statsFor('PL')!.lostKm2).toBe(0);
    expect(t.statsFor('PL')!.gainedKm2).toBeCloseTo(0, 5);
  });

  it('a conquest also takes the loser’s new land; saves keep it all', () => {
    const t = makeWorld();
    stroke(t, 'land', 53, 20, 2, 'PL');
    t.apply(t.planBattle('DE', 'PL', 1)!.action);
    expect(t.ownerAt(53, 20)).toBe('DE');
    expect(t.isConquered('PL')).toBe(true);
    const t2 = makeWorld();
    t2.load(JSON.parse(JSON.stringify(t.toJSON())));
    expect(t2.ownerAt(53, 20)).toBe('DE');
  });
});

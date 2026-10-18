import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StatsBook, powerScore } from '../src/stats/ratings';
import { parseCsv, parseRatingsCsv, ratingsToCsv } from '../src/stats/csv';

const defaults = { US: [96, 94, 98, 99], DE: [74, 78, 90, 75], PL: [68, 74, 66, 70], VA: [12, 30, 30, 14] };
const ids = Object.keys(defaults);
const countries = [
  { id: 'US', name: 'United States' },
  { id: 'DE', name: 'Germany' },
  { id: 'PL', name: 'Poland' },
  { id: 'VA', name: 'Vatican' },
];

describe('Power Score', () => {
  it('uses 25% attack, 25% defense, 20% money, 30% military, rounded', () => {
    // The example from the brief: 96, 94, 98, 99 → 96.85 → 97
    expect(powerScore({ attack: 96, defense: 94, money: 98, military: 99 })).toBe(97);
    expect(powerScore({ attack: 10, defense: 10, money: 10, military: 10 })).toBe(10);
    expect(powerScore({ attack: 100, defense: 0, money: 0, military: 0 })).toBe(25);
  });

  it('updates when a rating changes', () => {
    const b = new StatsBook(defaults, ids);
    const before = b.power('PL');
    b.set('PL', { military: 100 });
    expect(b.power('PL')).toBe(before + Math.round((100 - 70) * 0.3));
  });
});

describe('StatsBook', () => {
  it('keeps edits separate from the starting ratings and can reset them', () => {
    const b = new StatsBook(defaults, ids);
    b.set('DE', { attack: 99 });
    expect(b.get('DE').attack).toBe(99);
    expect(b.getDefault('DE').attack).toBe(74);
    expect(b.isEdited('DE')).toBe(true);
    b.reset('DE');
    expect(b.get('DE').attack).toBe(74);
    expect(b.isEdited('DE')).toBe(false);
  });

  it('keeps ratings between 1 and 100', () => {
    const b = new StatsBook(defaults, ids);
    b.set('VA', { attack: 500, defense: -3 });
    expect(b.get('VA')).toMatchObject({ attack: 100, defense: 1 });
  });

  it('ranks the strongest first', () => {
    const b = new StatsBook(defaults, ids);
    expect(b.ranking().map((r) => r.id)).toEqual(['US', 'DE', 'PL', 'VA']);
    expect(b.rankOf('US')).toBe(1);
    b.set('VA', { attack: 100, defense: 100, money: 100, military: 100 });
    expect(b.rankOf('VA')).toBe(1);
  });

  it('saves and loads only the edits', () => {
    const b = new StatsBook(defaults, ids);
    b.set('PL', { defense: 90 });
    const saved = JSON.parse(JSON.stringify(b.toJSON()));
    expect(saved.overrides).toEqual({ PL: { defense: 90 } });
    const b2 = new StatsBook(defaults, ids);
    b2.load(saved);
    expect(b2.get('PL').defense).toBe(90);
    b2.load({ formatVersion: 1, overrides: { XX: { attack: 5 }, PL: { attack: 'x' as unknown as number } } });
    expect(b2.isEdited('PL')).toBe(false);
  });
});

describe('spreadsheet import', () => {
  it('reads a typical spreadsheet with names, nicknames and different column names', () => {
    const csv = 'Country,Attack,Defence,Overall Military,Power\r\nUSA,90,91,95,93\n"Germany",80,,77,0\nAtlantis,1,1,1,1\n';
    const r = parseRatingsCsv(csv, countries);
    expect(r.columns).toEqual(['attack', 'defense', 'military']);
    expect(r.rows).toEqual([
      { id: 'US', ratings: { attack: 90, defense: 91, military: 95 } },
      { id: 'DE', ratings: { attack: 80, military: 77 } },
    ]);
    expect(r.unknown).toEqual(['Atlantis']);
  });

  it('accepts ISO codes, semicolons and quoted commas', () => {
    expect(parseCsv('a;b\n"x, y";2')).toEqual([['a', 'b'], ['x, y', '2']]);
    const r = parseRatingsCsv('Code;Attack;Money\npl;55;44', countries);
    expect(r.rows).toEqual([{ id: 'PL', ratings: { attack: 55, money: 44 } }]);
  });

  it('explains when no rating columns are found', () => {
    expect(parseRatingsCsv('Name,Colour\nGermany,red', countries).error).toMatch(/No rating columns/);
  });

  it('exports a spreadsheet that imports back the same', () => {
    const b = new StatsBook(defaults, ids);
    b.set('PL', { attack: 61 });
    const csv = ratingsToCsv(countries, (id) => b.get(id));
    expect(csv.split('\n')[0]).toBe('Code,Country,Attack,Defense,Money,Military,Power');
    const back = parseRatingsCsv(csv, countries);
    expect(back.rows.find((r) => r.id === 'PL')!.ratings.attack).toBe(61);
    expect(back.unknown).toEqual([]);
  });
});

describe('starter ratings data', () => {
  const file = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/stats.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/countries.json'), 'utf8'));
  it('rates every country, all within 1–100, and says they are estimates', () => {
    for (const c of registry) {
      const r = file.ratings[c.id];
      expect(r, c.name).toHaveLength(4);
      for (const v of r) expect(v >= 1 && v <= 100, `${c.name} ${v}`).toBe(true);
    }
    expect(file.note).toMatch(/estimates/i);
  });

  it('makes strong countries stronger, but not unbeatable', () => {
    const b = new StatsBook(file.ratings, registry.map((c: { id: string }) => c.id));
    expect(b.rankOf('US')).toBe(1);
    expect(b.power('US')).toBeLessThan(100);
    expect(b.power('DE')).toBeGreaterThan(b.power('LU'));
  });
});

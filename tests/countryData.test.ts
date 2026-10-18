/**
 * Checks the prepared map and flag data, so a bad data rebuild is caught
 * before it reaches the game.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { CountryInfo } from '../src/data/countries';

const pub = path.resolve(__dirname, '../public');
const countries: CountryInfo[] = JSON.parse(fs.readFileSync(path.join(pub, 'data/countries.json'), 'utf8'));
const capitals: { id: string; name: string; lon: number; lat: number }[] = JSON.parse(
  fs.readFileSync(path.join(pub, 'data/capitals.json'), 'utf8'),
);
const atlas = JSON.parse(fs.readFileSync(path.join(pub, 'flags/atlas.json'), 'utf8'));
const topoIds = (file: string): string[] =>
  JSON.parse(fs.readFileSync(path.join(pub, 'data', file), 'utf8')).objects.countries.geometries.map(
    (g: { id: string }) => g.id,
  );

describe('country registry', () => {
  it('has between 250 and 255 countries and territories', () => {
    expect(countries.length).toBeGreaterThanOrEqual(250);
    expect(countries.length).toBeLessThanOrEqual(255);
  });

  it('gives every country a unique id', () => {
    expect(new Set(countries.map((c) => c.id)).size).toBe(countries.length);
  });

  it('uses ISO codes for well-known countries', () => {
    const byName = new Map(countries.map((c) => [c.name, c.id]));
    expect(byName.get('United States')).toBe('US');
    expect(byName.get('Germany')).toBe('DE');
    expect(byName.get('Japan')).toBe('JP');
    expect(byName.get('France')).toBe('FR');
  });

  it('gives every non-disputed country a flag that exists', () => {
    for (const c of countries) {
      if (c.disputed) continue;
      expect(c.flag, c.name).toBeTruthy();
      expect(atlas.index[c.flag!], `${c.name} in atlas`).toBeTypeOf('number');
      expect(fs.existsSync(path.join(pub, 'flags/lg', `${c.flag}.png`)), `${c.name} large flag`).toBe(true);
    }
  });

  it('has a shape for every country in both detail levels', () => {
    for (const file of ['world-lo.json', 'world-hi.json']) {
      const ids = new Set(topoIds(file));
      for (const c of countries) expect(ids.has(c.id), `${c.name} in ${file}`).toBe(true);
    }
  });

  it('has a capital for nearly every country, in the right place', () => {
    const ids = new Set(countries.map((c) => c.id));
    expect(capitals.length).toBeGreaterThan(220);
    expect(new Set(capitals.map((c) => c.id)).size).toBe(capitals.length); // one each
    for (const c of capitals) expect(ids.has(c.id), c.name).toBe(true);
    const cap = (id: string) => capitals.find((c) => c.id === id)!;
    expect(cap('DE').name).toBe('Berlin');
    expect(cap('US').name).toBe('Washington, D.C.');
    expect(cap('AU').name).toBe('Canberra');
    expect(cap('ZA').name).toBe('Pretoria');
    // Berlin is at about 52.5°N, 13.4°E
    expect(cap('DE').lat).toBeCloseTo(52.5, 0);
    expect(cap('DE').lon).toBeCloseTo(13.4, 0);
  });

  it('keeps tiny countries in every level of detail', () => {
    for (const file of ['world-lo.json', 'world-hi.json', 'world-max.json']) {
      const ids = new Set(topoIds(file));
      for (const id of ['GI', 'MC', 'VA', 'SM', 'LI', 'AD']) expect(ids.has(id), `${id} in ${file}`).toBe(true);
    }
  });

  it('has sensible areas', () => {
    const area = (name: string) => countries.find((c) => c.name === name)!.areaKm2;
    expect(area('Russia')).toBeGreaterThan(area('Canada'));
    expect(area('Germany')).toBeGreaterThan(300_000);
    expect(area('Germany')).toBeLessThan(400_000);
    // No country can be bigger than Russia (an inside-out shape once made the Maldives bigger than the Earth).
    for (const c of countries) expect(c.areaKm2, c.name).toBeLessThanOrEqual(area('Russia'));
    expect(area('Maldives')).toBeLessThan(400);
  });
});

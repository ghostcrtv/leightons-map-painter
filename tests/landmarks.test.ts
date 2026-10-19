import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LANDMARKS } from '../src/data/landmarks';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as { id: string }[];
const ids = new Set(countries.map((c) => c.id));

describe('landmarks', () => {
  it('has at least 30, each with a unique id', () => {
    expect(LANDMARKS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length);
  });

  it('every landmark has real coordinates, a known country, a name, emoji and a short fact', () => {
    for (const l of LANDMARKS) {
      expect(Math.abs(l.lat), l.id).toBeLessThanOrEqual(90);
      expect(Math.abs(l.lon), l.id).toBeLessThanOrEqual(180);
      expect(ids.has(l.country), `${l.id}: ${l.country}`).toBe(true);
      expect(l.name.length).toBeGreaterThan(2);
      expect(l.emoji.length).toBeGreaterThan(0);
      expect(l.fact.length, l.id).toBeLessThanOrEqual(130); // fits the card
    }
  });

  it('every landmark with a photo has the file and a credit', () => {
    for (const l of LANDMARKS) {
      if (!l.photo) continue;
      expect(() => readFileSync(`public/landmarks/${l.id}.jpg`), l.id).not.toThrow();
      expect(l.photo.credit.length, l.id).toBeGreaterThan(1);
      expect(l.photo.licence.length, l.id).toBeGreaterThan(1);
    }
  });
});

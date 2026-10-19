import { describe, expect, it } from 'vitest';
import { seeded } from '../src/sim/random';
import { CRAZY_CHANCE, CRAZY_DISASTERS, likelyDisasters, pickCrazy, pickDisaster, type PlaceFacts } from '../src/sim/disasters';

const inland: PlaceFacts = { id: 'CH', lat: 46.8, lon: 8.2, coastal: false, km2: 41_000 };
const coast: PlaceFacts = { id: 'JP', lat: 36, lon: 138, coastal: true, km2: 378_000 };

describe('crazy disasters', () => {
  it('has at least 8 crazy disasters, all with names and emoji', () => {
    expect(CRAZY_DISASTERS.length).toBeGreaterThanOrEqual(8);
    for (const d of CRAZY_DISASTERS) {
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.emoji.length).toBeGreaterThan(0);
      expect(d.severity[0]).toBeLessThan(d.severity[1]);
      expect(d.severity[1]).toBeLessThanOrEqual(0.6);
    }
  });

  it('never happens when the setting is off', () => {
    const rand = seeded(3);
    for (let i = 0; i < 3000; i++) expect(pickDisaster(coast, rand).crazy).toBeFalsy();
  });

  it('is never listed as "likely here"', () => {
    expect(likelyDisasters(coast).some((x) => x.def.crazy)).toBe(false);
  });

  it('happens about CRAZY_CHANCE of the time when on', () => {
    const rand = seeded(5);
    let n = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (pickDisaster(coast, rand, true).crazy) n++;
    expect(n / N).toBeGreaterThan(CRAZY_CHANCE - 0.03);
    expect(n / N).toBeLessThan(CRAZY_CHANCE + 0.03);
  });

  it('only sends the kraken to countries with a coast', () => {
    const rand = seeded(9);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      expect(pickCrazy(inland, rand).id).not.toBe('kraken');
      seen.add(pickCrazy(coast, rand).id);
    }
    expect(seen.has('kraken')).toBe(true);
    expect(seen.size).toBe(CRAZY_DISASTERS.length);
  });
});

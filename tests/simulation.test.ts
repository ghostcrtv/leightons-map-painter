import { describe, expect, it } from 'vitest';
import { conflictOdds, resolveConflict, shareWord, winChance, type Fighter } from '../src/sim/conflict';
import { seeded } from '../src/sim/random';
import { DISASTERS, likelyDisasters, pickDisaster, rollSeverity, type PlaceFacts } from '../src/sim/disasters';

const F = (id: string, power: number, km2 = 300_000): Fighter => ({ id, power, km2 });

function simulate(a: Fighter, b: Fighter, n = 20000, seed = 7) {
  const rand = seeded(seed);
  const tally = { a: 0, b: 0, peace: 0, aConquer: 0, bConquer: 0, upsets: 0, shareSum: 0, partials: 0 };
  for (let i = 0; i < n; i++) {
    const r = resolveConflict(a, b, rand);
    if (r.outcome === 'peace') tally.peace++;
    else {
      if (r.winner === a.id) tally.a++;
      else tally.b++;
      if (r.outcome === 'conquest') r.winner === a.id ? tally.aConquer++ : tally.bConquer++;
      else {
        tally.partials++;
        tally.shareSum += r.share;
      }
      if (r.upset) tally.upsets++;
    }
  }
  return { ...tally, n };
}

describe('conflict odds', () => {
  it('add up to 100% and are fair for equal powers', () => {
    const o = conflictOdds(F('A', 70), F('B', 70));
    expect(o.aWins + o.bWins + o.peace).toBeCloseTo(1, 10);
    expect(o.aWins).toBeCloseTo(o.bWins, 10);
    expect(o.peace).toBeCloseTo(0.3, 2); // evenly matched: peace is most likely here
  });

  it('favour the stronger side by the right amount', () => {
    expect(winChance(79, 70)).toBeGreaterThan(0.7);
    expect(winChance(79, 70)).toBeLessThan(0.76);
    expect(winChance(90, 70)).toBeGreaterThan(0.88);
    // Stronger always better
    for (let gap = 0; gap < 90; gap += 5) expect(winChance(50 + gap / 2, 50 - gap / 2)).toBeGreaterThanOrEqual(winChance(50, 50));
  });

  it('never makes the underdog hopeless (a tiny country keeps a ~2% miracle chance)', () => {
    const o = conflictOdds(F('US', 97, 9.8e6), F('VA', 7, 0.44));
    expect(o.aWins).toBeGreaterThan(0.88);
    expect(o.bWins).toBeGreaterThan(0.015);
    expect(o.bWins).toBeLessThan(0.025);
  });
});

describe('conflict results (20,000 simulated battles)', () => {
  it('USA vs a tiny country: USA nearly always wins, but upsets happen rarely', () => {
    const s = simulate(F('US', 97, 9.8e6), F('XX', 10, 300));
    expect(s.a / s.n).toBeGreaterThan(0.88);
    expect(s.b).toBeGreaterThan(0); // the miracle happens sometimes…
    expect(s.b / s.n).toBeLessThan(0.025); // …but rarely
    expect(s.aConquer / s.a).toBeGreaterThan(0.45); // big wins often take everything
    expect(s.bConquer / s.n).toBeLessThan(0.002); // a complete upset conquest is almost impossible
  });

  it('close match: either side can win, with plenty of peace deals', () => {
    const s = simulate(F('DE', 79), F('PL', 72));
    expect(s.a / s.n).toBeGreaterThan(0.4);
    expect(s.b / s.n).toBeGreaterThan(0.18);
    expect(s.peace / s.n).toBeGreaterThan(0.18);
    const avgShare = s.shareSum / s.partials;
    expect(avgShare).toBeGreaterThan(0.06);
    expect(avgShare).toBeLessThan(0.25);
  });

  it('a bigger gap takes more land', () => {
    const close = simulate(F('A', 75), F('B', 70));
    const far = simulate(F('A', 90), F('B', 40));
    expect(far.shareSum / far.partials).toBeGreaterThan(close.shareSum / close.partials);
    expect(far.aConquer / far.a).toBeGreaterThan(close.aConquer / close.a);
  });

  it('conquering a much bigger country is harder', () => {
    const small = simulate(F('A', 85, 300_000), F('B', 60, 100_000));
    const huge = simulate(F('A', 85, 300_000), F('B', 60, 17_000_000));
    expect(huge.aConquer / huge.a).toBeLessThan(small.aConquer / small.a);
  });

  it('is repeatable with the same seed', () => {
    expect(simulate(F('A', 60), F('B', 55), 500, 3)).toEqual(simulate(F('A', 60), F('B', 55), 500, 3));
  });

  it('names amounts like the wheel', () => {
    expect([0.03, 0.1, 0.2, 0.5, 1].map(shareWord)).toEqual(['Tiny', 'Small', 'Medium', 'Large', 'All']);
  });
});

describe('natural disasters', () => {
  const place = (id: string, lat: number, lon: number, coastal = true, km2 = 300_000): PlaceFacts => ({ id, lat, lon, coastal, km2 });

  it('picks disasters that fit the place', () => {
    const top = (p: PlaceFacts) => likelyDisasters(p).map((x) => x.def.id);
    expect(top(place('JP', 36, 138))).toEqual(expect.arrayContaining(['earthquake', 'volcano', 'tsunami', 'hurricane']));
    expect(top(place('EG', 26, 30))).toContain('sandstorm');
    expect(top(place('EG', 26, 30))).not.toContain('blizzard');
    expect(top(place('CH', 47, 8, false, 41_000))).not.toContain('tsunami');
    expect(top(place('CH', 47, 8, false, 41_000))).not.toContain('hurricane');
    expect(top(place('GL', 72, -40))).toContain('blizzard');
    expect(top(place('GL', 72, -40))).not.toContain('sandstorm');
    expect(top(place('CU', 21.5, -79))).toContain('hurricane');
  });

  it('random disasters always fit, and severities stay in range', () => {
    const rand = seeded(11);
    const egypt = place('EG', 26, 30);
    for (let i = 0; i < 300; i++) {
      const d = pickDisaster(egypt, rand);
      expect(d.fits(egypt)).toBeGreaterThan(0);
      const s = rollSeverity(d, rand);
      expect(s).toBeGreaterThanOrEqual(d.severity[0]);
      expect(s).toBeLessThanOrEqual(d.severity[1]);
    }
    expect(DISASTERS.length).toBeGreaterThanOrEqual(10);
  });
});

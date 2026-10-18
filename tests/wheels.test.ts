import { describe, expect, it } from 'vitest';
import { WHEELS, landingAngle, optionAt, randomIndex } from '../src/actions/wheels';

describe('action wheels', () => {
  it('lands exactly on the chosen slice, after several full spins', () => {
    for (const n of [3, 5, 8, 200]) {
      let angle = 0;
      for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 7))) {
        for (const wobble of [-0.5, 0, 0.49]) {
          const next = landingAngle(angle, i, n, 6, wobble);
          expect(next - angle).toBeGreaterThanOrEqual(6 * 360);
          expect(optionAt(next, n)).toBe(i);
          angle = next;
        }
      }
    }
  });

  it('random picks stay in range and reach every option', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const r = randomIndex(8);
      expect(r >= 0 && r < 8).toBe(true);
      seen.add(r);
    }
    expect(seen.size).toBe(8);
  });

  it('has the four wheels with the requested choices', () => {
    const ctx = {
      countries: [
        { id: 'DE', name: 'Germany', flag: 'de', disputed: false },
        { id: 'PL', name: 'Poland', flag: 'pl', disputed: false },
        { id: 'XX', name: 'Disputed', flag: null, disputed: true },
      ] as never,
      hasLand: (id: string) => id !== 'PL',
      flagColor: () => '#888',
    };
    const labels = (id: string) => WHEELS.find((w) => w.id === id)!.options(ctx).map((o) => o.label);
    expect(labels('country')).toEqual(['Germany']); // conquered and disputed left off
    expect(labels('event')).toEqual(['War', 'Land', 'Erode']);
    expect(labels('amount')).toEqual(['Tiny', 'Small', 'Medium', 'Large', 'All']);
    expect(labels('direction')).toEqual(['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest']);
  });
});

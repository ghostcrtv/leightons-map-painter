/** Random numbers for simulations. Games use crypto randomness; tests pass a seeded one. */
export type Rand = () => number;

export const cryptoRand: Rand = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 0x100000000;
};

/** Small seeded generator (mulberry32): the same seed gives the same results (tests, future replays). */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(list: readonly T[], rand: Rand): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** Pick by weight (weights ≥ 0). */
export function pickWeighted<T>(list: readonly { item: T; weight: number }[], rand: Rand): T {
  const total = list.reduce((s, x) => s + Math.max(0, x.weight), 0);
  let r = rand() * total;
  for (const x of list) {
    r -= Math.max(0, x.weight);
    if (r < 0) return x.item;
  }
  return list[list.length - 1].item;
}

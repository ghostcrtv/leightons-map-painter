const nf = new Intl.NumberFormat('en-US');

/** "357,387 km²", "44 km²", or "under 1 km²". */
export function formatArea(km2: number): string {
  if (km2 < 1) return 'under 1 km²';
  return `${nf.format(Math.round(km2))} km²`;
}

/** Same area in square miles, for US readers. */
export function formatAreaMiles(km2: number): string {
  const mi = km2 * 0.386102;
  if (mi < 1) return 'under 1 sq mi';
  return `${nf.format(Math.round(mi))} sq mi`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * How big a country is now compared with its real size.
 * Up to 999% it is shown as a percentage; beyond that as "12× bigger",
 * because "65,000%" means nothing to most people.
 */
export function formatTerritory(ratio: number): { big: string; note: string } {
  if (!isFinite(ratio) || ratio < 0) ratio = 0;
  if (ratio >= 9.995) {
    const times = ratio >= 100 ? Math.round(ratio).toLocaleString('en-US') : String(Math.round(ratio));
    return { big: `${times}×`, note: 'bigger than its real size' };
  }
  const pct = ratio * 100;
  // A small change near 100% gets one decimal ("100.4%"), so it doesn't look like nothing happened.
  const shown = Math.round(pct) === 100 && Math.abs(pct - 100) >= 0.05 ? pct.toFixed(1) : String(Math.round(pct));
  return { big: `${shown}%`, note: 'of its real land' };
}

/** "12,300 km²" for amounts gained or lost. */
export function formatKm2(km2: number): string {
  if (km2 < 1) return 'less than 1 km²';
  return `${nf.format(km2 >= 1000 ? Math.round(km2 / 100) * 100 : Math.round(km2))} km²`;
}

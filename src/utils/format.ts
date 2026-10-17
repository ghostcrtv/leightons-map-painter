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

/**
 * Builds public/data/capitals.json — one capital city per country/territory.
 * Run with:  node scripts/make-capitals.mjs <path to ne_10m_populated_places_simple.geojson>
 * Source file (public domain, Natural Earth):
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson
 * Only needed when changing the capitals; the output is committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) throw new Error('Pass the path to ne_10m_populated_places_simple.geojson');
const places = JSON.parse(fs.readFileSync(src, 'utf8')).features.map((f) => f.properties);
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/countries.json'), 'utf8'));
const ids = new Set(registry.map((c) => c.id));

/** Countries with more than one capital in the data: the official capital wins. */
const PREFER = {
  ZA: 'Pretoria', NL: 'Amsterdam', BO: 'Sucre', CI: 'Yamoussoukro', MM: 'Naypyidaw',
  TZ: 'Dodoma', BJ: 'Porto-Novo', NG: 'Abuja', LK: 'Sri Jayawardenepura Kotte', MY: 'Kuala Lumpur',
  PS: 'Ramallah', SZ: 'Mbabane', IL: 'Jerusalem',
};
/** Territories missing from the data (approximate coordinates). */
const EXTRA = {
  AI: ['The Valley', 18.217, -63.057], VG: ['Road Town', 18.427, -64.62],
  GG: ['Saint Peter Port', 49.456, -2.536], JE: ['Saint Helier', 49.186, -2.107],
  MS: ['Brades', 16.79, -62.21], NR: ['Yaren', -0.547, 166.921], NF: ['Kingston', -29.056, 167.96],
  PN: ['Adamstown', -25.066, -130.101], BL: ['Gustavia', 17.897, -62.85], SH: ['Jamestown', -15.925, -5.717],
  MF: ['Marigot', 18.068, -63.083], PM: ['Saint-Pierre', 46.78, -56.177], SX: ['Philipsburg', 18.026, -63.046],
  GS: ['King Edward Point', -54.283, -36.494], VI: ['Charlotte Amalie', 18.342, -64.931],
  WF: ['Mata-Utu', -13.282, -176.174], TF: ['Port-aux-Français', -49.35, 70.22],
};
/** Names from the data matched to places Natural Earth files under another code. */
const BY_NAME = {
  XK: ['Pristina', 'Kosovo'], somaliland: ['Hargeisa', 'Somaliland'], CK: ['Avarua', 'Cook Islands'],
  FO: ['Tórshavn', 'Faroe Islands'], NU: ['Alofi', 'Niue'], MP: ['Capitol Hill', 'Northern Mariana Islands'],
  PR: ['San Juan', 'Puerto Rico'],
};

const rank = { 'Admin-0 capital': 0, 'Admin-0 capital alt': 1, 'Admin-0 region capital': 2 };
const out = [];
for (const id of ids) {
  let pick = null;
  if (EXTRA[id]) {
    const [name, lat, lon] = EXTRA[id];
    pick = { name, lat, lon };
  } else if (BY_NAME[id]) {
    const [name, country] = BY_NAME[id];
    const p = places.find((p) => p.name === name && p.adm0name === country);
    if (p) pick = { name: p.name, lat: p.latitude, lon: p.longitude };
  } else {
    const cands = places
      .filter((p) => p.iso_a2 === id && p.featurecla in rank)
      .sort((a, b) => rank[a.featurecla] - rank[b.featurecla]);
    const p = cands.find((p) => p.name === PREFER[id]) ?? cands[0];
    if (p) pick = { name: p.name, lat: p.latitude, lon: p.longitude };
  }
  if (pick) out.push({ id, name: pick.name.replace(/\s+/g, ' '), lon: +pick.lon.toFixed(4), lat: +pick.lat.toFixed(4) });
}
out.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(path.join(ROOT, 'public/data/capitals.json'), JSON.stringify(out));
console.log(`capitals: ${out.length} of ${ids.size} countries/territories`);

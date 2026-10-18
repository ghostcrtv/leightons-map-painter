/**
 * Build-time data preparation. Run with:  npm run prepare-data
 * (Only needed when changing the map or flag sources. The output is committed.)
 *
 * Inputs (npm packages, all free and openly licensed):
 *   - world-atlas         Natural Earth 1:10m admin-0 countries as TopoJSON
 *                         (Natural Earth data is public domain; package is ISC)
 *   - i18n-iso-countries  ISO 3166 numeric -> alpha-2 lookup (MIT)
 *   - flag-icons          4:3 SVG flags (MIT)
 *
 * Outputs (in /public, served as static files):
 *   data/world-lo.json   simplified TopoJSON for the zoomed-out view
 *   data/world-hi.json   detailed TopoJSON for the zoomed-in view
 *   data/world-max.json  full-detail TopoJSON, loaded only when zoomed in very close
 *   data/countries.json  country registry: id, name, flag code, disputed, area in km²
 *   flags/atlas.png      every flag at 120x90 in one image (one download at startup)
 *   flags/atlas.json     flag code -> cell index in the atlas
 *   flags/lg/<code>.png  480x360 flags, loaded only when zoomed in
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as simplify from 'topojson-simplify';
import { quantize, feature } from 'topojson-client';
import { geoArea } from 'd3-geo';

/**
 * Area in steradians, polygon by polygon. A polygon whose ring winds the "wrong" way is
 * measured by d3 as the whole Earth minus the island (this made the Maldives bigger than the
 * Earth): any polygon over half the sphere is flipped back to the small side.
 */
function realArea(f) {
  const geom = f.geometry;
  if (!geom) return 0;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let total = 0;
  for (const coordinates of polys) {
    const a = geoArea({ type: 'Polygon', coordinates });
    total += a > 2 * Math.PI ? 4 * Math.PI - a : a;
  }
  return total;
}
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const iso = require('i18n-iso-countries');
const world = require('world-atlas/countries-10m.json');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DATA = path.join(ROOT, 'public/data');
const OUT_FLAGS = path.join(ROOT, 'public/flags');
const FLAG_SRC = path.join(ROOT, 'node_modules/flag-icons/flags/4x3');
const CUSTOM_FLAGS = path.join(ROOT, 'scripts/custom-flags');

/**
 * Natural Earth features that have no ISO numeric code (or share one).
 * id: stable game id. flag: flag-icons code, or "x-<name>" for scripts/custom-flags/<name>.svg.
 * disputed: drawn in neutral grey instead of a flag.
 */
const SPECIAL = {
  'Dhekelia': { id: 'dhekelia', flag: 'gb' },
  'Akrotiri': { id: 'akrotiri', flag: 'gb' },
  'Somaliland': { id: 'somaliland', flag: 'x-somaliland' },
  'Kosovo': { id: 'XK', flag: 'xk' },
  'USNB Guantanamo Bay': { id: 'guantanamo', flag: 'us' },
  'N. Cyprus': { id: 'n-cyprus', flag: 'x-ncyprus' },
  'Cyprus U.N. Buffer Zone': { id: 'cyprus-buffer', flag: 'un' },
  'Siachen Glacier': { id: 'siachen', flag: null, disputed: true },
  'Baikonur': { id: 'baikonur', flag: 'kz' },
  'Indian Ocean Ter.': { id: 'indian-ocean-ter', flag: 'au' },
  'Coral Sea Is.': { id: 'coral-sea', flag: 'au' },
  'Ashmore and Cartier Is.': { id: 'ashmore', flag: 'au' },
  'Spratly Is.': { id: 'spratly', flag: null, disputed: true },
  'Clipperton I.': { id: 'clipperton', flag: 'fr' },
  'Bajo Nuevo Bank': { id: 'bajo-nuevo', flag: null, disputed: true },
  'Serranilla Bank': { id: 'serranilla', flag: null, disputed: true },
  'Scarborough Reef': { id: 'scarborough', flag: null, disputed: true },
};

// Friendlier display names than Natural Earth's abbreviations.
const NAME_FIX = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'Central African Republic',
  'Dominican Rep.': 'Dominican Republic',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Eq. Guinea': 'Equatorial Guinea',
  'S. Sudan': 'South Sudan',
  'W. Sahara': 'Western Sahara',
  'Solomon Is.': 'Solomon Islands',
  'Falkland Is.': 'Falkland Islands',
  'Fr. S. Antarctic Lands': 'French Southern Lands',
  'Fr. Polynesia': 'French Polynesia',
  'Cayman Is.': 'Cayman Islands',
  'Marshall Is.': 'Marshall Islands',
  'Faeroe Is.': 'Faroe Islands',
  'Cook Is.': 'Cook Islands',
  'Turks and Caicos Is.': 'Turks and Caicos Islands',
  'British Virgin Is.': 'British Virgin Islands',
  'U.S. Virgin Is.': 'U.S. Virgin Islands',
  'N. Mariana Is.': 'Northern Mariana Islands',
  'Heard I. and McDonald Is.': 'Heard and McDonald Islands',
  'S. Geo. and the Is.': 'South Georgia',
  'Br. Indian Ocean Ter.': 'British Indian Ocean Territory',
  'St. Kitts and Nevis': 'Saint Kitts and Nevis',
  'St. Vin. and Gren.': 'Saint Vincent and the Grenadines',
  'St-Martin': 'Saint Martin',
  'St-Barthélemy': 'Saint Barthélemy',
  'St. Pierre and Miquelon': 'Saint Pierre and Miquelon',
  'Wallis and Futuna Is.': 'Wallis and Futuna',
  'São Tomé and Principe': 'São Tomé and Príncipe',
  'Antigua and Barb.': 'Antigua and Barbuda',
  'Pitcairn Is.': 'Pitcairn Islands',
  'N. Cyprus': 'Northern Cyprus',
  'Indian Ocean Ter.': 'Australian Indian Ocean Territories',
  'Coral Sea Is.': 'Coral Sea Islands',
  'Ashmore and Cartier Is.': 'Ashmore and Cartier Islands',
  'Spratly Is.': 'Spratly Islands',
  'Clipperton I.': 'Clipperton Island',
  'Cyprus U.N. Buffer Zone': 'Cyprus UN Buffer Zone',
  'USNB Guantanamo Bay': 'Guantanamo Bay',
  'Macedonia': 'North Macedonia',
  'eSwatini': 'Eswatini',
  'Fr. Guiana': 'French Guiana',
  'Åland': 'Åland Islands',
  'U.S. Minor Outlying Is.': 'U.S. Minor Outlying Islands',
};

// --- 1. Assign stable ids + flags -----------------------------------------
const registry = [];
const seen = new Set();
for (const g of world.objects.countries.geometries) {
  const rawName = g.properties.name;
  const special = SPECIAL[rawName];
  let id, flag, disputed = false;
  if (special) {
    ({ id, flag } = special);
    disputed = !!special.disputed;
  } else {
    const a2 = iso.numericToAlpha2(g.id);
    if (!a2) throw new Error(`No ISO mapping for ${g.id} ${rawName}`);
    id = a2;
    flag = a2.toLowerCase();
  }
  if (seen.has(id)) throw new Error(`Duplicate id ${id} (${rawName})`);
  seen.add(id);
  const name = NAME_FIX[rawName] ?? rawName;
  g.id = id;
  g.properties = { name };
  // Real-world area from the full-detail 10m data (steradians -> km²).
  const rawKm2 = realArea(feature(world, g)) * 6371.0088 ** 2;
  const areaKm2 = rawKm2 < 100 ? Math.round(rawKm2 * 100) / 100 : Math.round(rawKm2);
  registry.push({ id, name, flag, disputed, areaKm2 });
}
registry.sort((a, b) => a.name.localeCompare(b.name));

// --- 2. Two levels of detail ----------------------------------------------
// Small countries keep their full real shape at every level of detail. Without this,
// simplifying would erase places like Gibraltar (7 km²) or squash Monaco to a sliver.
const PROTECT_KM2 = 2500;
const protectedArcs = new Set();
{
  const areaById = new Map(registry.map((r) => [r.id, r.areaKm2]));
  const collect = (a) => (Array.isArray(a) ? a.forEach(collect) : protectedArcs.add(a < 0 ? ~a : a));
  for (const g of world.objects.countries.geometries) {
    if ((areaById.get(g.id) ?? Infinity) < PROTECT_KM2) collect(g.arcs ?? []);
  }
}

/** minWeight = 0 keeps every point (full detail). */
function lod(minWeight, quant, file) {
  const topo = JSON.parse(JSON.stringify(world));
  delete topo.objects.land;
  const pre = simplify.presimplify(topo);
  for (const i of protectedArcs) for (const p of pre.arcs[i]) p[2] = Infinity;
  // filter(() => true) keeps every ring, so tiny islands and micro-states survive.
  let t = minWeight > 0 ? simplify.filter(simplify.simplify(pre, minWeight), () => true) : pre;
  t.arcs = t.arcs.map((a) => a.map((p) => [p[0], p[1]])); // drop the weight coordinate
  t = quantize(t, quant);
  fs.mkdirSync(OUT_DATA, { recursive: true });
  fs.writeFileSync(path.join(OUT_DATA, file), JSON.stringify(t));
  return fs.statSync(path.join(OUT_DATA, file)).size;
}
// Weights are triangle areas in square degrees.
const loSize = lod(0.05, 1e4, 'world-lo.json');
const hiSize = lod(0.0005, 1e5, 'world-hi.json');
const maxSize = lod(0, 1e6, 'world-max.json');
fs.writeFileSync(path.join(OUT_DATA, 'countries.json'), JSON.stringify(registry, null, 1));

// --- 3. Rasterize flags (PNG is far cheaper than SVG for iPad Safari canvas) -
const flagCodes = [...new Set(registry.map((r) => r.flag).filter(Boolean))].sort();
const flagSvg = (code) =>
  fs.readFileSync(
    code.startsWith('x-')
      ? path.join(CUSTOM_FLAGS, `${code.slice(2)}.svg`)
      : path.join(FLAG_SRC, `${code}.svg`),
    'utf8',
  );

fs.rmSync(OUT_FLAGS, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT_FLAGS, 'lg'), { recursive: true });
for (const code of flagCodes) {
  const png = new Resvg(flagSvg(code), { fitTo: { mode: 'width', value: 480 } }).render().asPng();
  fs.writeFileSync(path.join(OUT_FLAGS, 'lg', `${code}.png`), png);
}

// Atlas: every flag at 120x90 in one image, so startup needs a single request.
// Each flag is rendered separately then pasted, so flag SVG ids can't collide.
const CELL_W = 120, CELL_H = 90, COLS = 16;
const rows = Math.ceil(flagCodes.length / COLS);
const atlasW = COLS * CELL_W, atlasH = rows * CELL_H;
const atlas = Buffer.alloc(atlasW * atlasH * 4);
const index = {};
flagCodes.forEach((code, i) => {
  index[code] = i;
  const img = new Resvg(flagSvg(code), { fitTo: { mode: 'width', value: CELL_W } }).render();
  const px = img.pixels; // RGBA (premultiplied is fine: flags are opaque)
  const ox = (i % COLS) * CELL_W, oy = Math.floor(i / COLS) * CELL_H;
  const h = Math.min(img.height, CELL_H);
  for (let y = 0; y < h; y++) {
    px.copy(atlas, ((oy + y) * atlasW + ox) * 4, y * img.width * 4, y * img.width * 4 + Math.min(img.width, CELL_W) * 4);
  }
});
const png = new PNG({ width: atlasW, height: atlasH });
atlas.copy(png.data);
fs.writeFileSync(path.join(OUT_FLAGS, 'atlas.png'), PNG.sync.write(png));
fs.writeFileSync(path.join(OUT_FLAGS, 'atlas.json'), JSON.stringify({ cellW: CELL_W, cellH: CELL_H, cols: COLS, width: atlasW, height: atlasH, index }));

console.log(`countries: ${registry.length}, flags: ${flagCodes.length}`);
console.log(`world-lo ${(loSize / 1024).toFixed(0)} KB, world-hi ${(hiSize / 1024).toFixed(0)} KB, world-max ${(maxSize / 1024).toFixed(0)} KB`);

/**
 * Writes public/third-party-notices.txt — the licence notices for everything the game ships.
 * MIT / ISC / OFL licences require their notice to travel with the software, so this file
 * is included in every build (website and future iPad app).
 *
 * Run with:  npm run notices   (also part of `npm run prepare-data`)
 * Re-run whenever a runtime dependency is added or updated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** Runtime libraries bundled into the game, plus their own runtime dependencies. */
const seen = new Set();
const order = [];
function walk(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const dir = path.join(ROOT, 'node_modules', name);
  if (!fs.existsSync(dir)) return;
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  order.push({ name, dir, p });
  for (const dep of Object.keys(p.dependencies ?? {})) walk(dep);
}
Object.keys(pkg.dependencies).forEach(walk);

/** Packages whose files (not code) are shipped: map data and flags. */
for (const name of ['world-atlas', 'flag-icons']) walk(name);

const licenceText = (dir) => {
  const f = fs.readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').trim() : null;
};

/** Landmark photos (public/landmarks/credits.json, written when the photos are added). */
function landmarkPhotos() {
  const f = path.join(ROOT, 'public/landmarks/credits.json');
  if (!fs.existsSync(f)) return '';
  const credits = JSON.parse(fs.readFileSync(f, 'utf8'));
  let s = `LANDMARK PHOTOS
---------------
From Wikimedia Commons (https://commons.wikimedia.org). Each photo was resized and cropped
to a square for the game. Licences: CC0 / Public domain (no conditions), CC BY and CC BY-SA
(https://creativecommons.org/licenses/). Thank you to every photographer!

`;
  for (const [id, c] of Object.entries(credits)) {
    s += `- ${c.name}: "${c.title}" by ${c.credit}, ${c.licence}\n  ${c.page}\n`;
  }
  return s + '\n';
}

let out = `Leighton's Map Painter — third-party notices
=============================================

Leighton's Map Painter uses the free and open-source work listed below. Thank you!

MAP DATA
--------
Country borders and capital cities: Natural Earth (https://www.naturalearthdata.com).
Natural Earth data is in the public domain. Converted to TopoJSON by the world-atlas
project (ISC licence, below). Country areas and borders are approximate. Borders follow
Natural Earth's de facto ("on the ground") boundaries and do not express any political view.

FLAGS
-----
Flag images: flag-icons by Panayiotis Lipiridis and contributors (MIT licence, below).
Flags of Somaliland and Northern Cyprus were drawn for this game.

FONT
----
Lilita One by Juan Montoreano, SIL Open Font License 1.1 (below).

${landmarkPhotos()}SOFTWARE LIBRARIES
------------------
`;
for (const { name, dir, p } of order) {
  if (name.startsWith('@types/')) continue;
  out += `\n\n=== ${name} ${p.version} — ${p.license ?? 'see licence'} ===\n\n`;
  out += licenceText(dir) ?? `Licence: ${p.license}. ${p.homepage ?? ''}`;
}
fs.writeFileSync(path.join(ROOT, 'public/third-party-notices.txt'), out + '\n');
console.log(`third-party-notices.txt: ${order.length} packages`);

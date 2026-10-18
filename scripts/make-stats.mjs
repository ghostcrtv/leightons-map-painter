/**
 * Builds public/data/stats.json — the STARTER power ratings for every country/territory.
 *
 * These are approximate GAMEPLAY ESTIMATES, loosely inspired by public information about
 * armed forces and economies. They are not official, measured or validated figures.
 * Players can edit any rating in the game, or import their own spreadsheet (CSV).
 *
 * Each rating is 1–100: [attack, defense, money/resources, military].
 * Run with:  npm run stats
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/countries.json'), 'utf8'));

// ---------------------------------------------------------------- hand-set countries
// prettier-ignore
const EXPLICIT = {
  US: [96, 94, 98, 99], CN: [90, 93, 95, 94], RU: [89, 90, 70, 92], IN: [82, 86, 80, 86],
  GB: [83, 80, 82, 84], FR: [83, 80, 82, 84], KR: [78, 84, 80, 81], JP: [72, 86, 86, 80],
  TR: [77, 79, 64, 79], PK: [72, 78, 44, 75], IT: [72, 74, 78, 75], BR: [66, 74, 72, 71],
  DE: [74, 78, 90, 75], IL: [82, 84, 62, 79], IR: [70, 76, 48, 72], EG: [66, 72, 48, 68],
  UA: [70, 80, 40, 72], ID: [60, 72, 66, 65], AU: [68, 76, 80, 70], ES: [64, 70, 74, 67],
  PL: [68, 74, 66, 70], SA: [62, 66, 82, 66], CA: [62, 70, 82, 65], TW: [64, 82, 74, 67],
  VN: [60, 76, 50, 63], KP: [68, 78, 16, 67], TH: [56, 66, 56, 59], DZ: [56, 64, 46, 59],
  MX: [50, 60, 64, 53], GR: [58, 70, 54, 61], SE: [62, 72, 74, 64], NO: [58, 70, 82, 60],
  NL: [58, 64, 82, 60], AR: [46, 58, 50, 48], PH: [46, 62, 50, 49], MM: [50, 66, 30, 52],
  NG: [50, 58, 52, 52], BD: [48, 62, 46, 51], MA: [52, 62, 46, 54], IQ: [52, 58, 50, 53],
  SG: [56, 72, 80, 58], CH: [46, 82, 88, 52], AE: [60, 62, 84, 62], QA: [46, 52, 84, 46],
  KZ: [50, 62, 58, 52], CO: [48, 62, 50, 50], CL: [48, 64, 56, 50], PE: [44, 60, 46, 46],
  VE: [40, 58, 34, 44], ZA: [50, 62, 58, 52], ET: [50, 60, 32, 52], AZ: [54, 62, 48, 55],
  BY: [52, 64, 38, 54], RO: [54, 62, 56, 56], HU: [48, 58, 58, 50], CZ: [50, 58, 66, 52],
  PT: [50, 58, 62, 52], BE: [48, 54, 76, 50], AT: [44, 60, 78, 46], DK: [52, 58, 78, 54],
  FI: [56, 78, 72, 58], SK: [42, 54, 54, 44], BG: [46, 56, 46, 48], RS: [48, 60, 42, 50],
  HR: [44, 58, 48, 46], IE: [30, 48, 80, 32], NZ: [44, 62, 70, 46], MY: [48, 62, 60, 50],
  SY: [44, 58, 18, 46], JO: [46, 58, 40, 48], KW: [44, 52, 74, 44], OM: [44, 58, 60, 46],
  LY: [38, 50, 40, 40], SD: [42, 52, 26, 44], AF: [38, 62, 14, 40], UZ: [48, 58, 40, 50],
  TM: [40, 54, 42, 42], GE: [44, 60, 36, 46], AM: [44, 62, 34, 46], CU: [40, 62, 24, 42],
  AO: [42, 54, 40, 44], KE: [40, 52, 40, 42], TZ: [36, 52, 32, 38], CD: [32, 46, 30, 34],
  YE: [36, 56, 14, 38], LK: [36, 54, 36, 38], NP: [30, 62, 26, 32], MN: [32, 58, 34, 34],
  LB: [32, 50, 26, 34], TN: [38, 52, 38, 40], PY: [30, 50, 34, 32], BO: [32, 56, 32, 34],
  EC: [38, 54, 40, 40], UY: [30, 50, 48, 32], EE: [42, 56, 56, 44], LV: [38, 52, 50, 40],
  LT: [42, 56, 52, 44], SI: [36, 52, 62, 38], AL: [30, 50, 30, 32], MK: [30, 50, 30, 32],
  BA: [28, 50, 28, 30], ME: [26, 48, 30, 28], MD: [24, 44, 22, 26], XK: [24, 44, 22, 26],
  CY: [30, 48, 58, 32], MT: [22, 44, 60, 24], LU: [22, 42, 90, 24], IS: [12, 40, 72, 14],
  BH: [40, 48, 64, 40], BN: [26, 46, 70, 28], RW: [44, 56, 30, 46],
  // No army, or a very small one
  CR: [6, 40, 50, 6], PA: [12, 40, 58, 12],
  // Rich territories with no army of their own
  HK: [8, 30, 78, 8], MO: [6, 26, 74, 6], PR: [10, 30, 52, 10],
  // Ice and cold make these very hard to attack
  GL: [6, 60, 40, 6], AQ: [1, 95, 20, 1],
};

// ---------------------------------------------------------------- tiers for everyone else
// prettier-ignore
const TIERS = {
  T6: { v: [38, 52, 32, 40], ids: 'CM CI GH UG ZM ZW MZ MG SN ML NE BF TD MR SO SS ER DO GT HN SV NI BW NA GA CG KH LA TJ KG PG' },
  T7: { v: [30, 46, 30, 32], ids: 'CF BI MW BJ TG SL LR GN GW GM LS SZ DJ HT JM TT GY SR BZ BT TL FJ GQ somaliland PS EH n-cyprus' },
  T9: { v: [12, 30, 30, 14], ids: 'AD MC SM LI VA KN LC VC GD DM AG BB BS MV SC MU CV ST KM TO WS KI TV NR FM MH PW SB VU' },
  // Territories that belong to another country (their "owner" defends them in real life)
  TD: { v: [8, 24, 30, 8], ids: 'akrotiri dhekelia AX AS AI AW ashmore indian-ocean-ter baikonur BM IO VG KY clipperton CK coral-sea CW cyprus-buffer FK FO PF TF GI GU guantanamo GG HM IM JE MS NC NU NF MP PN BL SH MF PM SX GS TC UM VI WF' },
  // Uninhabited or disputed specks
  TX: { v: [2, 18, 6, 2], ids: 'bajo-nuevo serranilla scarborough spratly siachen' },
};

/** Small, repeatable variation so countries in the same tier aren't identical. */
function jitter(id, i) {
  let h = 2166136261;
  for (const ch of `${id}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 7) - 3; // -3 … +3
}
const clamp = (v) => Math.max(1, Math.min(100, Math.round(v)));

const out = {};
for (const [tier, { v, ids }] of Object.entries(TIERS)) {
  for (const id of ids.split(/\s+/)) {
    out[id] = v.map((x, i) => clamp(x + (tier === 'TX' ? 0 : jitter(id, i))));
  }
}
Object.assign(out, EXPLICIT);

const missing = registry.filter((c) => !out[c.id]).map((c) => c.id);
const unknown = Object.keys(out).filter((id) => !registry.some((c) => c.id === id));
if (missing.length || unknown.length) {
  console.error('Missing ratings for:', missing.join(' ') || '-', '\nUnknown ids:', unknown.join(' ') || '-');
  process.exit(1);
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(
  path.join(ROOT, 'public/data/stats.json'),
  JSON.stringify({ note: 'Approximate gameplay estimates, not official figures. [attack, defense, money, military]', ratings: sorted }),
);
console.log(`stats.json: ${Object.keys(sorted).length} countries`);

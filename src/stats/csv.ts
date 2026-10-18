/**
 * Spreadsheet import/export for ratings (CSV — Excel, Numbers and Google Sheets can all
 * save and open it). Pure logic, unit-tested.
 *
 * Import is forgiving, because people name columns differently:
 *   country column: "id", "code", "iso", "country", "name", "nation"
 *   ratings:        attack/offense · defense/defence · money/resources/economy · military/power
 * Countries are matched by ISO code first (DE, US…), then by name (accents, case and common
 * nicknames like "USA" or "UK" are handled). Power Score columns are ignored: it is always
 * calculated from the four ratings.
 */
import { RATING_KEYS, clampRating, powerScore, type Ratings, type RatingKey } from './ratings';

export interface CsvCountry {
  id: string;
  name: string;
}

export interface ImportResult {
  rows: { id: string; ratings: Partial<Ratings> }[];
  /** Rows whose country couldn't be matched (shown to the player). */
  unknown: string[];
  /** Which rating columns were found. */
  columns: RatingKey[];
  error?: string;
}

/** Split CSV text into rows of cells (handles quotes, commas in quotes, CRLF, ; or tab separators). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const COLUMN_NAMES: Record<RatingKey | 'country', string[]> = {
  country: ['id', 'code', 'iso', 'iso code', 'country', 'country name', 'name', 'nation', 'territory'],
  attack: ['attack', 'atk', 'offense', 'offence', 'attack rating'],
  defense: ['defense', 'defence', 'def', 'defense rating', 'defence rating'],
  money: ['money', 'resources', 'money resources', 'economy', 'economic', 'res', 'wealth'],
  military: ['military', 'mil', 'military power', 'overall military', 'overall military power', 'military rating'],
};

/** Extra names people commonly use. */
const NICKNAMES: Record<string, string> = {
  usa: 'US', 'u s a': 'US', 'united states of america': 'US', america: 'US', 'u s': 'US',
  uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', 'united kingdom of great britain and northern ireland': 'GB',
  'south korea': 'KR', 'republic of korea': 'KR', korea: 'KR', 'north korea': 'KP', dprk: 'KP',
  russia: 'RU', 'russian federation': 'RU', 'czech republic': 'CZ', czechia: 'CZ',
  'ivory coast': 'CI', 'cote d ivoire': 'CI', 'democratic republic of the congo': 'CD', drc: 'CD', 'dr congo': 'CD',
  'republic of the congo': 'CG', 'congo brazzaville': 'CG', burma: 'MM', myanmar: 'MM', persia: 'IR',
  holland: 'NL', 'the netherlands': 'NL', uae: 'AE', 'united arab emirates': 'AE', turkiye: 'TR',
  swaziland: 'SZ', eswatini: 'SZ', 'east timor': 'TL', macedonia: 'MK', 'cape verde': 'CV',
  vatican: 'VA', 'vatican city': 'VA', 'holy see': 'VA', 'bosnia': 'BA', 'trinidad': 'TT',
};

export function parseRatingsCsv(text: string, countries: CsvCountry[]): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], unknown: [], columns: [], error: 'The file is empty or has only one line.' };
  const header = rows[0].map(norm);
  const find = (key: keyof typeof COLUMN_NAMES) => header.findIndex((h) => COLUMN_NAMES[key].includes(h));
  let countryCol = find('country');
  if (countryCol < 0) countryCol = 0;
  const cols = RATING_KEYS.map((k) => [k, find(k)] as const).filter(([, i]) => i >= 0);
  if (cols.length === 0) {
    return {
      rows: [],
      unknown: [],
      columns: [],
      error: 'No rating columns found. Use column names like Country, Attack, Defense, Money, Military.',
    };
  }

  const byId = new Map(countries.map((c) => [c.id.toLowerCase(), c.id]));
  const byName = new Map(countries.map((c) => [norm(c.name), c.id]));
  const resolve = (raw: string): string | null => {
    const t = raw.trim();
    if (!t) return null;
    const id = byId.get(t.toLowerCase());
    if (id) return id;
    const n = norm(t);
    return byName.get(n) ?? (NICKNAMES[n] && byId.has(NICKNAMES[n].toLowerCase()) ? NICKNAMES[n] : null);
  };

  const result: ImportResult = { rows: [], unknown: [], columns: cols.map(([k]) => k) };
  for (const r of rows.slice(1)) {
    const name = r[countryCol] ?? '';
    const id = resolve(name);
    if (!id) {
      if (name.trim()) result.unknown.push(name.trim());
      continue;
    }
    const ratings: Partial<Ratings> = {};
    for (const [k, i] of cols) {
      const v = parseFloat((r[i] ?? '').replace(',', '.'));
      if (isFinite(v)) ratings[k] = clampRating(v);
    }
    if (Object.keys(ratings).length) result.rows.push({ id, ratings });
  }
  return result;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** All ratings as a spreadsheet: Code, Country, Attack, Defense, Money, Military, Power. */
export function ratingsToCsv(countries: CsvCountry[], get: (id: string) => Ratings): string {
  const lines = ['Code,Country,Attack,Defense,Money,Military,Power'];
  for (const c of countries) {
    const r = get(c.id);
    lines.push([c.id, c.name, r.attack, r.defense, r.money, r.military, powerScore(r)].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

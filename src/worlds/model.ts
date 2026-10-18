/**
 * Saved worlds (Phase 6). Pure logic: no storage, no DOM — unit-tested.
 *
 * A world = the original Earth + everything that happened in it:
 *   territory  — the action list (painting, battles, disasters, years…); undo/redo replay it
 *   names      — renamed countries and capitals (Leighton's names)
 *   customs    — countries the player invented (name + flag design)
 * Ratings edits (Edit Stats / spreadsheet) are the player's own sheet and are shared by all worlds.
 *
 * Saves are versioned. `migrateWorld` upgrades any older save step by step and never throws:
 * a broken file is reported, never half-loaded.
 */
import { SAVE_FORMAT_VERSION, type SavedTerritory } from '../territory/Territory';

export const WORLD_FORMAT_VERSION = 2;
export const BACKUP_KIND = 'leightons-map-painter-backup';

export interface FlagDesign {
  /** 'h' = horizontal stripes, 'v' = vertical stripes, 'cross', 'diag', 'plain' */
  layout: 'h' | 'v' | 'cross' | 'diag' | 'plain';
  colors: string[];
  /** Optional emoji/symbol in the middle (e.g. ⭐, 🦁). */
  symbol?: string;
  symbolColor?: string;
}

export interface CustomCountry {
  /** Slot id, e.g. "custom-3" (fixed slots so the map's measuring grid never changes size). */
  id: string;
  name: string;
  capital?: string;
  flag: FlagDesign;
}

export interface SavedWorld {
  formatVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  territory: SavedTerritory;
  names: Record<string, { name?: string; capital?: string }>;
  customs: CustomCountry[];
}

/** Light summary for the worlds list (no action list). */
export interface WorldMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Number of things that happened (actions). */
  changes: number;
  year: number;
}

export function makeId(): string {
  const b = new Uint8Array(8);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 256);
  }
  return 'w-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function newWorld(name: string, now = Date.now()): SavedWorld {
  return {
    formatVersion: WORLD_FORMAT_VERSION,
    id: makeId(),
    name: cleanName(name) || 'My World',
    createdAt: now,
    updatedAt: now,
    territory: { formatVersion: SAVE_FORMAT_VERSION, actions: [] },
    names: {},
    customs: [],
  };
}

export function cleanName(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 40);
}

/** Number of 'year' markers in the action list (Simulate 1 year). */
export function yearOf(t: SavedTerritory): number {
  let y = 0;
  for (const a of t.actions ?? []) {
    const k = (a as { kind?: string }).kind;
    if (k === 'resetWorld') y = 0;
    else if (k === 'year') y++;
  }
  return y;
}

export function metaOf(w: SavedWorld): WorldMeta {
  return { id: w.id, name: w.name, createdAt: w.createdAt, updatedAt: w.updatedAt, changes: w.territory.actions.length, year: yearOf(w.territory) };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#[0-9a-f]{6}$/i;

function cleanFlag(f: unknown): FlagDesign {
  const o = isObj(f) ? f : {};
  const layouts = ['h', 'v', 'cross', 'diag', 'plain'] as const;
  const layout = layouts.includes(o.layout as never) ? (o.layout as FlagDesign['layout']) : 'h';
  const colors = Array.isArray(o.colors) ? o.colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 4) : [];
  return {
    layout,
    colors: colors.length ? colors : ['#2d7ff9', '#ffffff', '#e8463a'],
    symbol: typeof o.symbol === 'string' ? o.symbol.slice(0, 4) : undefined,
    symbolColor: typeof o.symbolColor === 'string' && HEX.test(o.symbolColor) ? o.symbolColor : undefined,
  };
}

/**
 * Turn anything loaded (from storage or a backup file) into a current-format world, or null if
 * it isn't a world. Version 1 = the old single autosave ({formatVersion: 1, actions}).
 */
export function migrateWorld(raw: unknown, now = Date.now()): SavedWorld | null {
  if (!isObj(raw)) return null;
  // The old single autosave (before saved worlds existed).
  if (Array.isArray(raw.actions) && !raw.territory) {
    const w = newWorld('My World', now);
    w.territory = { formatVersion: SAVE_FORMAT_VERSION, actions: raw.actions as SavedTerritory['actions'] };
    return w;
  }
  if (!isObj(raw.territory) || !Array.isArray(raw.territory.actions)) return null;
  const names: SavedWorld['names'] = {};
  if (isObj(raw.names)) {
    for (const [id, v] of Object.entries(raw.names)) {
      if (!isObj(v)) continue;
      const name = typeof v.name === 'string' ? cleanName(v.name) : undefined;
      const capital = typeof v.capital === 'string' ? cleanName(v.capital) : undefined;
      if (name || capital) names[id] = { ...(name ? { name } : {}), ...(capital ? { capital } : {}) };
    }
  }
  const customs: CustomCountry[] = [];
  if (Array.isArray(raw.customs)) {
    for (const c of raw.customs) {
      if (!isObj(c) || typeof c.id !== 'string' || !/^custom-\d+$/.test(c.id)) continue;
      customs.push({ id: c.id, name: cleanName(String(c.name ?? '')) || 'New Country', capital: typeof c.capital === 'string' ? cleanName(c.capital) : undefined, flag: cleanFlag(c.flag) });
    }
  }
  return {
    formatVersion: WORLD_FORMAT_VERSION,
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
    name: cleanName(String(raw.name ?? '')) || 'My World',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    territory: { formatVersion: SAVE_FORMAT_VERSION, actions: raw.territory.actions as SavedTerritory['actions'] },
    names,
    customs,
  };
}

/** A backup file holding one or more worlds. */
export function toBackupFile(worlds: SavedWorld[], now = Date.now()): string {
  return JSON.stringify({ kind: BACKUP_KIND, formatVersion: WORLD_FORMAT_VERSION, savedAt: now, worlds }, null, 1);
}

/**
 * Read a backup file. Every world gets a NEW id, so importing never overwrites a world
 * that is already on this device.
 */
export function parseBackup(text: string, now = Date.now()): { worlds: SavedWorld[]; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { worlds: [], error: 'This file isn’t a Map Painter backup (it can’t be read).' };
  }
  const list = isObj(data) && Array.isArray(data.worlds) ? data.worlds : [data];
  const worlds = list.map((w) => migrateWorld(w, now)).filter((w): w is SavedWorld => !!w);
  if (!worlds.length) return { worlds: [], error: 'No worlds were found in this file.' };
  for (const w of worlds) w.id = makeId();
  return { worlds };
}

/** "Copy of Leighton's World", "Copy of Leighton's World 2", … */
export function copyName(name: string, existing: string[]): string {
  const base = `Copy of ${name}`.slice(0, 40);
  if (!existing.includes(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, 36)} ${i}`;
    if (!existing.includes(n)) return n;
  }
}

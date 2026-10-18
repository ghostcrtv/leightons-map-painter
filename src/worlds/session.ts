/**
 * The world being played, and the list of saved worlds.
 *
 * - On start: opens the last world played. The very first time, the old single autosave
 *   (from before saved worlds existed) becomes "My World" — nothing is ever lost.
 * - Every change is saved automatically to the current world (about a second later, and
 *   straight away when the app goes into the background).
 * - Worlds are never overwritten by imports (imported worlds get new ids) and never deleted
 *   without the player confirming.
 */
import { useGame } from '../game/store';
import type { Territory } from '../territory/Territory';
import { readSetting, writeSetting } from '../utils/settings';
import { saveTextFile } from '../utils/files';
import { copyName, metaOf, migrateWorld, newWorld, parseBackup, toBackupFile, type SavedWorld, type WorldMeta } from './model';
import { getAllWorlds, getWorld, putWorld, removeWorld, requestPersistence } from './storage';
import { unlock } from '../game/achievements';

const OLD_AUTOSAVE_KEY = 'lmp.v1.autosave';
let territory: Territory | null = null;
let current: SavedWorld | null = null;
let saveTimer = 0;
let loading = false;
const openedListeners = new Set<(w: SavedWorld) => void>();

/** Other parts of the game (custom countries, renamed countries) react when a world opens. */
export function onWorldOpened(fn: (w: SavedWorld) => void) {
  openedListeners.add(fn);
  return () => openedListeners.delete(fn);
}

export const currentWorld = () => current;

/** Change something stored on the world itself (names, custom countries) and save. */
export function updateCurrentWorld(change: (w: SavedWorld) => void) {
  if (!current) return;
  change(current);
  scheduleSave(0);
  for (const fn of openedListeners) fn(current);
  useGame.getState().worldChanged();
}

export async function initWorlds(t: Territory) {
  territory = t;
  requestPersistence();
  let worlds = (await getAllWorlds()).map((w) => migrateWorld(w)).filter((w): w is SavedWorld => !!w);
  if (!worlds.length) {
    // First run with saved worlds: bring over the old autosave (or start fresh).
    let first = newWorld('My World');
    try {
      const raw = localStorage.getItem(OLD_AUTOSAVE_KEY);
      const migrated = raw ? migrateWorld(JSON.parse(raw)) : null;
      if (migrated) first = migrated;
    } catch {
      /* no old save */
    }
    await safePut(first);
    worlds = [first];
  }
  const lastId = readSetting<string | null>('currentWorld', null);
  const pick = worlds.find((w) => w.id === lastId) ?? [...worlds].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  open(pick);

  t.subscribe(() => {
    if (loading || t.painting || !current) return;
    scheduleSave(900);
  });
  const flush = () => {
    if (document.visibilityState === 'hidden') scheduleSave(0);
  };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', () => scheduleSave(0));
}

function open(w: SavedWorld) {
  if (!territory) return;
  loading = true;
  current = w;
  try {
    for (const fn of openedListeners) fn(w); // custom countries must exist before the actions replay
    territory.load(w.territory);
  } finally {
    loading = false;
  }
  writeSetting('currentWorld', w.id);
  const st = useGame.getState();
  st.setWorld({ id: w.id, name: w.name });
  st.worldChanged();
}

function scheduleSave(delay: number) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, delay);
}

async function saveNow() {
  if (!current || !territory) return;
  current.territory = territory.toJSON();
  current.updatedAt = Date.now();
  await safePut(current);
}

async function safePut(w: SavedWorld) {
  try {
    await putWorld(w);
    useGame.getState().setSaveProblem(null);
  } catch {
    useGame.getState().setSaveProblem('Your world could not be saved on this device (storage may be full). Make a backup file from the Worlds menu.');
  }
}

export async function listWorlds(): Promise<WorldMeta[]> {
  await saveNow();
  return (await getAllWorlds())
    .map((w) => migrateWorld(w))
    .filter((w): w is SavedWorld => !!w)
    .map(metaOf)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function openWorld(id: string) {
  if (current?.id === id) return;
  await saveNow();
  const w = migrateWorld(await getWorld(id));
  if (w) open(w);
}

export async function createWorld(name: string) {
  await saveNow();
  const w = newWorld(name);
  await safePut(w);
  open(w);
  if ((await getAllWorlds()).length >= 3) unlock('world-builder');
}

export async function renameWorld(id: string, name: string) {
  const w = current?.id === id ? current : migrateWorld(await getWorld(id));
  if (!w) return;
  w.name = name.trim().slice(0, 40) || w.name;
  w.updatedAt = Date.now();
  if (current?.id === id) {
    current.name = w.name;
    useGame.getState().setWorld({ id, name: w.name });
    await saveNow();
  } else await safePut(w);
}

export async function duplicateWorld(id: string) {
  await saveNow();
  const src = migrateWorld(await getWorld(id));
  if (!src) return;
  const names = (await listWorlds()).map((m) => m.name);
  const copy = migrateWorld(JSON.parse(JSON.stringify(src)))!;
  copy.id = newWorld('x').id;
  copy.name = copyName(src.name, names);
  copy.createdAt = copy.updatedAt = Date.now();
  await safePut(copy);
}

export async function deleteWorld(id: string) {
  await removeWorld(id);
  if (current?.id === id) {
    const rest = await listWorlds();
    if (rest.length) {
      const w = migrateWorld(await getWorld(rest[0].id));
      if (w) return open(w);
    }
    const fresh = newWorld('My World');
    await safePut(fresh);
    open(fresh);
  }
}

const fileName = (name: string) =>
  `${name.replace(/[^a-z0-9 _-]+/gi, '').trim().replace(/\s+/g, '-') || 'world'}-${new Date().toISOString().slice(0, 10)}.json`;

export async function exportWorld(id: string) {
  await saveNow();
  const w = migrateWorld(await getWorld(id));
  if (w) saveTextFile(fileName(w.name), toBackupFile([w]), 'application/json');
}

export async function exportAll() {
  await saveNow();
  const all = (await getAllWorlds()).map((w) => migrateWorld(w)).filter((w): w is SavedWorld => !!w);
  saveTextFile(fileName('All-Map-Painter-worlds'), toBackupFile(all), 'application/json');
}

/** Add the worlds from a backup file (as new worlds). Returns how many, or an error message. */
export async function importBackup(text: string): Promise<{ count: number; error?: string }> {
  const { worlds, error } = parseBackup(text);
  if (error) return { count: 0, error };
  const names = (await listWorlds()).map((m) => m.name);
  for (const w of worlds) {
    if (names.includes(w.name)) w.name = copyName(w.name, names).replace(/^Copy of /, 'Imported ');
    names.push(w.name);
    w.updatedAt = Date.now();
    await safePut(w);
  }
  return { count: worlds.length };
}

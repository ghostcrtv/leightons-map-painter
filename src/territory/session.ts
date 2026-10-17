/**
 * Creates the Territory for the loaded world, keeps the UI store in sync with it, and
 * autosaves the current world to this browser so a reload never loses Leighton's work.
 *
 * Phase 6 replaces the single autosave with named save slots (IndexedDB) and backup files;
 * the saved format (SavedTerritory) stays the same, so autosaves carry over.
 */
import { useGame } from '../game/store';
import type { World } from '../map/world';
import { Territory, type SavedTerritory } from './Territory';
import { TerritoryGrid } from './TerritoryGrid';

/** About 2,048 cells across the map (13–20 km each): accurate and light enough for an iPad. */
const GRID_COLS = 2048;
const AUTOSAVE_KEY = 'lmp.v1.autosave';

let current: Territory | null = null;

export function getTerritory(): Territory | null {
  return current;
}

export function createTerritory(world: World): Territory {
  // Grid order is the country registry order; codes are index + 1.
  const shapes = world.countries;
  const grid = new TerritoryGrid({
    worldWidth: world.width,
    worldHeight: world.height,
    cols: GRID_COLS,
    km2PerUnit2At: world.km2PerUnit2At,
    countries: shapes.map((c) => ({ polys: c.polys, realKm2: c.info.areaKm2, point: c.labelPoint })),
  });
  const t = new Territory(
    grid,
    shapes.map((c) => c.info.id),
  );

  const saved = readAutosave();
  if (saved) t.load(saved);

  // Keep the UI in step. While a finger is painting, update at most 4 times a second
  // (measuring every country on every brush movement would slow painting down).
  let timer = 0;
  let saveTimer = 0;
  const push = () => {
    timer = 0;
    useGame.getState().territoryChanged({ canUndo: t.canUndo, canRedo: t.canRedo });
  };
  t.subscribe(() => {
    if (t.painting) {
      if (!timer) timer = window.setTimeout(push, 250);
    } else {
      clearTimeout(timer);
      push();
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => writeAutosave(t.toJSON()), 800);
    }
  });
  current = t;
  push();
  useGame.getState().setTerritoryReady();
  return t;
}

function readAutosave(): SavedTerritory | null {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedTerritory) : null;
  } catch {
    return null;
  }
}

function writeAutosave(data: SavedTerritory) {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // Storage full or blocked: the game keeps working, the world just isn't remembered.
    console.warn('Could not autosave the world.', e);
  }
}

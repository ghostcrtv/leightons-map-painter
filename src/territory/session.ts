/**
 * Creates the Territory for the loaded world and keeps the UI store in sync with it.
 * Saving lives in src/worlds/session.ts (named saved worlds).
 */
import { useGame } from '../game/store';
import type { World } from '../map/world';
import { Territory } from './Territory';
import { TerritoryGrid } from './TerritoryGrid';
import { CUSTOM_SLOT_IDS } from '../custom/slots';

/** About 2,048 cells across the map (13–20 km each): accurate and light enough for an iPad. */
const GRID_COLS = 2048;

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
    countries: [
      ...shapes.map((c) => ({ polys: c.polys, realKm2: c.info.areaKm2, point: c.labelPoint })),
      // Custom countries (invented by the player) start with no land of their own.
      ...CUSTOM_SLOT_IDS.map(() => ({ polys: [], realKm2: 0, point: [-1, -1] as [number, number], virtual: true })),
    ],
  });
  const t = new Territory(grid, [...shapes.map((c) => c.info.id), ...CUSTOM_SLOT_IDS]);

  // Keep the UI in step. While a finger is painting, update at most 4 times a second
  // (measuring every country on every brush movement would slow painting down).
  let timer = 0;
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
    }
  });
  current = t;
  push();
  useGame.getState().setTerritoryReady();
  return t;
}

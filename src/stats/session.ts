/**
 * Loads the starter ratings, keeps the player's edits saved in this browser, and tells the
 * UI when ratings change. (Phase 6 moves saving into named save slots + the storage adapter.)
 */
import { useGame } from '../game/store';
import { readSetting, writeSetting } from '../utils/settings';
import { StatsBook, type SavedStats } from './ratings';

const SAVE_KEY = 'statsEdits';
let book: StatsBook | null = null;

export function getStats(): StatsBook | null {
  return book;
}

export async function loadStats(baseUrl: string, ids: string[]): Promise<StatsBook> {
  let defaults: Record<string, number[]> = {};
  try {
    const res = await fetch(`${baseUrl}data/stats.json`);
    if (res.ok) defaults = (await res.json()).ratings ?? {};
  } catch {
    /* ratings are an extra: the map still works without them */
  }
  const b = new StatsBook(defaults, ids);
  b.load(readSetting<SavedStats | null>(SAVE_KEY, null));
  b.subscribe(() => {
    writeSetting(SAVE_KEY, b.toJSON());
    useGame.getState().statsChanged();
  });
  book = b;
  useGame.getState().statsChanged();
  return b;
}

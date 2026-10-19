/**
 * Which landmarks the player has discovered (tapped). Player-wide, like badges, and saved on
 * the device. Discovering landmarks unlocks two badges.
 */
import { LANDMARKS } from '../data/landmarks';
import { readSetting, writeSetting } from '../utils/settings';
import { unlock } from './achievements';

let seen: string[] = readSetting<string[]>('landmarksSeen', []);

export const discoveredCount = () => seen.filter((id) => LANDMARKS.some((l) => l.id === id)).length;
export const isDiscovered = (id: string) => seen.includes(id);

/** Remember a landmark as discovered. Returns true the first time. */
export function discover(id: string): boolean {
  if (seen.includes(id)) return false;
  seen = [...seen, id];
  writeSetting('landmarksSeen', seen);
  const n = discoveredCount();
  if (n >= 10) unlock('sightseer');
  if (n >= LANDMARKS.length) unlock('globetrotter');
  return true;
}

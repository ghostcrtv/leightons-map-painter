/**
 * Achievements (badges). Unlocked badges belong to the PLAYER (kept across all worlds) and
 * are saved on the device. Most are checked automatically from what happened in the world;
 * a few are unlocked by actions (spinning wheels, watching replays, winning a world war).
 */
import { readSetting, writeSetting } from '../utils/settings';
import { useGame } from './store';
import { sound } from '../audio/sound';
import type { Territory } from '../territory/Territory';

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  how: string;
}

export const BADGES: Badge[] = [
  { id: 'first-paint', emoji: '🖌️', name: 'First Paint', how: 'Paint some land for a country' },
  { id: 'first-conquest', emoji: '🏆', name: 'Conqueror', how: 'Conquer a whole country in a battle' },
  { id: 'underdog', emoji: '😱', name: 'Underdog Victory', how: 'See a weaker country win a battle' },
  { id: 'peacemaker', emoji: '🕊️', name: 'Peacemaker', how: '3 peace deals in one world' },
  { id: 'alliances', emoji: '🤝', name: 'Best Friends', how: '3 alliances in one world' },
  { id: 'survivor', emoji: '🔥', name: 'Survivor', how: 'One country hit by 3 disasters' },
  { id: 'disaster-collector', emoji: '🌪️', name: 'Disaster Collector', how: '5 different kinds of disaster in one world' },
  { id: 'island-builder', emoji: '🏝️', name: 'Island Builder', how: 'Build new land 5 times' },
  { id: 'eroder', emoji: '🌊', name: 'Sea Monster', how: 'Erode land into the sea' },
  { id: 'sea-rise', emoji: '📈', name: 'Rising Tide', how: 'Make the sea level rise' },
  { id: 'rebel', emoji: '✊', name: 'Freedom!', how: 'See a country rebel and break free' },
  { id: 'year-1', emoji: '📅', name: 'Time Traveller', how: 'Simulate a whole year' },
  { id: 'year-5', emoji: '🗓️', name: 'Five Years Later', how: 'Reach Year 5 in a world' },
  { id: 'double', emoji: '💪', name: 'Twice the Size', how: 'Grow a country to 200%' },
  { id: 'empire', emoji: '👑', name: 'Mega Empire', how: 'Grow a country to 10× its real size' },
  { id: 'world-champion', emoji: '🌍', name: 'Ruler of the World', how: 'Win a World War' },
  { id: 'new-nation', emoji: '🏳️', name: 'New Nation', how: 'Create your own country' },
  { id: 'renamer', emoji: '✏️', name: 'Name Changer', how: 'Rename a country' },
  { id: 'spinner', emoji: '🎡', name: 'Wheel Master', how: 'Spin the action wheels 10 times' },
  { id: 'history-buff', emoji: '📜', name: 'History Buff', how: 'Watch a replay in the History' },
  { id: 'world-builder', emoji: '🗂️', name: 'World Builder', how: 'Make 3 different worlds' },
];

let unlocked: Record<string, number> = readSetting('badges', {});
let queue: string[] = [];

export const isUnlocked = (id: string) => !!unlocked[id];
export const unlockedAt = (id: string) => unlocked[id];
export const unlockedCount = () => BADGES.filter((b) => unlocked[b.id]).length;

/** Unlock a badge (shows a little celebration the first time). */
export function unlock(id: string) {
  if (unlocked[id] || !BADGES.some((b) => b.id === id)) return;
  unlocked = { ...unlocked, [id]: Date.now() };
  writeSetting('badges', unlocked);
  queue.push(id);
  if (queue.length === 1) showNext();
}

function showNext() {
  const id = queue[0];
  if (!id) return;
  useGame.getState().setBadgeToast(id);
  sound.play('win');
  setTimeout(() => {
    queue = queue.slice(1);
    useGame.getState().setBadgeToast(null);
    setTimeout(showNext, 400);
  }, 3600);
}

/** Count-based badges (spins). */
export function bump(counter: 'spins') {
  const n = readSetting<number>(`count.${counter}`, 0) + 1;
  writeSetting(`count.${counter}`, n);
  if (counter === 'spins' && n >= 10) unlock('spinner');
}

/** Check the world for badges earned (called a moment after every change). */
export function checkWorld(t: Territory, countryIds: string[]) {
  const all = t.activeActions();
  let peace = 0;
  let land = 0;
  const disasterTypes = new Set<string>();
  const hits = new Map<string, number>();
  const visit = (a: (typeof all)[number]) => {
    switch (a.kind) {
      case 'paint':
        unlock('first-paint');
        break;
      case 'fill':
        if (a.owner) unlock('first-paint');
        break;
      case 'battle':
        if (a.outcome === 'conquest') unlock('first-conquest');
        if (a.upset) unlock('underdog');
        break;
      case 'peace':
        peace++;
        break;
      case 'land':
        land++;
        break;
      case 'sea':
        unlock(a.sim ? 'sea-rise' : 'eroder');
        break;
      case 'rebellion':
        unlock('rebel');
        break;
      case 'disaster':
        disasterTypes.add(a.type);
        hits.set(a.id, (hits.get(a.id) ?? 0) + 1);
        break;
      case 'year':
        unlock('year-1');
        for (const e of a.events ?? []) visit(e);
        break;
    }
  };
  for (const a of all) visit(a);
  if (peace >= 3) unlock('peacemaker');
  if (land >= 5) unlock('island-builder');
  if (disasterTypes.size >= 5) unlock('disaster-collector');
  if ([...hits.values()].some((n) => n >= 3)) unlock('survivor');
  if (t.year() >= 5) unlock('year-5');
  let pairs = 0;
  for (const id of countryIds) pairs += t.alliesOf(id).length;
  if (pairs / 2 >= 3) unlock('alliances');
  for (const id of countryIds) {
    const s = t.statsFor(id);
    if (!s || s.originalKm2 <= 0) continue;
    const r = s.currentKm2 / s.originalKm2;
    if (r >= 2) unlock('double');
    if (r >= 10) unlock('empire');
  }
}

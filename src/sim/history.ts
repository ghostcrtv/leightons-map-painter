/**
 * The world's story, for the History log: every battle, peace deal, disaster, alliance,
 * rebellion and year, worked out from the world's action list (so Undo and saved worlds
 * keep it right automatically).
 */
import type { Action } from '../territory/Territory';
import { shareWord } from './conflict';
import { DISASTER_BY_ID, severityWord } from './disasters';
import { formatArea } from '../utils/format';

export interface HistoryEntry {
  year: number;
  emoji: string;
  text: string;
  action: Action;
  /** Can its show be played again? */
  replay: boolean;
  at?: [number, number];
  /** Countries involved (for filtering and the leaderboard). */
  ids: string[];
}

export function buildHistory(actions: Action[], name: (id: string) => string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  let year = 0;
  const visit = (a: Action, y: number) => {
    switch (a.kind) {
      case 'battle': {
        const allies = a.allies?.length ? ` (allies helped: ${a.allies.map(name).join(', ')})` : '';
        const km = a.km2 ? ` (${formatArea(a.km2)})` : '';
        const text =
          a.outcome === 'conquest'
            ? `${a.upset ? 'Upset! ' : ''}${name(a.winner)} conquered all of ${name(a.loser)}${km}${allies}`
            : `${a.upset ? 'Upset! ' : ''}${name(a.winner)} took a ${shareWord(a.share ?? 0.1)} piece of ${name(a.loser)}${km}${allies}`;
        out.push({ year: y, emoji: a.outcome === 'conquest' ? '🏆' : '⚔️', text, action: a, replay: true, at: a.at, ids: [a.winner, a.loser] });
        break;
      }
      case 'peace':
        out.push({ year: y, emoji: '🕊️', text: `${name(a.a)} and ${name(a.b)} made peace`, action: a, replay: true, at: a.at, ids: [a.a, a.b] });
        break;
      case 'disaster': {
        const d = DISASTER_BY_ID.get(a.type);
        out.push({
          year: y,
          emoji: d?.emoji ?? '💥',
          text: `${severityWord(a.severity)} ${(d?.name ?? a.type).toLowerCase()} in ${name(a.id)}`,
          action: a,
          replay: true,
          at: a.at,
          ids: [a.id],
        });
        break;
      }
      case 'alliance':
        out.push({
          year: y,
          emoji: a.on ? '🤝' : '💔',
          text: a.on ? `${name(a.a)} and ${name(a.b)} became allies` : `${name(a.a)} and ${name(a.b)} ended their alliance`,
          action: a,
          replay: false,
          ids: [a.a, a.b],
        });
        break;
      case 'rebellion':
        out.push({
          year: y,
          emoji: '✊',
          text: `${name(a.id)} rebelled and broke free from ${name(a.from)}${a.km2 ? ` (${formatArea(a.km2)})` : ''}`,
          action: a,
          replay: false,
          at: a.at,
          ids: [a.id, a.from],
        });
        break;
      case 'land':
        if ((a as { sim?: boolean }).sim) out.push({ year: y, emoji: '🏝️', text: `${name(a.owner)} grew new land along its coast`, action: a, replay: false, ids: [a.owner] });
        break;
      case 'sea':
        if ((a as { sim?: boolean }).sim) out.push({ year: y, emoji: '🌊', text: 'Sea levels rose: coasts around the world were eroded', action: a, replay: false, ids: [] });
        break;
      case 'year':
        for (const e of a.events ?? []) visit(e, y + 1);
        out.push({ year: y + 1, emoji: '📅', text: `Year ${y + 1} ended`, action: a, replay: false, ids: [] });
        break;
      case 'resetWorld':
        out.length = 0;
        break;
    }
  };
  for (const a of actions) {
    visit(a, year);
    if (a.kind === 'year') year++;
    if (a.kind === 'resetWorld') year = 0;
  }
  return out;
}

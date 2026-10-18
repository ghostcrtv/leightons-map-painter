import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { getTerritory } from '../territory/session';
import { battlePower, playable } from '../sim/runner';
import { formatArea, formatTerritory } from '../utils/format';
import { Modal } from './Modal';

type Board = 'size' | 'power' | 'growth' | 'wins' | 'conquests';
const BOARDS: { id: Board; label: string }[] = [
  { id: 'size', label: '🌍 Biggest' },
  { id: 'power', label: '💪 Most powerful' },
  { id: 'growth', label: '📈 Grew the most' },
  { id: 'wins', label: '⚔️ Most wins' },
  { id: 'conquests', label: '🏆 Conquests' },
];

/** The world's top 10 in different ways, as a bar chart. */
export function LeaderboardDialog() {
  const setOpen = useGame((s) => s.setLeaderboardOpen);
  const countries = useGame((s) => s.countries);
  const version = useGame((s) => s.territoryVersion);
  const [board, setBoard] = useState<Board>('size');

  const rows = useMemo(() => {
    const t = getTerritory();
    if (!t) return [];
    const wins = new Map<string, number>();
    const conquests = new Map<string, number>();
    const visit = (a: ReturnType<typeof t.activeActions>[number]) => {
      if (a.kind === 'battle') {
        wins.set(a.winner, (wins.get(a.winner) ?? 0) + 1);
        if (a.outcome === 'conquest') conquests.set(a.winner, (conquests.get(a.winner) ?? 0) + 1);
      } else if (a.kind === 'rebellion') wins.set(a.id, (wins.get(a.id) ?? 0) + 1);
      else if (a.kind === 'year') (a.events ?? []).forEach(visit);
    };
    t.activeActions().forEach(visit);
    const list = countries
      .filter((c) => !c.disputed && playable(c.id))
      .map((c) => {
        const s = t.statsFor(c.id);
        const value =
          board === 'size'
            ? s?.currentKm2 ?? 0
            : board === 'power'
              ? battlePower(c.id)
              : board === 'growth'
                ? s && s.originalKm2 > 0
                  ? s.currentKm2 / s.originalKm2
                  : 0
                : board === 'wins'
                  ? wins.get(c.id) ?? 0
                  : conquests.get(c.id) ?? 0;
        return { c, value };
      })
      .filter((r) => (board === 'growth' ? r.value > 1.0005 : r.value > 0))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, version, board]);

  const max = rows[0]?.value || 1;
  const label = (v: number) =>
    board === 'size' ? formatArea(v) : board === 'power' ? `${Math.round(v)}` : board === 'growth' ? formatTerritory(v).big : `${v}`;

  return (
    <Modal title="Leaderboard" onClose={() => setOpen(false)} wide>
      <div className="chips" role="radiogroup" aria-label="Leaderboard">
        {BOARDS.map((b) => (
          <button key={b.id} role="radio" aria-checked={board === b.id} className={`chip${board === b.id ? ' on' : ''}`} onClick={() => setBoard(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="empty-history">Nobody yet! Battles, painting and simulations fill this board.</p>
      ) : (
        <ol className="board">
          {rows.map(({ c, value }, i) => {
            const flag = mapController.flagUrl(c.flag);
            return (
              <li key={c.id}>
                <button
                  className="board-row"
                  onClick={() => {
                    useGame.getState().select(c.id);
                    mapController.flyTo(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="board-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                  {flag ? <img src={flag} alt="" className="mini-flag" /> : <span className="mini-flag disputed" />}
                  <span className="board-main">
                    <span className="board-name">{c.name}</span>
                    <span className="board-bar">
                      <i style={{ width: `${Math.max(3, (value / max) * 100)}%`, background: mapController.flagColor(c.flag) }} />
                    </span>
                  </span>
                  <span className="board-value">{label(value)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { getTerritory } from '../territory/session';
import { buildHistory, type HistoryEntry } from '../sim/history';
import { replay } from '../sim/runner';
import { Modal } from './Modal';

/** The world's story: every battle, peace deal, disaster, alliance, rebellion and year. */
export function HistoryDialog() {
  const setOpen = useGame((s) => s.setHistoryOpen);
  const byId = useGame((s) => s.countryById);
  const version = useGame((s) => s.territoryVersion);
  const worldVersion = useGame((s) => s.worldVersion);
  const [filter, setFilter] = useState('');
  const entries = useMemo(() => {
    const t = getTerritory();
    if (!t) return [];
    return buildHistory(t.activeActions(), (id) => byId.get(id)?.name ?? id).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId, version, worldVersion]);
  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.text.toLowerCase().includes(q)) : entries;

  const groups: { year: number; items: HistoryEntry[] }[] = [];
  for (const e of shown) {
    const g = groups[groups.length - 1];
    if (g && g.year === e.year) g.items.push(e);
    else groups.push({ year: e.year, items: [e] });
  }

  const goTo = (e: HistoryEntry) => {
    const st = useGame.getState();
    if (e.ids[0]) st.select(e.ids[0]);
    setOpen(false);
  };

  return (
    <Modal title="History" onClose={() => setOpen(false)} wide>
      <p className="muted">Everything that happened in this world, newest first. Tap ▶ to watch a battle or disaster again.</p>
      <input
        id="history-search"
        type="search"
        className="rank-search"
        placeholder="Find a country or event…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        autoComplete="off"
      />
      {entries.length === 0 ? (
        <p className="empty-history">Nothing has happened yet! Try the lightning button for battles, disasters and whole years.</p>
      ) : (
        <div className="history">
          {groups.map((g) => (
            <section key={`${g.year}-${g.items[0].text}`}>
              <h3 className="history-year">{g.year === 0 ? 'Before Year 1' : `Year ${g.year}`}</h3>
              <ul>
                {g.items.map((e, i) => (
                  <li key={i} className={`history-row${e.action.kind === 'year' ? ' year-mark' : ''}`}>
                    <span className="history-emoji" aria-hidden>
                      {e.emoji}
                    </span>
                    <button className="history-text" onClick={() => goTo(e)} disabled={!e.ids.length}>
                      {e.text}
                    </button>
                    {e.replay && (
                      <button
                        className="chip mini"
                        aria-label="Watch again"
                        onClick={() => {
                          setOpen(false);
                          void replay(e.action);
                        }}
                      >
                        ▶
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

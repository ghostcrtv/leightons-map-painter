import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import type { WarTickerEntry } from '../sim/types';

function Flag({ id, state }: { id: string; state: 'win' | 'lose' | 'out' | 'even' }) {
  const c = useGame((s) => s.countryById.get(id));
  const url = c ? mapController.flagUrl(c.flag) : null;
  return (
    <span className={`tk-flag ${state}`} title={c?.name}>
      {url ? <img src={url} alt={c?.name ?? id} /> : <i />}
      {state === 'out' && <b className="tk-cross" aria-hidden />}
    </span>
  );
}

function Row({ e }: { e: WarTickerEntry }) {
  const byId = useGame((s) => s.countryById);
  const name = (id?: string) => (id ? byId.get(id)?.name ?? id : '');
  if (e.kind === 'event') {
    return (
      <li className="tk-row event">
        <span className="tk-emoji" aria-hidden>
          {e.emoji}
        </span>
        <span className="tk-text">{e.text}</span>
      </li>
    );
  }
  const st = (id: string): 'win' | 'lose' | 'out' | 'even' =>
    e.outcome === 'peace' ? 'even' : id === e.eliminated ? 'out' : id === e.winner ? 'win' : 'lose';
  const what =
    e.outcome === 'peace' ? 'Peace' : e.eliminated ? `${name(e.eliminated)} is out!` : `${name(e.winner)} wins`;
  return (
    <li className={`tk-row battle${e.eliminated ? ' elim' : ''}`}>
      <Flag id={e.a} state={st(e.a)} />
      <span className="tk-vs" aria-hidden>
        {e.outcome === 'peace' ? '🕊️' : '⚔️'}
      </span>
      <Flag id={e.b} state={st(e.b)} />
      <span className="tk-text">{what}</span>
    </li>
  );
}

/** World War: a scrolling list of every result (newest on top) and the countries-left counter. */
export function WarTicker() {
  const running = useGame((s) => s.simRunning);
  const list = useGame((s) => s.warTicker);
  const left = useGame((s) => s.warLeft);
  if (running !== 'war' || left === null) return null;
  return (
    <aside className="war-ticker" aria-label="World War results">
      <div className="tk-head">
        <span className="tk-left">{left}</span>
        <span className="tk-label">
          countries
          <br />
          left
        </span>
      </div>
      <ol className="tk-list">
        {list.map((e) => (
          <Row key={e.n} e={e} />
        ))}
      </ol>
    </aside>
  );
}

/** The big World War announcements: "Down to 100!", "Then there were 10…", the final, the champion. */
export function WarMilestone() {
  const m = useGame((s) => s.warMilestone);
  const byId = useGame((s) => s.countryById);
  if (!m) return null;
  const flag = (id: string) => {
    const c = byId.get(id);
    return c ? mapController.flagUrl(c.flag) : null;
  };
  return (
    <div className={`war-milestone${m.champion ? ' champion' : ''}`} role="status" aria-live="polite">
      <div className="wm-card" key={m.title}>
        {m.champion && (
          <span className="wm-crown" aria-hidden>
            👑
          </span>
        )}
        <h2 className="wm-title">{m.title}</h2>
        {m.flags && m.flags.length > 0 && (
          <div className={`wm-flags${m.vs ? ' vs' : ''}${m.champion ? ' big' : ''}`}>
            {m.flags.map((id, i) => (
              <span key={id} className="wm-flag" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                {flag(id) ? <img src={flag(id)!} alt="" /> : <i />}
                <small>{byId.get(id)?.name ?? id}</small>
                {m.vs && i === 0 && <b className="wm-vs">VS</b>}
              </span>
            ))}
          </div>
        )}
        {m.sub && <p className="wm-sub">{m.sub}</p>}
      </div>
    </div>
  );
}

import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { shareWord } from '../sim/conflict';
import { DISASTER_BY_ID } from '../sim/disasters';
import {
  lastConflictPair, rerunDisaster, runCoastGrowth, runConflict, runRandomConflict, runRebellion, runSeaRise, simulateYear, skipRun, stopAutoBattles, stopRun,
} from '../sim/runner';
import { severityWord, smokeWord } from '../sim/disasters';
import { getTerritory } from '../territory/session';
import { formatArea } from '../utils/format';
import { IconClose } from './icons';

function Flag({ id }: { id: string }) {
  const c = useGame((s) => s.countryById.get(id));
  const url = c ? mapController.flagUrl(c.flag) : null;
  return url ? <img className="hud-flag" src={url} alt="" /> : null;
}

/** On-map simulation UI: the banner while a simulation plays, and the result card after. */
export function SimHud() {
  const banner = useGame((s) => s.simBanner);
  const report = useGame((s) => s.simReport);
  const auto = useGame((s) => s.simAuto);
  const running = useGame((s) => s.simRunning);
  const byId = useGame((s) => s.countryById);
  const setReport = useGame((s) => s.setSimReport);
  // Hide the result card while a window is open on top of the map.
  const windowOpen = useGame((s) => !!s.simView || s.worldsOpen || s.historyOpen || !!s.designer || s.badgesOpen || s.leaderboardOpen || s.actionsOpen || s.rankingsOpen || s.helpOpen || s.settingsOpen || s.tourOpen);
  useGame((s) => s.territoryVersion);
  const name = (id?: string) => (id ? byId.get(id)?.name ?? id : '');
  const t = getTerritory();
  const canUndo = !!report && 'undoVersion' in report && report.undoVersion !== null && t?.version === report.undoVersion;
  const undo = () => {
    mapController.undo();
    setReport(null);
  };

  return (
    <>
      {banner && (
        <div className="sim-banner" role="status" aria-live="polite">
          {banner.text ? (
            <>
              <span className="hud-emoji">{banner.emoji}</span>
              <strong>{banner.text}</strong>
            </>
          ) : banner.kind === 'conflict' ? (
            <>
              <Flag id={banner.a} />
              <strong>{name(banner.a)}</strong>
              <span className="swords" aria-label="versus">
                ⚔️
              </span>
              <strong>{name(banner.b)}</strong>
              <Flag id={banner.b!} />
            </>
          ) : (
            <>
              <span className="hud-emoji">{DISASTER_BY_ID.get(banner.type!)?.emoji}</span>
              <strong>
                {DISASTER_BY_ID.get(banner.type!)?.name} {DISASTER_BY_ID.get(banner.type!)?.verb} {name(banner.a)}!
              </strong>
            </>
          )}
          {banner.step && <small className="banner-step">{banner.step}</small>}
        </div>
      )}
      {running && (
        <div className="run-controls">
          <button className="btn secondary" onClick={skipRun}>
            ⏩ {running === 'year' ? 'Skip to the end of the year' : 'Go fast'}
          </button>
          <button className="btn danger" onClick={stopRun}>
            ■ Stop
          </button>
        </div>
      )}
      {auto && (
        <button className="btn danger auto-stop" onClick={stopAutoBattles}>
          ■ Stop auto battles
        </button>
      )}
      {report && !banner && !windowOpen && (
        <div className={`sim-report ${report.kind === 'conflict' ? report.outcome : report.kind}`} role="status" aria-live="polite">
          <button className="icon-btn small report-close" aria-label="Close" onClick={() => setReport(null)}>
            <IconClose width={18} height={18} />
          </button>
          {report.kind === 'conflict' ? (
            <>
              {report.outcome === 'peace' ? (
                <>
                  <h3>🕊️ Peace deal!</h3>
                  <p>
                    {name(report.a)} and {name(report.b)} agreed to stop fighting. No land changed.
                  </p>
                </>
              ) : (
                <>
                  <h3>
                    {report.upset ? '😱 Upset! ' : report.outcome === 'conquest' ? '🏆 ' : '🚩 '}
                    {report.outcome === 'conquest'
                      ? `${name(report.winner)} conquers ${name(report.loser)}!`
                      : `${name(report.winner)} wins!`}
                  </h3>
                  <p>
                    <Flag id={report.winner!} />
                    {report.outcome === 'conquest' ? (
                      <>
                        All of {name(report.loser)}’s land ({formatArea(report.km2)}) now belongs to {name(report.winner)}.
                      </>
                    ) : (
                      <>
                        Took a <b>{shareWord(report.share)}</b> piece of {name(report.loser)}: {formatArea(report.km2)} (
                        {Math.max(1, Math.round(report.share * 100))}% of its land).
                      </>
                    )}
                  </p>
                </>
              )}
              {report.allies.length > 0 && <p className="odds-line">🤝 Allies joined in: {report.allies.map((x) => name(x)).join(', ')}</p>}
              {report.damage && (
                <p className="odds-line">
                  🩹 War damage to {name(report.damage.id)}: Military {report.damage.military}{report.damage.money ? `, Money ${report.damage.money}` : ''} (heals over the years)
                </p>
              )}
              {report.recovered && (
                <p className="recovered">💪 {name(report.winner)} won, so it has recovered from its disasters. No more smoke!</p>
              )}
              <p className="odds-line">
                Chances were: {name(report.a)} {Math.round(report.odds.aWins * 100)}% · peace {Math.round(report.odds.peace * 100)}% ·{' '}
                {name(report.b)} {Math.round(report.odds.bWins * 100)}%
              </p>
              {!auto && (
                <div className="report-buttons">
                  <button
                    className="btn primary"
                    onClick={() => {
                      const p = lastConflictPair();
                      if (p) runConflict(p.a, p.b);
                    }}
                  >
                    ⚔️ Again
                  </button>
                  <button className="btn secondary" onClick={() => runRandomConflict()}>
                    🎲 Random battle
                  </button>
                  {canUndo && (
                    <button className="btn secondary" onClick={undo}>
                      Undo
                    </button>
                  )}
                </div>
              )}
            </>
          ) : report.kind === 'year' ? (
            <>
              <h3>📅 Year {report.year} in review</h3>
              {report.stopped && <p className="odds-line">You stopped the year early.</p>}
              <ul className="year-list">
                {report.entries.length === 0 && <li>A quiet year. Nothing much happened!</li>}
                {report.entries.map((e, i) => (
                  <li key={i}>
                    <span aria-hidden>{e.emoji}</span> {e.text}
                  </li>
                ))}
              </ul>
              {report.gainer && (
                <p className="odds-line">
                  📈 Biggest winner: <b>{name(report.gainer.id)}</b> (+{formatArea(report.gainer.km2)})
                  {report.loser && (
                    <>
                      {' '}
                      · 📉 Biggest loser: <b>{name(report.loser.id)}</b> (−{formatArea(report.loser.km2)})
                    </>
                  )}
                </p>
              )}
              <div className="report-buttons">
                <button className="btn primary" onClick={() => simulateYear()}>
                  📅 Next year
                </button>
                {canUndo && (
                  <button className="btn secondary" onClick={undo}>
                    Undo the whole year
                  </button>
                )}
              </div>
            </>
          ) : report.kind === 'war' ? (
            <>
              <h3>{report.champion ? `👑 ${name(report.champion)} rules the world!` : '🌍 World War paused'}</h3>
              <p>
                {report.battles} battle{report.battles === 1 ? '' : 's'} fought. {report.left} countr{report.left === 1 ? 'y' : 'ies'} left
                {report.leader && !report.champion && (
                  <>
                    {' '}
                    · biggest now: <b>{name(report.leader.id)}</b> ({formatArea(report.leader.km2)})
                  </>
                )}
                .
              </p>
              <p className="odds-line">Every battle is in the History, and Undo takes them back one at a time.</p>
              {!report.champion && (
                <div className="report-buttons">
                  <button className="btn primary" onClick={() => useGame.getState().setSimView('war')}>
                    🌍 Keep going…
                  </button>
                </div>
              )}
            </>
          ) : report.kind === 'event' ? (
            <>
              <h3>
                {report.emoji} {report.title}
              </h3>
              <p>{report.text}</p>
              <div className="report-buttons">
                {report.again && (
                  <button
                    className="btn primary"
                    onClick={() => (report.again === 'rebellion' ? runRebellion() : report.again === 'coast' ? runCoastGrowth() : runSeaRise())}
                  >
                    🎲 Another one
                  </button>
                )}
                {canUndo && (
                  <button className="btn secondary" onClick={undo}>
                    Undo
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h3>
                {DISASTER_BY_ID.get(report.type)?.emoji} {severityWord(report.severity)} {DISASTER_BY_ID.get(report.type)?.name.toLowerCase()} in{' '}
                {name(report.id)}!
              </h3>
              <p>
                <Flag id={report.id} />
                {name(report.id)} is weakened: battle power {Math.round(report.powerBefore)} → <b>{Math.round(report.powerAfter)}</b> (
                {smokeWord(t?.weakness(report.id) ?? report.severity)}). It stays weak until it wins a battle or the
                world is reset.
              </p>
              <div className="report-buttons">
                <button className="btn primary" onClick={() => rerunDisaster()}>
                  🌪️ Another one
                </button>
                <button className="btn secondary" onClick={() => useGame.getState().setSimView('disaster')}>
                  Choose…
                </button>
                {canUndo && (
                  <button className="btn secondary" onClick={undo}>
                    Undo
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

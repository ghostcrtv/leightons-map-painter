import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { DISASTERS } from '../sim/disasters';
import {
  battlePower, likelyFor, oddsFor, playable, randomNation, randomOpponent, runConflict, runDisaster, startAutoBattles,
} from '../sim/runner';
import { getTerritory } from '../territory/session';
import { Modal } from './Modal';
import { IconChevronDown } from './icons';

const RANDOM = '__random';

/** The Simulation menu: run conflicts and natural disasters on the map. */
export function SimulationDialog() {
  const view = useGame((s) => s.simView);
  const setView = useGame((s) => s.setSimView);
  const title = view === 'conflict' ? 'Conflict' : view === 'disaster' ? 'Natural disaster' : 'Simulation';
  return (
    <Modal title={title} onClose={() => setView(null)} wide>
      {view !== 'menu' && (
        <button className="back-link" onClick={() => setView('menu')}>
          <IconChevronDown width={16} height={16} style={{ transform: 'rotate(90deg)' }} /> All simulations
        </button>
      )}
      {view === 'menu' && (
        <>
          <p className="muted sim-intro">Let the game decide! Results use each country’s Power Score, plus a bit of luck.</p>
          <div className="action-grid">
            <button className="action-card" onClick={() => setView('conflict')}>
              <span className="action-emoji" aria-hidden>
                ⚔️
              </span>
              <strong>Conflict</strong>
              <small>Two nations face off. Stronger ones are favoured, but underdogs can win!</small>
            </button>
            <button className="action-card" onClick={() => setView('disaster')}>
              <span className="action-emoji" aria-hidden>
                🌪️
              </span>
              <strong>Natural disaster</strong>
              <small>Floods, earthquakes, tornadoes and more. Hit countries are weakened.</small>
            </button>
          </div>
        </>
      )}
      {view === 'conflict' && <ConflictSetup />}
      {view === 'disaster' && <DisasterSetup />}
    </Modal>
  );
}

/** Countries that can take part, sorted by name (re-read when the map changes). */
function useNations() {
  const countries = useGame((s) => s.countries);
  const version = useGame((s) => s.territoryVersion);
  return useMemo(
    () => countries.filter((c) => playable(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countries, version],
  );
}

function NationSelect(props: { id: string; label: string; value: string; onChange: (v: string) => void; randomLabel: string }) {
  const nations = useNations();
  return (
    <label className="nation-select">
      <span className="field-label">{props.label}</span>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="" disabled>
          Choose a nation…
        </option>
        <option value={RANDOM}>🎲 {props.randomLabel}</option>
        {nations.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <NationBadge id={props.value} />
    </label>
  );
}

function NationBadge({ id }: { id: string }) {
  useGame((s) => s.statsVersion);
  useGame((s) => s.territoryVersion);
  const c = useGame((s) => s.countryById.get(id));
  if (!c) return <span className="nation-badge empty">No nation yet</span>;
  const flag = mapController.flagUrl(c.flag);
  const weak = getTerritory()?.weakness(id) ?? 0;
  return (
    <span className="nation-badge">
      {flag && <img src={flag} alt="" />}
      <span>
        <strong>{c.name}</strong>
        <small>
          Power {Math.round(battlePower(id))}
          {weak > 0 && <em className="weak-tag"> · weakened −{Math.round(weak * 100)}%</em>}
        </small>
      </span>
    </span>
  );
}

function ConflictSetup() {
  const selectedId = useGame((s) => s.selectedId);
  const countryById = useGame((s) => s.countryById);
  useGame((s) => s.statsVersion);
  useGame((s) => s.territoryVersion);
  const [a, setA] = useState(() => (selectedId && playable(selectedId) ? selectedId : ''));
  const [b, setB] = useState(() => (selectedId && playable(selectedId) ? randomOpponent(selectedId) ?? '' : ''));

  const chooseA = (v: string) => {
    if (v === RANDOM) {
      const r = randomNation();
      if (!r) return;
      setA(r);
      setB(randomOpponent(r) ?? '');
      return;
    }
    setA(v);
    if (!b || b === v) setB(randomOpponent(v) ?? '');
  };
  const chooseB = (v: string) => {
    if (v === RANDOM) setB((a ? randomOpponent(a) : randomNation(undefined)) ?? '');
    else setB(v);
  };
  const shuffle = () => chooseA(RANDOM);
  const ready = !!a && !!b && a !== b && playable(a) && playable(b);
  const odds = ready ? oddsFor(a, b) : null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const nameA = countryById.get(a)?.name ?? '';
  const nameB = countryById.get(b)?.name ?? '';

  return (
    <div className="sim-setup">
      <div className="versus">
        <NationSelect id="sim-a" label="Nation 1" value={a} onChange={chooseA} randomLabel="Random nation" />
        <div className="vs-badge" aria-hidden>
          VS
        </div>
        <NationSelect id="sim-b" label="Nation 2" value={b} onChange={chooseB} randomLabel="Random neighbour" />
      </div>
      {a && b && a === b && <p className="sheet-msg bad">Pick two different nations.</p>}
      {odds && (
        <div className="odds">
          <div className="odds-bar" aria-hidden>
            <i style={{ width: pct(odds.aWins) }} className="oa" />
            <i style={{ width: pct(odds.peace) }} className="op" />
            <i style={{ width: pct(odds.bWins) }} className="ob" />
          </div>
          <div className="odds-labels">
            <span>
              {nameA} wins <b>{pct(odds.aWins)}</b>
            </span>
            <span>
              🕊️ Peace <b>{pct(odds.peace)}</b>
            </span>
            <span>
              {nameB} wins <b>{pct(odds.bWins)}</b>
            </span>
          </div>
        </div>
      )}
      <div className="sim-buttons">
        <button className="btn primary big-go" disabled={!ready} onClick={() => runConflict(a, b)}>
          ⚔️ BATTLE!
        </button>
        <button className="btn secondary" onClick={shuffle}>
          🎲 Random matchup
        </button>
        <button className="btn secondary" onClick={() => startAutoBattles()}>
          ▶ Auto battles
        </button>
      </div>
      <p className="muted small-print">
        Winners can take a little land, a lot, or the whole country. Peace deals change nothing. Weakened countries fight at
        lower power. Undo takes back any result. Auto battles keep picking random neighbours until you press Stop.
      </p>
    </div>
  );
}

function DisasterSetup() {
  const selectedId = useGame((s) => s.selectedId);
  const [id, setId] = useState(() => (selectedId && playable(selectedId) ? selectedId : ''));
  const [type, setType] = useState('');
  const likely = useMemo(() => (id ? likelyFor(id).slice(0, 5) : []), [id]);

  const chooseNation = (v: string) => setId(v === RANDOM ? randomNation() ?? '' : v);

  return (
    <div className="sim-setup">
      <div className="versus single">
        <NationSelect id="dis-nation" label="Nation" value={id} onChange={chooseNation} randomLabel="Random nation" />
        <label className="nation-select">
          <span className="field-label">Disaster</span>
          <select id="dis-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">🎲 Random (one that fits the place)</option>
            {DISASTERS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.emoji} {d.name}
              </option>
            ))}
          </select>
          {likely.length > 0 && (
            <span className="likely">
              Likely here:{' '}
              {likely.map((d) => (
                <button key={d.id} className={`chip mini${type === d.id ? ' on' : ''}`} onClick={() => setType(d.id)}>
                  {d.emoji} {d.name}
                </button>
              ))}
            </span>
          )}
        </label>
      </div>
      <div className="sim-buttons">
        <button className="btn primary big-go" disabled={!id} onClick={() => runDisaster(id, type || undefined)}>
          💥 Unleash!
        </button>
        <button className="btn secondary" onClick={() => runDisaster()}>
          🎲 Random disaster
        </button>
      </div>
      <p className="muted small-print">
        A country hit by a disaster is weakened (it fights at lower power): light disasters make a little smoke, extreme ones huge clouds. It stays weak until it wins a battle or you reset the
        whole map. Random disasters pick a nation and a disaster that really happens there.
      </p>
    </div>
  );
}

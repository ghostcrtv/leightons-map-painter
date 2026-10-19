import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { CRAZY_DISASTERS, NORMAL_DISASTERS } from '../sim/disasters';
import {
  battlePower, likelyFor, oddsFor, playable, playableIds, randomNation, randomOpponent, rebels, runCoastGrowth, runConflict, runDisaster,
  runRebellion, runSeaRise, setAlliance, simulateYear, startAutoBattles, startWorldWar, strengthOf,
} from '../sim/runner';
import { formatArea } from '../utils/format';
import { getTerritory } from '../territory/session';
import { Modal } from './Modal';
import { CountryPicker } from './CountryPicker';
import { IconChevronDown } from './icons';

const RANDOM = '__random';

/** The Simulation menu: run conflicts and natural disasters on the map. */
export function SimulationDialog() {
  const view = useGame((s) => s.simView);
  const setView = useGame((s) => s.setSimView);
  const title = { menu: 'Simulation', conflict: 'Conflict', disaster: 'Natural disaster', war: 'World War', rebellion: 'Rebellion', coast: 'Coast growth' }[view ?? 'menu'];
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
            <button className="action-card" onClick={() => simulateYear()}>
              <span className="action-emoji" aria-hidden>
                📅
              </span>
              <strong>Simulate 1 year</strong>
              <small>A string of random events, then a year in review. One Undo takes it back.</small>
            </button>
            <button className="action-card" onClick={() => setView('war')}>
              <span className="action-emoji" aria-hidden>
                🌍
              </span>
              <strong>World War</strong>
              <small>Battle after battle until one superpower rules the world.</small>
            </button>
            <button className="action-card" onClick={() => setView('rebellion')}>
              <span className="action-emoji" aria-hidden>
                ✊
              </span>
              <strong>Rebellion</strong>
              <small>A conquered country breaks free and takes its land back.</small>
            </button>
            <button className="action-card" onClick={() => setView('coast')}>
              <span className="action-emoji" aria-hidden>
                🏝️
              </span>
              <strong>Coast growth</strong>
              <small>A country by the sea builds new land along its coast.</small>
            </button>
            <button className="action-card" onClick={() => runSeaRise()}>
              <span className="action-emoji" aria-hidden>
                🌊
              </span>
              <strong>Sea level rise</strong>
              <small>Every coast in the world loses a little land.</small>
            </button>
          </div>
        </>
      )}
      {view === 'conflict' && <ConflictSetup />}
      {view === 'disaster' && <DisasterSetup />}
      {view === 'war' && <WarSetup />}
      {view === 'rebellion' && <RebellionSetup />}
      {view === 'coast' && <CoastSetup />}
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
    <div className="nation-select">
      <span className="field-label">{props.label}</span>
      <CountryPicker
        id={props.id}
        value={props.value}
        onChange={props.onChange}
        items={nations.map((c) => ({ id: c.id }))}
        extras={[{ value: RANDOM, label: `🎲 ${props.randomLabel}` }]}
        placeholder="Choose a nation…"
      />
      <NationBadge id={props.value} />
    </div>
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
  // Attack / Defend in the country panel choose both sides; otherwise start from the tapped country.
  const [preset] = useState(() => {
    const p = useGame.getState().conflictPreset;
    useGame.getState().setConflictPreset(null);
    return p;
  });
  const [a, setA] = useState(() => preset?.a ?? (selectedId && playable(selectedId) ? selectedId : ''));
  const [b, setB] = useState(() => preset?.b ?? (selectedId && playable(selectedId) ? randomOpponent(selectedId) ?? '' : ''));

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
  const allied = !!a && !!b && a !== b && !!getTerritory()?.areAllies(a, b);
  const ready = !!a && !!b && a !== b && playable(a) && playable(b) && !allied;
  const odds = ready ? oddsFor(a, b) : null;
  const sa = ready ? strengthOf(a, 'attacker', b) : null;
  const sb = ready ? strengthOf(b, 'defender', a) : null;
  const allyNames = (ids: string[]) => ids.map((x) => countryById.get(x)?.name ?? x).join(', ');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const nameA = countryById.get(a)?.name ?? '';
  const nameB = countryById.get(b)?.name ?? '';

  return (
    <div className="sim-setup">
      <div className="versus">
        <NationSelect id="sim-a" label="Nation 1 · attacks ⚔️" value={a} onChange={chooseA} randomLabel="Random nation" />
        <div className="vs-badge" aria-hidden>
          VS
        </div>
        <NationSelect id="sim-b" label="Nation 2 · defends 🛡️" value={b} onChange={chooseB} randomLabel="Random neighbour" />
      </div>
      {a && b && a === b && <p className="sheet-msg bad">Pick two different nations.</p>}
      {allied && (
        <p className="sheet-msg bad allied-msg">
          🤝 They’re allies, so they won’t fight.{' '}
          <button className="chip" onClick={() => setAlliance(a, b, false)}>
            Break the alliance
          </button>
        </p>
      )}
      {sa && sb && (
        <div className="strengths">
          <span>
            ⚔️ Attack strength <b>{Math.round(sa.total)}</b>
            {sa.allies.length > 0 && <small> incl. allies: {allyNames(sa.allies)}</small>}
          </span>
          <span>
            🛡️ Defense strength <b>{Math.round(sb.total)}</b>
            <small> incl. home bonus{sb.allies.length > 0 ? ` + allies: ${allyNames(sb.allies)}` : ''}</small>
          </span>
        </div>
      )}
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
        Nation 1 attacks with its Attack, Military and Money; Nation 2 defends with its Defense, Military and Money, plus a home
        bonus. Allies help. Winners can take a little land, a lot, or the whole country; losers get war damage that heals over the
        years. Weakened countries fight at lower power. Undo takes back any result.
      </p>
    </div>
  );
}

function DisasterSetup() {
  const selectedId = useGame((s) => s.selectedId);
  const [id, setId] = useState(() => (selectedId && playable(selectedId) ? selectedId : ''));
  const [type, setType] = useState('');
  const crazy = useGame((s) => s.crazyDisasters);
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
            {NORMAL_DISASTERS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.emoji} {d.name}
              </option>
            ))}
            {crazy && (
              <optgroup label="🤪 Crazy disasters">
                {CRAZY_DISASTERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.emoji} {d.name}
                  </option>
                ))}
              </optgroup>
            )}
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
        {crazy && (
          <button className="btn secondary" onClick={() => runDisaster(id || undefined, 'crazy')}>
            🤪 Crazy one!
          </button>
        )}
      </div>
      <p className="muted small-print">
        A country hit by a disaster is weakened (it fights at lower power): light disasters make a little smoke, extreme ones huge clouds. It stays weak until it wins a battle or you reset the
        whole map. Random disasters pick a nation and a disaster that really happens there.
        {crazy ? ' Crazy disasters are on, so anything can happen!' : ' Want zombies and aliens? Turn on Crazy disasters in Settings.'}
      </p>
    </div>
  );
}

function WarSetup() {
  useGame((s) => s.territoryVersion);
  const left = playableIds().length;
  return (
    <div className="sim-setup">
      <p>
        Countries attack their neighbours again and again — bigger results than normal battles — until <b>one superpower</b> rules
        the world, or you press <b>Stop</b>. {left} countries are still in the game.
      </p>
      <div className="sim-buttons">
        <button className="btn primary big-go" onClick={() => startWorldWar(false)}>
          🌍 Watch it
        </button>
        <button className="btn secondary" onClick={() => startWorldWar(true)}>
          ⏩ Go fast (no animations)
        </button>
      </div>
      <p className="muted small-print">
        Tip: make a copy of your world first (tap the logo → Copy) if you want to keep the map as it is now. Every battle is saved in
        the History, and Undo takes them back one at a time.
      </p>
    </div>
  );
}

function RebellionSetup() {
  const byId = useGame((s) => s.countryById);
  useGame((s) => s.territoryVersion);
  const list = rebels();
  const [id, setId] = useState(list[0]?.id ?? '');
  if (!list.length) {
    return (
      <div className="sim-setup">
        <p className="empty-history">No country has lost enough land to rebel yet. Win some battles or paint some land first!</p>
      </div>
    );
  }
  return (
    <div className="sim-setup">
      <div className="nation-select">
        <span className="field-label">Who rebels?</span>
        <CountryPicker
          id="rebel-pick"
          value={id}
          onChange={setId}
          items={list.map((c) => ({ id: c.id, label: `${byId.get(c.id)?.name} (from ${byId.get(c.from)?.name}, ${formatArea(c.km2)})` }))}
        />
      </div>
      <div className="sim-buttons">
        <button className="btn primary big-go" disabled={!id} onClick={() => runRebellion(id)}>
          ✊ Rebel!
        </button>
        <button className="btn secondary" onClick={() => runRebellion()}>
          🎲 Random rebellion
        </button>
      </div>
      <p className="muted small-print">The rebels take back their own real land from the country holding most of it.</p>
    </div>
  );
}

function CoastSetup() {
  const selectedId = useGame((s) => s.selectedId);
  const countries = useGame((s) => s.countries);
  const version = useGame((s) => s.territoryVersion);
  const coastal = useMemo(
    () => countries.filter((c) => playable(c.id) && mapController.isCoastal(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countries, version],
  );
  const [id, setId] = useState(() => (selectedId && coastal.some((c) => c.id === selectedId) ? selectedId : ''));
  return (
    <div className="sim-setup">
      <div className="nation-select">
        <span className="field-label">Country by the sea</span>
        <CountryPicker id="coast-pick" value={id} onChange={setId} items={coastal.map((c) => ({ id: c.id }))} extras={[{ value: '', label: '🎲 Random' }]} />
      </div>
      <div className="sim-buttons">
        <button className="btn primary big-go" onClick={() => runCoastGrowth(id || undefined)}>
          🏝️ Grow!
        </button>
      </div>
      <p className="muted small-print">The country builds about 1–4% more land along part of its coast.</p>
    </div>
  );
}

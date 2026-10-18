import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { getStats } from '../stats/session';
import { RATING_KEYS, RATING_LABELS, type RatingKey } from '../stats/ratings';
import { IconMinus, IconPlus } from './icons';
import { getTerritory } from '../territory/session';
import { DISASTER_BY_ID } from '../sim/disasters';
import { effectiveRatings, playable } from '../sim/runner';
import { roleStrength } from '../sim/strength';

/** The country card's Power section: Power Score, rank and the four ratings (editable). */
export function PowerCard({ id, editing, setEditing }: { id: string; editing: boolean; setEditing: (v: boolean) => void }) {
  useGame((s) => s.statsVersion);
  useGame((s) => s.territoryVersion);
  const setRankingsOpen = useGame((s) => s.setRankingsOpen);
  const total = useGame((s) => s.countries.length);
  const book = getStats();
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => setConfirmReset(false), [id, editing]);
  if (!book) return null;
  const r = book.get(id);
  const power = book.power(id);
  const rank = book.rankOf(id);

  const change = (k: RatingKey, v: number) => book.set(id, { [k]: v });

  return (
    <section className={`stat-card power-card${editing ? ' editing' : ''}`}>
      <h3>
        Power
        {rank && (
          <button className="rank-pill" onClick={() => setRankingsOpen(true)} title="See the power rankings">
            #{rank} of {total}
          </button>
        )}
      </h3>
      <div className="power-row">
        <div className="big-number">{power}</div>
        <p className="muted">
          Power Score
          <small>{book.isEdited(id) ? 'Edited ratings' : 'Game estimate, not official'}</small>
        </p>
      </div>
      <WeakNote id={id} power={power} />
      <BattleNote id={id} />
      <div className="ratings">
        {RATING_KEYS.map((k) => (
          <div key={k} className="rating">
            <span className="rating-name">{RATING_LABELS[k]}</span>
            {editing ? (
              <span className="rating-edit">
                <button className="step" aria-label={`Lower ${RATING_LABELS[k]}`} onClick={() => change(k, r[k] - 1)}>
                  <IconMinus width={18} height={18} />
                </button>
                <input
                  id={`rate-${k}`}
                  type="range"
                  min={1}
                  max={100}
                  value={r[k]}
                  aria-label={RATING_LABELS[k]}
                  onChange={(e) => change(k, Number(e.target.value))}
                />
                <button className="step" aria-label={`Raise ${RATING_LABELS[k]}`} onClick={() => change(k, r[k] + 1)}>
                  <IconPlus width={18} height={18} />
                </button>
              </span>
            ) : (
              <span className="rating-bar" aria-hidden>
                <i style={{ width: `${r[k]}%` }} />
              </span>
            )}
            <span className="rating-value">{r[k]}</span>
          </div>
        ))}
      </div>
      {editing && (
        <div className="power-edit-buttons">
          {book.isEdited(id) && !confirmReset && (
            <button className="btn secondary" onClick={() => setConfirmReset(true)}>
              Reset to starting ratings
            </button>
          )}
          {confirmReset && (
            <button
              className="btn danger"
              onClick={() => {
                book.reset(id);
                setConfirmReset(false);
              }}
            >
              Yes, reset
            </button>
          )}
          <button className="btn primary" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      )}
    </section>
  );
}

/** Disasters still weakening this country (smoke on the map), and its lower battle power. */
function WeakNote({ id, power }: { id: string; power: number }) {
  const t = getTerritory();
  const weak = t?.weakness(id) ?? 0;
  if (!t || weak <= 0) return null;
  const hits = t.disastersOf(id);
  const names = [...new Set(hits.map((h) => DISASTER_BY_ID.get(h.type)?.emoji ?? '💥'))].join(' ');
  return (
    <p className="weak-note">
      <span aria-hidden>💨</span> Weakened by {hits.length === 1 ? 'a disaster' : `${hits.length} disasters`} {names}: fights at{' '}
      <b>{Math.round(power * (1 - weak))}</b> (−{Math.round(weak * 100)}%) until it wins a battle or the world is reset.
    </p>
  );
}

/** How strong the country is in battles right now, and any war damage still healing. */
function BattleNote({ id }: { id: string }) {
  const t = getTerritory();
  if (!t || !playable(id)) return null;
  const r = effectiveRatings(id);
  const weak = t.weakness(id);
  const m = t.marksOf(id);
  const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  return (
    <div className="battle-note">
      <span>
        ⚔️ Attacks at <b>{Math.round(roleStrength(r, 'attacker', weak))}</b>
      </span>
      <span>
        🛡️ Defends at <b>{Math.round(roleStrength(r, 'defender', weak))}</b>
      </span>
      {(m.military !== 0 || m.money !== 0) && (
        <small>
          {m.military < 0 || m.money < 0 ? '🩹 War damage' : '💪 Battle-hardened'}:{' '}
          {[m.military ? `Military ${sign(m.military)}` : '', m.money ? `Money ${sign(m.money)}` : ''].filter(Boolean).join(', ')} · heals each year
        </small>
      )}
    </div>
  );
}

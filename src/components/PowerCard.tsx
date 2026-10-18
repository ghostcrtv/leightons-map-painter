import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { getStats } from '../stats/session';
import { RATING_KEYS, RATING_LABELS, type RatingKey } from '../stats/ratings';
import { IconMinus, IconPlus } from './icons';

/** The country card's Power section: Power Score, rank and the four ratings (editable). */
export function PowerCard({ id, editing, setEditing }: { id: string; editing: boolean; setEditing: (v: boolean) => void }) {
  useGame((s) => s.statsVersion);
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

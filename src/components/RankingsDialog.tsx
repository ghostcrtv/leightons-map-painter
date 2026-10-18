import { useMemo, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { getStats } from '../stats/session';
import { RATING_KEYS, RATING_LABELS, powerScore, type RatingKey } from '../stats/ratings';
import { parseRatingsCsv, ratingsToCsv } from '../stats/csv';
import { readTextFile, saveTextFile } from '../utils/files';
import { Modal } from './Modal';

type SortKey = 'power' | RatingKey;

/** Power rankings: every country sorted by strength, plus spreadsheet import/export. */
export function RankingsDialog() {
  const setOpen = useGame((s) => s.setRankingsOpen);
  const countries = useGame((s) => s.countries);
  const countryById = useGame((s) => s.countryById);
  const statsVersion = useGame((s) => s.statsVersion);
  const [sort, setSort] = useState<SortKey>('power');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const book = getStats();

  const rows = useMemo(() => {
    if (!book) return [];
    const q = query.trim().toLowerCase();
    const all = book.ranking().filter((r) => {
      const c = countryById.get(r.id);
      return c && !c.disputed && (!q || c.name.toLowerCase().includes(q));
    });
    if (sort !== 'power') return [...all].sort((a, b) => b.ratings[sort] - a.ratings[sort] || b.power - a.power);
    return all;
    // statsVersion: re-sort when ratings change
  }, [book, countryById, query, sort, statsVersion]);

  if (!book) return null;

  const importFile = async (file: File) => {
    const result = parseRatingsCsv(await readTextFile(file), countries);
    if (result.error) {
      setMessage({ text: result.error, bad: true });
      return;
    }
    book.applyMany(result.rows);
    const skipped = result.unknown.length
      ? ` Couldn't match ${result.unknown.length}: ${result.unknown.slice(0, 5).join(', ')}${result.unknown.length > 5 ? '…' : ''}.`
      : '';
    setMessage({ text: `Updated ${result.rows.length} countries (${result.columns.map((k) => RATING_LABELS[k]).join(', ')}).${skipped}` });
  };

  const select = (id: string) => {
    useGame.getState().select(id);
    mapController.flyTo(id);
    setOpen(false);
  };

  return (
    <Modal title="Power rankings" onClose={() => setOpen(false)} wide>
      <p className="muted rank-note">Ratings are approximate game estimates, not official figures. Tap a country to see it.</p>
      <div className="rank-controls">
        <input
          id="rank-search"
          type="search"
          className="rank-search"
          placeholder="Find a country…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        <div className="chips" role="radiogroup" aria-label="Sort by">
          {(['power', ...RATING_KEYS] as SortKey[]).map((k) => (
            <button key={k} role="radio" aria-checked={sort === k} className={`chip${sort === k ? ' on' : ''}`} onClick={() => setSort(k)}>
              {k === 'power' ? 'Power' : RATING_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <ol className="rank-list">
        {rows.map((r, i) => {
          const c = countryById.get(r.id)!;
          const flag = mapController.flagUrl(c.flag);
          return (
            <li key={r.id}>
              <button className="rank-row" onClick={() => select(r.id)}>
                <span className="rank-num">{sort === 'power' ? r.rank : i + 1}</span>
                {flag ? <img src={flag} alt="" className="mini-flag" /> : <span className="mini-flag disputed" />}
                <span className="rank-name">
                  {c.name}
                  {book.isEdited(r.id) && <em className="edited-tag">edited</em>}
                </span>
                <span className="rank-mini" aria-label="Attack, defense, money, military">
                  {RATING_KEYS.map((k) => (
                    <span key={k} className={sort === k ? 'hi' : ''}>
                      {r.ratings[k]}
                    </span>
                  ))}
                </span>
                <span className="rank-power">{sort === 'power' ? r.power : r.ratings[sort]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="sheet-tools">
        <h3>Spreadsheet</h3>
        <p className="muted">
          Import your own ratings from a CSV file (save it from Excel, Numbers or Google Sheets). Columns: Country, Attack,
          Defense, Money, Military. The Power Score is worked out automatically.
        </p>
        <div className="sheet-buttons">
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            Import CSV
          </button>
          <button className="btn secondary" onClick={() => saveTextFile('map-painter-ratings.csv', ratingsToCsv(countries, (id) => book.get(id)))}>
            Download all ratings
          </button>
          <button className="btn secondary" onClick={() => setConfirmReset(true)}>
            Reset all ratings
          </button>
          <input
            ref={fileRef}
            id="ratings-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && <p className={`sheet-msg${message.bad ? ' bad' : ''}`}>{message.text}</p>}
        {confirmReset && (
          <div className="confirm" role="alertdialog" aria-label="Reset all ratings?">
            <p>Put every country back to its starting ratings? Your edits and imports will be lost.</p>
            <div className="confirm-buttons">
              <button className="btn secondary" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  book.reset();
                  setConfirmReset(false);
                  setMessage({ text: 'All ratings are back to the starting values.' });
                }}
              >
                Reset all
              </button>
            </div>
          </div>
        )}
      </section>
      <p className="muted small-print">Power Score = Attack 25% + Defense 25% + Money 20% + Military 30%. Example: {powerScore({ attack: 96, defense: 94, money: 98, military: 99 })} for 96 / 94 / 98 / 99.</p>
    </Modal>
  );
}

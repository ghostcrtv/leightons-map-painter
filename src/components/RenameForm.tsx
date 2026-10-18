import { useState } from 'react';
import { useGame } from '../game/store';
import { realCapital, realName } from '../custom/customs';
import { currentWorld, updateCurrentWorld } from '../worlds/session';
import { cleanName } from '../worlds/model';
import { unlock } from '../game/achievements';

/** Rename a country (and its capital) in this world. The real names can always come back. */
export function RenameForm({ id, onDone }: { id: string; onDone: () => void }) {
  const c = useGame((s) => s.countryById.get(id));
  const [name, setName] = useState(c?.name ?? '');
  const [capital, setCapital] = useState(c?.capital ?? '');
  if (!c) return null;
  const renamed = !!currentWorld()?.names[id];
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = cleanName(name);
    const cap = cleanName(capital);
    updateCurrentWorld((w) => {
      const entry: { name?: string; capital?: string } = {};
      if (n && n !== realName(id)) entry.name = n;
      if (cap && cap !== realCapital(id)) entry.capital = cap;
      if (entry.name || entry.capital) w.names[id] = entry;
      else delete w.names[id];
    });
    if (n && n !== realName(id)) unlock('renamer');
    onDone();
  };
  return (
    <form className="rename-form" onSubmit={save}>
      <label className="nation-select">
        <span className="field-label">Country name</span>
        <input id="rename-country" className="text-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="nation-select">
        <span className="field-label">Capital</span>
        <input id="rename-capital" className="text-input" maxLength={40} value={capital} onChange={(e) => setCapital(e.target.value)} />
      </label>
      <div className="confirm-buttons">
        {renamed && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              updateCurrentWorld((w) => delete w.names[id]);
              onDone();
            }}
          >
            Real names
          </button>
        )}
        <button type="button" className="btn secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Save
        </button>
      </div>
      <small className="muted">Only changes the name in this world. Real name: {realName(id)}</small>
    </form>
  );
}

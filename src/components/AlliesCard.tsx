import { useMemo } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { playable, setAlliance } from '../sim/runner';
import { getTerritory } from '../territory/session';
import { CountryPicker } from './CountryPicker';

/** Country card: this country's allies. Allies help each other in battles and never fight each other. */
export function AlliesCard({ id }: { id: string }) {
  const version = useGame((s) => s.territoryVersion);
  const countries = useGame((s) => s.countries);
  const byId = useGame((s) => s.countryById);
  const select = useGame((s) => s.select);
  const t = getTerritory();
  const allies = t ? t.alliesOf(id).filter((x) => byId.has(x)) : [];
  const options = useMemo(
    () => countries.filter((c) => c.id !== id && playable(c.id) && !allies.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countries, id, version],
  );
  if (!t || !playable(id)) return null;
  return (
    <section className="stat-card allies-card">
      <h3>Allies 🤝</h3>
      {allies.length === 0 ? (
        <p className="muted">No allies yet. Allies help each other in battles and won’t fight each other.</p>
      ) : (
        <div className="ally-chips">
          {allies.map((x) => {
            const c = byId.get(x)!;
            const flag = mapController.flagUrl(c.flag);
            return (
              <span key={x} className="ally-chip">
                <button className="ally-name" onClick={() => select(x)}>
                  {flag && <img src={flag} alt="" />}
                  {c.name}
                </button>
                <button className="ally-x" aria-label={`End alliance with ${c.name}`} onClick={() => setAlliance(id, x, false)}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <CountryPicker
        id={`ally-add-${id}`}
        className="ally-add"
        value=""
        showValue={false}
        placeholder="＋ Make an ally…"
        onChange={(v) => {
          if (v) setAlliance(id, v, true);
        }}
        items={options.map((c) => ({ id: c.id }))}
      />
    </section>
  );
}

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { formatArea, formatAreaMiles, ordinal } from '../utils/format';
import {
  IconBrush,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconLock,
  IconShield,
  IconSliders,
  IconSword,
  IconTarget,
  IconWaves,
} from './icons';

/**
 * Information about the tapped country. Right-hand panel on iPad landscape and
 * desktop; a sheet at the bottom on narrow screens. Can be collapsed to a chip.
 */
export function CountryPanel() {
  const selectedId = useGame((s) => s.selectedId);
  const countryById = useGame((s) => s.countryById);
  const countries = useGame((s) => s.countries);
  const collapsed = useGame((s) => s.panelCollapsed);
  const setCollapsed = useGame((s) => s.setPanelCollapsed);
  const select = useGame((s) => s.select);
  const ref = useRef<HTMLElement>(null);

  const country = selectedId ? countryById.get(selectedId) : undefined;

  // Size ranking (largest = 1st). Disputed specks are left out of the ranking.
  const rankById = useMemo(() => {
    const ranked = countries.filter((c) => !c.disputed).sort((a, b) => b.areaKm2 - a.areaKm2);
    return { map: new Map(ranked.map((c, i) => [c.id, i + 1])), total: ranked.length };
  }, [countries]);

  // Tell the map how much space the panel covers, so "zoom to country" centres in the free area.
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      mapController.setInsets({ right: 0, bottom: 0 });
      return;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.left > window.innerWidth / 2) mapController.setInsets({ right: window.innerWidth - r.left, bottom: 0 });
      else mapController.setInsets({ right: 0, bottom: window.innerHeight - r.top });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [country, collapsed]);

  if (!country) return null;
  const flagUrl = mapController.flagUrl(country.flag);
  const rank = rankById.map.get(country.id);

  if (collapsed) {
    return (
      <button ref={ref as React.RefObject<HTMLButtonElement>} className="panel-chip" onClick={() => setCollapsed(false)}>
        {flagUrl ? <img src={flagUrl} alt="" className="mini-flag" /> : <span className="mini-flag disputed" />}
        <span className="chip-name">{country.name}</span>
        <IconChevronUp width={18} height={18} />
      </button>
    );
  }

  return (
    <aside ref={ref} className="country-panel" aria-label={`${country.name} information`}>
      <div className="panel-head">
        <div className="panel-buttons">
          <button className="icon-btn small" onClick={() => setCollapsed(true)} aria-label="Shrink panel" title="Shrink">
            <IconChevronDown width={18} height={18} />
          </button>
          <button className="icon-btn small" onClick={() => select(null)} aria-label="Close" title="Close">
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="flag-frame">
          {flagUrl ? <img src={flagUrl} alt={`Flag of ${country.name}`} /> : <div className="flag-disputed">Disputed area</div>}
        </div>
        <h2 className="country-name">{country.name}</h2>
        <p className="country-sub">
          {country.disputed ? 'Disputed territory' : 'Country or territory'} · Code {country.id}
        </p>
      </div>

      <div className="panel-body">
        <section className="stat-card">
          <h3>Territory</h3>
          <div className="big-number">100%</div>
          <div className="meter" aria-hidden>
            <span style={{ width: '100%' }} />
          </div>
          <p className="muted">of its original land · nothing gained or lost yet</p>
          <dl className="facts">
            {country.capital && (
              <div>
                <dt>Capital</dt>
                <dd className="capital-name">★ {country.capital}</dd>
              </div>
            )}
            <div>
              <dt>Size</dt>
              <dd>
                {formatArea(country.areaKm2)}
                <small>{formatAreaMiles(country.areaKm2)}</small>
              </dd>
            </div>
            {rank && (
              <div>
                <dt>Size rank</dt>
                <dd>
                  {ordinal(rank)} biggest<small>of {rankById.total}</small>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="stat-card locked">
          <h3>
            Power <IconLock width={14} height={14} />
          </h3>
          <p className="muted">
            Attack, Defense, Money, Military and a total Power Score arrive in the next update.
          </p>
          <div className="power-ghost" aria-hidden>
            {['Attack', 'Defense', 'Money', 'Military'].map((k) => (
              <div key={k}>
                <span>{k}</span>
                <i />
              </div>
            ))}
          </div>
        </section>

        <div className="actions">
          <button className="action primary" onClick={() => mapController.flyTo(country.id)}>
            <IconTarget /> Zoom to {country.name.length > 16 ? 'country' : country.name}
          </button>
          <SoonAction icon={<IconSword />} label="Attack" />
          <SoonAction icon={<IconShield />} label="Defend" />
          <SoonAction icon={<IconBrush />} label="Paint Territory" />
          <SoonAction icon={<IconWaves />} label="Expand Land" />
          <SoonAction icon={<IconSliders />} label="Edit Stats" />
        </div>
      </div>
    </aside>
  );
}

function SoonAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="action soon" disabled title="Coming in a future update">
      {icon} {label}
      <span className="soon-tag">Soon</span>
    </button>
  );
}

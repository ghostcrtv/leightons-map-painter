import { useMemo, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { WHEELS, landingAngle, optionAt, randomIndex, type WheelDef, type WheelOption } from '../actions/wheels';
import { Modal } from './Modal';
import { IconChevronDown } from './icons';

/**
 * The Actions menu: tools for making random decisions (spin wheels) and other extras.
 * New actions go in the list below.
 */
export function ActionsDialog() {
  const setOpen = useGame((s) => s.setActionsOpen);
  const setRankingsOpen = useGame((s) => s.setRankingsOpen);
  const [wheelId, setWheelId] = useState<string | null>(null);
  const wheel = WHEELS.find((w) => w.id === wheelId);

  return (
    <Modal title={wheel ? `Spin: ${wheel.title}` : 'Actions'} onClose={() => setOpen(false)} wide>
      {wheel ? (
        <>
          <button className="back-link" onClick={() => setWheelId(null)}>
            <IconChevronDown width={16} height={16} style={{ transform: 'rotate(90deg)' }} /> All actions
          </button>
          <WheelView key={wheel.id} wheel={wheel} onDone={() => setOpen(false)} />
        </>
      ) : (
        <>
          <h3 className="actions-heading">Spin a wheel</h3>
          <div className="action-grid">
            {WHEELS.map((w) => (
              <button key={w.id} className="action-card" onClick={() => setWheelId(w.id)}>
                <span className="action-emoji" aria-hidden>
                  {w.emoji}
                </span>
                <strong>{w.title}</strong>
                <small>{w.blurb}</small>
              </button>
            ))}
          </div>
          <h3 className="actions-heading">More</h3>
          <div className="action-grid">
            <button
              className="action-card"
              onClick={() => {
                setOpen(false);
                setRankingsOpen(true);
              }}
            >
              <span className="action-emoji" aria-hidden>
                🏆
              </span>
              <strong>Power rankings</strong>
              <small>Strongest countries, edit & import ratings</small>
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function WheelView({ wheel, onDone }: { wheel: WheelDef; onDone: () => void }) {
  const countries = useGame((s) => s.countries);
  // Territory changes can take conquered countries off the country wheel.
  const territoryVersion = useGame((s) => s.territoryVersion);
  const options = useMemo(
    () =>
      wheel.options({
        countries,
        hasLand: (id) => (territoryVersion >= 0 ? !mapController.isConquered(id) : true),
        flagColor: mapController.flagColor,
      }),
    [wheel, countries, territoryVersion],
  );
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelOption | null>(null);
  const pending = useRef<number | null>(null);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const spin = () => {
    if (spinning || options.length === 0) return;
    const index = randomIndex(options.length);
    const wobble = randomIndex(1000) / 1000 - 0.5;
    pending.current = index;
    setResult(null);
    setSpinning(true);
    setAngle((a) => landingAngle(a, index, options.length, reduceMotion ? 1 : 6, wobble));
  };

  const finished = () => {
    if (!spinning) return;
    setSpinning(false);
    const index = pending.current ?? optionAt(angle, options.length);
    setResult(options[index]);
  };

  const showCountry = (id: string) => {
    useGame.getState().select(id);
    mapController.flyTo(id);
    onDone();
  };

  return (
    <div className="wheel-view">
      <div className="wheel-wrap">
        <div className="wheel-pointer" aria-hidden />
        <svg
          className="wheel"
          viewBox="-100 -100 200 200"
          style={{
            transform: `rotate(${angle}deg)`,
            transition: spinning ? `transform ${reduceMotion ? 0.4 : 4.2}s cubic-bezier(0.12, 0.7, 0.12, 1)` : 'none',
          }}
          onTransitionEnd={finished}
          role="img"
          aria-label={`Wheel with ${options.length} choices`}
        >
          {options.map((o, i) => (
            <path key={i} d={slicePath(i, options.length)} fill={o.color} stroke="#0b1320" strokeWidth={options.length > 60 ? 0.15 : 0.8} />
          ))}
          {options.length <= 12 &&
            options.map((o, i) => {
              const mid = ((i + 0.5) * 360) / options.length;
              return (
                <text
                  key={`t${i}`}
                  transform={`rotate(${mid}) translate(0 -62)`} /* upright when its slice stops under the pointer */
                  className="wheel-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={options.length > 6 ? 8.5 : 12}
                >
                  {o.label}
                </text>
              );
            })}
          <circle r="14" fill="#121b29" stroke="#ffcd3c" strokeWidth="2.5" />
        </svg>
      </div>

      <div className="wheel-side">
        <button className="btn primary spin-btn" onClick={spin} disabled={spinning || options.length === 0}>
          {spinning ? 'Spinning…' : result ? 'Spin again' : 'SPIN!'}
        </button>
        <div className={`wheel-result${result ? ' show' : ''}`} aria-live="polite">
          {result ? (
            <>
              <small>It landed on</small>
              {result.countryId ? <ResultCountry id={result.countryId} /> : <strong className="result-word" style={{ background: result.color }}>{result.label}</strong>}
              {result.countryId && (
                <button className="btn secondary" onClick={() => showCountry(result.countryId!)}>
                  Show on map
                </button>
              )}
            </>
          ) : (
            <small>{options.length} choices on this wheel{wheel.id === 'country' ? ' (conquered countries are left off)' : ''}</small>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCountry({ id }: { id: string }) {
  const c = useGame((s) => s.countryById.get(id));
  if (!c) return null;
  const flag = mapController.flagUrl(c.flag);
  return (
    <span className="result-country">
      {flag && <img src={flag} alt="" />}
      <strong>{c.name}</strong>
    </span>
  );
}

/** A pie slice from the top, going clockwise. */
function slicePath(i: number, n: number): string {
  if (n === 1) return 'M0 -98 A98 98 0 1 1 -0.01 -98 Z';
  const a0 = ((i / n) * 360 - 90) * (Math.PI / 180);
  const a1 = (((i + 1) / n) * 360 - 90) * (Math.PI / 180);
  const r = 98;
  const large = 360 / n > 180 ? 1 : 0;
  return `M0 0 L${(r * Math.cos(a0)).toFixed(3)} ${(r * Math.sin(a0)).toFixed(3)} A${r} ${r} 0 ${large} 1 ${(r * Math.cos(a1)).toFixed(3)} ${(r * Math.sin(a1)).toFixed(3)} Z`;
}

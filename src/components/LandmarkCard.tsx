import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { mapController } from '../game/mapController';
import { LANDMARKS, LANDMARK_BY_ID } from '../data/landmarks';
import { discover, discoveredCount } from '../game/landmarks';
import { sound } from '../audio/sound';
import { IconClose } from './icons';

/** The card that pops up from a landmark pin: a round photo, the name, where it is and a fun fact. */
export function LandmarkCard() {
  const card = useGame((s) => s.landmarkCard);
  const setCard = useGame((s) => s.setLandmarkCard);
  const byId = useGame((s) => s.countryById);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [photoOk, setPhotoOk] = useState(true);
  const lm = card ? LANDMARK_BY_ID.get(card.id) : undefined;

  useEffect(() => {
    if (!lm) return;
    setPhotoOk(true);
    const first = discover(lm.id);
    setIsNew(first);
    sound.play(first ? 'chirp' : 'pop');
  }, [lm]);

  // Keep the card on its pin, even while the map flies somewhere (zoom buttons and so on).
  useLayoutEffect(() => {
    if (!card) return;
    let raf = 0;
    let last = '';
    const place = () => {
      const el = ref.current;
      const at = mapController.landmarkScreen(card.id) ?? [card.x, card.y];
      // The map moved somewhere else (zoom buttons, a simulation…): the pin is gone, so is the card.
      if (at[0] < -20 || at[1] < -20 || at[0] > window.innerWidth + 20 || at[1] > window.innerHeight + 20) {
        useGame.getState().setLandmarkCard(null);
        return;
      }
      if (el) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const margin = 12;
        const top0 = 84; // below the top bar
        const pinTop = at[1] - 38;
        const below = pinTop - h < top0;
        const left = Math.max(margin, Math.min(window.innerWidth - w - margin, at[0] - w / 2));
        const top = below ? Math.min(window.innerHeight - h - margin, at[1] + 10) : pinTop - h;
        const key = `${Math.round(left)},${Math.round(top)},${below}`;
        if (key !== last) {
          last = key;
          setPos({ left, top, below });
        }
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [card]);

  if (!card || !lm) return null;
  const country = byId.get(lm.country);
  const flag = country ? mapController.flagUrl(country.flag) : null;
  const photo = lm.photo && photoOk ? `${import.meta.env.BASE_URL}landmarks/${lm.id}.jpg` : null;
  const n = discoveredCount();

  return (
    <div
      ref={ref}
      className={`landmark-card${pos?.below ? ' below' : ''}`}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
      role="dialog"
      aria-label={lm.name}
    >
      <button className="icon-btn small landmark-close" aria-label="Close" onClick={() => setCard(null)}>
        <IconClose width={16} height={16} />
      </button>
      <div className="landmark-circle">
        {photo ? (
          <img src={photo} alt={lm.name} onError={() => setPhotoOk(false)} />
        ) : (
          <span className="landmark-emoji" aria-hidden>
            {lm.emoji}
          </span>
        )}
      </div>
      <div className="landmark-name">{lm.name}</div>
      <p className="landmark-place">
        {flag && <img src={flag} alt="" />}
        {lm.place}
        {country ? `, ${country.name}` : ''}
      </p>
      <p className="landmark-fact">{lm.fact}</p>
      <p className="landmark-count">
        {isNew && <b className="landmark-new">New! </b>}
        📸 {n} of {LANDMARKS.length} landmarks discovered
      </p>
      {photo && lm.photo && (
        <p className="landmark-credit">
          Photo: {lm.photo.credit} · {lm.photo.licence}
        </p>
      )}
    </div>
  );
}

import { useEffect } from 'react';
import { useGame } from '../game/store';
import { sound } from '../audio/sound';

/** The celebration when a hidden thing is found (the monkey or the Impossible Island). */
export function SecretPop() {
  const pop = useGame((s) => s.secretPop);
  const setPop = useGame((s) => s.setSecretPop);

  useEffect(() => {
    if (!pop) return;
    sound.play(pop === 'monkey' ? 'monkey' : 'adventure');
    const t = window.setTimeout(() => setPop(null), pop === 'monkey' ? 1600 : 6000);
    return () => clearTimeout(t);
  }, [pop, setPop]);

  if (!pop) return null;
  if (pop === 'monkey') {
    return (
      <div className="secret-pop monkey" role="status" aria-live="polite" onClick={() => setPop(null)}>
        <span className="secret-monkey" aria-hidden>
          🐒
        </span>
        <strong className="secret-title">You Found Me!</strong>
      </div>
    );
  }
  return (
    <div className="secret-pop island" role="status" aria-live="polite" onClick={() => setPop(null)}>
      <div className="secret-card">
        <span className="secret-island" aria-hidden>
          🏝️
        </span>
        <strong className="secret-title">You found The Impossible Island!</strong>
        <p>
          It sits at Point Nemo: the spot in the ocean farthest from any land, about 2,700 km from the nearest shore. Hardly
          anyone ever finds it!
        </p>
      </div>
    </div>
  );
}

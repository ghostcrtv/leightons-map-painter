import { useState } from 'react';
import { useGame } from '../game/store';
import { writeSetting } from '../utils/settings';

const STEPS = [
  {
    title: 'Welcome, Leighton!',
    text: 'This is your world. Every country shows its own flag. Paint borders to grab land, and soon you’ll build islands and fight battles too.',
    emoji: '🌍',
  },
  {
    title: 'Move and zoom',
    text: 'Slide one finger to move the map. Pinch with two fingers to zoom. Double-tap to zoom in fast.',
    emoji: '👆',
  },
  {
    title: 'Tap a country',
    text: 'Tap any country to see its flag and size. Can’t find one? Type its name in the search box at the top.',
    emoji: '🗺️',
  },
  {
    title: 'Paint the world',
    text: 'Tap a country, then Paint Territory. Slide one finger over a neighbour to make it yours. Two fingers move the map.',
    emoji: '🖌️',
  },
  {
    title: 'Need help?',
    text: 'Tap the Help button at the top any time to see how everything works.',
    emoji: '❓',
  },
];

export const TOUR_SEEN_KEY = 'tourSeen';

/** Short first-time introduction. Skippable, and only shown once. */
export function WelcomeTour() {
  const setTourOpen = useGame((s) => s.setTourOpen);
  const [step, setStep] = useState(0);
  const finish = () => {
    writeSetting(TOUR_SEEN_KEY, true);
    setTourOpen(false);
  };
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="modal-backdrop tour-backdrop">
      <div className="modal tour" role="dialog" aria-modal="true" aria-label={s.title}>
        <div className="tour-emoji" aria-hidden>
          {s.emoji}
        </div>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <div className="tour-dots" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="modal-foot">
          {!last && (
            <button className="btn secondary" onClick={finish}>
              Skip
            </button>
          )}
          <button className="btn primary" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? 'Let’s play!' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useGame } from '../game/store';
import { Modal } from './Modal';

interface Topic {
  title: string;
  text: string;
  ready: boolean;
}

/** HOW TO PLAY — always reachable from the Help button. Written for kids. */
const TOPICS: Topic[] = [
  { title: 'Move around the map', ready: true, text: 'Put one finger on the map and slide it. With a mouse, click and drag. Flick it and the map glides!' },
  { title: 'Zoom in and out', ready: true, text: 'Pinch two fingers apart to zoom in, and together to zoom out. Double-tap to zoom in fast. You can also use the + and − buttons on the left, or the mouse wheel.' },
  { title: 'See the whole world', ready: true, text: 'Tap the globe button on the left to zoom all the way out.' },
  { title: 'Pick a country', ready: true, text: 'Tap any country. It gets a gold outline and its card opens. Tiny countries show up as little dots once you zoom in a bit.' },
  { title: 'Find a country by name', ready: true, text: 'Type its name in the search box at the top, then tap it in the list. The map flies right there.' },
  { title: 'Country information', ready: true, text: 'The country card shows the flag, how big the country is, and how much of its land it still has. Tap the arrow to shrink the card, or × to close it.' },
  { title: 'Paint territory and change borders', ready: false, text: 'Pick a country, choose the Paint brush, and paint over a neighbour. That land becomes yours and shows your flag.' },
  { title: 'Power ratings', ready: false, text: 'Every country gets Attack, Defense, Money and Military ratings, plus one Power Score to compare countries quickly.' },
  { title: 'Battles', ready: false, text: 'Pick an attacker and a defender and press BATTLE. Stronger countries usually win, but surprises can happen! Then you decide what happens to the land.' },
  { title: 'Expand land and create islands', ready: false, text: 'Paint new land into the ocean from a coastline, or make a brand-new island for any country.' },
  { title: 'Save and load worlds', ready: false, text: 'Save your world with a name, load it later, and make backup files so you never lose it.' },
  { title: 'Reset the map', ready: false, text: 'Put any country, or the whole world, back to the real Earth.' },
];

export function HelpDialog() {
  const setHelpOpen = useGame((s) => s.setHelpOpen);
  const setTourOpen = useGame((s) => s.setTourOpen);
  return (
    <Modal title="How to play" onClose={() => setHelpOpen(false)} wide>
      <ol className="help-list">
        {TOPICS.map((t) => (
          <li key={t.title} className={t.ready ? '' : 'soon'}>
            <h3>
              {t.title}
              {!t.ready && <span className="soon-tag">Coming soon</span>}
            </h3>
            <p>{t.text}</p>
          </li>
        ))}
      </ol>
      <div className="modal-foot">
        <button
          className="btn secondary"
          onClick={() => {
            setHelpOpen(false);
            setTourOpen(true);
          }}
        >
          Show the welcome tour again
        </button>
        <button className="btn primary" onClick={() => setHelpOpen(false)}>
          Got it!
        </button>
      </div>
    </Modal>
  );
}

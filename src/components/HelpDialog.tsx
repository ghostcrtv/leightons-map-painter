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
  { title: 'Pick a country', ready: true, text: 'Tap any country. It gets a gold outline and its card opens. Really tiny countries, like Vatican City and Gibraltar, show up as little dots once you zoom in a bit. Tap the dot!' },
  { title: 'Capital cities', ready: true, text: 'Zoom in and capital cities appear as yellow stars with their names. You can turn them off in Settings (the gear button).' },
  { title: 'Find a country by name', ready: true, text: 'Type its name in the search box at the top, then tap it in the list. The map flies right there.' },
  { title: 'Country information', ready: true, text: 'The country card shows the flag, how big the country is, and how much of its land it still has. Tap the arrow to shrink the card, or × to close it.' },
  { title: 'Paint territory', ready: true, text: 'Tap a country, then tap Paint Territory (or the brush on the left). Now slide one finger into a neighbour: that land becomes yours and shows your flag. The borders move too!' },
  { title: 'Paint stays inside one country', ready: true, text: 'Each stroke only paints the first country it reaches, so you never paint the wrong neighbour by accident. To paint another country, lift your finger and start a new stroke.' },
  { title: 'Brush sizes', ready: true, text: 'While painting, pick Small, Medium or Large next to the toolbar. Zoom in to paint carefully, zoom out for giant land grabs.' },
  { title: 'Fill a whole country', ready: true, text: 'Pick the paint bucket (Fill) under the brush sizes, then tap any country: all of it becomes yours in one go. With the eraser, Fill puts a whole country back.' },
  { title: 'Move the map while painting', ready: true, text: 'Use TWO fingers to move or zoom the map while painting. On a computer, drag with the right mouse button.' },
  { title: 'Change who is painting', ready: true, text: 'Tap Change in the bar at the bottom, then tap a different country.' },
  { title: 'Oops! Undo and Redo', ready: true, text: 'The curved arrows on the left take back your last change, or bring it back again.' },
  { title: 'Erase', ready: true, text: 'Pick the eraser and drag over land to put back the real borders there.' },
  { title: 'Territory score', ready: true, text: 'Every country starts at 100% of its real land. Grab land and it goes up (187% means almost twice as big!). Really huge? It shows 12× bigger. Lose it all and the country is Conquered.' },
  { title: 'Power ratings', ready: true, text: 'Every country has Attack, Defense, Money and Military ratings (1–100) and one Power Score. Tap Edit Stats to change them. They are game estimates, not official numbers.' },
  { title: 'Action wheels', ready: true, text: 'Tap the wheel button at the top to spin for a random country, War / Land / Erode, how much, or which direction.' },
  { title: 'Power rankings', ready: true, text: 'In Actions, open Power rankings to see the strongest countries, or import your own ratings from a spreadsheet (CSV).' },
  { title: 'Simulation: conflicts', ready: true, text: 'Tap the lightning button at the top, then Conflict. Pick two nations (or 🎲 Random) and press BATTLE! Watch the missiles fly. Stronger countries usually win, but underdogs sometimes surprise everyone. The winner may take some land, ALL the land, or they make peace.' },
  { title: 'Simulation: natural disasters', ready: true, text: 'In Simulation, choose Natural disaster. Pick a nation and a disaster, or press Random disaster for one that really happens there. Hit countries are weakened: smoke rises from them and they fight at lower power until you reset them.' },
  { title: 'Auto battles', ready: true, text: 'Press Auto battles to watch random neighbours fight again and again. Press Stop when you’ve seen enough. Undo takes back the last result.' },
  { title: 'Expand land and create islands', ready: false, text: 'Paint new land into the ocean from a coastline, or make a brand-new island for any country.' },
  { title: 'Your world is remembered', ready: true, text: 'Your painting is kept on this iPad automatically, even if you close the game.' },
  { title: 'Save and load worlds', ready: false, text: 'Save lots of different worlds with names, load them later, and make backup files so you never lose them.' },
  { title: 'Reset the map', ready: true, text: 'Tap a country and choose Reset borders to put just that country back. To reset everything, open Settings (the gear) and tap Reset whole world.' },
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

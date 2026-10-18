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
  { title: 'Simulation: natural disasters', ready: true, text: 'In Simulation, choose Natural disaster. Pick a nation and a disaster, or press Random disaster for one that really happens there. Disasters can be light, moderate, severe or extreme. Hit countries are weakened: the worse it is, the more smoke rises from them, and they fight at lower power. They stay weak until they WIN a battle (there is always hope!) or the whole world is reset.' },
  { title: 'Sounds', ready: true, text: 'Battles, disasters, the paint bucket and the spin wheels make sounds. Turn them off or change the volume in Settings (the gear). If you hear nothing, check that the iPad isn’t muted.' },
  { title: 'Auto battles', ready: true, text: 'Press Auto battles to watch random neighbours fight again and again. Press Stop when you’ve seen enough. Undo takes back the last result.' },
  { title: 'Land tool: new land and erosion', ready: true, text: 'Tap the island button on the left. With ＋ Land, pick a country by the sea and drag over the water to build new land (even new islands!). With − Erode, drag over any land and it sinks into the sea. The light-blue line still shows the real border. Undo works as usual.' },
  { title: 'Your world is remembered', ready: true, text: 'Your world is kept on this iPad automatically, even if you close the game.' },
  { title: 'Save and load worlds', ready: true, text: 'Tap the logo (top left) to open Worlds. Make new worlds, play a different one, rename, copy or delete them. Every world saves itself. Make a backup file now and then to keep them extra safe.' },
  { title: 'Attack and defend', ready: true, text: 'In a Conflict, Nation 1 attacks (Attack + Military + Money) and Nation 2 defends (Defense + Military + Money + a home bonus). Losers get war damage that heals a little every year.' },
  { title: 'Allies', ready: true, text: 'On a country card, use Allies to make friends. Allies help each other in battles and never fight each other.' },
  { title: 'Simulate a whole year', ready: true, text: 'In Simulation, tap Simulate 1 year: battles, disasters, rebellions, new land and more happen one after another, then you see the Year in review. Skip jumps to the end. Undo takes back the whole year.' },
  { title: 'World War', ready: true, text: 'Countries fight their neighbours again and again until one rules the world. Watch it, or Go fast. Press Stop any time.' },
  { title: 'Rebellions, coasts and seas', ready: true, text: 'Rebellion lets a conquered country break free. Coast growth builds new land along a coast. Sea level rise eats a little land from every coast.' },
  { title: 'History', ready: true, text: 'Actions → History lists everything that happened, year by year. Tap ▶ to watch a battle or disaster again.' },
  { title: 'Create your own country', ready: true, text: 'Actions → Create a country. Pick a name, a capital and design its flag. Then paint its land, or build it an island with the Land tool.' },
  { title: 'Rename countries', ready: true, text: 'Tap ✏️ Rename on a country card to give it (and its capital) a new name in this world. "Real names" puts them back.' },
  { title: 'Leaderboard and badges', ready: true, text: 'Actions → Leaderboard shows the biggest, strongest and most winning countries. Badges are prizes you unlock by playing.' },
  { title: 'Pictures and day/night', ready: true, text: 'Actions → Picture of the map saves or shares a picture with your world’s name. Settings → Day and night makes night move around the world.' },
  { title: 'Play without internet', ready: true, text: 'After the game has opened once, it works offline too (when it’s on its own web address).' },
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
      <footer className="about-note">
        <h3>About</h3>
        <p>
          <strong>Leighton’s Map Painter</strong> was imagined, designed and developed by <strong>Leighton R.</strong> It
          grew out of his love for world flags, countries and geography, and his idea of a map where every nation flies its
          real flag, borders can be redrawn and the whole planet is up for grabs. Every feature in this game started as one of
          his ideas.
        </p>
        <p className="copyright">© 2026 Leighton R. All rights reserved.</p>
      </footer>
    </Modal>
  );
}

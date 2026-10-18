# Changelog

## 0.9.0 — 2026-10-18 — Smarter battles (big phase, stage 2)

- Changed: Nation 1 ATTACKS (Attack + Military + Money) and Nation 2 DEFENDS (Defense +
  Military + Money + a home bonus). Who attacks whom now matters.
- New: alliances (country card → Allies). Allies help in battles and won't fight each other.
- New: war damage — losers lose Military and Money; winners get battle-hardened. It heals a
  little every simulated year.
- New: History (Actions menu): every battle, peace deal, disaster and alliance, grouped by
  year, with ▶ to watch it again. Peace deals are now recorded (and can be undone).

## 0.8.0 — 2026-10-18 — Saved worlds (big phase, stage 1)

- New: Worlds menu (tap the logo): many named worlds, each saved automatically on the device
  (IndexedDB). New, Play, Rename, Copy, Delete (with confirmation), Back up one or all worlds
  to a file, and Open a backup file (always added as new worlds, never overwriting).
- The old single autosave becomes "My World" automatically; nothing is lost.
- The logo shows which world you're playing (and its year).

## 0.7.0 — 2026-10-17 — Land tool, water pattern, stronger disasters

- New: Land tool (island button): ＋ Land builds new land from the sea for countries by the
  sea (even new islands); − Erode sinks any land into the sea. Territory %, battles, undo,
  reset and saves all understand new and lost land. The real border stays as a light-blue line.
- New: a faint wave pattern on all water, so the sea is easy to tell apart from blue flags.
- New: the Direction wheel shows arrows (on the wheel and with the result: "That's down the map").
- Changed: disasters vary from Light to Extreme; the smoke matches (a wisp → black clouds) and
  so does the weakening. Weakness now lasts until the country WINS a battle or the whole world
  is reset (resetting a country's borders no longer heals it).

## 0.6.1 — 2026-10-17 — Sound effects

- New: sound effects made in code (no sound files): missile launches, explosions, doves,
  fireworks, a fanfare for wins, a chime for peace, a sound for each disaster, the paint
  bucket, and clicks as the spin wheels turn.
- New: Settings → Sound effects on/off and Volume (remembered).

## 0.6.0 — 2026-10-17 — Simulations: conflicts and natural disasters

- New: Simulation menu (lightning button, left of Actions).
- New: Conflict — two nations (or Random + a neighbour) fight in a short animated battle
  (missiles, explosions, smoke). Results: peace (doves), a piece of land taken, or complete
  conquest (fireworks), decided by Power Scores plus luck. Odds shown before each battle.
- New: Auto battles — random neighbours keep fighting until you press Stop.
- New: 11 natural disasters with their own animations; "Random disaster" picks a nation and a
  disaster that fits the place. Hit countries are weakened (fight at lower power) and smoke
  rises from them until they (or the whole map) are reset.
- Every simulation result can be undone and is kept after a reload.

## 0.5.0 — 2026-10-17 — Phase 3: Country statistics + Action wheels

- New: every country has Attack, Defense, Money and Military ratings and a Power Score
  (approximate game estimates, not official figures). Shown on the country card with its rank.
- New: Edit Stats (sliders and −/+), reset to starting ratings; edits are remembered.
- New: Power rankings window (sort, search, tap to fly) with spreadsheet (CSV) import and export.
- New: Actions menu (wheel button left of Settings) with four spin wheels: Country,
  War / Land / Erode, How much (Tiny–All), Direction (8 ways).
- Changed: a selected country shows its real border as a thin light-blue line, and a striped
  gold line around all the land it owns now.
- Fixed: newly painted land could flash black while painting fast past the flag's edge.

## 0.4.0 — 2026-10-17 — Smoother painting, country lock, Fill

- Changed: a paint (or erase) stroke now stays inside the first country it reaches, so you
  can't paint the wrong neighbour by accident. Painting starts at your own border.
- New: Fill brush (paint bucket) — tap a country and all of it becomes the painter's. With the
  eraser, Fill puts a whole country back.
- Faster: while painting, only the new paint is drawn (no full-map redraw per movement); the
  brush outline no longer redraws the map.
- Changed: the Help button is now just a "?" in a small round button.

## 0.3.1 — 2026-10-17 — iPad app readiness review

- Docs: `docs/ios-readiness.md` (Capacitor/iPadOS compatibility, offline, licences, App Store
  concerns); "Future: iPad App Store release" section in ROADMAP.md; one-codebase rules in CLAUDE.md.
- New: `public/third-party-notices.txt` (licence notices shipped with the game) and
  `npm run notices` to regenerate it. No gameplay changes.

## 0.3.0 — 2026-10-17 — Phase 2: Territory painting

- New: Paint tool — pick a country and paint over neighbours; the land becomes theirs, shows
  their flag (stretched over home + captured land) and gets a new border.
- New: Small / Medium / Large brushes; brush outline under the mouse.
- New: Erase tool (puts back real borders), Undo / Redo (buttons and Cmd/Ctrl+Z).
- New: Reset borders for one country (country card) and Reset whole world (Settings).
- New: territory score in the country card: % of real land, "12×" when huge, land gained /
  lost in km², "Conquered" at 0%. Real Earth is always 100%.
- New: the world is autosaved in the browser, so a reload keeps the painting.
- New: the Paint Pin logo is now the app icon and Home Screen icon; Lilita One title font.
- Changed: two fingers move the map while painting; a stray second finger cancels the stroke.
- Fixed: Escape now closes Settings; keys no longer reach the map while a window is open.

## 0.2.0 — 2026-10-17 — Phase 1 polish

- Fixed: small islands now each show a whole mini flag instead of a sliver of a big one;
  flags are re-fitted to the detailed borders so no island is left uncovered.
- Fixed: tiny countries (Gibraltar, Monaco, Vatican, San Marino…) keep their real shapes;
  simplifying the borders no longer erases them. They also get a bolder outline.
- Fixed: very small shapes could flip "inside out" (the Vatican covered the map in white).
- New: full-detail borders, downloaded only when zooming in close. Zoom is capped where the
  map data stops being accurate.
- New: capital cities — yellow stars and names when zoomed in; on/off in Settings; capital
  shown in the country card.
- Changed: smaller "? HELP" button.
- Design: three logo concepts in `design/logo-concepts/` (not used in the app yet).

## 0.1.0 — 2026-10-17 — Phase 1: Working World Map

- New: world map with 255 countries and territories, each filled with its flag inside its
  real borders (Natural Earth 1:10m data, flag-icons flags).
- New: pan, pinch-zoom, double-tap zoom, mouse wheel, trackpad and keyboard controls.
- New: two levels of border detail; sharper borders load in the background.
- New: tap to select a country; dots for tiny countries when zoomed in; country names.
- New: country information panel (flag, size, size rank, territory %), collapsible.
- New: country search, Help / How to play, first-time welcome tour, Settings.
- New: iPad Home Screen icon and full-screen mode.
- New: automated tests for country data, flag placement and camera maths.
- Docs: README, CLAUDE.md, ROADMAP.md, CHANGELOG.md.

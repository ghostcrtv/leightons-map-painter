# Changelog

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

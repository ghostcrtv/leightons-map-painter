# Roadmap — Leighton's Map Painter

## Current phase

**Phase 1: Working World Map — complete (waiting for iPad testing).**
Next up: **Phase 2: Territory Painting.**

## Completed

### Phase 1 — Working world map
- Accurate world map from Natural Earth (1:10m), 255 selectable countries and territories.
- Every country filled with its own flag, clipped to its real borders.
- Smooth pan, pinch-to-zoom, double-tap zoom, mouse wheel, trackpad, keyboard.
- Sharper borders load automatically when zoomed in.
- Tap/click to select (gold outline); tiny countries get tappable dots when zoomed in.
- Country names on the map, sized to fit.
- Capital cities (yellow stars, can be turned off in Settings).
- Tiny countries keep their real shapes; full-detail borders when zoomed in close.
- Country panel: flag, name, size, size rank, territory %, future actions shown as "Soon".
- Search for a country by name; the map flies there.
- Help ("How to play"), first-time welcome tour (skippable, shown once), Settings
  (names on/off, borders on/off).
- iPad Home Screen icon and full-screen app mode.
- Automated tests for data and map maths.

## Upcoming

| Phase | What | Notes |
|---|---|---|
| 2 | Territory painting | Paint tool, Small/Medium/Large brush, erase/restore, undo/redo, reset country, reset world |
| 3 | Country statistics | Attack, Defense, Money, Military, Power Score; rankings; edit stats; spreadsheet import |
| 4 | Battles | Quick Battle, Full Invasion, Border Conflict, Custom; results and conquest choices |
| 5 | Land expansion | Paint into water, coastline expansion, island creation, land removal |
| 6 | Saving | IndexedDB save slots, rename/duplicate/delete, export/import files, versioned saves |
| 7 | Deployment | GitHub + Cloudflare Pages, permanent web address, Home Screen |
| 8 | Polish | Performance, battle presentation, tutorials, offline play |

Deployment can happen earlier — any time after Phase 1 — so Leighton can play while we build.

## Known issues / limits

- **Not yet tested on a real iPad.** Tested in Chromium at iPad and phone sizes only.
- Natural Earth's smallest countries are approximate shapes; their areas are rough
  (e.g. Monaco shows ~18 km², Vatican "under 1 km²"). The Vatican is a thin sliver in the
  data, so it shows as a dot.
- Zoom stops at 300× because the free map data isn't accurate beyond that.
- Logo: three concepts drawn (design/logo-concepts); waiting for a pick.
- Flags are 4:3 versions (from flag-icons), so a few flags (e.g. Nepal, Switzerland) look
  slightly different from their official proportions.
- Antarctica takes a lot of room at the bottom (normal for this projection).
- Disputed specks (e.g. Spratly Islands, Siachen Glacier) are grey instead of a flag.
- No offline mode yet (needs an internet connection to load).

## Future ideas (not scheduled)

Military alliances · automatic conquest · country elimination · mergers · rebellions · custom
countries and flags · historical maps · world rankings · battle history · random wars ·
diplomacy · AI-controlled countries · **Simulate 1 year / 10 years** · world history timeline ·
territory growth charts · economic growth · military upgrades · optional free cloud saves.

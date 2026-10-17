# Roadmap — Leighton's Map Painter

## Current phase

**Phase 2: Territory Painting — complete (waiting for iPad testing).**
Next up: **Phase 3: Country statistics** (Attack, Defense, Money, Military, Power Score).

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

### Phase 2 — Territory painting
- Paint tool with Small/Medium/Large brushes and a Fill (whole country) brush; captured land
  shows the painter's flag. Each stroke stays inside one country.
- Borders move with the paint; coastlines stay crisp; painting never covers the sea.
- Erase, Undo, Redo, Reset country, Reset whole world.
- Territory score (% / "×" bigger), land gained/lost, "Conquered".
- Autosave of the current world in the browser.
- Paint Pin logo and Home Screen icon.

## Upcoming

| Phase | What | Notes |
|---|---|---|
| 3 | Country statistics | Attack, Defense, Money, Military, Power Score; rankings; edit stats; spreadsheet import |
| 4 | Battles | Quick Battle, Full Invasion, Border Conflict, Custom; results and conquest choices |
| 5 | Land expansion | Paint into water, coastline expansion, island creation, land removal |
| 6 | Saving | IndexedDB save slots, rename/duplicate/delete, export/import files, versioned saves |
| 7 | Deployment | GitHub + Cloudflare Pages, permanent web address, Home Screen |
| 8 | Polish | Performance, battle presentation, tutorials, offline play |

Deployment can happen earlier — any time after Phase 1 — so Leighton can play while we build.

## Future: iPad App Store release

Goal: one day sell Leighton's Map Painter as a paid iPad app, **built from this same code**.
The browser version stays the main version until then. Full review:
[docs/ios-readiness.md](docs/ios-readiness.md).

**Already true (keep it that way)**
- Static app, no server, no internet calls; all map data, flags and fonts are bundled.
- Every shipped asset allows commercial use; notices are in `public/third-party-notices.txt`.
- Works with Capacitor (WKWebView) as-is: Canvas 2D, Pointer Events, safe areas, relative paths.

**Build in the normal phases so the app needs no rewrite**
- Phase 6 (saving): save through a storage adapter (IndexedDB in the browser, native files in
  the app) and export through an export adapter (download in the browser, Share sheet / Files
  in the app).
- Phase 7/8: website offline mode with a service worker (the app is offline automatically).
- Keep battles abstract and neutral (no realistic violence, real leaders or real wars).

**Decisions needed before release**
- Disputed borders: keep Natural Earth's de facto borders (e.g. Crimea shown in Russia) or
  switch to a Natural Earth "point of view" version.
- App name: "Leighton's Map Painter" is close to "GyLala's Map Painter"; check the App Store
  and consider a more distinct name or subtitle.
- Which countries' App Stores to sell in (not mainland China).
- Price, age rating (likely 9+), and whether to add native touches (haptics, Files, Share).

**Release steps (when the time comes)**
1. Join the Apple Developer Program (US$99/year, in an adult's name). *Paid: ask first.*
2. Add Capacitor (`@capacitor/core`, `@capacitor/ios`; free, MIT) and `npx cap add ios`.
   Set iPadOS deployment target 15.4+ (the CSS uses `:has()`). Disable WebView bounce.
3. Add native adapters: Filesystem/Preferences (saves), Share (export), optional Haptics.
4. Add an About & credits screen (shows third-party notices) and a privacy policy page.
5. Test on real iPads (oldest supported model too) and in the Simulator; TestFlight with family.
6. App Store listing: screenshots, description ("creative map sandbox"), privacy label
   "Data Not Collected", age rating questionnaire, regions.
7. Submit for review; fix any feedback; release.

## Known issues / limits

- **Not yet tested on a real iPad.** Tested in Chromium at iPad and phone sizes only.
- Natural Earth's smallest countries are approximate shapes; their areas are rough
  (e.g. Monaco shows ~18 km², Vatican "under 1 km²"). The Vatican is a thin sliver in the
  data, so it shows as a dot.
- Zoom stops at 300× because the free map data isn't accurate beyond that.
- Erasing next to painted land doesn't draw a border line between them (colours still differ).
- Painting was laggy on the iPad in v0.3; v0.4 only draws new paint during a stroke. Please
  re-check on the iPad. Moving/zooming the map still redraws everything each frame.
- While painting, names and new border lines appear when the finger lifts; the painter's flag
  may shift slightly then as it re-fits over the bigger territory.
- Disputed borders follow Natural Earth's de facto view (e.g. Crimea shown as part of Russia,
  Western Sahara as part of Morocco). Decide before any App Store release.
- Only one world is kept (autosave); multiple named saves come in Phase 6.
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

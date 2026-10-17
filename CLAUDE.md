# CLAUDE.md — Leighton's Map Painter

Guide for future Claude Code sessions. Read this first, then ROADMAP.md.

## Project overview

A single-player, browser-based world map painting and military strategy sandbox, built by a
dad and his 9-year-old son, Leighton. Countries show their flags inside their real borders;
the player will paint territory, expand land into the sea, rate countries' power, and simulate
battles. It must work great in **Safari on an iPad**, be **completely free** to host and play,
and stay **easy to extend**.

The owners are beginners. Explain things simply, do the coding yourself, and never ask them to
paste code into files.

## Non-negotiable rules

- Single player only. No accounts, multiplayer, servers, chat or online leaderboards.
- Free only. No paid APIs, map tiles, Google Maps, or services needing a credit card.
  If something can't be free, explain and ask first.
- Static website (no backend). Data and flags ship inside the app (`public/`).
- Never overwrite or break saved worlds. Version the save format and write migrations.
- Original world data (`public/data`, `src/data`) is never modified by gameplay.
- Commit to Git before significant changes. Keep the app deployable at all times.
- Don't claim iPad Safari works unless it was tested there; list what needs manual testing.

## Technology stack

| Piece | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript + Vite | Requested; fast dev server and builds |
| State | Zustand (`src/game/store.ts`) | Tiny, no boilerplate |
| Map drawing | **Custom Canvas 2D renderer** (`src/map/MapRenderer.ts`) | See "Map rendering" |
| Projection & geo math | d3-geo, d3-geo-projection (Miller), topojson-client, polylabel | Small, reliable, free |
| Boundaries | Natural Earth 1:10m admin-0 via `world-atlas` | Public domain, 255 countries/territories |
| Flags | `flag-icons` SVGs → PNG at build time | MIT licence, 4:3 flags |
| Tests | Vitest (`tests/`) | Runs with `npm test` |
| Hosting (planned) | GitHub + Cloudflare Pages | Free, no card, unlimited static bandwidth |
| Saves (planned) | IndexedDB + JSON export/import | Phase 6 |

**MapLibre GL JS and Turf.js were evaluated and deliberately not used** (decision 2026‑10‑17):
MapLibre can only fill countries with colours or screen-space repeating patterns; it cannot
stretch one flag across a country and clip it to the border, and its tiles/vector pipeline adds
weight we don't need for a single flat map. Turf's polygon booleans (union/difference) are too
slow and fragile to run on every brush movement on an iPad. Revisit only if a need appears that
Canvas can't meet.

## Folder layout

```
scripts/            build-time data tools (Node). prepare-data.mjs, make-icons.mjs, custom-flags/
public/data/        world-lo.json, world-hi.json (TopoJSON), countries.json (registry)
public/flags/       atlas.png + atlas.json (all flags, 120x90), lg/<code>.png (480x360)
public/icons/       app icon (logo.svg + PNGs for iPad Home Screen)
src/data/           ORIGINAL world data types/loaders (read-only at runtime)
src/map/            geometry.ts, camera.ts (pure, tested) · world.ts (load+project)
                    flags.ts · MapRenderer.ts (canvas) · gestures.ts (input) · MapView.tsx
src/game/           store.ts (Zustand) · mapController.ts (UI → map bridge)
src/components/     React UI: TopBar, CountrySearch, MapToolbar, CountryPanel, dialogs
src/utils/          settings (localStorage), formatting
src/styles/app.css  all styles
tests/              Vitest tests
```

Planned folders (create when the phase starts): `src/territory/` (Phase 2/5),
`src/stats/` (Phase 3), `src/battles/` (Phase 4), `src/storage/` (Phase 6),
`src/simulation/` (future auto-simulation).

## Map rendering approach

- **Projection:** Miller cylindrical — familiar rectangular "classroom" map, whole world visible.
  Every shape is projected **once** into "world units" (map is `WORLD_WIDTH` = 1000 units wide).
  Panning/zooming only changes the camera (`screen = world * scale + offset`), so flags and
  borders can never drift out of alignment.
- **Flags:** for each country, its polygons are grouped into "flag clusters"
  (`clusterPolygons`): nearby islands share one flag, far-away pieces (Alaska, Hawaii, French
  Guiana) get their own. Each cluster draws its flag with `ctx.clip(path)` + `drawImage`,
  stretched toward the shape's proportions (max 1.6×) then cropped to cover (`fitFlagRect`).
- **Flag images:** PNG, not SVG (SVG on canvas is slow/unreliable in iPad Safari). One atlas
  image holds every flag at 120×90; a sharp 480×360 PNG is lazy-loaded when a flag is shown
  ≥110px wide.
- **Speed:** three levels of detail — `lo` at startup, `hi` built in the background (used at
  ≥2.5× zoom), `max` (full 1:10m detail, ~1 MB gzipped) downloaded only once the player zooms
  past 10× and used at ≥20×. At `max` only on-screen countries' borders are stroked. Countries
  under 2,500 km² are protected from simplification at every level (`PROTECT_KM2` in
  prepare-data). Max zoom is 300× (data isn't accurate beyond that); shapes < 12px get the flag's average colour without clipping; visible-area culling;
  all borders in one `Path2D` stroke; DPR capped at 2. If a full frame takes > 14 ms, gestures
  slide a cached snapshot over a low-res whole-world overview, and redraw sharply on release.
- **Tiny countries:** at ≥2.5× zoom, countries too small to see (`isTiny`, which checks width
  AND height because some are slivers) get a tappable dot; small ones (4–60px) get a bolder
  outline.
- **Inside-out shapes:** `fixWinding` in world.ts flips any polygon covering more than half the
  globe (quantising can reverse a micro-state's ring, e.g. the Vatican).
- **Flag clusters:** a piece joins a cluster only if nearby AND ≥20% of the biggest piece's
  size, so small islands get a whole flag of their own. Flag rectangles are re-fitted once when
  `hi` loads and then fixed for all zoom levels.
- **Capitals:** `public/data/capitals.json` (Natural Earth populated places, built by
  `scripts/make-capitals.mjs`). Drawn as yellow stars + names when the country is ≥140px on
  screen or zoom ≥14×; skipped for tiny countries; a capital sharing the country's name shows
  only the star. Labels share one collision list (`placed`) with country names.
- **Hit-testing:** bounding-box filter, then `isPointInPath`, smallest area first (so enclaves
  like Lesotho and Vatican win).
- **React never re-renders when the map moves.** The renderer is a plain class; the UI talks to
  it via `mapController` and store subscriptions.

## Territory ownership system (design — build in Phase 2)

Hybrid of a country-level table and a painted grid, so untouched borders stay perfectly crisp
and painting never needs polygon maths:

1. **ORIGINAL WORLD** — the Natural Earth shapes + `countries.json`. Never changes.
2. **Region control table** — `controller: Record<originalCountryId, ownerId>`.
   "Conquer entire country" just sets one entry (instant, tiny to save). Drawing uses the
   owner's flag for that region.
3. **Paint layer** — a sparse grid over the flat map (≈0.05 world units per cell, ~2–5 km),
   stored as 256×256 tiles of `Uint16` owner indexes, created only where painted.
   `0` = no change (fall back to 1–2), `WATER` = land removed. Land expansion / islands = owner
   cells where the original was sea.
   - Brush = stamp a circle into cells → cost is the brush size, not the world size.
   - Undo/redo = each stroke records the previous values of the cells it changed.
   - Drawing: per visible edited tile, build a mask per owner and draw that owner's flag
     (using the owner's own flag rectangle so it lines up with its homeland) through the mask.
     Borders of painted areas from marching squares, cached per tile, rebuilt only for tiles a
     stroke touched.
   - Territory size = original area adjusted by painted cells × cell area (with latitude
     correction for the projection).
4. **Saves** store only (2) and the non-empty tiles of (3), run-length encoded.

Lookup order for "who owns this point": paint layer → region control table → original owner.

## Battle calculation system (design — Phase 3/4)

- Ratings 1–100: attack, defense, resources (money), military.
  Comprehensive Power = round(attack·0.25 + defense·0.25 + resources·0.20 + military·0.30).
  Weights live in one config object.
- Stats are stored separately from map data, editable in-game, importable from a spreadsheet
  (CSV with an `id` column of ISO codes; match by name as fallback).
- Labelled as "approximate gameplay estimates", never official.
- Battle formula (to implement): attacker strength = blend of attack, military, resources;
  defender strength = blend of defense, military, resources, plus terrain/home bonus; compare
  with a logistic curve plus seeded randomness so a 93 usually beats an 89 but not always.
  All factors documented in one config file and covered by tests.
- Battles never auto-change borders. Player chooses: Conquer entire country / Paint captured
  territory / No change / Simulate again.
- Use a seeded random number generator so the future "Simulate 1 year" can be replayed.

## Save game structure (design — Phase 6)

IndexedDB database `leightons-map-painter`, store `worlds`. Each record:
`{ formatVersion, id, name, createdAt, updatedAt, mode, controller, paintTiles, stats,
battleHistory, settings }`. Export = the same object as a `.json` file. On load, run
`migrations[formatVersion]` step by step up to the current version. Never delete a save
without the player confirming.

## Coding conventions

- TypeScript strict mode. Small modules with one job each.
- Pure logic (geometry, camera, battle maths, save migration) has no DOM access and has tests.
- Comments explain *why*. User-facing text is short and kid-friendly.
- Touch targets ≥ 44px. Inputs use ≥ 16px font (stops iPad Safari auto-zoom).
- Wrap all storage access in try/catch.
- Keep dependencies few and free/open-source.

## Testing requirements

Before finishing any change:
1. `npm test` — all tests pass.
2. `npm run build` — type check + production build succeed.
3. Run the app (`npm run dev` or `npm run preview`) and check the feature works; check the
   browser console for errors.
4. Add tests for new pure logic (territory ownership, scores, battles, save round-trips).
5. Update ROADMAP.md and CHANGELOG.md. List anything needing manual iPad testing.

Automated browser checks used in development: Playwright (Chromium) screenshots at iPad
(1180×820) and phone sizes, `?debug` exposes `window.__map.debugInfo()`. WebKit (Safari's
engine) was not available in the build environment — iPad behaviour must be checked by hand.

## Data refresh

`npm run prepare-data` rebuilds `public/data`, `public/flags` and icons from npm packages.
Only needed when changing the map/flag source. Special cases (territories without ISO codes,
disputed areas, friendlier names) are listed at the top of `scripts/prepare-data.mjs`.

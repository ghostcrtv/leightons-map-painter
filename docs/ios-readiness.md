# iPad App Readiness Review

*Reviewed 17 October 2026, at the end of Phase 2. Re-check before starting the iOS release.*

**Summary:** the game can be wrapped with Capacitor and built in Xcode later without being
rebuilt. It is a self-contained static web app: no server, no internet calls, all data,
flags and fonts are inside the build, and every shipped asset allows commercial use.
Saving and file export must be built so they can be swapped onto native storage later
(planned for Phase 6). The biggest App Store questions are about content (disputed borders
and the war theme) rather than technology.

## 1. Capacitor and iPadOS compatibility

| Area | Status | Notes |
|---|---|---|
| Build output | ✅ Ready | Vite builds a static `dist/` folder with relative paths (`base: './'`), which Capacitor uses directly as `webDir`. |
| Rendering | ✅ Ready | Canvas 2D + Path2D, which Safari/WKWebView fully supports. No WebGL and no map-tile service. |
| Touch input | ✅ Ready | Pointer Events (iPadOS 13+), our own pinch handling, Safari page-zoom gestures blocked. |
| Safe areas / notch | ✅ Ready | `viewport-fit=cover` + `env(safe-area-inset-*)` throughout. |
| Data loading | ✅ Ready | `fetch()` of files bundled in the app works under Capacitor's local scheme. |
| Fonts | ✅ Ready | Lilita One bundled via @fontsource (no Google Fonts CDN). The other fonts are system fonts. |
| Minimum iOS | ⚠️ Set to **iPadOS 15.4+** | The CSS uses `:has()` (Safari 15.4+). Capacitor 8 supports iOS 15.0+, so set the deployment target to 15.4 or later (16+ recommended). |
| Memory | ✅ Fine | ~3 full-screen canvases + 12 MB ownership grid + map data. Well within WKWebView limits; re-check on the oldest iPad we support. |
| App size | ✅ Small | ~12 MB of data/flags/code. |
| Saves | ⚠️ Needs Phase 6 design | Today: autosave in `localStorage`. In an app, WKWebView storage is usually kept but **not guaranteed** (iOS can clear website data). Phase 6 must save through a small storage adapter: IndexedDB in the browser, native files (Capacitor Filesystem/Preferences) in the app. |
| Export/Import files | ⚠️ Needs Phase 6 design | Browser "download" links don't work inside an iOS app. Use an export adapter: download in the browser, the iOS Share sheet / Files in the app (Capacitor Share + Filesystem plugins). |
| Keyboard shortcuts | ✅ Harmless | Work with an iPad keyboard; ignored otherwise. |
| Debug hook (`?debug`) | ✅ Harmless | Only active with `?debug` in the web address; never in the app. |

## 2. Libraries and features that could cause problems in an iOS app

None of the shipped libraries is a problem: React, Zustand, d3-geo, d3-geo-projection,
topojson-client, polylabel and their small dependencies are plain JavaScript with no native or
network parts. `@resvg/resvg-js`, `pngjs`, `topojson-simplify`, `i18n-iso-countries`,
`flag-icons` (SVG sources) and `world-atlas` are **build-time only** (used by
`npm run prepare-data`) and are not inside the app.

Things to avoid or handle when we add features:
- **Downloading code or content at runtime:** don't (Guideline 2.5.2). Everything must ship in the bundle.
- **External links** (website, help pages): keep them out, or behind a parental gate if we ever join the Kids Category.
- **Service workers:** fine for the website's offline mode, but don't rely on them in the app (Capacitor serves files itself).
- **`alert()` / `confirm()` / `prompt()`:** don't use them (they look out of place in an app). We already use in-page confirmations.
- **Analytics, ads, sign-in, cloud sync:** none today; adding any would change the privacy label and possibly the age rating.

## 3. Working completely offline

- **iPad app:** offline automatically, because all files are inside the app and the game makes no network requests (checked: no external URLs in the shipped code or data).
- **Website:** it needs the internet to *first* load. After that it runs offline until a reload, except the full-detail borders (`world-max.json`) and large flags, which load on demand. To make the website fully offline (for a Home Screen web app), add a service worker that pre-caches all files (e.g. `vite-plugin-pwa`, MIT licence) in Phase 7/8. No game code changes needed.

## 4. Licences of shipped assets and code

| What | Source | Licence | Commercial use & redistribution |
|---|---|---|---|
| Country borders | Natural Earth 1:10m (via world-atlas) | **Public domain** | ✅ Yes; no attribution required (we credit anyway) |
| world-atlas packaging | Mike Bostock | ISC | ✅ Yes, keep notice |
| Capital cities | Natural Earth populated places | **Public domain** | ✅ Yes |
| Flags (240) | flag-icons | MIT | ✅ Yes, keep notice |
| Somaliland & N. Cyprus flags | drawn for this game | ours | ✅ |
| Logo (Paint Pin) | drawn for this game; the "L" is an outline from Lilita One | ours / OFL | ✅ OFL allows using the font in logos and artwork |
| Lilita One font | Juan Montoreano | SIL OFL 1.1 | ✅ Yes; may be bundled in apps; can't sell the font on its own |
| React, React DOM, scheduler, Zustand, commander | — | MIT | ✅ Yes, keep notice |
| d3-geo, d3-geo-projection, d3-array, internmap, topojson-client, polylabel, tinyqueue | — | ISC | ✅ Yes, keep notice |
| Build-only tools (resvg-js MPL-2.0, pngjs MIT, topojson-simplify ISC, i18n-iso-countries MIT) | — | — | Not shipped |

The notices are collected in **`public/third-party-notices.txt`** (shipped in every build;
regenerate with `npm run notices`). Before release, add an **About & credits** screen that
shows it.

**National flags** are not copyrighted works in most countries and are widely used in
geography games. Some countries restrict using their flag or coat of arms *as a trademark* or
in an insulting way. We use them only to show the countries, which is fine. Don't put a
country's flag in the app icon or marketing art.

## 5. One codebase for browser and iPad

Rules (also in CLAUDE.md, so future sessions follow them):
1. All assets are local files under `public/`. No CDNs or remote APIs.
2. Relative paths only (`import.meta.env.BASE_URL`), never `/absolute` URLs.
3. Platform differences live behind small adapters (storage, file export/share, haptics),
   chosen at runtime (`Capacitor.isNativePlatform()`), never as separate copies of the game.
4. Test in Safari (and later the iOS Simulator) before each release; the browser stays the main target.
5. Capacitor gets added in its own folder (`ios/`) with `capacitor.config.ts` — the game code doesn't change.

## 6. App Store review concerns

1. **War theme against real countries (Guideline 1.1.2).** Apple says game "enemies"
   *"cannot solely target a specific race, culture, real government…"*. Our sandbox treats every
   country the same and the player picks both sides, which is the safe pattern. Keep battles
   **abstract**: no realistic violence, no real leaders, no real wars or events, no mocking of
   any nationality (1.1.1). Label power ratings as "game estimates" (already planned). Describe
   it as a creative map sandbox in the listing.
2. **Disputed borders and regional laws (Guideline 5, Legal).** The map follows Natural Earth's
   *de facto* borders, for example: **Crimea is shown as part of Russia**, Western Sahara as part
   of Morocco, Taiwan, Kosovo and Palestine as separate places, and Kashmir split as each side
   controls it. That can upset players or break local rules in some countries.
   *Decision needed before release:* keep de facto borders, or switch to a Natural Earth 5.x
   "point of view" dataset (for example the U.S. view, which shows Crimea in Ukraine). Do not
   offer the app in **mainland China**: it requires government-approved maps and a game licence
   number for paid games. Consider leaving out other storefronts with strict map laws.
3. **"Just a website" (Guideline 4.2).** Low risk: the game is bundled, works offline and is
   highly interactive. Native touches (haptics when conquering, saving through the Files app,
   share sheet for exported worlds) make the app feel native.
4. **Name and look (Guideline 5.2.1).** We were inspired by "GyLala's Map Painter". Our art and
   code are original, but **"Leighton's Map Painter" is close to "GyLala's Map Painter"**. Search
   the App Store before release; a more distinct name (or subtitle) lowers the risk of a
   copycat complaint.
5. **Privacy (Guideline 5.1.1).** The app collects nothing, so the privacy label is "Data Not
   Collected". A **privacy policy web page is still required** (it can be a short page on the game's website).
6. **Age rating / Kids Category.** Expect a 9+ rating (mild, cartoon-style conflict once battles
   exist). Avoid the Kids Category unless we add parental gates, since it bans outside links and
   any third-party analytics.
7. **Paid app basics.** The Apple Developer Program costs **US$99 per year**: the one cost the
   project can't avoid (Capacitor, Xcode and TestFlight are free). The account must be in an
   adult's name. A Mac with a current Xcode is needed to build.

Sources checked: Apple App Review Guidelines (developer.apple.com/app-store/review/guidelines),
Capacitor docs (capacitorjs.com), Natural Earth terms (naturalearthdata.com), licence files of
each package in `node_modules`.

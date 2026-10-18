# Publishing on the App Store — the plan

**Status: prepared, not started.** Per the family's decision (2026-10-17) the game stays a
website for now. Everything below is ready for when you decide to go ahead.

## What's already done (free)

- One codebase that works offline, saves on the device, and has no accounts, ads or tracking.
- Storage, files and sharing go through small adapters (`src/worlds/storage.ts`,
  `src/utils/files.ts`), so the iPad app can swap in native storage and the Share sheet.
- **App icon** (1024×1024): `docs/app-store/icon-1024.png` (made by `npm run prepare-data`).
- **Screenshots** for the 13-inch iPad (2752×2064): `docs/app-store/screenshots/`.
- **Privacy policy page**: `public/privacy.html` (the App Store needs a link to one).
  "Data not collected" is the honest answer to Apple's privacy questions.
- Licences checked: map data public domain, flags MIT, font OFL, code libraries MIT/ISC
  (`public/third-party-notices.txt`). All allow a paid app.

## What it costs and needs (decide first)

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | **$99 per year** (paid) | Needed to publish any app. Sign up at developer.apple.com with your Apple ID. |
| A Mac with Xcode | free | Your MacBook Pro works. Xcode is free in the Mac App Store. |
| The iPad | — | For testing with TestFlight (free). |

## Steps (Claude does the coding; you do the Apple account parts)

1. Join the Apple Developer Program (you, on Apple's website).
2. Claude adds **Capacitor** (free, MIT) to the project and creates the iOS project.
3. You open it in Xcode on the Mac, sign in with your Apple ID, and press Run to try it on
   the iPad.
4. Claude swaps the adapters to native ones (saving, Share sheet), then checks offline
   play, sounds and the Home indicator area on a real iPad.
5. Upload a test build to **TestFlight** from Xcode, then install it on the iPad.
6. Fill in App Store Connect: name, description, keywords, screenshots, icon,
   privacy ("Data Not Collected"), age rating, price.
7. Submit for review (usually 1–3 days).

## App Review notes (things Apple looks at)

- **Age rating:** battles are cartoon-style (missiles, explosions, no people or blood): answer
  "Infrequent/Mild Cartoon or Fantasy Violence" → likely **9+**.
- **Real countries and flags:** fine for a geography/strategy game. The game shows a disputed
  area as grey and says ratings are game estimates, not official figures. Keep it neutral:
  no real leaders, no real wars, no insults to any country.
- **Not a "website in a wrapper":** the app works fully offline, saves on the device and has
  native sharing — this matters for review.
- **Kids Category:** optional. If chosen, there must be no links out of the app without a
  parent gate (the Privacy/Licences links would need one).

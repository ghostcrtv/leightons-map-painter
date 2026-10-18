# Putting the game on the internet (free)

The game is a plain website (no server, no database), so it can be hosted for free.
The recommended way is **GitHub Pages**: free, no credit card, and the game updates by itself
every time a change is saved to GitHub.

## What you need (one time, about 10 minutes)

1. A free GitHub account: go to github.com and choose **Sign up**. (Use the official GitHub
   website and sign-in page. Never type your password into a chat.)
2. Connect GitHub to Claude: in claude.ai **Settings → Connectors → GitHub**.
3. Tell Claude "set up hosting". Claude will:
   - create a repository called `leightons-map-painter` (you approve it),
   - push the game to it,
   - and tell you the one switch to flip on github.com: **Settings → Pages → Source: GitHub Actions**.

The address will look like `https://YOUR-NAME.github.io/leightons-map-painter/`.

## After that

- Every change Claude pushes is tested and published automatically (`.github/workflows/deploy.yml`).
- On the iPad: open the address in Safari → Share → **Add to Home Screen**. It opens full screen
  like an app and **works offline** after the first visit (the game saves itself on the iPad).
- Saved worlds live on each device. Use **Worlds → Back up all worlds** to move them between
  devices, or before clearing Safari's data.

## Other free options

- **Cloudflare Pages** (free, no card): connect the same GitHub repository, build command
  `npm run build`, output folder `dist`.
- **Netlify** (free tier): same settings.

Avoid hosts that ask for a credit card. The game never needs a paid plan.

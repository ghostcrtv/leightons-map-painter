# Leighton's Map Painter

A free, single-player world map game for iPad and computer. Every country shows its flag inside
its real borders. Explore the world now — painting borders, battles, new islands and saved
worlds are coming in the next updates (see ROADMAP.md).

Made by Leighton and his dad, with Claude.

---

## Play it on your Mac (step by step)

You only need to do steps 1–2 once.

**1. Install Node.js** (free — it runs the game on your Mac)
- Go to <https://nodejs.org> and click the big **LTS** download button.
- Open the downloaded file and click through the installer.

**2. Open Terminal in the game folder**
- In Finder, find the `leightons-map-painter` folder.
- Right-click (or Control-click) the folder → **Services** → **New Terminal at Folder**.
  (If you don't see it: open the **Terminal** app, type `cd ` with a space, drag the folder into
  the Terminal window, and press Return.)
- Type this and press Return (it downloads the game's building blocks, takes a minute):
  ```
  npm install
  ```

**3. Start the game**
- In the same Terminal window type:
  ```
  npm run dev
  ```
- You'll see a line like `Local: http://localhost:5173/`. Open that address in Safari or Chrome.
- To stop the game, click the Terminal window and press **Control + C**.

**Try it on the iPad before it's published:** while `npm run dev` is running, Terminal also shows
a `Network:` address like `http://192.168.1.23:5173/`. Type that into Safari on the iPad (the iPad
must be on the same Wi-Fi). This only works while the Mac is on and the game is running.

---

## Publish it to a permanent free website (so it works anytime, even with the Mac off)

We use two free services. Neither needs a credit card.
- **GitHub** stores the game's files (and their history).
- **Cloudflare Pages** turns those files into a website and gives you an address like
  `leightons-map-painter.pages.dev`.

Free plans and free web addresses depend on each company's rules, which can change. If one ever
stops being free, the game can be moved to another free host — it's just a plain website.

Claude will walk you through these steps when you're ready (Phase 7, or earlier if you like):

1. **Create a GitHub account** at <https://github.com/signup> (free).
2. **Put the game on GitHub.** Claude creates the repository and uploads the files. You'll sign
   in through GitHub's own login page — never type passwords into the chat.
3. **Create a Cloudflare account** at <https://dash.cloudflare.com/sign-up> (free plan).
4. **Connect Cloudflare Pages to GitHub:** Workers & Pages → Create → Pages → Connect to Git →
   choose `leightons-map-painter`. Use these settings:
   - Framework preset: **Vite** (or "None")
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Click **Save and Deploy**. After a minute or two you get your web address.
6. **On the iPad:** open the address in Safari.
7. **Add to Home Screen:** tap the **Share** button (square with an arrow) → **Add to Home Screen**
   → **Add**. The Map Painter icon appears and opens full-screen like an app.

## Publishing updates later

Ask Claude for a change (for example "add world rankings"). When it's working, Claude saves it to
GitHub. Cloudflare notices automatically and updates the website in a minute or two. On the iPad,
close and reopen the game to get the new version.

---

## Commands (for reference)

| Command | What it does |
|---|---|
| `npm install` | Downloads the building blocks (needed once, and after updates that add new ones) |
| `npm run dev` | Runs the game on your Mac, updating live as files change |
| `npm run build` | Checks the code and builds the finished website into `dist/` |
| `npm run preview` | Runs the finished `dist/` website locally |
| `npm test` | Runs the automatic tests |
| `npm run prepare-data` | Rebuilds the map and flag files (only when changing map/flag sources) |

## Troubleshooting

- **`npm: command not found`** — Node.js isn't installed yet (step 1), or Terminal was open
  before you installed it. Quit Terminal and open it again.
- **The page is blank or says it can't load the map** — make sure `npm run dev` is still running
  in Terminal, then reload the page.
- **iPad can't open the Network address** — check both devices are on the same Wi-Fi, and that
  the Mac allowed the connection if it asked.
- **"Port 5173 is in use"** — the game is already running in another Terminal window. Use that
  one, or close it with Control + C.
- **Something else** — copy the red error text from Terminal or the screen and paste it to
  Claude.

## Credits and licences

- Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via `world-atlas`.
- Flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT). Somaliland and Northern Cyprus
  flags were drawn for this project.
- Country areas are approximate. Future power ratings are gameplay estimates, not official data.

For developers and Claude: see **CLAUDE.md** (architecture and rules) and **ROADMAP.md**.

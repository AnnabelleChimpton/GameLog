# GameLog

A pretty, static site for showing off a video game collection. Search it, filter
it by console, sort it, click any cover for the details. Host it free on GitHub
Pages.

No framework, no build step, no dependencies. The repo *is* the site: a page, a
stylesheet, a script, and one JSON file holding your collection. The helper
scripts that fetch cover art are optional and run on your own machine.

---

## Make it yours

### 1. Fork it

Click **Fork** at the top of this repo (or use the green **Use this template**
button if you'd rather not carry the commit history), then clone your copy:

```bash
git clone https://github.com/YOUR-USERNAME/GameLog.git && cd GameLog
```

### 2. Turn on GitHub Pages

In your fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

That's the only setting to change. From now on every push publishes the site to
`https://YOUR-USERNAME.github.io/GameLog/`, usually within a minute.

### 3. Put your own games in

Empty out `data/collection.json` and start adding. There are three ways, and
they all write to the same file — mix and match freely.

**Type them in by hand.** Every field except `title` and `platform` is optional:

```json
{
  "games": [
    {
      "id": "nintendo-switch-hades",
      "title": "Hades",
      "platform": "Nintendo Switch",
      "year": 2020,
      "cover": "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co39vc.jpg",
      "description": "A rogue-like dungeon crawler in which you defy the god of the dead.",
      "genres": ["Action", "Roguelike"],
      "developer": "Supergiant Games",
      "condition": "CIB",
      "notes": "Signed by the composer."
    }
  ],
  "hardware": []
}
```

**Let a script look it up.** This is the easy way — it finds the cover art,
description, year and genres for you:

```bash
npm run add "Hades"
```

**Import an existing export.** If you already track your collection in
[Gameye](https://www.gameye.app), export to CSV and seed the whole thing at once:

```bash
npm run import:gameye -- ~/Downloads/your-export.csv
```

### 4. Change the name and colour

`data/config.json` holds everything about the site's identity:

```json
{
  "title": "GameLog",
  "tagline": "A shelf of everything I've collected.",
  "accent": "#f0a04b",
  "defaultSort": "title",
  "showHardware": true,
  "footer": "Built with [GameLog](https://github.com/AnnabelleChimpton/GameLog)."
}
```

`accent` is any CSS colour and drives the highlights throughout. `footer`
accepts links and `**bold**`.

---

## Day-to-day: you bought a game

```bash
npm run add "Chrono Trigger"
```

It searches IGDB, shows you the matches, asks which platform and what condition,
and writes the entry. Then:

```bash
git add data/collection.json && git commit -m "Add Chrono Trigger" && git push
```

The site updates itself. That's the whole loop.

If you'd rather skip the questions:

```bash
npm run add "Chrono Trigger" -- --platform "SNES/Super Famicom" --condition CIB
```

---

## Cover art

Cover art and descriptions come from [IGDB](https://www.igdb.com), which is free
but wants you to register. It takes about two minutes and you only do it once.

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and log
   in (IGDB is owned by Twitch, so it uses a Twitch login).
2. **Register Your Application**:
   - **Name** — anything, e.g. `GameLog`
   - **OAuth Redirect URL** — `http://localhost`
   - **Category** — Application Integration
   - **Client Type** — Confidential
3. Copy the **Client ID**, then click **New Secret** and copy that too.
4. Save them locally:

```bash
cp .env.example .env
```

Paste both values into `.env`. It is gitignored, so your keys never leave your
machine — and the published site never needs them, because the art urls are
baked into `collection.json`.

Then fill in everything that's missing:

```bash
npm run enrich
```

Re-run it any time. It only touches entries that are still missing something and
never overwrites anything you edited yourself, so it's safe to run repeatedly.

| Command | What it does |
| --- | --- |
| `npm run enrich` | Fill in whatever is missing |
| `npm run enrich -- --force` | Refetch everything, overwriting |
| `npm run enrich -- --only <id>` | Redo a single entry |
| `npm run enrich -- --dry-run` | Show what would change, write nothing |

Anything IGDB can't find keeps a generated placeholder cover — a wash of the
platform's colour with its name. Those tiles show their title permanently, so
the shelf still reads properly. To fix one by hand, paste any image url into its
`cover` field.

---

## Preview before you push

```bash
npm run serve
```

Then open <http://localhost:4321>. You need this rather than double-clicking
`index.html`, because browsers block the page's JSON fetch on `file://` urls.

To catch mistakes before they go live:

```bash
npm run check
```

It flags invalid JSON, duplicate ids, missing platforms and unknown consoles,
and tells you how much is still waiting on `npm run enrich`. The deploy workflow
runs the same check, so a broken `collection.json` fails the build instead of
publishing a blank page.

---

## Adding a console the registry doesn't know

Everything still works with an unrecognised platform — it just gets an
auto-generated abbreviation and colour. To give it a proper one, add a line to
`assets/js/platforms.mjs`:

```js
{ key: 'Sega Dreamcast', short: 'DC', color: '#e06c3b', igdb: 23 },
```

- `key` — exactly as you spell it in `collection.json`
- `short` — the badge label; keep it to about four characters
- `color` — the chip dot, badge, and placeholder-cover colour
- `igdb` — IGDB's platform id, which narrows cover-art searches. Look it up in
  the [IGDB platform list](https://api-docs.igdb.com/#platform), or set `null`.

That one file is shared by the site and the scripts, so a platform added there
works everywhere.

---

## What's in here

```
index.html               the page
assets/css/styles.css    all the styling; colours are CSS variables at the top
assets/js/app.js         search, filter, sort, the detail dialog
assets/js/platforms.mjs  the platform registry — names, colours, IGDB ids
data/collection.json     your games and hardware
data/config.json         site title, tagline, accent colour
scripts/                 the optional Node helpers
```

`data/collection.json` is the only file you need to touch day to day.

### Fields

Only `title` and `platform` are required; anything you leave out is simply not
shown.

| Field | Notes |
| --- | --- |
| `id` | Unique, url-safe. Doubles as a deep link: `…/#nintendo-64-goldeneye-007` |
| `title`, `platform` | Required |
| `year` | Release year |
| `cover` | Any image url, or a path like `assets/covers/foo.jpg` |
| `description` | A short blurb |
| `genres` | A list: `["Action", "RPG"]` |
| `developer`, `publisher` | Free text |
| `region` | e.g. `USA`, `JP`, `PAL` |
| `release` | Non-standard editions: `Demo`, `Not For Resale` |
| `condition` | Free text: `CIB`, `Loose`, `Boxed`, `New`, whatever you use |
| `copies` | Shows an `×2` badge when above 1 |
| `metacritic` | 0–100 |
| `notes` | Anything personal; shown in the detail view |
| `added` | `YYYY-MM-DD`, used by the "Recently added" sort |

`hardware` entries use `name` instead of `title` and `image` instead of `cover`,
and appear in their own section at the bottom of the page.

---

## Notes

Everything in `collection.json` is public once you push it — it's a static site,
so anyone can read the raw file. Don't put anything in `notes` you wouldn't want
seen. There are no price or valuation fields for the same reason.

Cover images are hotlinked to IGDB's CDN rather than committed, which keeps the
repo small. If you'd rather host them yourself, download them into
`assets/covers/` and point the `cover` fields at the local paths — the site
treats any url the same way.

Keyboard: `/` focuses search, `Esc` clears it or closes the dialog, `←` and `→`
step through games while a detail view is open.

---

## Licence

MIT. Cover art and game descriptions come from
[IGDB](https://www.igdb.com) and belong to their respective owners.

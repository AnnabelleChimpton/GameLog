# GameLog

A pretty, static site for showing off a video game collection. Search it, filter
it by console, sort it, click any cover for the details. Host it free on GitHub
Pages.

The page opens with **you** — photo, name, a few words, your links — and your
collection begins right underneath. Someone following a shared link learns whose
shelf this is and what's on it without clicking anything.

No framework, no build step, no dependencies. The repo *is* the site: a page, a
stylesheet, a script, and one JSON file holding your collection. Edit it through
a local UI (`npm run manage`), a CLI, or a text editor — whichever you prefer.

**Views:**

- **Shelf** — the cover grid, with search, platform filters and sorting.
- **Timeline** — your collection by release year, gaps and all.
- **Lists** — backlogs, wishlists, favourites; owned games and hunted ones.
- **Stats** — decades, platforms, genres, scores and condition at a glance.
- **Compare** — point it at *somebody else's* GameLog and see what you share.

**Compare** is the reason this is a static site rather than an app. Every
GameLog publishes its `collection.json` openly, and GitHub Pages serves it with
`access-control-allow-origin: *`, so any GameLog can read any other one straight
from the browser — no server, no accounts, no API in between. Paste a friend's
address and you get three lists: what they have that you don't, what you both
have, and what's yours alone.

Add the ones you follow to `data/config.json` and they become one-click buttons:

```json
"friends": [
  { "name": "Sam", "url": "https://sam.github.io/GameLog/" }
]
```

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

Empty out `data/collection.json` and start adding. There are four ways, and they
all write to the same file — mix and match freely.

**Use the manager.** `npm run manage` opens an editor in your browser, which is
the easiest way in. The rest of these work just as well.

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

## The manager

Editing JSON by hand is fine until it isn't. There's a UI:

```bash
npm run manage
```

Open the address it prints and you get a proper editor:

- **Lists** — make them, rename them, drag entries up and down, add notes.
- **Games** — edit any field on any game, or add one by searching IGDB.
- **Hardware** — your consoles.
- **Profile** — your photo, bio and links.
- **Site** — title, tagline, accent colour (with a colour picker), and the
  shelves you follow.

Adding a game searches your own collection *and* IGDB at once. Pick something
you own and it links to it; pick something you don't and it's saved as a wanted
entry with its cover art. Results that are ROM hacks or ports are labelled, so
you don't accidentally add *Chrono Trigger+* instead of *Chrono Trigger*.

Changes are held in memory until you press **Save** (or ⌘/Ctrl+S), so a mis-click
is undone by reloading the page. Saving writes `data/*.json` and nothing else —
edits produce small, readable diffs, so you can see exactly what changed before
committing:

```bash
git add data && git commit -m "Update collection" && git push
```

### It's local-only, on purpose

The manager needs a server that can write files, and that server only exists
while `npm run manage` is running on your machine. Your published site is static
files on someone else's host — there's nothing there to save to, which is
precisely why nobody visiting your site can edit it. Open `manage.html` on the
published copy and it just tells you to run it locally.

The write endpoints are deliberately hard to reach from anywhere but the manager
page itself: the server binds to `127.0.0.1` only, writes require a custom
header that a foreign page can't send without a CORS preflight the server
refuses, a mismatched `Origin` is rejected, the only writable paths are the
three `data/*.json` files and a profile photo under `assets/profile/` (never a
path taken from the request), every payload is shape-checked before it replaces
a real file, uploads must be a real image type and are size-capped, and writes
go via a temp file and a rename so an interrupted save can't leave a
half-written collection behind.

## About you

A collection is more interesting when you know whose it is. Add a photo, a few
paragraphs and some links, and they become the top of your page: your name as
the heading, the collection's own title and tagline beneath it, a line of facts
worked out from the data, your bio, and your links.

The bio is clipped to three lines with a **Read more** toggle, so the covers
still clear the fold. The header scrolls away as you browse; the search box and
filters are what stay pinned.

The manager's **Profile** tab is the easy way — "Choose a photo…" resizes the
image to 512px in your browser before saving it, so a 4 MB phone photo lands in
your repo as about 30 KB instead of sitting in git history forever at full size.

By hand, it's a `profile` block in `data/config.json`:

```json
"profile": {
  "name": "Annabelle",
  "photo": "assets/profile/avatar.jpg",
  "about": "I collect mostly fifth and sixth generation consoles.\n\nBlank lines make paragraphs. [Links](https://example.com) and **bold** work.",
  "links": [
    { "label": "GitHub", "url": "https://github.com/you" },
    { "url": "https://twitch.tv/you" }
  ]
}
```

`photo` takes a local path or any image url. Links to GitHub, Twitch, Bluesky,
Mastodon, YouTube and `mailto:` addresses get their own icon; everything else
gets a globe. Leave `label` out and the address is used instead.

The About page also works out a few things on its own — how many games across
how many platforms, the years they span, and which console you're deepest on —
so it stays accurate as the collection grows.

**Every part is optional.** Leave `profile` empty and the header falls back to
just your site title, tagline and collection facts — which is the default for a
fresh fork.

### Sharing the link

Link previews are built by crawlers that don't run JavaScript, so those tags
can't be assembled at runtime like the rest of the page — they live in
`index.html`, between two `gamelog:meta` markers. Saving in the manager rewrites
that block from your config: the title becomes "Your Name — Your Title", the
description comes from your bio, and your photo becomes the card image.

For the image to work, set **Published address** on the manager's Site tab (or
`siteUrl` in the config) to your site's address — a crawler can't resolve a
relative path. Edit `config.json` rather than those meta lines; anything you
type between the markers is overwritten on the next save.

## Lists

A list is any named set of games — a backlog, a wishlist, the ones you'd save
from a fire. Entries can be games you own *or* games you're still hunting.

```bash
npm run list
```

That walks you through it. The direct forms:

```bash
npm run list -- new "The hunt"
npm run list -- add the-hunt "Chrono Trigger" --platform "SNES/Super Famicom"
npm run list -- rm the-hunt "Chrono Trigger"
npm run list -- show
```

Add a game you already own and it stores a `ref` to your collection entry. Add
one you don't and it stores the title, looking up cover art so the tile still
looks like something.

**The part worth knowing:** entries are resolved against your collection on
every page load, not frozen when you add them. Put *Chrono Trigger* on your
hunting list, buy it a year later, run `npm run add "Chrono Trigger"` — and the
list entry turns from wanted into owned by itself. Nothing to edit, and the
"3 of 7 owned" meter moves on its own.

Wanted games render dimmed with a **want** badge; owned ones are full colour and
open their details on click.

### The file

`data/lists.json`, and it's plain enough to write by hand:

```json
{
  "lists": [
    {
      "id": "the-hunt",
      "name": "The hunt",
      "description": "Actively looking for these.",
      "items": [
        { "title": "Panzer Dragoon Saga", "platform": "Sega Saturn", "note": "disc only is fine" },
        { "ref": "nintendo-64-banjo-kazooie", "note": "want a boxed copy" }
      ]
    }
  ]
}
```

Each entry is either a `ref` (a game `id` from your collection) or a `title`
(plus an optional `platform` to pin which version you want). `note` is yours to
use however. Order is preserved, so a "play next" list stays in the order you
put it in. `npm run check` warns about a `ref` that doesn't match anything.

One caveat on the scripted form: `npm run list -- add …` run without a terminal
takes the first search result sight unseen. Run it interactively when the title
is ambiguous — there are a lot of *Chrono Trigger* ROM hacks.

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

`npm run serve` is read-only. Use `npm run manage` when you want to edit.

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
assets/js/app.js         state, routing, the shelf, the detail dialog
assets/js/lib.js         helpers shared by every view
assets/js/stats.js       the stats view and its charts
assets/js/timeline.js    the by-year view
assets/js/lists.js       lists, and resolving entries against the collection
assets/js/profile.js     the About view
assets/js/manage.js      the local manager UI
manage.html              the manager page (local use only)
assets/js/compare.js     fetching and diffing another collection
assets/js/platforms.mjs  the platform registry — names, colours, IGDB ids
data/collection.json     your games and hardware
data/lists.json          your lists (optional)
data/config.json         site title, tagline, accent colour, friends
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

Keyboard: `/` focuses search, `r` picks a game at random from whatever is
showing, `Esc` clears the search or closes the dialog, and `←` / `→` step
through games while a detail view is open.

Controls hide themselves when they'd be lying. "Recently added" only appears if
your `added` dates actually differ — a bulk import stamps every row with the
same day, and sorting by it would just reproduce the alphabetical order. Same
for "Highest rated" without scores, and the condition filter with only one
condition in use.

Condition is grouped for filtering (New / CIB / Boxed / Loose / Other) but
displayed exactly as you wrote it, so `CIB+` and `B+` still say `CIB+` and `B+`
on the game itself.

---

## Licence

MIT. Cover art and game descriptions come from
[IGDB](https://www.igdb.com) and belong to their respective owners.

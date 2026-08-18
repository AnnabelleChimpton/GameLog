# GameLog

A pretty, static site for showing off a video game collection. Search it, filter
it by console, sort it, click any cover for the details. Host it free on GitHub
Pages.

The page opens with **you**: photo, name, a few words, your links. Your
collection begins right underneath, so someone following a shared link learns
whose shelf this is and what's on it without clicking anything.

No framework, no build step, no dependencies. The repo *is* the site: a page, a
stylesheet, a script, and one JSON file holding your collection. Edit it through
a local UI (`npm run manage`), a CLI, or a text editor, whichever you prefer.

**Views:**

- **Shelf**: the cover grid, with search, platform filters and sorting.
- **Timeline**: your collection by release year, gaps and all.
- **Lists**: backlogs, wishlists, favourites; owned games and hunted ones.
- **Stats**: decades, platforms, genres, scores and condition at a glance.
- **Compare**: point it at *somebody else's* GameLog and see what you share.

**Compare** is the reason this is a static site rather than an app. Every
GameLog publishes its `collection.json` openly, and GitHub Pages serves it with
`access-control-allow-origin: *`, so any GameLog can read any other one straight
from the browser. No server, no accounts, no API in between. Paste a friend's
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

In your fork: **Settings → Pages → Build and deployment → Source: Deploy from a
branch**, branch `main`, folder `/ (root)`.

That's the only setting to change. There's no build step and no workflow. The
repo *is* the site, so GitHub just serves it. Every push publishes to
`https://YOUR-USERNAME.github.io/GameLog/`, usually within a minute.

### 3. Clear out the previous collection

A fork arrives with whoever's games you forked from. One command empties them,
along with their name, bio and footer:

```bash
npm run start-fresh
```

It asks you to confirm, and leaves `.env` and your git history alone.

### 4. Put your own games in

Four ways, all writing to the same file: mix and match freely.

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

**Let a script look it up.** It finds the cover art, description and year for
you, with no signup required:

```bash
npm run add "Hades"
```

**Import an existing export.** If you already track your collection in
[Gameye](https://www.gameye.app), export to CSV and seed the whole thing at once:

```bash
npm run import:gameye -- ~/Downloads/your-export.csv
```

### 5. Change the name and colour

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
accepts links and `**bold**`. The manager's **Site** and **Profile** tabs edit
all of this without touching the file.

### 6. Publish

Press **Publish…** in the manager. It shows exactly which files are about to go
out, lets you describe the change, then commits and pushes.

Or do it yourself, if you'd rather:

```bash
git add -A && git commit -m "Start my collection" && git push
```

---

## Day-to-day: you bought a game

```bash
npm run add "Chrono Trigger"
```

It searches, shows you the matches, asks which platform and what condition, and
writes the entry: cover art, description and year included. No signup needed;
it uses IGDB if you have it configured and the keyless sources otherwise.

Then push, either with **Publish…** in the manager or:

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

- **Lists**: make them, rename them, drag entries up and down, add notes.
- **Games**: edit any field on any game, or add one by searching IGDB.
- **Hardware**: your consoles.
- **Profile**: your photo, bio and links.
- **Site**: title, tagline, accent colour (with a colour picker), and the
  shelves you follow.

Adding a game searches your own collection *and* a game database at once: IGDB
if you've set it up, Wikipedia and libretro if you haven't. Pick something you
own and it links to it; pick something you don't and it's saved as a wanted
entry with its cover art. IGDB results that are ROM hacks or ports are labelled,
so you don't accidentally add *Chrono Trigger+* instead of *Chrono Trigger*.

Box art from the keyless source is chosen per platform, so a game added before
you picked one gets its cover the moment you choose the platform.

Changes are held in memory until you press **Save** (or ⌘/Ctrl+S), so a mis-click
is undone by reloading the page. Saving writes `data/*.json` and nothing else,
which keeps diffs small and readable.

**Publish…** then commits and pushes. It lists what's going out first, and only
ever stages the files the manager itself edits. Anything else you've changed is
shown as "left alone" for you to handle in git. If there's no `origin` remote
yet, or your credentials aren't set up, it says so rather than half-succeeding.

### It's local-only, on purpose

The manager needs a server that can write files, and that server only exists
while `npm run manage` is running on your machine. Your published site is static
files on someone else's host. There's nothing there to save to, which is
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

The manager's **Profile** tab is the easy way: "Choose a photo…" resizes the
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

The About page also works out a few things on its own: how many games across
how many platforms, the years they span, and which console you're deepest on -
so it stays accurate as the collection grows.

Setup instructions inside the site (the `npm run` hints on an empty shelf or an
empty Lists tab) only appear when you are viewing it from localhost. A visitor
to the published site has no terminal and no clone, so they see a plain message
instead, and an empty Lists tab is hidden from them altogether.

**Every part is optional.** Leave `profile` empty and the header falls back to
just your site title, tagline and collection facts. Which is the default for a
fresh fork.

### Sharing the link

Link previews are built by crawlers that don't run JavaScript, so those tags
can't be assembled at runtime like the rest of the page. They live in
`index.html`, between two `gamelog:meta` markers. Saving in the manager rewrites
that block from your config: the title becomes "Your Name. Your Title", the
description comes from your bio, and your photo becomes the card image.

For the image to work, set **Published address** on the manager's Site tab (or
`siteUrl` in the config) to your site's address. A crawler can't resolve a
relative path. Edit `config.json` rather than those meta lines; anything you
type between the markers is overwritten on the next save.

## Playing through it

If you're working through the collection, on stream or otherwise, four optional
fields turn the site into a progress tracker:

```json
"status": "beaten",
"beatenOn": "2026-08-20",
"video": "https://youtube.com/watch?v=...",
"verdict": "Ends on a boss you can walk past. 3/10."
```

`status` is `playing`, `beaten` or `dropped`, and leaving it out means not
started. Set it from the manager's Games tab, where the play-through fields sit
above the catalogue ones and the date fills itself in when you mark something
beaten.

Everything else follows from it:

- **A progress bar** appears above the shelf, counting whatever is currently
  filtered. Select a platform and it becomes that project's tracker: "2 of 31
  beaten" for a one-console run, or the whole collection with no filter.
- **Episode numbers** are worked out from the order things were finished, so a
  video titled `Some Game (12/185)` gets its number from the site rather than
  from you counting. The number shows on the tile and in the detail view.
- **The detail view** leads with the episode number, your verdict, and a link
  to the video, which is what someone arriving from a description wants.
- **Filter by status** to see only what's left, then press **Surprise me** to
  roll the next one at random.

`dropped` exists on purpose. Some games have no ending to reach, and recording
that with a reason is more honest than inventing a finish line.

## Lists

A list is any named set of games. A backlog, a wishlist, the ones you'd save
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
hunting list, buy it a year later, run `npm run add "Chrono Trigger"`, and the
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
is ambiguous. There are a lot of *Chrono Trigger* ROM hacks.

## Cover art and descriptions

```bash
npm run enrich
```

No signup. It fills in what's missing, never overwrites your own edits, and is
safe to re-run. Box art comes from [libretro](https://thumbnails.libretro.com),
descriptions and years from [Wikipedia](https://en.wikipedia.org).

It's very good on anything emulated: 95% of games on the platforms it covers -
and **has nothing for current-gen**, because nobody scans PlayStation 5 or
Switch boxes for an emulation project.

For those, open `npm run manage` and drop an image straight onto the game. No
API, no account, and you get the exact cover you want.

<details>
<summary>Using IGDB instead, if you want current-gen filled in automatically</summary>

One database for everything, plus genres and companies. The catch is the
sign-up: IGDB is owned by Twitch, so it needs a Twitch account **with a phone
number for 2FA**, and there's no email-only path.

1. [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register
   Your Application**. OAuth Redirect URL `http://localhost`, category
   Application Integration, client type Confidential.
2. Copy the Client ID, click **New Secret**, copy that.
3. `cp .env.example .env` and paste both in.

`.env` is gitignored and the published site never needs it: image urls are
baked into `collection.json`. With keys present, `enrich` and `add` use IGDB
automatically; `--source free` forces the keyless path either way.

</details>

A game with no art keeps a generated placeholder in its platform's colour, and
those tiles show their title permanently, so the shelf still reads properly.

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
and tells you how much is still waiting on `npm run enrich`. The manager runs
the same shape checks before it writes anything, so data saved through the UI is
already valid. This is for catching hand-edits.

---

## Adding a console the registry doesn't know

Everything still works with an unrecognised platform. It just gets an
auto-generated abbreviation and colour. To give it a proper one, add a line to
`assets/js/platforms.mjs`:

```js
{ key: 'Sega Dreamcast', short: 'DC', color: '#e06c3b', igdb: 23 },
```

- `key`: exactly as you spell it in `collection.json`
- `short`: the badge label; keep it to about four characters
- `color`: the chip dot, badge, and placeholder-cover colour
- `igdb`: IGDB's platform id, which narrows cover-art searches. Look it up in
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
assets/js/platforms.mjs  the platform registry: names, colours, IGDB ids
scripts/lib/libretro.mjs keyless box art
scripts/lib/wikipedia.mjs keyless descriptions and years
data/collection.json     your games and hardware
data/lists.json          your lists (optional)
data/config.json         site title, tagline, accent colour, friends
scripts/                 the optional Node helpers (start-fresh, add, enrich, …)
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
| `metacritic` | 0-100 |
| `notes` | Anything personal; shown in the detail view |
| `added` | `YYYY-MM-DD`, used by the "Recently added" sort |
| `igdbId` / `wikidataId` | Set by `enrich`. Stable ids that let one collection be matched against another exactly, rather than by title |

`hardware` entries use `name` instead of `title` and `image` instead of `cover`,
and appear in their own section at the bottom of the page.

The file also carries `"gamelog": 1`. A schema version, so that anything
reading a collection over the network (the Compare view, or an index across many
sites later) can tell which format it's looking at rather than guessing.

---

## Notes

Everything in `collection.json` is public once you push it. It's a static site,
so anyone can read the raw file. Don't put anything in `notes` you wouldn't want
seen. There are no price or valuation fields for the same reason.

Cover images are hotlinked to IGDB's CDN rather than committed, which keeps the
repo small. If you'd rather host them yourself, download them into
`assets/covers/` and point the `cover` fields at the local paths. The site
treats any url the same way.

Keyboard: `/` focuses search, `r` picks a game at random from whatever is
showing, `Esc` clears the search or closes the dialog, and `←` / `→` step
through games while a detail view is open.

Controls hide themselves when they'd be lying. "Recently added" only appears if
your `added` dates actually differ. A bulk import stamps every row with the
same day, and sorting by it would just reproduce the alphabetical order. Same
for "Highest rated" without scores, and the condition filter with only one
condition in use.

Condition is grouped for filtering (New / CIB / Boxed / Loose / Other) but
displayed exactly as you wrote it, so `CIB+` and `B+` still say `CIB+` and `B+`
on the game itself.

---

## Licence

MIT, for the code.

Cover art and descriptions come from [IGDB](https://www.igdb.com),
[libretro](https://thumbnails.libretro.com) and [Wikipedia](https://en.wikipedia.org)
depending on which source you use. The artwork itself belongs to its respective
publishers: none of it is mine to license.

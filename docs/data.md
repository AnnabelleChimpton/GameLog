# Files, fields and commands

[← README](../README.md)

## What's in here


```
index.html               the page
Open GameLog Manager.*    double-click to open the editor (Mac / Windows)
Start Fresh.*             double-click to empty a fresh copy (Mac / Windows)
assets/css/styles.css    all the styling; colours are CSS variables at the top
assets/js/app.js         state, routing, the shelf
assets/js/detail.js      the detail dialog
assets/js/lib.js         helpers shared by every view
assets/js/stats.js       the stats view and its charts
assets/js/timeline.js    the by-year view
assets/js/lists.js       lists, and resolving entries against the collection
assets/js/feed.js        the log: posts woven with play-through milestones
scripts/lib/rss.mjs      generates feed.xml from the log
assets/js/profile.js     the About view
assets/js/manage.js      the local manager UI
manage.html              the manager page (local use only)
assets/js/compare.js     fetching another collection: Compare, and the Following river
assets/js/platforms.mjs  the built-in platform registry: names, colours, shapes, art sources
scripts/lib/libretro.mjs keyless box art
scripts/lib/wikipedia.mjs keyless descriptions and years
scripts/lib/scores.mjs   keyless Metacritic scores (Wikipedia, then Wikidata)
scripts/lib/shrink.mjs   the PNG reader and JPEG writer that keep stored art small
assets/js/ids.mjs        how ids are made, shared by the scripts and the manager
data/collection.json     your games and hardware
data/lists.json          your lists (optional)
data/feed.json           your log posts (optional)
data/config.json         site title, tagline, accent colour, friends
data/platforms.json      your console overrides/additions (optional)
scripts/                 the optional Node helpers (start-fresh, add, enrich, …)
tests/                   `npm test`, no dependencies
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
| `metacritic` | 0-100. Filled by `enrich`, `add` and the manager from Wikipedia/Wikidata; yours to overwrite |
| `notes` | Anything personal; shown in the detail view |
| `added` | `YYYY-MM-DD`, used by the "Recently added" sort |
| `igdbId` / `wikidataId` | Set by `enrich`. Stable ids that let one collection be matched against another exactly, rather than by title |

`hardware` entries use `name` instead of `title` and `image` instead of `cover`,
and appear in their own section at the bottom of the page.

The file also carries `"gamelog": 1`. A schema version, so that anything
reading a collection over the network (the Compare view, or an index across many
sites later) can tell which format it's looking at rather than guessing.

---


## Hardware


`hardware` is a second list alongside `games`, for the things you play on rather
than play:

```json
"hardware": [
  { "id": "n64", "name": "Nintendo 64 System", "platform": "Nintendo 64" },
  { "id": "n64-pad", "name": "Controller [Grey]", "kind": "controller",
    "platform": "Nintendo 64", "quantity": 4, "condition": "Loose" }
]
```

`kind` is `console`, `controller`, `memory` or `accessory`, and defaults to
`console` when left out. `quantity` defaults to 1, so four identical controllers
are one row with `"quantity": 4` rather than four rows, and show as ×4.

The shelf groups them under headings, and the counts on your page follow the
kind, so peripherals never get counted as consoles.

No database covers peripherals, so photos are yours to add. The manager's
hardware tab has the same drop-or-paste picker the games use.


## Every command

All optional. The site is static files and works without any of them; these
are the helpers that fill the files in.

| Command | What it does |
| --- | --- |
| `npm run manage` | The local editor, at `http://localhost:4321/manage.html`. Also the double-click launchers. |
| `npm run serve` | Preview the site, read-only. |
| `npm run add "Title"` | Add one game: searches, asks platform and condition, fetches art, description, year and score. `--platform`, `--condition`, `--region`, `--notes`, `--source free`, `--no-lookup`. |
| `npm run enrich` | Fill in whatever is missing — art, description, year, score — for the whole collection. `--force`, `--only <id>`, `--dry-run`, `--source free\|igdb`. |
| `npm run boxart` | Backfill true-shape box scans. `--platform "Nintendo 64"`, `--force`. |
| `npm run vendor` | Download any art still linked to other sites into the repo. `--dry-run`. |
| `npm run shrink` | Re-encode stored art so it weighs less. `--dry-run`. |
| `npm run list` | Make and edit lists; `npm run list -- wants <id>` marks the wishlist. |
| `npm run post "Title"` | Write a log post. `--ref <game-id>`, `--body`, `--date`; `show`, `rm <id>`. |
| `npm run check` | Validate the data files before you push. |
| `npm run import:gameye -- file.csv` | Seed the collection from a Gameye export. |
| `npm run start-fresh` | Empty a fresh fork of the previous owner's games and profile. |
| `npm test` | The test suite. No dependencies. `GAMELOG_ONLINE=1 npm test` also checks the platform registry's Wikidata items, Wikipedia codes and libretro directories against the live services. |


## Notes


Everything in `collection.json` is public once you push it. It's a static site,
so anyone can read the raw file. Don't put anything in `notes` you wouldn't want
seen. There are no price or valuation fields for the same reason.

Cover images and box scans are stored in the repo, shrunk on the way in, so a
published GameLog owns its pictures rather than borrowing them. A `cover` can
still be any url if you want it to be: the site treats a link and a local path
the same way. See [Cover art, descriptions and scores](art.md).

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

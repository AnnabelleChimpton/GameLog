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

There are two ways to set up your own GameLog. The numbered steps further down
are the quick path if you use git and a terminal. If you would rather not, the
click-only walkthrough here does the whole thing with buttons.

### Not a coder? Start here

You can run your own GameLog without typing a single command. You need three
free things: a GitHub account, GitHub Desktop, and Node.js. Setup takes about ten
minutes and you only do it once. After that, editing is a double-click.

**1. Make your own copy.** Sign in at github.com and open this project's page.
Near the top right, click **Fork**, then **Create fork**. That makes a copy under
your own account, which is what you edit and publish from. (Some copies of this
project also show a green **Use this template** button near the top, which does
the same thing without carrying the original's history. Either one is fine; Fork
is always there.)

**2. Turn on hosting.** In your copy, open **Settings**, then **Pages** in the
left sidebar. Under **Source**, choose **Deploy from a branch**, select the
`main` branch and the `/ (root)` folder, and save. Your site goes live at
`https://YOUR-USERNAME.github.io/GameLog/` in a minute or two. This is the only
setting you touch here.

**3. Copy it to your computer.** Install **GitHub Desktop** from
desktop.github.com and sign in. Choose **File**, then **Clone repository**, pick
your GameLog, and clone it. GitHub Desktop is also how you publish later, with a
button instead of commands.

**4. Install Node.js.** The editor runs on your own machine and needs this, once.
Get it from nodejs.org and choose the version labelled LTS. There is nothing to
configure.

**5. Edit.** Open your GameLog folder (in GitHub Desktop, use **Repository**,
then **Show in Finder** or **Show in Explorer**). Double-click **Open GameLog
Manager.command** on a Mac, or **Open GameLog Manager.bat** on Windows. The
editor opens in your browser. Search for games to add them, set your name and
photo on the **Profile** tab, and your title and colour on the **Site** tab.
Your copy starts with example games so the page is not empty while you find your
way around; delete the ones you do not want with the **Delete** button on each,
and add your own. (If you would rather clear them all in one go, double-click
**Start Fresh.command** or **Start Fresh.bat** first. It shows what it will
erase and asks you to confirm by typing a word, so nothing is wiped by accident.)

**6. Publish.** When it looks right, open GitHub Desktop. It lists what you
changed. Write a short note in the **Summary** box, click **Commit to main**,
then **Push origin**. Your live site updates within a minute. The manager's own
**Publish** button does the same thing once GitHub Desktop has signed you in.

After setup, the whole routine is: double-click the launcher, make your changes,
and push in GitHub Desktop.

### 1. Fork it

Click **Fork** at the top of this repo (or, if the repo offers a green **Use
this template** button, that too, which skips the commit history), then clone
your copy:

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

Not comfortable in a terminal? **Double-click `Open GameLog Manager.command`**
(Mac) or **`Open GameLog Manager.bat`** (Windows) in this folder. It starts the
same editor and opens it in your browser — no commands to type. Keep the little
window that appears open while you edit, and close it when you're done. (You
still need [Node.js](https://nodejs.org) installed once; the launcher says so if
it's missing. On a Mac, the first time, right-click the file and choose **Open**
so it's allowed to run.)

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

**Let a script look it up.** It finds the cover art, box scan, description,
year and Metacritic score for you, with no signup required:

```bash
npm run add "Hades"
```

**Import an existing export.** If you already track your collection in
[Gameye](https://www.gameye.app), export to CSV and seed the whole thing at once:

```bash
npm run import:gameye -- ~/Downloads/your-export.csv
```

### 5. Consoles and peripherals

`hardware` is a second list alongside `games`, for the things you play on rather
than play — consoles, controllers, memory cards. The manager's **Hardware** tab
handles it; the fields are in [Files, fields and commands](docs/data.md#hardware).

### 6. Change the name and colour

The manager's **Site** and **Profile** tabs set the title, tagline, accent
colour, your photo and bio and links. By hand, it's all in `data/config.json`;
see [Your name, photo and the site's identity](docs/site.md).

### 7. Publish

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
writes the entry: cover art, box scan, description, year and Metacritic score
included. No signup needed: everything comes from public sources (libretro for
art, Wikipedia and Wikidata for the words and the score), with IGDB as an
optional extra for current-gen covers. The pictures are stored in your repo and
shrunk on the way in, so your site owns them and stays small.

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

## Going further

Everything above is enough to run a GameLog. The rest is documented where it
lives:

- [**The manager**](docs/manager.md) — the local editor, tab by tab, and why it only runs on your machine.
- [**Your name, photo and the site's identity**](docs/site.md) — the profile header, link previews, title and colour.
- [**Cover art, descriptions and scores**](docs/art.md) — where the data comes from with no signup, keeping art in the repo and small, true box shapes, and the optional IGDB setup.
- [**Playing through it**](docs/playthrough.md) — status, episode numbers, the progress bar.
- [**Lists**](docs/lists.md) — backlogs, the wishlist, and how entries resolve against your collection.
- [**The log**](docs/log.md) — posts, the RSS feed, following other shelves, directories.
- [**Adding a console the registry doesn't know**](docs/platforms.md) — `data/platforms.json`.
- [**Files, fields and commands**](docs/data.md) — every file, every field, every `npm run`.

## What's in here

```
index.html               the page
manage.html              the editor (local use only)
assets/                  styles, scripts, and your stored pictures
data/collection.json     your games and hardware: the one file you touch day to day
data/config.json         site title, colour, your profile, the shelves you follow
data/lists.json          your lists (optional)
data/feed.json           your log posts (optional)
data/platforms.json      your console overrides (optional)
scripts/                 the optional Node helpers (add, enrich, shrink, …)
tests/                   `npm test`, no dependencies
```

The full map, and every field, is in [Files, fields and commands](docs/data.md).

---

## Licence

MIT, for the code.

Cover art and descriptions come from [IGDB](https://www.igdb.com),
[libretro](https://thumbnails.libretro.com) and [Wikipedia](https://en.wikipedia.org)
depending on which source you use. The artwork itself belongs to its respective
publishers: none of it is mine to license.

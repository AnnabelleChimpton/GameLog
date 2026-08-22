# Cover art, descriptions and scores

[← README](../README.md)


```bash
npm run enrich
```

No signup. It fills in what's missing, never overwrites your own edits, and is
safe to re-run. Box art comes from [libretro](https://thumbnails.libretro.com),
descriptions and years from [Wikipedia](https://en.wikipedia.org).

It's very good on anything emulated: 95% of games on the platforms it covers -
and **has nothing for current-gen**, because nobody scans PlayStation 5 or
Switch boxes for an emulation project.

For those, open `npm run manage`, find the game, and use the cover box:

- **drop** an image file onto it, or **click** it and pick one
- **paste a link** into the field underneath and press **Download**

(Copying an image to the clipboard and pressing ctrl-V also works once the drop
zone has focus, but it is a shortcut rather than the way in.)

Whatever you give it is resized to 600px, written to `assets/covers/<game-id>`,
and the path is filled in for you.

The **Cover image path or url** field underneath is the raw value, and it does
something different on purpose: whatever you type there is stored as-is, so a
url stays a link rather than being downloaded. That is the one way to keep a
hotlink on purpose. A line under the box always says which you have, with a
**Save a local copy** button when it is a link. No API, no account, and you get
the exact cover you want. Because the file is downloaded rather than linked, it
also cannot vanish later when somebody else tidies up their server.

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

### Scores

Metacritic has no public API, and the databases that carry its numbers all want
a key. So `enrich` reads the score out of the game's Wikipedia article — the
reception box nearly every game article has — and, where the article defers to
Wikidata, out of Wikidata's review-score records. No signup.

The rule is strict on purpose, because a wrong number on a shelf is worse than
a blank. A score is only taken for *your platform*: either the article labels
it with that platform (`MC_XBOX`, "Xbox: 74/100", a Wikidata claim for that
console), or the score is unlabelled **and** your platform is the first one the
article's infobox lists — which is the platform the game came out on, and whose
score an unlabelled number is. A port never inherits the original's score. Each
run prints where every score came from (`← Wikipedia: Halo 2`), so any number
can be checked against its source in one click.

`npm run add` and the manager fetch it as a game is added, and the **Metascore**
box on the manager's Games tab has a **Look up** button for any game. Checked
against a collection with known scores this finds about 85% and gets none
wrong. Metacritic started in 2001, so most of a 3DO or SNES shelf has none to
find, and `npm run check` says so without nagging. A number you type yourself
is never overwritten.

### Keeping the art

```bash
npm run vendor
```

Art is found by handing you a link to somebody else's server, and a link works
right up until the day that server reorganises a directory. So every route that
finds art also stores it: `npm run add`, `npm run enrich`, `npm run boxart`, and
adding a game in the manager all download the picture into `assets/covers` or
`assets/boxart` and point `collection.json` at the copy. You do not have to do
anything for this, and it is why a published GameLog owns its own pictures.

`npm run vendor` is the catch-up pass for a collection that predates that, or
for anything a run could not fetch at the time. It is safe to re-run, and it is
not destructive: anything it cannot download keeps the link it had, so the worst
case is a game that stays linked rather than one that loses its art. `--dry-run`
shows what it would fetch.

The manager has the same as a button under **Site → Artwork backup**, the
publish dialog warns when anything is still hotlinked, and `npm run check`
reports the count. Expect roughly 100 KB per game with a cover and a box scan.

### Keeping it small

Box scans arrive from libretro as PNGs of photographed boxes, the worst possible
pairing: a 480×680 scan weighs half a megabyte, and a few hundred of them add
up to a repo every fork drags along. So every picture is shrunk on its way in,
by every route — the CLI, the manager, `enrich`, `boxart`, `vendor`. A PNG that
is a photograph becomes a JPEG at about a tenth of the size, with nothing you
can see on a shelf tile; anything over 1200px on its longest side is scaled
down first. A PNG that is a cut-out (a console on a clear background) is left
a PNG, and a picture that would barely shrink is left alone. There is nothing
to install: the image code is part of the repo.

For a collection built before this, or one with big scans dropped in by hand:

```bash
npm run shrink
```

It re-encodes what is already stored and repoints the entries; `--dry-run`
shows what it would do. The manager's **Site → Artwork backup** card has the
same as a button, **Shrink stored pictures**.

### True box shapes

Filter the shelf to a single console and the tiles stop being uniform
rectangles: each one takes the proportions of the real box. A Nintendo 64
cartridge box is wider than it is tall, a 3DO longbox is narrow and
tall, and lined up along one shelf they look like the shelf they came from.

This needs a second picture, because the covers most databases serve are
normalised to one size. `npm run add` and the manager fetch it while you add a
game, so there is usually nothing to do. To backfill games added before this
existed:

```bash
npm run boxart
```

It reads a few bytes of each scan to learn its proportions rather than
downloading the image, and takes `--platform "Nintendo 64"` to do one console
at a time, or `--force` to redo ones already filled in. Anything it can't find
falls back to the console's usual shape, so a shelf never ends up ragged.

Current-gen consoles have no scan source at all — libretro doesn't scan
PlayStation 5 or Switch boxes — but their cases are all one standard size, so
each platform in `assets/js/platforms.mjs` carries a `box` proportion (a Switch
cartridge case is narrower than a PlayStation Blu-ray case, which is a touch
wider than a GameCube DVD case). A single-platform shelf uses that known shape
when there's nothing to measure, so a Switch shelf stands like a shelf of Switch
cases rather than dropping to a plain grid. A real scan, when there is one,
always wins over the known value.

# Adding a console the registry doesn't know

[← README](../README.md)


The registry in `assets/js/platforms.mjs` ships comprehensive — every mainstream
home console and handheld from the Atari 2600 through the Switch, plus the
Sega/NEC/SNK/Bandai lines — so most shelves need nothing here. An unrecognised
platform still works too; it just gets an auto-generated abbreviation and
colour.

To add a console the registry doesn't know, or amend one, **you don't touch
code** — put it in `data/platforms.json`, which is merged over the built-ins by
`key` at load:

```json
{
  "platforms": [
    { "key": "Bandai WonderSwan", "short": "WS", "color": "#3a5a7a",
      "igdb": 57, "box": 0.90, "libretro": "Bandai - WonderSwan",
      "wiki": null, "wikidata": "Q1065792" }
  ]
}
```

- `key`: exactly as you spell it in `collection.json`
- `short`: the badge label; keep it to about four characters
- `color`: the chip dot, badge, and placeholder-cover colour
- `igdb`: IGDB's platform id, which narrows cover-art searches. Look it up in
  the [IGDB platform list](https://api-docs.igdb.com/#platform), or omit it.
- `box`: the case proportion (width ÷ height), for drawing a single-platform
  shelf at true shape when there's no scan to measure. A disc case is about
  `0.71`, an N64 cartridge box `1.37`, a 3DO longbox `0.52`.
- `libretro`: the system directory in libretro's thumbnail repo (No-Intro
  naming), which is the keyless box-art source. Omit it for anything libretro
  doesn't scan.
- `wiki`: the code Wikipedia's "Video game reviews" template uses for the
  console (`PS4`, `NGC`, `XBOX`…), so the score lookup can pick this platform's
  Metacritic score out of an article that lists several. The full list is in
  [the template's documentation](https://en.wikipedia.org/wiki/Template:Video_game_reviews/doc).
  Omit it and only an article about a single-platform release can score a game.
- `wikidata`: the console's Wikidata item (`Q184839` is the Nintendo 64), for
  the same job when an article defers to Wikidata. Search
  [wikidata.org](https://www.wikidata.org) for the console and copy the Q-number.

Only `key` is required; anything you leave out keeps the built-in value (when
you're amending an existing console) or a sensible default (when adding a new
one). A fresh fork ships the file with an empty list, which means the built-ins,
untouched; deleting it means the same.

---

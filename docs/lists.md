# Lists

[← README](../README.md)


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
npm run list -- wants the-hunt
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

### Your wishlist

One list can be marked as your **wishlist** — the games you're actively hunting.
It's just a flag (`"wants": true` on the list, or the star toggle on the
manager's Lists tab, or `npm run list -- wants <id>`), and only one list can
hold it. The wishlist leads the Lists tab, carries a **Wishlist** tag, and
counts by what's left — "*2 games still to find*" — rather than by what you own.
Everything else about it is an ordinary list, so a game flips from wanted to
owned the moment it lands in your collection.

### The file

`data/lists.json`, and it's plain enough to write by hand:

```json
{
  "lists": [
    {
      "id": "the-hunt",
      "name": "The hunt",
      "wants": true,
      "description": "Actively looking for these.",
      "items": [
        { "title": "Panzer Dragoon Saga", "platform": "Sega Saturn", "note": "disc only is fine" },
        { "ref": "nintendo-64-banjo-kazooie", "note": "want a boxed copy" }
      ]
    }
  ]
}
```

`wants` is optional and marks this as your one wishlist. Each entry is either a
`ref` (a game `id` from your collection) or a `title`
(plus an optional `platform` to pin which version you want). `note` is yours to
use however. Order is preserved, so a "play next" list stays in the order you
put it in. `npm run check` warns about a `ref` that doesn't match anything.

One caveat on the scripted form: `npm run list -- add …` run without a terminal
takes the first search result sight unseen. Run it interactively when the title
is ambiguous. There are a lot of *Chrono Trigger* ROM hacks.

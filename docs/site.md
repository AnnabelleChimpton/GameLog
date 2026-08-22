# Your name, photo and the site's identity

[← README](../README.md)


## Name, tagline and colour

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

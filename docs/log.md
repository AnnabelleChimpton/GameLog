# The log, the feed, and following other shelves

[← README](../README.md)


A running feed of your collection, on its own **Log** tab: short notes you write
("finally found a boxed copy"), woven together with a milestone for every game
you mark beaten or dropped, newest first.

```bash
npm run post "Finally landed a boxed Halo 2"
```

That's the whole thing. Add `--ref <game-id>` to hang the post off a game you
own, and it borrows that game's cover as a thumbnail that opens the detail on
click:

```bash
npm run post -- "Beat it at last" --ref microsoft-xbox-halo-2
npm run post -- "Shelf reorg" --body "Everything back in generation order." --date 2026-08-19
npm run post -- show          # print the log
npm run post -- rm <id>       # remove a post
```

**The part worth knowing:** you rarely need to write a post at all. Every game
you mark beaten or dropped (on the manager's Games tab, or by hand) already
becomes a dated entry, with its verdict as the text and its episode number
attached. So the log fills itself in from the play-through fields you were
setting anyway; written posts are for the things the collection can't know.

The manager's **Updates** tab is the point-and-click way: write a post, attach a
game, delete one. Like everything else it saves to a `data/*.json` file —
`data/feed.json` — and nothing else.

### The file

`data/feed.json`, plain enough to write by hand:

```json
{
  "gamelog": 1,
  "posts": [
    { "id": "2026-08-19-boxed-halo", "date": "2026-08-19",
      "title": "Finally landed a boxed Halo 2",
      "body": "Flea-market find, **complete** with the manual.",
      "ref": "microsoft-xbox-halo-2" }
  ]
}
```

`title` and `date` (`YYYY-MM-DD`) are required; `body` and `ref` are optional.
`body` takes the same restrained markdown as your bio — blank lines make
paragraphs, `**bold**` and `[links](https://…)` work, and nothing else is
interpreted, so a log read from another shelf later is as safe as a collection
is. `id` doubles as a deep-link anchor and is filled in for you. `npm run check`
warns about a `ref` that matches no game.

The feed is optional: with no `data/feed.json` at all, the milestones still fill
the log, and a visitor sees the Log tab only once there's something in it.

### It's a real RSS feed

The log is also published as `feed.xml`, so anyone can follow your shelf in a
normal feed reader — paste `https://you.github.io/GameLog/feed.xml` (or just the
site address; the page advertises the feed) into whatever they use.

Readers don't run JavaScript, so `feed.xml` can't be built in the browser the
way the rest of the page is — it's a static file, generated the same way and for
the same reason as the link-preview tags. It's rewritten from `data/feed.json`
and your collection whenever you save in the manager, when you run
`npm run post`, and again at publish, so it never drifts. The milestones ride
along in it, so a subscriber sees "Beaten: *Halo 2*" without you writing a post.

For the item links to work, set **Published address** on the manager's Site tab
(or `siteUrl` in the config) — a reader can't resolve a relative link, the same
requirement the preview-card image has. Without it, no `feed.xml` is written.

### Following other shelves

The **Following** tab is the other side of the log: the latest from the GameLogs
*you* follow, all in one newest-first river — games they've beaten, notes
they've written — each labelled with whose shelf it's from and linking back to
it.

It's the same trick as Compare. The shelves you follow are the `friends` in
`data/config.json` (set on the manager's Site tab), and the river reads each
one's collection and log **straight from their site in your browser** — no
server, no account, nothing in between. Their milestones come through too, so
following someone shows "Sam beat *Halo 2*" without Sam writing a word.

Each shelf is someone else's site, so one being down or slow just drops that
shelf from the river and the rest still show. A visitor to your published site
sees the tab only once you follow at least one shelf.

**Finding more people.** Above the river, a **Shelves to explore** strip suggests
GameLogs you don't follow yet, from two sources: the shelves *your* follows
follow (read from their public `friends` lists, ranked by how many of your
follows point at each), and the shelves listed in any **directory** you
subscribe to. Each links straight out, and its tooltip says where the
suggestion came from. So the follow graph is walkable a step at a time — land on
a shelf, see who it follows, and who *its* circle follows.

### Directories

A directory is the on-ramp for someone who doesn't know anyone yet. It's a
**shared, published list of shelves** — a webring's member list — and, like
everything else here, it's just a static file anyone can host. Subscribe to one
(the manager's Site tab, or `directories` in `data/config.json`) and its shelves
show up in **Shelves to explore**, so you can find people without knowing a
single address first.

```json
"directories": [
  "https://someone.github.io/gamelog-ring/directory.json"
]
```

**Hosting your own** is nothing more than publishing this file somewhere with
open CORS (GitHub Pages does):

```json
{
  "gamelog_directory": 1,
  "name": "The GameLog Ring",
  "description": "Physical game collectors.",
  "shelves": [
    { "name": "Annabelle", "url": "https://annabellechimpton.github.io/GameLog/" },
    { "name": "Sam", "url": "https://sam.github.io/GameLog/" }
  ]
}
```

`gamelog_directory` is a schema version, `shelves` is a list of `{ name, url }`.
There's no central directory and no registration — anyone can start one, fork
one, or run several, and shelves can be listed in as many as they like. A shelf
you already follow is never suggested back to you, and any address that isn't a
plain `http(s)` one is dropped, because a directory is somebody else's file too.

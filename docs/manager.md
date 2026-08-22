# The manager

[← README](../README.md)


Editing JSON by hand is fine until it isn't. There's a UI (or double-click
**Open GameLog Manager** in the repo folder, which runs the same thing):

```bash
npm run manage
```

Open the address it prints and you get a proper editor:

- **Lists**: make them, rename them, mark one as your wishlist, drag entries up
  and down. A wanted entry's title and platform are editable in place; an owned
  one is edited on the Games tab, so here you just add a note.
- **Games**: edit any field on any game, or add one by searching IGDB.
- **Hardware**: consoles, controllers, memory cards and accessories.
- **Updates**: write log posts, attach a game to one, delete them.
- **Profile**: your photo, bio and links.
- **Site**: title, tagline, accent colour (with a colour picker), and the
  shelves you follow.

Adding a game searches your own collection *and* a game database at once: IGDB
if you've set it up, Wikipedia and libretro if you haven't. Pick something you
own and it links to it; pick something you don't and it's saved as a wanted
entry, after asking which platform you want — and it pulls that platform's cover
art. On a list you can leave the platform as "any"; a catalogue entry needs one.
IGDB results that are ROM hacks or ports are labelled, so you don't accidentally
add *Chrono Trigger+* instead of *Chrono Trigger*.

Box art from the keyless source is chosen per platform, so a game added before
you picked one gets its cover the moment you choose the platform.

Changes are held in memory until you press **Save** (or ⌘/Ctrl+S), so a mis-click
is undone by reloading the page. Saving writes `data/*.json` and nothing else,
which keeps diffs small and readable.

**Publish…** then commits and pushes. It lists what's going out first, and only
ever stages the files the manager itself writes: the `data/*.json` files, your
profile photo, the stored covers and box scans, `index.html`'s preview tags and
`feed.xml`. Anything else you've changed is shown as "left alone" for you to
handle in git. If git isn't installed, there's no `origin` remote yet, or your
credentials aren't set up, it says so — and tells you to use GitHub Desktop's
Commit and Push instead — rather than half-succeeding. A machine with no git
name and email configured yet is fine: the commit is signed with the name on
your profile and your GitHub account's no-reply address.

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

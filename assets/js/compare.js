// The compare view.
//
// Every GameLog publishes the same collection.json at the same path, and GitHub
// Pages serves it with `access-control-allow-origin: *`. That means one shelf
// can read another directly from the browser -- no server, no accounts, no API
// between them. This view is the payoff for that.
//
// Everything fetched here is somebody else's file, so it is treated as hostile
// input: strings only ever reach the page through textContent, cover urls go
// through safeImageUrl, and the entry count is capped.

import { platformInfo } from './platforms.mjs';
import { h, coverImage, titleKey, plural } from './lib.js';

const MAX_ENTRIES = 20000;

/**
 * Work out where a collection.json lives from whatever the user pasted.
 * Accepts a site root, a direct json url, a github repo url, or "user/repo".
 */
export function resolveCollectionUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('Paste a GameLog address first.');

  // "user/repo" shorthand -> that user's project page.
  //
  // The username may not contain a dot, or a bare host and path like
  // "someone.github.io/GameLog" matches this and gets rebuilt as
  // "someone.github.io.github.io/GameLog". Repository names can contain dots,
  // so only the first segment is restricted.
  if (/^[\w-]+\/[\w.-]+$/.test(raw)) {
    const [user, repo] = raw.split('/');
    return `https://${user}.github.io/${repo}/data/collection.json`;
  }

  // Reject a foreign scheme before assuming https, or "ftp://host" would be
  // silently rewritten into "https://ftp//host" and fetched anyway.
  // (?!\d) keeps "localhost:4321" a host-and-port rather than a "localhost:" scheme.
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):(?!\d)/i);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    throw new Error(`Only http and https addresses can be loaded, not "${scheme[1]}:".`);
  }

  let url;
  try {
    // Bare "localhost:4321" means a local preview, which is never https.
    const assumed = /^localhost([:/]|$)/i.test(raw) ? 'http' : 'https';
    url = new URL(scheme ? raw : `${assumed}://${raw}`);
  } catch {
    throw new Error(`"${raw}" doesn't look like a web address.`);
  }

  // A hostname needs a dot to be real. localhost is the one exception, so that
  // `npm run serve` can be compared against while you are setting things up.
  const host = url.hostname;
  if (host !== 'localhost' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) {
    throw new Error(`"${raw}" doesn't look like a web address.`);
  }

  // A github.com repo url points at the source, not the published site.
  if (url.hostname === 'github.com') {
    const [user, repo] = url.pathname.split('/').filter(Boolean);
    if (user && repo) return `https://${user}.github.io/${repo}/data/collection.json`;
  }

  if (url.pathname.endsWith('.json')) return url.href;

  url.pathname = url.pathname.replace(/\/+$/, '') + '/data/collection.json';
  url.hash = '';
  return url.href;
}

/** Fetch and sanity-check somebody else's collection. */
export async function loadCollection(input) {
  const url = resolveCollectionUrl(input);

  let response;
  try {
    response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
  } catch {
    // A CORS rejection and an offline network are indistinguishable here.
    throw new Error(
      `Couldn't reach ${url}. Either the address is wrong, or that host ` +
      `doesn't allow other sites to read it. GitHub Pages does.`
    );
  }

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `No collection found at ${url}. Check the address points at a GameLog site.`
        : `That address answered with HTTP ${response.status}.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${url} isn't valid JSON, so it probably isn't a GameLog.`);
  }

  if (!data || !Array.isArray(data.games)) {
    throw new Error(`${url} loaded, but has no "games" list: probably not a GameLog.`);
  }

  const games = data.games.slice(0, MAX_ENTRIES).filter((g) => g && typeof g.title === 'string');
  if (!games.length) throw new Error('That collection is empty.');

  return { url, games };
}

/** Group two collections into shared / theirs-only / yours-only. */
export function diff(mine, theirs) {
  const index = (games) => {
    const map = new Map();
    for (const game of games) {
      const key = titleKey(game.title);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(game);
    }
    return map;
  };

  const mineByTitle = index(mine);
  const theirsByTitle = index(theirs);

  const shared = [];
  const onlyMine = [];
  const onlyTheirs = [];

  for (const [key, games] of mineByTitle) {
    if (theirsByTitle.has(key)) shared.push({ mine: games, theirs: theirsByTitle.get(key) });
    else onlyMine.push(...games);
  }
  for (const [key, games] of theirsByTitle) {
    if (!mineByTitle.has(key)) onlyTheirs.push(...games);
  }

  const bySortTitle = (a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
  return {
    shared: shared.sort((a, b) => bySortTitle(a.mine[0], b.mine[0])),
    onlyMine: onlyMine.sort(bySortTitle),
    onlyTheirs: onlyTheirs.sort(bySortTitle),
  };
}

function miniTile(game, { onOpen = null, subtitle = null } = {}) {
  const info = platformInfo(game.platform);
  const img = coverImage(game);
  img.className = 'minitile__cover';

  const props = {
    class: game.cover ? 'minitile' : 'minitile minitile--noart',
    title: `${game.title}: ${game.platform || 'unknown platform'}`,
  };

  const children = [
    img,
    h('span', { class: 'minitile__badge', style: `--badge-color:${info.color}`, text: info.short }),
    h('span', { class: 'minitile__name', text: game.title }),
    subtitle ? h('span', { class: 'minitile__sub', text: subtitle }) : null,
  ];

  // Only our own games open the detail dialog; theirs are not in our index.
  if (onOpen) {
    return h('button', { ...props, type: 'button',
      'aria-label': `${game.title}, ${game.platform}`, onclick: () => onOpen(game) }, children);
  }
  return h('div', { ...props, role: 'listitem' }, children);
}

function section(title, blurb, tiles) {
  return h('section', { class: 'cmp__section' },
    h('h3', { class: 'cmp__heading' },
      h('span', { text: title }),
      h('span', { class: 'cmp__badge', text: String(tiles.length) })),
    h('p', { class: 'cmp__blurb', text: blurb }),
    tiles.length
      ? h('div', { class: 'shelf shelf--mini', role: 'list' }, tiles)
      : h('p', { class: 'cmp__none', text: 'Nothing here.' }));
}

export function renderComparison(result, theirLabel, { onOpen }) {
  const { shared, onlyMine, onlyTheirs } = result;
  const theirTotal = shared.length + onlyTheirs.length;
  const myTotal = shared.length + onlyMine.length;

  // Deliberately not a single "overlap %". Two shelves of wildly different
  // sizes make that number meaningless -- 6 shared out of 187 combined reads
  // as 3% and sounds like nothing, when it is actually two thirds of theirs.
  const summary = h('div', { class: 'cmp__summary' },
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value', text: String(shared.length) }),
      h('span', { class: 'stat__label', text: 'in common' }),
      h('span', { class: 'stat__sub',
        text: `${shared.length} of their ${theirTotal} · ${shared.length} of your ${myTotal}` })),
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value', text: String(onlyTheirs.length) }),
      h('span', { class: 'stat__label', text: 'only theirs' }),
      h('span', { class: 'stat__sub', text: 'you could be hunting these' })),
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value', text: String(onlyMine.length) }),
      h('span', { class: 'stat__label', text: 'only yours' }),
      h('span', { class: 'stat__sub', text: 'nothing they have' })));

  return h('div', { class: 'cmp__results' },
    summary,
    section('They have, you don\'t', `Games on ${theirLabel} that are missing from your shelf.`,
      onlyTheirs.map((g) => miniTile(g))),
    section('You both have', 'Titles on both shelves, however you each own them.',
      shared.map(({ mine, theirs }) => miniTile(mine[0], {
        onOpen,
        subtitle: theirs[0].platform !== mine[0].platform
          ? `theirs: ${platformInfo(theirs[0].platform).short}` : null,
      }))),
    section('You have, they don\'t', 'Yours alone, out of this pairing.',
      onlyMine.map((g) => miniTile(g, { onOpen }))));
}

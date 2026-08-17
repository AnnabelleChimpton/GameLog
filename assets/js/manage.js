// The local manager UI.
//
// Talks to the small write API that `npm run manage` puts up. On a published
// GameLog those endpoints don't exist -- the fetch fails, and the page says so
// rather than pretending to save.
//
// Edits are held in memory and written on Save, so a mis-click is undone by
// reloading rather than by digging through git.

import { PLATFORMS, platformFromIgdbId, platformSortIndex } from './platforms.mjs';
import { h, coverImage, titleKey, plural } from './lib.js';
import { labelFor } from './profile.js';
import { resolveList } from './lists.js';

const $ = (s) => document.querySelector(s);

const API = {
  headers: { 'X-GameLog-Manage': '1', 'Content-Type': 'application/json' },
};

const state = {
  collection: { games: [], hardware: [] },
  lists: { lists: [] },
  config: {},
  igdb: false,
  tab: 'lists',
  selectedList: null,
  gameQuery: '',
  editing: null,
  dirty: new Set(),
  // Lists created this session and not yet written to disk. Their ids may still
  // follow their names; a saved list's id is frozen because links point at it.
  freshLists: new Set(),
};

/* --- Saving --------------------------------------------------------------- */

function markDirty(what) {
  state.dirty.add(what);
  $('#save').disabled = false;
  $('#dirty').hidden = false;
}

function status(message, kind = 'info') {
  const el = $('#mg-status');
  el.hidden = !message;
  el.textContent = message || '';
  el.dataset.kind = kind;
  if (message && kind !== 'error') {
    clearTimeout(status._t);
    status._t = setTimeout(() => { el.hidden = true; }, 3200);
  }
}

async function save() {
  const targets = [...state.dirty];
  if (!targets.length) return;

  $('#save').disabled = true;
  try {
    for (const what of targets) {
      const body = what === 'collection' ? state.collection
        : what === 'lists' ? state.lists
        : state.config;
      const res = await fetch(`/api/${what}`, {
        method: 'PUT', headers: API.headers, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Could not save ${what}.`);
    }
    state.dirty.clear();
    state.freshLists.clear();
    $('#dirty').hidden = true;
    status(`Saved ${targets.map((t) => `data/${t}.json`).join(' and ')}.`);
  } catch (err) {
    status(err.message, 'error');
    $('#save').disabled = false;
  }
}

/* --- Small building blocks ------------------------------------------------ */

function field(label, value, onInput, { type = 'text', placeholder = '', rows = 0 } = {}) {
  const input = rows
    ? h('textarea', { class: 'mg-input', rows: String(rows), placeholder })
    : h('input', { class: 'mg-input', type, placeholder });
  input.value = value ?? '';
  input.addEventListener('input', () => onInput(input.value));
  return h('label', { class: 'mg-field' },
    h('span', { class: 'mg-field__label', text: label }), input);
}

function platformField(value, onChange) {
  const select = h('select', { class: 'mg-input' });
  const known = PLATFORMS.map((p) => p.key);
  // Keep an unrecognised platform selectable rather than silently rewriting it.
  const options = known.includes(value) || !value ? known : [value, ...known];
  select.append(h('option', { value: '', text: '— pick a platform —' }));
  for (const key of options) select.append(h('option', { value: key, text: key }));
  select.value = value || '';
  select.addEventListener('change', () => onChange(select.value));
  return h('label', { class: 'mg-field' },
    h('span', { class: 'mg-field__label', text: 'Platform' }), select);
}

function iconButton(label, onClick, { danger = false, title = '' } = {}) {
  return h('button', {
    type: 'button',
    class: danger ? 'mg-mini mg-mini--danger' : 'mg-mini',
    title: title || label,
    onclick: onClick,
  }, h('span', { text: label }));
}

function thumb(game) {
  const img = coverImage(game);
  img.className = 'mg-thumb__img';
  return h('div', { class: 'mg-thumb' }, img);
}

/* --- The game picker ------------------------------------------------------ */

let pickerResolve = null;

/**
 * Which shelves a search result could plausibly go on.
 *
 * IGDB says which platforms a game was released for, so the answer is usually
 * already in the result -- asking someone to pick it out of a list of thirty
 * afterwards was throwing that away.
 */
function likelyPlatforms(candidate) {
  const fromIds = (candidate.platformIds || [])
    .map(platformFromIgdbId)
    .filter(Boolean);

  if (fromIds.length) {
    // IGDB returns platforms in no meaningful order, so the first button was
    // as likely to be a later port as the original -- Star Fox 64 offered Wii
    // ahead of Nintendo 64. Rank by how much of that platform this collection
    // already holds, since you are usually adding to a shelf you already keep,
    // and fall back to registry order (roughly chronological) to break ties.
    const owned = new Map();
    for (const game of state.collection.games) {
      owned.set(game.platform, (owned.get(game.platform) || 0) + 1);
    }
    return [...new Set(fromIds)].sort((a, b) =>
      (owned.get(b) || 0) - (owned.get(a) || 0)
      || platformSortIndex(a) - platformSortIndex(b));
  }

  // Keyless results carry no platform data, so fall back to the shelves this
  // collection already uses -- far shorter than the full registry.
  return [...new Set(state.collection.games.map((g) => g.platform))].filter(Boolean).sort();
}

/** Step two of the picker: which platform is your copy for. */
function renderPlatformStep(candidate, results, done) {
  const suggested = likelyPlatforms(candidate);

  const all = h('select', { class: 'mg-input' },
    h('option', { value: '', text: '— another platform —' }),
    ...PLATFORMS.map((p) => h('option', { value: p.key, text: p.key })));
  all.addEventListener('change', () => { if (all.value) done(all.value); });

  results.replaceChildren(
    h('p', { class: 'mg-picked' },
      h('span', { class: 'mg-picked__label', text: 'Adding' }),
      h('span', { class: 'mg-picked__name',
        text: `${candidate.title}${candidate.year ? ` (${candidate.year})` : ''}` })),
    h('p', { class: 'mg-hint', text: 'Which platform is your copy for?' }),
    h('div', { class: 'mg-platgrid' },
      suggested.map((key) => h('button', {
        type: 'button', class: 'mg-mini mg-platpick', onclick: () => done(key),
      }, h('span', { text: key })))),
    all);
}

/**
 * Search your own collection and a game database at once. Picking something you
 * own produces a ref; picking anything else produces a standalone entry.
 *
 * With `needPlatform`, a second step in the same dialog asks which shelf it
 * belongs on and resolves box art for it before returning.
 */
function openPicker({ title, allowOwned = true, allowSearch = true, platform = null,
                      needPlatform = false }) {
  const dialog = $('#picker');
  const input = $('#picker-input');
  const results = $('#picker-results');
  input.value = '';
  input.placeholder = title || 'Search…';
  results.replaceChildren();
  $('#picker-hint').textContent = state.igdb || !allowSearch
    ? 'Type at least two letters.'
    : 'Type at least two letters. Without IGDB keys this searches Wikipedia and '
      + 'libretro, which cover everything except current-gen consoles.';

  let timer;
  const run = async () => {
    const term = input.value.trim();
    if (term.length < 2) { results.replaceChildren(); return; }

    const rows = [];

    if (allowOwned) {
      const key = titleKey(term);
      const owned = state.collection.games
        .filter((g) => titleKey(g.title).includes(key)
          || g.title.toLowerCase().includes(term.toLowerCase()))
        .slice(0, 6);
      for (const game of owned) {
        rows.push(h('button', {
          type: 'button', class: 'mg-result',
          onclick: () => { dialog.close(); pickerResolve?.({ kind: 'owned', game }); },
        },
          thumb(game),
          h('div', { class: 'mg-result__body' },
            h('span', { class: 'mg-result__name', text: game.title }),
            h('span', { class: 'mg-result__meta',
              text: `${game.platform}${game.year ? ` · ${game.year}` : ''}` })),
          h('span', { class: 'mg-result__tag', text: 'you own this' })));
      }
    }

    if (allowSearch) {
      const params = new URLSearchParams({ q: term });
      if (platform) params.set('platform', platform);
      const res = await fetch(`/api/search?${params}`, { headers: API.headers })
        .then((r) => r.json()).catch(() => ({ results: [] }));
      for (const found of res.results || []) {
        rows.push(h('button', {
          type: 'button', class: 'mg-result',
          onclick: () => {
            if (!needPlatform) {
              dialog.close();
              pickerResolve?.({ kind: 'new', game: found });
              return;
            }
            $('#picker-hint').textContent = '';
            renderPlatformStep(found, results, async (chosenPlatform) => {
              dialog.close();
              // Keyless art is per-platform, so it can only be resolved now.
              if (!found.cover && chosenPlatform) {
                const params = new URLSearchParams({ title: found.title, platform: chosenPlatform });
                const got = await fetch(`/api/cover?${params}`, { headers: API.headers })
                  .then((r) => r.json()).catch(() => ({}));
                found.cover = got.cover || null;
              }
              pickerResolve?.({ kind: 'new', game: found, platform: chosenPlatform });
            });
          },
        },
          thumb({ cover: found.cover, platform: platform || found.platforms?.[0] }),
          h('div', { class: 'mg-result__body' },
            h('span', { class: 'mg-result__name', text: found.title }),
            h('span', { class: 'mg-result__meta',
              text: [found.year, (found.platforms || []).slice(0, 3).join(', ')]
                .filter(Boolean).join(' · ') })),
          found.derivative
            ? h('span', { class: 'mg-result__tag mg-result__tag--warn', text: 'hack / port' })
            : null));
      }
    }

    results.replaceChildren(...(rows.length
      ? rows
      : [h('p', { class: 'cmp__none', text: 'Nothing found.' })]));
  };

  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 220); };
  dialog.showModal();
  input.focus();

  return new Promise((resolve) => {
    pickerResolve = resolve;
    dialog.addEventListener('close', () => resolve(null), { once: true });
  });
}

/* --- Lists tab ------------------------------------------------------------ */

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    || `list-${state.lists.lists.length + 1}`;
}

function renderLists() {
  const wrap = $('#tab-lists');
  const lists = state.lists.lists;

  const picker = h('div', { class: 'mg-listbar' },
    ...lists.map((list) => h('button', {
      type: 'button', class: 'chip',
      'aria-selected': String(list.id === state.selectedList),
      onclick: () => { state.selectedList = list.id; renderLists(); },
    },
      h('span', { text: list.name || list.id }),
      h('span', { class: 'chip__count', text: String(list.items?.length || 0) }))),
    h('button', {
      type: 'button', class: 'pillbutton pillbutton--accent',
      onclick: () => {
        const name = `New list ${lists.length + 1}`;
        const list = { id: slug(name), name, description: null, items: [] };
        lists.push(list);
        state.freshLists.add(list);
        state.selectedList = list.id;
        markDirty('lists');
        renderLists();
      },
    }, h('span', { text: '+ New list' })));

  if (!lists.length) {
    wrap.replaceChildren(picker, h('div', { class: 'mg-empty' },
      h('p', { text: 'No lists yet. Make one — a backlog, a wishlist, whatever you like.' })));
    return;
  }

  const list = lists.find((l) => l.id === state.selectedList) || lists[0];
  state.selectedList = list.id;
  const resolved = resolveList(list, state.collection.games);

  const idLabel = h('span', { class: 'mg-hint', text: `id: ${list.id}` });

  const meta = h('div', { class: 'mg-card' },
    h('div', { class: 'mg-row' },
      field('Name', list.name, (v) => {
        list.name = v;
        // A list's id is its deep link, so renaming an established one must not
        // quietly break every link to it. Until its first save there are no
        // links yet, so the id tracks the name instead of freezing as
        // "new-list-1" -- which is what everybody would otherwise end up with.
        if (state.freshLists.has(list)) {
          const taken = new Set(lists.filter((l) => l !== list).map((l) => l.id));
          let id = slug(v);
          let n = 2;
          while (taken.has(id)) id = `${slug(v)}-${n++}`;
          list.id = id;
          state.selectedList = id;
          idLabel.textContent = `id: ${id}`;
        }
        markDirty('lists');
      }),
      field('Description', list.description, (v) => {
        list.description = v || null; markDirty('lists');
      }, { placeholder: 'Optional' })),
    h('div', { class: 'mg-row mg-row--tight' },
      idLabel,
      h('span', { class: 'mg-grow' }),
      h('span', { class: 'mg-hint',
        text: `${resolved.ownedCount} of ${resolved.total} owned` }),
      iconButton('Delete list', () => {
        if (!confirm(`Delete "${list.name}"? The games themselves are untouched.`)) return;
        state.lists.lists = lists.filter((l) => l !== list);
        state.selectedList = state.lists.lists[0]?.id || null;
        markDirty('lists');
        renderLists();
      }, { danger: true })));

  const rows = resolved.entries.map((entry, i) => {
    const { game, owned, missing } = entry;
    const item = list.items[i];

    return h('div', { class: owned ? 'mg-item' : 'mg-item mg-item--wanted' },
      thumb(game),
      h('div', { class: 'mg-item__body' },
        h('span', { class: 'mg-item__name', text: game.title }),
        h('span', { class: 'mg-item__meta',
          text: missing ? 'broken link — no such game id'
            : owned ? `${game.platform} · in your collection`
            : `${game.platform || 'any platform'} · not owned yet` }),
        h('input', {
          class: 'mg-input mg-input--slim',
          placeholder: 'Note (optional)',
          value: item.note || '',
          oninput: (e) => { item.note = e.target.value || undefined; markDirty('lists'); },
        })),
      h('div', { class: 'mg-item__acts' },
        iconButton('↑', () => {
          if (i === 0) return;
          [list.items[i - 1], list.items[i]] = [list.items[i], list.items[i - 1]];
          markDirty('lists'); renderLists();
        }, { title: 'Move up' }),
        iconButton('↓', () => {
          if (i === list.items.length - 1) return;
          [list.items[i + 1], list.items[i]] = [list.items[i], list.items[i + 1]];
          markDirty('lists'); renderLists();
        }, { title: 'Move down' }),
        iconButton('Remove', () => {
          list.items.splice(i, 1); markDirty('lists'); renderLists();
        }, { danger: true })));
  });

  const addButton = h('button', {
    type: 'button', class: 'pillbutton pillbutton--accent mg-add',
    onclick: async () => {
      const picked = await openPicker({ title: 'Add a game to this list' });
      if (!picked) return;
      if (picked.kind === 'owned') {
        list.items.push({ ref: picked.game.id });
      } else {
        const g = picked.game;
        list.items.push({
          title: g.title, platform: null, year: g.year, cover: g.cover,
          description: g.description, genres: g.genres, developer: g.developer,
          publisher: g.publisher, igdbId: g.igdbId,
        });
      }
      markDirty('lists');
      renderLists();
    },
  }, h('span', { text: '+ Add a game' }));

  wrap.replaceChildren(picker, meta,
    rows.length ? h('div', { class: 'mg-items' }, rows)
      : h('div', { class: 'mg-empty' }, h('p', { text: 'This list is empty.' })),
    addButton);
}

/* --- Games tab ------------------------------------------------------------ */

function gameEditor(game) {
  const set = (key) => (v) => {
    game[key] = v === '' ? null : v;
    markDirty('collection');
  };

  return h('div', { class: 'mg-card mg-editor' },
    h('div', { class: 'mg-editor__head' },
      thumb(game),
      h('div', { class: 'mg-grow' },
        field('Title', game.title, (v) => { game.title = v; markDirty('collection'); }),
        platformField(game.platform, async (v) => {
          game.platform = v;
          markDirty('collection');
          // Keyless art is chosen per platform, so a game added before a
          // platform was picked can only get its cover at this moment.
          if (!game.cover && v) {
            const params = new URLSearchParams({ title: game.title, platform: v });
            if (game.region) params.set('region', game.region);
            const found = await fetch(`/api/cover?${params}`, { headers: API.headers })
              .then((r) => r.json()).catch(() => ({}));
            if (found.cover && !game.cover) {
              game.cover = found.cover;
              status('Found box art for that platform.');
              renderGames();
            }
          }
        })),
      iconButton('Delete', () => {
        if (!confirm(`Remove "${game.title}" from your collection?`)) return;
        state.collection.games = state.collection.games.filter((g) => g !== game);
        state.editing = null;
        markDirty('collection');
        renderGames();
      }, { danger: true })),

    h('div', { class: 'mg-row' },
      field('Year', game.year ?? '', (v) => {
        game.year = v ? Number(v) : null; markDirty('collection');
      }, { type: 'number' }),
      field('Condition', game.condition, set('condition'),
        { placeholder: 'CIB, Loose, Boxed, New…' }),
      field('Copies', game.copies ?? 1, (v) => {
        game.copies = Math.max(1, Number(v) || 1); markDirty('collection');
      }, { type: 'number' })),

    h('div', { class: 'mg-row' },
      field('Developer', game.developer, set('developer')),
      field('Publisher', game.publisher, set('publisher'))),

    h('div', { class: 'mg-row' },
      field('Region', game.region, set('region'), { placeholder: 'USA, JP, PAL…' }),
      field('Edition', game.release, set('release'), { placeholder: 'Demo, Not For Resale…' }),
      field('Metascore', game.metacritic ?? '', (v) => {
        game.metacritic = v ? Number(v) : null; markDirty('collection');
      }, { type: 'number' })),

    field('Genres (comma separated)', (game.genres || []).join(', '), (v) => {
      game.genres = v.split(',').map((s) => s.trim()).filter(Boolean);
      markDirty('collection');
    }),
    field('Cover image url', game.cover, set('cover'),
      { placeholder: 'https://…  or  assets/covers/foo.jpg' }),
    field('Description', game.description, set('description'), { rows: 4 }),
    field('Your note', game.notes, set('notes'),
      { rows: 2, placeholder: 'Anything personal — where it came from, what state it\'s in' }));
}

function renderGames() {
  const wrap = $('#tab-games');
  const term = state.gameQuery.trim().toLowerCase();
  const games = term
    ? state.collection.games.filter((g) =>
        g.title.toLowerCase().includes(term) || g.platform.toLowerCase().includes(term))
    : state.collection.games;

  const search = h('div', { class: 'mg-listbar' },
    h('input', {
      class: 'cmp__input', type: 'search', placeholder: 'Filter your games…',
      value: state.gameQuery,
      oninput: (e) => { state.gameQuery = e.target.value; renderGames(); },
    }),
    h('span', { class: 'mg-hint', text: `${games.length} of ${plural(state.collection.games.length, 'game')}` }),
    h('span', { class: 'mg-grow' }),
    h('button', {
      type: 'button', class: 'pillbutton pillbutton--accent',
      onclick: async () => {
        const picked = await openPicker({
          title: 'Add a game you own', allowOwned: false, needPlatform: true,
        });
        if (!picked || !picked.platform) return;
        const g = picked.game;
        const game = {
          id: '', title: g.title, platform: picked.platform, year: g.year, cover: g.cover,
          description: g.description, genres: g.genres || [], developer: g.developer,
          publisher: g.publisher, region: null, release: null, condition: null,
          copies: 1, metacritic: null, notes: null,
          added: new Date().toISOString().slice(0, 10), igdbId: g.igdbId ?? null,
          wikidataId: g.wikidataId ?? null,
        };
        game.id = uniqueGameId(game);
        state.collection.games.push(game);
        state.collection.games.sort((a, b) =>
          a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
        state.editing = game.id;
        // Show just the game that was added, rather than dropping it into
        // alphabetical order somewhere down a list of hundreds and scrolling
        // after it. One row, editor already open, nothing to hunt for --
        // clearing the filter brings everything back.
        state.gameQuery = game.title;
        markDirty('collection');
        renderGames();
        status(`Added ${game.title} — ${game.platform}. `
          + 'Clear the filter above to see the whole collection again.')
      },
    }, h('span', { text: '+ Add a game' })));

  const rows = games.slice(0, 400).map((game) => {
    const open = state.editing === game.id;
    return h('div', { class: 'mg-gamerow' },
      h('button', {
        type: 'button',
        class: open ? 'mg-gamerow__head is-open' : 'mg-gamerow__head',
        onclick: () => { state.editing = open ? null : game.id; renderGames(); },
      },
        thumb(game),
        h('div', { class: 'mg-item__body' },
          h('span', { class: 'mg-item__name', text: game.title }),
          h('span', { class: 'mg-item__meta',
            text: [game.platform || '⚠ no platform', game.year, game.condition]
              .filter(Boolean).join(' · ') })),
        h('span', { class: 'mg-hint', text: open ? '−' : 'edit' })),
      open ? gameEditor(game) : null);
  });

  wrap.replaceChildren(search,
    rows.length ? h('div', { class: 'mg-items' }, rows)
      : h('div', { class: 'mg-empty' }, h('p', { text: 'Nothing matches.' })),
    games.length > 400
      ? h('p', { class: 'mg-hint', text: 'Showing the first 400 — narrow the filter to see more.' })
      : null);
}

function uniqueGameId(game) {
  const base = `${game.platform || 'game'}-${game.title}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const taken = new Set(state.collection.games.map((g) => g.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/* --- Hardware tab --------------------------------------------------------- */

function renderHardware() {
  const wrap = $('#tab-hardware');
  const items = state.collection.hardware;

  const rows = items.map((item, i) => h('div', { class: 'mg-card' },
    h('div', { class: 'mg-row' },
      field('Name', item.name, (v) => { item.name = v; markDirty('collection'); }),
      platformField(item.platform, (v) => { item.platform = v; markDirty('collection'); })),
    h('div', { class: 'mg-row' },
      field('Condition', item.condition, (v) => {
        item.condition = v || null; markDirty('collection');
      }),
      field('Image url', item.image, (v) => {
        item.image = v || null; markDirty('collection');
      }),
      h('div', { class: 'mg-field' },
        h('span', { class: 'mg-field__label', text: ' ' }),
        iconButton('Remove', () => {
          items.splice(i, 1); markDirty('collection'); renderHardware();
        }, { danger: true })))));

  wrap.replaceChildren(
    h('div', { class: 'mg-listbar' },
      h('span', { class: 'mg-hint', text: `${plural(items.length, 'console')} and accessories` }),
      h('span', { class: 'mg-grow' }),
      h('button', {
        type: 'button', class: 'pillbutton pillbutton--accent',
        onclick: () => {
          items.push({ id: `hardware-${Date.now()}`, name: 'New item', platform: '',
            image: null, condition: null, notes: null });
          markDirty('collection'); renderHardware();
        },
      }, h('span', { text: '+ Add hardware' }))),
    rows.length ? h('div', { class: 'mg-items' }, rows)
      : h('div', { class: 'mg-empty' }, h('p', { text: 'No hardware listed.' })));
}

/* --- Site tab ------------------------------------------------------------- */

function renderSite() {
  const wrap = $('#tab-site');
  const config = state.config;
  const set = (key) => (v) => { config[key] = v === '' ? null : v; markDirty('config'); };

  const accent = h('input', { class: 'mg-color', type: 'color' });
  accent.value = /^#[0-9a-f]{6}$/i.test(config.accent || '') ? config.accent : '#f0a04b';
  accent.addEventListener('input', () => {
    config.accent = accent.value;
    document.documentElement.style.setProperty('--accent', accent.value);
    markDirty('config');
  });

  const friends = Array.isArray(config.friends) ? config.friends : (config.friends = []);

  wrap.replaceChildren(
    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'Identity' }),
      h('div', { class: 'mg-row' },
        field('Site title', config.title, set('title')),
        h('label', { class: 'mg-field mg-field--narrow' },
          h('span', { class: 'mg-field__label', text: 'Accent colour' }), accent)),
      field('Tagline', config.tagline, set('tagline')),
      field('Published address', config.siteUrl, set('siteUrl'),
        { placeholder: 'https://you.github.io/GameLog' }),
      h('p', { class: 'mg-hint',
        text: 'Used for the link preview card when someone shares your page — '
          + 'an absolute address is the only kind a crawler can resolve an image from.' }),
      field('Footer', config.footer, set('footer'),
        { rows: 2, placeholder: 'Markdown links and **bold** work here' }),
      h('label', { class: 'mg-check' },
        (() => {
          const box = h('input', { type: 'checkbox' });
          box.checked = config.showHardware !== false;
          box.addEventListener('change', () => {
            config.showHardware = box.checked; markDirty('config');
          });
          return box;
        })(),
        h('span', { text: 'Show the hardware section on the site' }))),

    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'Shelves you follow' }),
      h('p', { class: 'mg-hint',
        text: 'These appear as one-click buttons on the Compare view.' }),
      h('div', { class: 'mg-items' },
        friends.map((friend, i) => h('div', { class: 'mg-row mg-row--tight' },
          field('Name', friend.name, (v) => { friend.name = v; markDirty('config'); }),
          field('Address', friend.url, (v) => { friend.url = v; markDirty('config'); },
            { placeholder: 'https://someone.github.io/GameLog/' }),
          iconButton('Remove', () => {
            friends.splice(i, 1); markDirty('config'); renderSite();
          }, { danger: true })))),
      h('button', {
        type: 'button', class: 'pillbutton',
        onclick: () => { friends.push({ name: '', url: '' }); markDirty('config'); renderSite(); },
      }, h('span', { text: '+ Add a shelf' }))));
}


/* --- Profile tab ---------------------------------------------------------- */

/**
 * Shrink a chosen photo in the browser before it is ever uploaded.
 *
 * A phone photo is several megabytes and would sit in the git history forever
 * at full size, for something rendered at 120px. 512px on the long edge is
 * plenty for both the header avatar and the About page.
 */
function downscaleImage(file, max = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image this can read.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        // PNG keeps transparency; everything else is smaller as JPEG.
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderProfileTab() {
  const wrap = $('#tab-profile');
  const profile = state.config.profile || (state.config.profile = {});
  const links = Array.isArray(profile.links) ? profile.links : (profile.links = []);
  const set = (key) => (v) => { profile[key] = v === '' ? null : v; markDirty('config'); };

  const preview = h('div', { class: 'mg-avatar' });
  const paint = () => {
    if (profile.photo) {
      const img = h('img', { src: `${profile.photo}?t=${Date.now()}`, alt: '' });
      img.addEventListener('error', () => {
        preview.replaceChildren(h('span', { class: 'mg-avatar__none', text: 'not found' }));
      }, { once: true });
      preview.replaceChildren(img);
    } else {
      preview.replaceChildren(h('span', { class: 'mg-avatar__none', text: 'no photo' }));
    }
  };
  paint();

  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'mg-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      status('Resizing…');
      const dataUrl = await downscaleImage(file);
      const res = await fetch('/api/photo', {
        method: 'PUT', headers: API.headers, body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      profile.photo = json.path;
      markDirty('config');
      paint();
      status(`Photo saved to ${json.path} (${Math.round(json.bytes / 1024)} KB). `
        + 'Press Save to point your profile at it.');
    } catch (err) {
      status(err.message, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  wrap.replaceChildren(
    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'About you' }),
      h('p', { class: 'mg-hint',
        text: 'All optional. Leave it empty and the About tab never appears on your site.' }),
      h('div', { class: 'mg-profilehead' },
        preview,
        h('div', { class: 'mg-grow' },
          field('Your name', profile.name, set('name'),
            { placeholder: 'Shown at the top of the About page' }),
          h('div', { class: 'mg-row mg-row--tight' },
            h('label', { class: 'mg-mini mg-file__label' },
              h('span', { text: 'Choose a photo…' }), fileInput),
            profile.photo
              ? iconButton('Remove photo', () => {
                  profile.photo = null; markDirty('config'); paint(); renderProfileTab();
                }, { danger: true })
              : null),
          h('p', { class: 'mg-hint',
            text: 'Resized to 512px before saving, so it stays small in your repo.' }))),
      field('About', profile.about, set('about'),
        { rows: 6,
          placeholder: 'A few lines about you and what you collect. Blank lines make '
            + 'paragraphs; [links](https://example.com) and **bold** work.' }),
      field('Photo path or url', profile.photo, set('photo'),
        { placeholder: 'assets/profile/avatar.jpg — or paste any image url' })),

    h('div', { class: 'mg-card' },
      h('h2', { class: 'mg-card__title', text: 'Links' }),
      h('p', { class: 'mg-hint',
        text: 'GitHub, Twitch, Bluesky, Mastodon, YouTube and mailto: get their own icon. '
          + 'Anything else gets a globe. Leave the label blank to use the address.' }),
      h('div', { class: 'mg-items' },
        links.map((link, i) => h('div', { class: 'mg-row mg-row--tight' },
          field('Label', link.label, (v) => { link.label = v || null; markDirty('config'); },
            { placeholder: labelFor(link.url || '') || 'Optional' }),
          field('Address', link.url, (v) => { link.url = v; markDirty('config'); },
            { placeholder: 'https://…  or  mailto:you@example.com' }),
          iconButton('Remove', () => {
            links.splice(i, 1); markDirty('config'); renderProfileTab();
          }, { danger: true })))),
      h('button', {
        type: 'button', class: 'pillbutton',
        onclick: () => { links.push({ label: '', url: '' }); markDirty('config'); renderProfileTab(); },
      }, h('span', { text: '+ Add a link' }))));
}

/* --- Publishing ----------------------------------------------------------- */

const STATE_WORDS = { M: 'changed', A: 'added', D: 'deleted', R: 'renamed', '??': 'new' };

async function openPublisher() {
  const dialog = $('#publisher');
  const body = $('#pub-body');
  const where = $('#pub-where');
  const status = $('#pub-status');
  status.hidden = true;
  $('#pub-go').disabled = false;

  body.replaceChildren(h('p', { class: 'mg-hint', text: 'Checking…' }));
  dialog.showModal();

  const git = await fetch('/api/git', { headers: API.headers })
    .then((r) => r.json()).catch(() => null);

  if (!git?.isRepo) {
    where.textContent = '';
    body.replaceChildren(h('p', { class: 'cmp__none',
      text: 'This folder is not a git repository, so there is nothing to publish to.' }));
    $('#pub-go').disabled = true;
    return;
  }

  where.textContent = git.remote
    ? `${git.branch} → ${git.remote.replace(/^https:\/\/[^@]*@/, 'https://')}`
    : `${git.branch} — no remote set`;

  const parts = [];

  if (state.dirty.size) {
    parts.push(h('p', { class: 'mg-pub__warn',
      text: 'You have unsaved edits. Save them first, or they will not be included.' }));
  }

  if (git.mine.length) {
    parts.push(h('p', { class: 'mg-field__label', text: 'Will be published' }));
    parts.push(h('ul', { class: 'mg-pub__files' },
      git.mine.map((c) => h('li', {},
        h('span', { class: 'mg-pub__state', text: STATE_WORDS[c.state] || c.state }),
        h('span', { text: c.path })))));
  } else if (git.unpushed > 0) {
    parts.push(h('p', { class: 'mg-hint',
      text: `No new edits, but ${plural(git.unpushed, 'commit')} have never been pushed.` }));
  } else {
    parts.push(h('p', { class: 'cmp__none', text: 'Nothing to publish — everything is up to date.' }));
    $('#pub-go').disabled = true;
  }

  if (git.others.length) {
    parts.push(h('p', { class: 'mg-field__label', text: 'Left alone' }));
    parts.push(h('ul', { class: 'mg-pub__files mg-pub__files--muted' },
      git.others.map((c) => h('li', {},
        h('span', { class: 'mg-pub__state', text: STATE_WORDS[c.state] || c.state }),
        h('span', { text: c.path })))));
    parts.push(h('p', { class: 'mg-hint',
      text: 'The manager only publishes what it edits. Handle these in git yourself.' }));
  }

  if (!git.remote) $('#pub-go').disabled = true;
  body.replaceChildren(...parts);
}

async function doPublish() {
  const status = $('#pub-status');
  $('#pub-go').disabled = true;
  status.hidden = false;
  status.dataset.kind = 'info';
  status.textContent = 'Publishing…';

  try {
    const res = await fetch('/api/publish', {
      method: 'POST', headers: API.headers,
      body: JSON.stringify({ message: $('#pub-message').value }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Publish failed.');
    status.dataset.kind = 'info';
    status.textContent = `${json.summary}  Your site updates in a minute or so.`;
    $('#pub-message').value = '';
  } catch (err) {
    status.dataset.kind = 'error';
    status.textContent = err.message;
    $('#pub-go').disabled = false;
  }
}

/* --- Tabs and boot -------------------------------------------------------- */


function renderTab() {
  for (const tab of $('#mg-tabs').children) {
    tab.setAttribute('aria-current', String(tab.dataset.tab === state.tab));
  }
  $('#tab-lists').hidden = state.tab !== 'lists';
  $('#tab-games').hidden = state.tab !== 'games';
  $('#tab-hardware').hidden = state.tab !== 'hardware';
  $('#tab-profile').hidden = state.tab !== 'profile';
  $('#tab-site').hidden = state.tab !== 'site';

  if (state.tab === 'lists') renderLists();
  else if (state.tab === 'games') renderGames();
  else if (state.tab === 'hardware') renderHardware();
  else if (state.tab === 'profile') renderProfileTab();
  else renderSite();
}

async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem('gamelog-theme') || 'auto';

  let data;
  try {
    const res = await fetch('/api/state', { headers: API.headers });
    if (!res.ok) throw new Error('no api');
    data = await res.json();
  } catch {
    // No local server: this is the published copy, or `npm run serve` rather
    // than `npm run manage`.
    $('#mg-offline').hidden = false;
    document.querySelector('.mg-main').hidden = true;
    document.querySelector('.mg-top__actions').hidden = true;
    document.querySelector('#mg-tabs').hidden = true;
    return;
  }

  state.collection = data.collection?.games ? data.collection : { games: [], hardware: [] };
  state.collection.hardware = state.collection.hardware || [];
  state.lists = data.lists?.lists ? data.lists : { lists: [] };
  state.config = data.config || {};
  state.igdb = Boolean(data.igdb);
  state.selectedList = state.lists.lists[0]?.id || null;

  if (state.config.accent) {
    document.documentElement.style.setProperty('--accent', state.config.accent);
  }

  $('#mg-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.viewtab');
    if (tab) { state.tab = tab.dataset.tab; renderTab(); }
  });

  $('#save').addEventListener('click', save);
  $('#publish').addEventListener('click', openPublisher);
  $('#pub-go').addEventListener('click', doPublish);
  $('#pub-cancel').addEventListener('click', () => $('#publisher').close());

  $('#theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark'
      || (root.dataset.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    localStorage.setItem('gamelog-theme', root.dataset.theme);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      save();
    }
  });

  // Losing edits to a stray tab close is a bad way to learn about the Save button.
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty.size) { event.preventDefault(); event.returnValue = ''; }
  });

  if (!state.igdb) {
    status('No IGDB keys in .env — you can still edit everything, but searching for '
      + 'games you don\'t own is unavailable.', 'warn');
  }

  renderTab();
}

boot();

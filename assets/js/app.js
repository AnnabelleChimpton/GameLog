// GameLog — the front end.
//
// No build step and no dependencies: this reads data/collection.json and
// data/config.json at load, then renders and filters entirely in the browser.
// A few hundred games is small enough that re-rendering on every keystroke is
// imperceptible, so there is no virtualisation to reason about.
//
// Four views share one filter state: shelf, timeline, stats, compare.

import { platformInfo, platformSortIndex } from './platforms.mjs';
import {
  fold, sortKey, conditionGroup, CONDITION_ORDER, coverImage, placeholderCover,
  safeImageUrl, h, plural,
} from './lib.js';
import { renderStats } from './stats.js';
import { renderTimeline } from './timeline.js';
import * as compare from './compare.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  title: $('#site-title'),
  tagline: $('#site-tagline'),
  search: $('#search'),
  sort: $('#sort'),
  condition: $('#condition'),
  chips: $('#platform-chips'),
  filters: $('#filters'),
  views: $('#views'),
  statline: $('#statline'),
  grid: $('#grid'),
  count: $('#count'),
  clear: $('#clear'),
  empty: $('#empty'),
  notesToggle: $('#notes-toggle'),
  dice: $('#dice'),
  hardwareSection: $('#hardware-section'),
  hardwareGrid: $('#hardware-grid'),
  colophon: $('#colophon-text'),
  themeToggle: $('#theme-toggle'),
  viewShelf: $('#view-shelf'),
  viewTimeline: $('#view-timeline'),
  viewStats: $('#view-stats'),
  viewCompare: $('#view-compare'),
  cmpForm: $('#cmp-form'),
  cmpUrl: $('#cmp-url'),
  cmpStatus: $('#cmp-status'),
  cmpOutput: $('#cmp-output'),
  cmpFriends: $('#cmp-friends'),
  dialog: $('#detail'),
  dCover: $('#detail-cover'),
  dPlatform: $('#detail-platform'),
  dYear: $('#detail-year'),
  dTitle: $('#detail-title'),
  dGenres: $('#detail-genres'),
  dDescription: $('#detail-description'),
  dMeta: $('#detail-meta'),
  dNotes: $('#detail-notes'),
  dPrev: $('#detail-prev'),
  dNext: $('#detail-next'),
  dClose: $('.detail__close'),
};

const VIEWS = ['shelf', 'timeline', 'stats', 'compare'];

const state = {
  games: [],
  hardware: [],
  config: {},
  view: 'shelf',
  query: '',
  platform: 'all',
  condition: 'all',
  notesOnly: false,
  sort: 'title',
  visible: [],
  openIndex: -1,
};

/* --- Filtering and sorting ------------------------------------------------ */

function buildSearchIndex(game) {
  return fold([
    game.title,
    game.platform,
    platformInfo(game.platform).short,
    game.developer,
    game.publisher,
    (game.genres || []).join(' '),
    game.year,
    game.notes,
  ].filter(Boolean).join(' '));
}

function compute() {
  const terms = fold(state.query).split(' ').filter(Boolean);

  const list = state.games.filter((game) => {
    if (state.platform !== 'all' && game.platform !== state.platform) return false;
    if (state.condition !== 'all' && game._condition !== state.condition) return false;
    if (state.notesOnly && !game.notes) return false;
    // Every term must appear somewhere, so "zelda n64" narrows as you'd expect.
    return terms.every((t) => game._index.includes(t));
  });

  const dir = state.sort.startsWith('-') ? -1 : 1;
  const field = state.sort.replace(/^-/, '');

  list.sort((a, b) => {
    if (field === 'title') return dir * a._sortKey.localeCompare(b._sortKey, 'en');
    // Missing numbers and dates always sink to the bottom, whichever way we sort.
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return a._sortKey.localeCompare(b._sortKey, 'en');
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return a._sortKey.localeCompare(b._sortKey, 'en');
    return dir * (av > bv ? 1 : -1);
  });

  state.visible = list;
}

const isFiltered = () =>
  Boolean(state.query) || state.platform !== 'all' || state.condition !== 'all' || state.notesOnly;

/* --- Shelf ---------------------------------------------------------------- */

function renderGrid() {
  const fragment = document.createDocumentFragment();

  state.visible.forEach((game, i) => {
    const info = platformInfo(game.platform);

    const tile = document.createElement('button');
    tile.type = 'button';
    // Without real art the placeholder says nothing but the platform, so the
    // title plate has to stay put rather than waiting for a hover.
    tile.className = game.cover ? 'tile' : 'tile tile--noart';
    tile.dataset.index = String(i);
    tile.setAttribute('aria-label',
      `${game.title}${game.year ? `, ${game.year}` : ''}, ${game.platform}`);
    // Stagger only the first screenful; beyond that it's just delay.
    if (i < 24) tile.style.animationDelay = `${Math.min(i * 14, 340)}ms`;

    const img = coverImage(game, { eager: i < 12 });
    img.className = 'tile__cover';

    const badge = document.createElement('span');
    badge.className = 'tile__badge';
    badge.style.setProperty('--badge-color', info.color);
    badge.textContent = info.short;

    const plate = document.createElement('span');
    plate.className = 'tile__plate';
    const name = document.createElement('span');
    name.className = 'tile__name';
    name.textContent = game.title;
    plate.append(name);
    if (game.year) {
      const sub = document.createElement('span');
      sub.className = 'tile__sub';
      sub.textContent = game.year;
      plate.append(sub);
    }

    tile.append(img, badge, plate);

    if (game.notes) {
      const dot = document.createElement('span');
      dot.className = 'tile__note';
      dot.title = 'Has a note';
      tile.append(dot);
    }

    if (game.copies > 1) {
      const copies = document.createElement('span');
      copies.className = 'tile__copies';
      copies.textContent = `×${game.copies}`;
      copies.title = `${game.copies} copies`;
      tile.append(copies);
    }

    fragment.append(tile);
  });

  el.grid.replaceChildren(fragment);
}

function renderCount() {
  const total = state.games.length;
  const shown = state.visible.length;

  if (isFiltered()) {
    el.count.textContent = `${shown} of ${total} game${total === 1 ? '' : 's'}`;
  } else {
    const platforms = new Set(state.games.map((g) => g.platform)).size;
    const copies = state.games.reduce((sum, g) => sum + (g.copies || 1), 0);
    const extra = copies > total ? ` · ${copies} copies` : '';
    el.count.textContent =
      `${total} game${total === 1 ? '' : 's'} · ${plural(platforms, 'platform')}${extra}`;
  }

  el.clear.hidden = !isFiltered();
  el.empty.hidden = shown > 0;
  el.grid.hidden = shown === 0;
  el.dice.disabled = shown === 0;
}

function renderHardware() {
  if (!state.hardware.length || state.config.showHardware === false || state.query
      || state.notesOnly || state.condition !== 'all') {
    el.hardwareSection.hidden = true;
    return;
  }
  const list = state.platform === 'all'
    ? state.hardware
    : state.hardware.filter((item) => item.platform === state.platform);

  if (!list.length) { el.hardwareSection.hidden = true; return; }
  el.hardwareSection.hidden = false;

  el.hardwareGrid.replaceChildren(...list.map((item) => {
    const info = platformInfo(item.platform);
    const card = h('div', { class: 'hw-card' });
    const art = h('div', { class: 'hw-card__art' });

    const src = safeImageUrl(item.image);
    if (src) {
      const img = h('img', { src, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => {
        art.style.background = info.color;
        art.replaceChildren(h('span', { class: 'hw-card__initials', text: info.short }));
      }, { once: true });
      art.append(img);
    } else {
      art.style.background = info.color;
      art.append(h('span', { class: 'hw-card__initials', text: info.short }));
    }

    card.append(art, h('div', {},
      h('p', { class: 'hw-card__name', text: item.name }),
      h('p', { class: 'hw-card__meta',
        text: [item.platform, item.condition].filter(Boolean).join(' · ') })));
    return card;
  }));
}

/* --- View switching ------------------------------------------------------- */

function render() {
  compute();

  for (const tab of el.views.children) {
    const active = tab.dataset.view === state.view;
    tab.setAttribute('aria-current', String(active));
  }

  el.viewShelf.hidden = state.view !== 'shelf';
  el.viewTimeline.hidden = state.view !== 'timeline';
  el.viewStats.hidden = state.view !== 'stats';
  el.viewCompare.hidden = state.view !== 'compare';

  // Platform chips and the count line only mean something where a shelf of
  // games is on screen. Stats always describes the whole collection.
  const listy = state.view === 'shelf' || state.view === 'timeline';
  el.filters.hidden = !listy;
  el.statline.hidden = !listy;
  el.dice.hidden = !listy;
  el.notesToggle.hidden = !listy;
  el.search.closest('.search').hidden = state.view === 'stats' || state.view === 'compare';
  el.sort.closest('.select').hidden = state.view !== 'shelf';
  el.condition.closest('.select').hidden = !listy;

  if (state.view === 'shelf') {
    renderGrid();
    renderCount();
    renderHardware();
  } else if (state.view === 'timeline') {
    renderCount();
    el.viewTimeline.replaceChildren(
      renderTimeline(state.visible, { onOpen: openByGame }));
  } else if (state.view === 'stats') {
    el.viewStats.replaceChildren(renderStats(state.games, state.hardware));
  }

  for (const chip of el.chips.children) {
    chip.setAttribute('aria-selected', String(chip.dataset.platform === state.platform));
  }
}

function setView(view) {
  if (!VIEWS.includes(view)) view = 'shelf';
  state.view = view;
  writeUrl();
  render();
}

/* --- Chips and selects ---------------------------------------------------- */

function renderChips() {
  const counts = new Map();
  for (const game of state.games) {
    counts.set(game.platform, (counts.get(game.platform) || 0) + 1);
  }

  const platforms = [...counts.keys()].sort(
    (a, b) => platformSortIndex(a) - platformSortIndex(b) || a.localeCompare(b)
  );

  const chip = (key, label, count, color) => h('button', {
    type: 'button', class: 'chip', role: 'tab',
    dataset: { platform: key },
    'aria-selected': String(state.platform === key),
  },
    color ? h('span', { class: 'chip__dot', style: `--chip-color:${color}` }) : null,
    h('span', { text: label }),
    h('span', { class: 'chip__count', text: String(count) }));

  el.chips.replaceChildren(
    chip('all', 'All', state.games.length, null),
    ...platforms.map((p) => chip(p, p.length > 20 ? platformInfo(p).short : p,
      counts.get(p), platformInfo(p).color))
  );
}

function renderConditionOptions() {
  const present = new Set(state.games.map((g) => g._condition).filter(Boolean));
  const ordered = CONDITION_ORDER.filter((c) => present.has(c));

  // One condition (or none) is not a filter, it's a label.
  if (ordered.length < 2) {
    el.condition.closest('.select').dataset.unavailable = 'true';
    return;
  }
  delete el.condition.closest('.select').dataset.unavailable;

  el.condition.replaceChildren(
    h('option', { value: 'all', text: 'Any condition' }),
    ...ordered.map((c) => h('option', { value: c, text: c })));
}

/**
 * "Recently added" is only a sort if the dates actually differ. A CSV import
 * stamps every row with the same day -- here that was 143 of 184 games -- and
 * the option then just reproduces the alphabetical order while claiming not to.
 */
function pruneDeadSorts() {
  const dates = state.games.map((g) => g.added).filter(Boolean);
  const distinct = new Set(dates);
  let dominant = 0;
  for (const d of distinct) {
    dominant = Math.max(dominant, dates.filter((x) => x === d).length);
  }
  const useful = dates.length >= 4 && distinct.size >= 3 && dominant / dates.length < 0.6;

  if (!useful) {
    el.sort.querySelector('option[value="-added"]')?.remove();
    if (state.sort === '-added') state.sort = 'title';
  }

  // Same idea for ratings: no scores, no "highest rated".
  if (!state.games.some((g) => typeof g.metacritic === 'number')) {
    el.sort.querySelector('option[value="-metacritic"]')?.remove();
    if (state.sort === '-metacritic') state.sort = 'title';
  }
  if (!state.games.some((g) => g.year)) {
    for (const v of ['year', '-year']) el.sort.querySelector(`option[value="${v}"]`)?.remove();
    if (state.sort.replace('-', '') === 'year') state.sort = 'title';
  }
}

/* --- Detail dialog -------------------------------------------------------- */

function metaRow(term, value) {
  if (!value) return [];
  return [h('dt', { text: term }), h('dd', { text: value })];
}

function openDetail(index) {
  const game = state.visible[index];
  if (!game) return;
  state.openIndex = index;

  const src = safeImageUrl(game.cover);
  el.dCover.src = src || placeholderCover(game.platform);
  el.dCover.alt = `${game.title} cover art`;
  el.dCover.onerror = () => {
    el.dCover.onerror = null;
    el.dCover.src = placeholderCover(game.platform);
  };

  el.dPlatform.textContent = game.platform;
  el.dYear.textContent = game.year || '';
  el.dTitle.textContent = game.title;

  el.dGenres.replaceChildren(
    ...(game.genres || []).map((g) => h('li', { text: g })));

  el.dDescription.textContent = game.description || '';

  el.dMeta.replaceChildren(
    ...metaRow('Developer', game.developer),
    ...metaRow('Publisher', game.publisher),
    ...metaRow('Condition', game.condition),
    ...metaRow('Copies', game.copies > 1 ? String(game.copies) : null),
    ...metaRow('Edition', game.release),
    ...metaRow('Region', game.region),
    ...metaRow('Metascore', game.metacritic ? `${game.metacritic}/100` : null),
    ...metaRow('Added', game.added),
  );

  el.dNotes.hidden = !game.notes;
  el.dNotes.textContent = game.notes || '';

  el.dPrev.disabled = index === 0;
  el.dNext.disabled = index === state.visible.length - 1;

  if (!el.dialog.open) el.dialog.showModal();

  // Deep links: the url always points at whatever is open.
  history.replaceState(null, '', `#${game.id}`);
  el.dialog.querySelector('.detail__inner').scrollTop = 0;
}

/** Open a game by identity rather than by position in the current list. */
function openByGame(game) {
  const index = state.visible.indexOf(game);
  if (index !== -1) return openDetail(index);
  const byId = state.visible.findIndex((g) => g.id === game.id);
  if (byId !== -1) openDetail(byId);
}

function closeDetail() {
  if (el.dialog.open) el.dialog.close();
}

function step(delta) {
  const next = state.openIndex + delta;
  if (next >= 0 && next < state.visible.length) openDetail(next);
}

/** Pick something at random from whatever is currently showing. */
function surpriseMe() {
  if (!state.visible.length) return;
  // Never hand back the game already open -- that reads as a broken button.
  let index = Math.floor(Math.random() * state.visible.length);
  if (state.visible.length > 1 && index === state.openIndex) {
    index = (index + 1) % state.visible.length;
  }
  openDetail(index);
}

/* --- Compare -------------------------------------------------------------- */

let comparing = false;

function cmpStatus(message, kind = 'info') {
  el.cmpStatus.hidden = !message;
  el.cmpStatus.textContent = message || '';
  el.cmpStatus.dataset.kind = kind;
}

async function runComparison(input) {
  if (comparing) return;
  comparing = true;
  el.cmpOutput.replaceChildren();
  cmpStatus('Fetching that collection…');

  try {
    const theirs = await compare.loadCollection(input);
    const result = compare.diff(state.games, theirs.games);
    const label = new URL(theirs.url).host;

    cmpStatus('');
    el.cmpOutput.replaceChildren(
      compare.renderComparison(result, label, { onOpen: (game) => {
        setView('shelf');
        // Clear filters first, or the game may not be in the visible list.
        state.query = ''; state.platform = 'all'; state.condition = 'all';
        state.notesOnly = false;
        syncControls();
        render();
        openByGame(game);
      } }));

    el.cmpUrl.value = input;
    writeUrl();
  } catch (err) {
    cmpStatus(err.message || String(err), 'error');
  } finally {
    comparing = false;
  }
}

function renderFriends() {
  const friends = Array.isArray(state.config.friends) ? state.config.friends : [];
  if (!friends.length) { el.cmpFriends.hidden = true; return; }
  el.cmpFriends.hidden = false;
  el.cmpFriends.replaceChildren(
    h('span', { class: 'cmp__friendlabel', text: 'Shelves you follow' }),
    ...friends
      .filter((f) => f && typeof f.url === 'string')
      .map((f) => h('button', {
        type: 'button', class: 'chip',
        onclick: () => { el.cmpUrl.value = f.url; runComparison(f.url); },
      }, h('span', { text: f.name || f.url }))));
}

/* --- URL and theme -------------------------------------------------------- */

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.view = VIEWS.includes(params.get('view')) ? params.get('view') : 'shelf';
  state.query = params.get('q') || '';
  state.platform = params.get('platform') || 'all';
  state.condition = params.get('condition') || 'all';
  state.notesOnly = params.get('notes') === '1';
  state.sort = params.get('sort') || state.config.defaultSort || 'title';
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.view !== 'shelf') params.set('view', state.view);
  if (state.query) params.set('q', state.query);
  if (state.platform !== 'all') params.set('platform', state.platform);
  if (state.condition !== 'all') params.set('condition', state.condition);
  if (state.notesOnly) params.set('notes', '1');
  if (state.sort !== (state.config.defaultSort || 'title')) params.set('sort', state.sort);
  if (state.view === 'compare' && el.cmpUrl.value.trim()) {
    params.set('with', el.cmpUrl.value.trim());
  }
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function syncControls() {
  el.search.value = state.query;
  el.sort.value = state.sort;
  el.condition.value = state.condition;
  el.notesToggle.setAttribute('aria-pressed', String(state.notesOnly));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (theme === 'auto') localStorage.removeItem('gamelog-theme');
  else localStorage.setItem('gamelog-theme', theme);
}

function currentlyDark() {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/* --- Wiring --------------------------------------------------------------- */

function attachEvents() {
  let debounce;
  el.search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = el.search.value;
      writeUrl();
      render();
    }, 110);
  });

  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    writeUrl();
    render();
  });

  el.condition.addEventListener('change', () => {
    state.condition = el.condition.value;
    writeUrl();
    render();
  });

  el.notesToggle.addEventListener('click', () => {
    state.notesOnly = !state.notesOnly;
    syncControls();
    writeUrl();
    render();
  });

  el.dice.addEventListener('click', surpriseMe);

  el.views.addEventListener('click', (event) => {
    const tab = event.target.closest('.viewtab');
    if (tab) setView(tab.dataset.view);
  });

  el.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.platform = chip.dataset.platform;
    writeUrl();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.grid.addEventListener('click', (event) => {
    const tile = event.target.closest('.tile');
    if (tile) openDetail(Number(tile.dataset.index));
  });

  el.clear.addEventListener('click', () => {
    state.query = '';
    state.platform = 'all';
    state.condition = 'all';
    state.notesOnly = false;
    syncControls();
    writeUrl();
    render();
    el.search.focus();
  });

  el.cmpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runComparison(el.cmpUrl.value);
  });

  el.dClose.addEventListener('click', closeDetail);
  el.dPrev.addEventListener('click', () => step(-1));
  el.dNext.addEventListener('click', () => step(1));

  // Clicking the backdrop (i.e. the dialog element itself) closes it.
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog) closeDetail();
  });

  el.dialog.addEventListener('close', () => {
    const tile = el.grid.querySelector(`.tile[data-index="${state.openIndex}"]`);
    state.openIndex = -1;
    history.replaceState(null, '', location.pathname + location.search);
    tile?.focus();
  });

  el.themeToggle.addEventListener('click', () => {
    applyTheme(currentlyDark() ? 'light' : 'dark');
  });

  document.addEventListener('keydown', (event) => {
    if (el.dialog.open) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
      return;
    }
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);
    if (event.key === '/' && !typing) {
      event.preventDefault();
      el.search.focus();
      el.search.select();
    }
    if (event.key.toLowerCase() === 'r' && !typing && !event.metaKey && !event.ctrlKey) {
      surpriseMe();
    }
    if (event.key === 'Escape' && typing && event.target === el.search) {
      el.search.value = '';
      state.query = '';
      writeUrl();
      render();
    }
  });
}

/* --- Boot ----------------------------------------------------------------- */

async function boot() {
  const stored = localStorage.getItem('gamelog-theme');
  document.documentElement.dataset.theme = stored || 'auto';

  let collection;
  let config = {};
  try {
    const [collectionRes, configRes] = await Promise.all([
      fetch('data/collection.json', { cache: 'no-cache' }),
      fetch('data/config.json', { cache: 'no-cache' }).catch(() => null),
    ]);
    if (!collectionRes.ok) throw new Error(`HTTP ${collectionRes.status}`);
    collection = await collectionRes.json();
    if (configRes?.ok) config = await configRes.json();
  } catch (err) {
    el.grid.hidden = true;
    el.empty.hidden = false;
    el.empty.replaceChildren(
      h('strong', { text: 'Could not load the collection.' }),
      h('span', { text: 'data/collection.json is missing or unreadable. If you opened this file directly, serve it instead: npm run serve' }));
    console.error('GameLog:', err);
    return;
  }

  state.config = config;
  state.games = (collection.games || []).map((g) => ({
    ...g,
    copies: g.copies || 1,
    _index: buildSearchIndex(g),
    _sortKey: sortKey(g.title),
    _condition: conditionGroup(g.condition),
  }));
  state.hardware = collection.hardware || [];

  // Config-driven chrome.
  if (config.accent) document.documentElement.style.setProperty('--accent', config.accent);
  if (config.title) {
    el.title.textContent = config.title;
    document.title = config.title;
  }
  if (config.tagline) el.tagline.textContent = config.tagline;
  if (config.footer) el.colophon.replaceChildren(...miniMarkdown(config.footer));

  readUrl();
  pruneDeadSorts();
  renderConditionOptions();
  if (!state.games.some((g) => g.notes)) el.notesToggle.remove();
  syncControls();
  renderChips();
  renderFriends();
  render();
  attachEvents();

  // A #game-id in the url opens that game straight away.
  const wanted = decodeURIComponent(location.hash.slice(1));
  if (wanted) {
    const index = state.visible.findIndex((g) => g.id === wanted);
    if (index !== -1) openDetail(index);
  }

  const withParam = new URLSearchParams(location.search).get('with');
  if (withParam && state.view === 'compare') {
    el.cmpUrl.value = withParam;
    runComparison(withParam);
  }
}

/** Links and bold only, built as nodes so nothing is ever parsed as html. */
function miniMarkdown(text) {
  const out = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(document.createTextNode(text.slice(last, match.index)));
    if (match[2]) {
      out.push(h('a', { href: match[2], target: '_blank', rel: 'noopener noreferrer',
        text: match[1] }));
    } else {
      out.push(h('strong', { text: match[3] }));
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

boot();

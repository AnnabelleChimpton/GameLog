// GameLog — the whole front end.
//
// No build step and no dependencies: this reads data/collection.json and
// data/config.json at load, then renders and filters entirely in the browser.
// A few hundred games is small enough that re-rendering the grid on every
// keystroke is imperceptible, so there is no virtualisation to reason about.

import { platformInfo, platformSortIndex } from './platforms.mjs';

const $ = (sel) => document.querySelector(sel);

const el = {
  title: $('#site-title'),
  tagline: $('#site-tagline'),
  search: $('#search'),
  sort: $('#sort'),
  chips: $('#platform-chips'),
  grid: $('#grid'),
  count: $('#count'),
  clear: $('#clear'),
  empty: $('#empty'),
  hardwareSection: $('#hardware-section'),
  hardwareGrid: $('#hardware-grid'),
  colophon: $('#colophon-text'),
  themeToggle: $('#theme-toggle'),
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

const state = {
  games: [],
  hardware: [],
  config: {},
  query: '',
  platform: 'all',
  sort: 'title',
  visible: [],
  openIndex: -1,
};

/* --- Helpers -------------------------------------------------------------- */

/** Lowercase, strip accents and punctuation, so "Pokémon" matches "pokemon". */
function fold(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sortable title: ignores a leading article so "A Link" files under L… */
function sortKey(title) {
  return fold(title).replace(/^(the|a|an) /, '');
}

/**
 * A generated cover for games with no art: a wash of the platform colour with
 * the platform label. It carries no title, because tiles without real art keep
 * their title plate permanently visible -- printing it twice looked like a bug.
 *
 * Built as an inline SVG data URI, so it costs no request and always renders.
 */
function placeholderCover(platform) {
  const { short, color } = platformInfo(platform);
  const label = short.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // The font family has to be named inline: an SVG loaded into an <img> is an
  // isolated document and inherits nothing from the page.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 352" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="${color}" stop-opacity="0.92"/>
    <stop offset="1" stop-color="#0b0c10" stop-opacity="0.97"/>
  </linearGradient>
</defs>
<rect width="264" height="352" fill="#15161c"/>
<rect width="264" height="352" fill="url(#g)"/>
<text x="132" y="168" text-anchor="middle" font-size="52" font-weight="800" fill="#ffffff" fill-opacity="0.34" letter-spacing="1">${label}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

/** Minimal, deliberately limited markdown: links and bold only. */
function miniMarkdown(text) {
  const escaped = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

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
  ].filter(Boolean).join(' '));
}

function compute() {
  const terms = fold(state.query).split(' ').filter(Boolean);

  let list = state.games.filter((game) => {
    if (state.platform !== 'all' && game.platform !== state.platform) return false;
    // Every term must appear somewhere, so "zelda n64" narrows as you'd expect.
    return terms.every((t) => game._index.includes(t));
  });

  const dir = state.sort.startsWith('-') ? -1 : 1;
  const field = state.sort.replace(/^-/, '');

  list = list.sort((a, b) => {
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

/* --- Rendering ------------------------------------------------------------ */

function renderChips() {
  const counts = new Map();
  for (const game of state.games) {
    counts.set(game.platform, (counts.get(game.platform) || 0) + 1);
  }

  const platforms = [...counts.keys()].sort(
    (a, b) => platformSortIndex(a) - platformSortIndex(b) || a.localeCompare(b)
  );

  const chip = (key, label, count, color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.platform = key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(state.platform === key));
    if (color) {
      button.innerHTML =
        `<span class="chip__dot" style="--chip-color:${color}"></span>` +
        `<span>${label}</span><span class="chip__count">${count}</span>`;
    } else {
      button.innerHTML = `<span>${label}</span><span class="chip__count">${count}</span>`;
    }
    return button;
  };

  el.chips.replaceChildren(
    chip('all', 'All', state.games.length, null),
    ...platforms.map((p) => {
      const info = platformInfo(p);
      return chip(p, info.key === p ? shortLabel(p) : p, counts.get(p), info.color);
    })
  );
}

/** Prefer the full platform name, but fall back to the short one when long. */
function shortLabel(platform) {
  const info = platformInfo(platform);
  return platform.length > 20 ? info.short : platform;
}

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

    const img = document.createElement('img');
    img.className = 'tile__cover';
    img.loading = i < 12 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.src = game.cover || placeholderCover(game.platform);
    // A dead cover url should never leave a broken image on the shelf.
    img.addEventListener('error', () => {
      img.src = placeholderCover(game.platform);
    }, { once: true });

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
  const filtered = state.query || state.platform !== 'all';

  const platforms = new Set(state.games.map((g) => g.platform)).size;
  const copies = state.games.reduce((sum, g) => sum + (g.copies || 1), 0);

  if (filtered) {
    el.count.textContent = `${shown} of ${total} game${total === 1 ? '' : 's'}`;
  } else {
    const extra = copies > total ? ` · ${copies} copies` : '';
    el.count.textContent =
      `${total} game${total === 1 ? '' : 's'} · ${platforms} platform${platforms === 1 ? '' : 's'}${extra}`;
  }

  el.clear.hidden = !filtered;
  el.empty.hidden = shown > 0;
  el.grid.hidden = shown === 0;
}

function renderHardware() {
  if (!state.hardware.length || state.config.showHardware === false) {
    el.hardwareSection.hidden = true;
    return;
  }
  // Hardware follows the platform filter, but a text search is about games --
  // leaving a console shelf under "no results for zelda" just reads as noise.
  if (state.query) { el.hardwareSection.hidden = true; return; }

  const list = state.platform === 'all'
    ? state.hardware
    : state.hardware.filter((h) => h.platform === state.platform);

  if (!list.length) { el.hardwareSection.hidden = true; return; }
  el.hardwareSection.hidden = false;

  el.hardwareGrid.replaceChildren(
    ...list.map((item) => {
      const info = platformInfo(item.platform);

      const card = document.createElement('div');
      card.className = 'hw-card';

      const art = document.createElement('div');
      art.className = 'hw-card__art';
      if (item.image) {
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          art.style.background = info.color;
          art.replaceChildren(initials(info.short));
        }, { once: true });
        art.append(img);
      } else {
        art.style.background = info.color;
        art.append(initials(info.short));
      }

      const body = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'hw-card__name';
      name.textContent = item.name;
      const meta = document.createElement('p');
      meta.className = 'hw-card__meta';
      meta.textContent = [item.platform, item.condition].filter(Boolean).join(' · ');
      body.append(name, meta);

      card.append(art, body);
      return card;
    })
  );
}

function initials(text) {
  const span = document.createElement('span');
  span.className = 'hw-card__initials';
  span.textContent = text;
  return span;
}

function render() {
  compute();
  renderGrid();
  renderCount();
  renderHardware();
  for (const chip of el.chips.children) {
    chip.setAttribute('aria-selected', String(chip.dataset.platform === state.platform));
  }
}

/* --- Detail dialog -------------------------------------------------------- */

function metaRow(term, value) {
  if (!value) return [];
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}

function openDetail(index) {
  const game = state.visible[index];
  if (!game) return;
  state.openIndex = index;

  el.dCover.src = game.cover || placeholderCover(game.platform);
  el.dCover.alt = `${game.title} cover art`;
  el.dCover.onerror = () => {
    el.dCover.onerror = null;
    el.dCover.src = placeholderCover(game.platform);
  };

  el.dPlatform.textContent = game.platform;
  el.dYear.textContent = game.year || '';
  el.dTitle.textContent = game.title;

  el.dGenres.replaceChildren(
    ...(game.genres || []).map((g) => {
      const li = document.createElement('li');
      li.textContent = g;
      return li;
    })
  );

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

function closeDetail() {
  if (el.dialog.open) el.dialog.close();
}

function step(delta) {
  const next = state.openIndex + delta;
  if (next >= 0 && next < state.visible.length) openDetail(next);
}

/* --- URL and theme -------------------------------------------------------- */

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.query = params.get('q') || '';
  state.platform = params.get('platform') || 'all';
  state.sort = params.get('sort') || state.config.defaultSort || 'title';
  if (!Array.from(el.sort.options).some((o) => o.value === state.sort)) state.sort = 'title';
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.platform !== 'all') params.set('platform', state.platform);
  if (state.sort !== (state.config.defaultSort || 'title')) params.set('sort', state.sort);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
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
    el.search.value = '';
    writeUrl();
    render();
    el.search.focus();
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
    el.empty.innerHTML =
      '<strong>Could not load the collection.</strong>' +
      '<span>data/collection.json is missing or unreadable. ' +
      'If you opened this file directly, serve it instead: <code>npm run serve</code></span>';
    console.error('GameLog:', err);
    return;
  }

  state.config = config;
  state.games = (collection.games || []).map((g) => ({
    ...g,
    copies: g.copies || 1,
    _index: buildSearchIndex(g),
    _sortKey: sortKey(g.title),
  }));
  state.hardware = collection.hardware || [];

  // Config-driven chrome.
  if (config.accent) document.documentElement.style.setProperty('--accent', config.accent);
  if (config.title) {
    el.title.textContent = config.title;
    document.title = config.title;
  }
  if (config.tagline) el.tagline.textContent = config.tagline;
  if (config.footer) el.colophon.innerHTML = miniMarkdown(config.footer);

  readUrl();
  el.search.value = state.query;
  el.sort.value = state.sort;

  renderChips();
  render();
  attachEvents();

  // A #game-id in the url opens that game straight away.
  const wanted = decodeURIComponent(location.hash.slice(1));
  if (wanted) {
    const index = state.visible.findIndex((g) => g.id === wanted);
    if (index !== -1) openDetail(index);
  }
}

boot();

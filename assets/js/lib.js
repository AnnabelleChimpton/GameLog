// Helpers shared by every view.

import { platformInfo } from './platforms.mjs';

/** Lowercase, strip accents and punctuation, so "Pokémon" matches "pokemon". */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sortable title: ignores a leading article so "A Link" files under L… */
export function sortKey(title) {
  return fold(title).replace(/^(the|a|an) /, '');
}

/** Match key for "is this the same game?" across two collections. */
export function titleKey(title) {
  return fold(title).replace(/^(the|a|an) /, '').replace(/ /g, '');
}

/**
 * Collection condition is free text -- everyone writes it differently, and one
 * export here alone had ten spellings ("CIB", "CIB+", "CIB+, CIB", "Boxed+",
 * "B", …). Deriving a bucket at read time lets the UI filter and count without
 * rewriting anyone's data: the original string is still what gets displayed.
 */
export function conditionGroup(condition) {
  const c = String(condition ?? '').trim().toLowerCase();
  if (!c) return null;
  if (/^(new|sealed|factory)/.test(c)) return 'New';
  if (/^cib/.test(c)) return 'CIB';
  if (/^box/.test(c)) return 'Boxed';
  if (/^loose/.test(c)) return 'Loose';
  return 'Other';
}

export const CONDITION_ORDER = ['New', 'CIB', 'Boxed', 'Loose', 'Other'];

/**
 * Whether this page is being served from the owner's own machine.
 *
 * Setup instructions are for whoever runs the repo, not for whoever visits the
 * published site: a stranger reading "npm run list" has no terminal, no clone,
 * and no idea what it refers to. Guidance is shown only where it can be acted
 * on.
 */
export const isLocal = () =>
  ['localhost', '127.0.0.1', '[::1]', ''].includes(window.location.hostname);

/* --- Play status ---------------------------------------------------------- */

/**
 * Where a game stands in a play-through project.
 *
 * "dropped" is deliberately a first-class outcome rather than a failure. Some
 * games have no ending to reach: Just Dance and Wii Play never roll credits,
 * and saying so with a reason is more honest, and better viewing, than
 * pretending a score threshold was a finish line.
 */
export const STATUSES = ['playing', 'beaten', 'dropped'];

export const STATUS_LABEL = {
  playing: 'Playing',
  beaten: 'Beaten',
  dropped: 'Dropped',
  unplayed: 'Not started',
};

export const playStatus = (game) =>
  (STATUSES.includes(game?.status) ? game.status : 'unplayed');

/**
 * Episode numbers, in the order games were actually finished.
 *
 * This is what makes a video title like "Plumbers Don't Wear Ties (12/185)"
 * something the site works out rather than something counted by hand, which
 * is the part people get wrong by episode forty.
 */
export function episodeNumbers(games) {
  const beaten = games
    .filter((g) => playStatus(g) === 'beaten')
    .sort((a, b) =>
      String(a.beatenOn || '9999').localeCompare(String(b.beatenOn || '9999'))
      || String(a.title).localeCompare(String(b.title), 'en'));

  const numbers = new Map();
  beaten.forEach((game, i) => numbers.set(game, i + 1));
  return numbers;
}

/** Beaten / total across whatever set is passed in, so any subset works. */
export function progressOf(games) {
  const counts = { beaten: 0, playing: 0, dropped: 0, unplayed: 0 };
  for (const game of games) counts[playStatus(game)] += 1;
  // Dropped games are settled, so they count as done for the purposes of
  // "how far through is this", but are reported separately.
  const total = games.length;
  const done = counts.beaten + counts.dropped;
  return { ...counts, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/**
 * A generated cover for games with no art: a wash of the platform colour with
 * the platform label. It carries no title, because tiles without real art keep
 * their title plate permanently visible -- printing it twice looked like a bug.
 */
export function placeholderCover(platform) {
  const { short, color } = platformInfo(platform);
  const label = escapeXml(short);

  // The font family has to be named inline: an SVG loaded into an <img> is an
  // isolated document and inherits nothing from the page.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 352" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="${escapeXml(color)}" stop-opacity="0.92"/>
    <stop offset="1" stop-color="#0b0c10" stop-opacity="0.97"/>
  </linearGradient>
</defs>
<rect width="264" height="352" fill="#15161c"/>
<rect width="264" height="352" fill="url(#g)"/>
<text x="132" y="168" text-anchor="middle" font-size="52" font-weight="800" fill="#ffffff" fill-opacity="0.34" letter-spacing="1">${label}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Only ever hand an <img> a url we are willing to load. Cover urls can arrive
 * from another person's collection over the network, so anything that isn't a
 * plain image reference is dropped rather than passed through.
 */
export function safeImageUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  // A relative path, optionally with a cache-busting query. Anything with a
  // scheme, a protocol-relative "//", or a parent-directory hop is refused.
  if (/^[\w./-]+(\?[\w=&.-]*)?$/.test(trimmed)
      && !trimmed.startsWith('//') && !trimmed.includes('..')) return trimmed;
  return null;
}

/** Build an <img> that quietly falls back to a placeholder. */
export function coverImage(game, { eager = false } = {}) {
  const img = document.createElement('img');
  img.loading = eager ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.alt = '';
  const src = safeImageUrl(game.cover);
  img.src = src || placeholderCover(game.platform);
  if (src) {
    img.addEventListener('error', () => {
      img.src = placeholderCover(game.platform);
    }, { once: true });
  }
  return img;
}

/* --- Chart tooltip -------------------------------------------------------- */

let tooltipEl = null;

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'charttip';
  tooltipEl.setAttribute('role', 'status');
  tooltipEl.hidden = true;
  document.body.append(tooltipEl);
  return tooltipEl;
}

/**
 * Attach a hover readout to a chart mark. Charts carry direct labels too, so
 * this is a convenience rather than the only way to read a value.
 */
export function attachTip(element, getText) {
  const show = (event) => {
    const tip = ensureTooltip();
    tip.textContent = getText();
    tip.hidden = false;
    const pad = 12;
    const x = Math.min(event.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.max(event.clientY - tip.offsetHeight - pad, 8);
    tip.style.transform = `translate(${x}px, ${y}px)`;
  };
  const hide = () => { if (tooltipEl) tooltipEl.hidden = true; };

  element.addEventListener('pointerenter', show);
  element.addEventListener('pointermove', show);
  element.addEventListener('pointerleave', hide);
  element.addEventListener('blur', hide);
  element.addEventListener('focus', (event) => {
    const rect = event.target.getBoundingClientRect();
    show({ clientX: rect.left + rect.width / 2, clientY: rect.top });
  });
}

/* --- Small DOM helpers ---------------------------------------------------- */

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.setAttribute('style', value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c != null));
  return node;
}

/** Count occurrences, returning [value, count] sorted by count descending. */
export function tally(items, pick) {
  const counts = new Map();
  for (const item of items) {
    for (const value of [].concat(pick(item) ?? [])) {
      if (value == null || value === '') continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The detail dialog: one game, full size, with arrows to the next.
//
// It steps through whatever the shelf is currently showing, so it is handed a
// way to read that list rather than a copy of it -- filters change under it
// and the arrows have to follow. Everything about the dialog element lives
// here: filling it in, opening and closing, the keyboard, and the deep link
// in the address bar that always points at whatever is open.

import { h, safeImageUrl, placeholderCover, playStatus, STATUS_LABEL } from './lib.js';

const $ = (sel) => document.querySelector(sel);

function metaRow(term, value) {
  if (!value) return [];
  return [h('dt', { text: term }), h('dd', { text: value })];
}

/**
 * Wire the dialog up once and get back the handful of verbs the rest of the
 * page needs.
 *
 *   visible()   the games the dialog steps through, in order
 *   episodes()  Map of game -> episode number, for play-through shelves
 *   onClose(i)  called with the index that was open, so the shelf can put
 *               focus back on that tile
 */
export function createDetail({ visible, episodes, onClose = () => {} }) {
  const el = {
    dialog: $('#detail'),
    cover: $('#detail-cover'),
    platform: $('#detail-platform'),
    year: $('#detail-year'),
    title: $('#detail-title'),
    genres: $('#detail-genres'),
    description: $('#detail-description'),
    meta: $('#detail-meta'),
    notes: $('#detail-notes'),
    episode: $('#detail-episode'),
    verdict: $('#detail-verdict'),
    video: $('#detail-video'),
    prev: $('#detail-prev'),
    next: $('#detail-next'),
    close: $('.detail__close'),
  };

  let openIndex = -1;

  function open(index) {
    const list = visible();
    const game = list[index];
    if (!game) return;
    openIndex = index;

    const src = safeImageUrl(game.cover);
    el.cover.src = src || placeholderCover(game.platform);
    el.cover.alt = `${game.title} cover art`;
    el.cover.onerror = () => {
      el.cover.onerror = null;
      el.cover.src = placeholderCover(game.platform);
    };

    el.platform.textContent = game.platform;
    el.year.textContent = game.year || '';
    el.title.textContent = game.title;

    el.genres.replaceChildren(...(game.genres || []).map((g) => h('li', { text: g })));
    el.description.textContent = game.description || '';

    el.meta.replaceChildren(
      ...metaRow('Developer', game.developer),
      ...metaRow('Publisher', game.publisher),
      ...metaRow('Condition', game.condition),
      ...metaRow('Copies', game.copies > 1 ? String(game.copies) : null),
      ...metaRow('Edition', game.release),
      ...metaRow('Region', game.region),
      ...metaRow('Metascore', game.metacritic ? `${game.metacritic}/100` : null),
      ...metaRow('Added', game.added),
      ...metaRow('Status', playStatus(game) === 'unplayed' ? null : STATUS_LABEL[playStatus(game)]),
      ...metaRow('Beaten', game.beatenOn),
    );

    // The episode number and the write-up are the reason someone clicks
    // through from a video description, so they sit above the catalogue data.
    const episode = episodes().get(game);
    el.episode.hidden = !episode;
    if (episode) el.episode.textContent = `Episode ${episode}`;

    el.verdict.hidden = !game.verdict;
    el.verdict.textContent = game.verdict || '';

    const video = typeof game.video === 'string' && /^https?:\/\//i.test(game.video)
      ? game.video : null;
    el.video.hidden = !video;
    if (video) el.video.href = video;

    el.notes.hidden = !game.notes;
    el.notes.textContent = game.notes || '';

    el.prev.disabled = index === 0;
    el.next.disabled = index === list.length - 1;

    if (!el.dialog.open) el.dialog.showModal();

    // Deep links: the url always points at whatever is open.
    history.replaceState(null, '', `#${game.id}`);
    el.dialog.querySelector('.detail__inner').scrollTop = 0;
  }

  /** Open a game by identity rather than by position in the current list. */
  function openGame(game) {
    const list = visible();
    const index = list.indexOf(game);
    if (index !== -1) return open(index);
    const byId = list.findIndex((g) => g.id === game.id);
    if (byId !== -1) open(byId);
  }

  function close() {
    if (el.dialog.open) el.dialog.close();
  }

  function step(delta) {
    const next = openIndex + delta;
    if (next >= 0 && next < visible().length) open(next);
  }

  /**
   * Pick something at random from whatever is currently showing.
   *
   * Randomised order is what the N64 project used, and it removes the nightly
   * argument about what to play next. Filter to "Not started" first and this
   * becomes the roll that picks the episode.
   */
  function random() {
    const list = visible();
    if (!list.length) return;
    // Never hand back the game already open -- that reads as a broken button.
    let index = Math.floor(Math.random() * list.length);
    if (list.length > 1 && index === openIndex) index = (index + 1) % list.length;
    open(index);
  }

  el.close.addEventListener('click', close);
  el.prev.addEventListener('click', () => step(-1));
  el.next.addEventListener('click', () => step(1));

  // Clicking the backdrop (i.e. the dialog element itself) closes it.
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog) close();
  });

  el.dialog.addEventListener('close', () => {
    const was = openIndex;
    openIndex = -1;
    history.replaceState(null, '', location.pathname + location.search);
    onClose(was);
  });

  // The arrows step while the dialog is up; nothing else on the page should
  // react to keys until it is closed, which is what the return value is for.
  document.addEventListener('keydown', (event) => {
    if (!el.dialog.open) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });

  return {
    open,
    openGame,
    close,
    step,
    random,
    get isOpen() { return el.dialog.open; },
    get index() { return openIndex; },
  };
}

// Descriptions and release years with no signup.
//
// The pairing for libretro's art: Wikipedia supplies the words. Its action API
// answers for many titles per request, so a collection costs a handful of
// calls rather than one per game -- which matters, because the per-page REST
// endpoint starts returning 429 after about ten hits.
//
// Deliberately NOT used for cover art. Almost all game box art on Wikipedia is
// non-free content hosted under a fair-use rationale that covers the article
// itself, not reuse on someone else's site. Of a sample of ten titles here,
// nine were non-free and one was freely licensed.

import { searchableTitle } from './collection.mjs';

const API = 'https://en.wikipedia.org/w/api.php';
// The extracts module answers for at most 20 pages per request whatever the
// title limit says; ask for more and the rest come back silently empty.
const BATCH = 20;
const UA = 'GameLog/1.0 (personal collection site; +https://github.com/AnnabelleChimpton/GameLog)';

/**
 * Wikipedia disambiguates games in a handful of predictable ways: the bare
 * title when nothing else claims it, "(video game)" when a film or a series
 * does, "(2016 video game)" when an older game does too, and the platform
 * when a remake shares the year. Most exact first; the first that resolves to
 * a game article wins.
 */
export function candidates(title, platform, year = null, { round = 0 } = {}) {
  const clean = searchableTitle(title);
  const bases = [clean];
  if (!/^the\s/i.test(clean)) bases.push(`The ${clean}`);
  const out = [];
  if (round === 0) {
    out.push(...bases);
    for (const base of bases) out.push(`${base} (video game)`);
  } else {
    // The rarer spellings, asked for only when the plain ones found nothing.
    if (year) for (const base of bases) out.push(`${base} (${year} video game)`);
    if (platform) for (const base of bases) out.push(`${base} (${platform} video game)`);
    // Titles are case-sensitive past the first letter, and a box shouts
    // "REROLL" where the article says "Reroll".
    const cased = clean.replace(/\b([A-Z])([A-Z]{2,})\b/g, (_, a, b) => a + b.toLowerCase());
    if (cased !== clean) out.push(cased);
  }
  return [...new Set(out)];
}

/**
 * One batched query. `props` says which page properties to ask for and
 * `pick` turns a returned page into a result, or null to skip it.
 */
async function queryTitles(titles, props, pick) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    titles: titles.join('|'),
    ...props,
  });

  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
    // Asked too quickly: wait it out rather than lose the batch.
    if (res.status !== 429 || attempt >= 2) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
  const json = await res.json();

  const found = new Map();
  // Redirects and normalisation mean the title asked for is often not the
  // title returned, so both mappings are needed to match results back up.
  const alias = new Map();
  for (const n of json.query?.normalized || []) alias.set(n.from, n.to);
  for (const r of json.query?.redirects || []) alias.set(r.from, r.to);

  for (const page of json.query?.pages || []) {
    if (page.missing) continue;
    const result = pick(page);
    if (result) found.set(page.title, result);
  }
  return { found, alias };
}

const EXTRACT_PROPS = {
  prop: 'extracts|pageprops',
  exintro: '1',
  explaintext: '1',
  exsentences: '3',
  exlimit: String(BATCH),
};

function pickExtract(page) {
  if (!page.extract) return null;
  return {
    title: page.title,
    extract: page.extract.replace(/\s+/g, ' ').trim(),
    wikidata: page.pageprops?.wikibase_item || null,
  };
}

/** The article source, for anything the plain-text extract leaves out. */
const WIKITEXT_PROPS = {
  prop: 'revisions',
  rvprop: 'content',
  rvslots: 'main',
};

function pickWikitext(page) {
  const text = page.revisions?.[0]?.slots?.main?.content;
  return text ? { title: page.title, wikitext: text } : null;
}

/**
 * Free-text search, for adding one game interactively.
 *
 * `generator=search` feeds the search results straight into the extract
 * fetcher, so a search and its summaries cost one request rather than two.
 */
export async function searchTitles(term, { limit = 8 } = {}) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${term} video game`,
    gsrlimit: String(limit),
    prop: 'extracts|pageprops',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
  });

  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const json = await res.json();

  return (json.query?.pages || [])
    .filter((page) => page.extract)
    .map((page) => ({
      title: page.title.replace(/\s*\(video game\)$/i, ''),
      articleTitle: page.title,
      extract: page.extract.replace(/\s+/g, ' ').trim(),
      wikidata: page.pageprops?.wikibase_item || null,
      // Search returns pages in relevance order; index preserves it.
      order: page.index ?? 0,
    }))
    .filter((page) => looksRelevant(page.extract))
    .sort((a, b) => a.order - b.order);
}

/**
 * "…is a 1995 role-playing video game…". The year is usually right there.
 *
 * It has to be the year the subject *is*, not any year nearby: the intro of a
 * sequel names its predecessor's year a sentence later, and a remake's names
 * the original's, so "earliest year mentioned" was wrong for most of a shelf.
 */
export function yearFromExtract(extract) {
  const text = String(extract || '').slice(0, 400);
  const stated = /\b(?:is|was)\s+an?\s+(?:[\w'-]+\s+){0,3}?(19[5-9]\d|20[0-4]\d)\b/i.exec(firstSentence(text));
  if (stated) return Number(stated[1]);
  const released = /\breleased\b[^.]{0,60}?\b(19[5-9]\d|20[0-4]\d)\b/i.exec(text);
  return released ? Number(released[1]) : null;
}

/** Up to the first full stop that ends a sentence (not "Bros." or "Dr."). */
function firstSentence(text) {
  const end = text.search(/\.\s+[A-Z]/);
  return end === -1 ? text.slice(0, 300) : text.slice(0, end + 1);
}

/**
 * Whether an article is about the game on the shelf and not a namesake from
 * another decade: the 2019 remake of Link's Awakening has its own article,
 * and the 1993 original's is the wrong one for it. Unknown years pass.
 */
export function sameGame(game, extract) {
  const articleYear = yearFromExtract(extract);
  if (!game.year || !articleYear) return true;
  return Math.abs(game.year - articleYear) <= 2;
}

/**
 * Reject a page that is clearly about something other than this game.
 *
 * The opening sentence of a game article says what kind of game it is --
 * "a 1998 action-adventure game", "a kart racing game" -- so any "... game"
 * counts. A series or franchise page also says "game", but it has no release
 * year, no reviews and a description of the whole line, so those are turned
 * down and the "(video game)" spelling gets its turn.
 */
export function looksRelevant(extract) {
  const text = String(extract || '');
  // "Super Smash Bros. is a crossover fighting game series" -- the noun the
  // subject *is* comes right after "is a", within a few words. Only the
  // first sentence counts: the next may say "it is a tie-in to the film".
  if (/\bis an? (?:[\w'-]+[ ,]+){0,6}?(series|franchise|film|novel|television)\b/i.test(firstSentence(text))) {
    return false;
  }
  return /\b(video game|[a-z-]+ game|game (developed|published|released|for|by|in))\b/i.test(text);
}

/**
 * Look up many games at once.
 *
 * Returns a Map keyed by the game object, so callers don't have to re-match on
 * title. Games with no article simply don't appear in it.
 */
export function lookupAll(games, options = {}) {
  return batchLookup(games, EXTRACT_PROPS, pickExtract, BATCH,
    (page) => looksRelevant(page.extract), options);
}

/**
 * The source of articles already identified by exact title -- the ones
 * lookupAll found -- as a Map of title to wikitext.
 *
 * Whole articles are far bigger than intro extracts, so these go in smaller
 * batches: the API caps one response at a few megabytes and quietly drops
 * pages that don't fit.
 */
export async function fetchWikitext(titles, { onProgress } = {}) {
  const out = new Map();
  const all = [...new Set(titles)];
  let done = 0;
  // When a batch of articles is too big for one response the API returns the
  // rest without their text, so whatever comes back empty is asked for again
  // in smaller groups until each is fetched alone.
  for (const size of [WIKITEXT_BATCH, 4, 1]) {
    const pending = all.filter((t) => !out.has(t));
    for (let i = 0; i < pending.length; i += size) {
      const slice = pending.slice(i, i + size);
      try {
        const batch = await queryTitles(slice, WIKITEXT_PROPS, pickWikitext);
        for (const asked of slice) {
          const page = batch.found.get(batch.alias.get(asked) || asked);
          if (page) { out.set(asked, page.wikitext); done += 1; }
        }
      } catch {
        // A failed batch costs those articles this round; the smaller retry follows.
      }
      onProgress?.(Math.min(done, all.length), all.length);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return out;
}

const WIKITEXT_BATCH = 12;

async function batchLookup(games, props, pick, batchSize, relevant, { onProgress } = {}) {
  const results = new Map();
  // A page that is the right title but the wrong decade -- the original when
  // the shelf holds the remake -- is kept aside: the rarer spellings get a
  // chance to find the right article, and it stands in only if they don't.
  const namesakes = new Map();
  // Two rounds: the plain spellings for everything, then the rarer ones for
  // whatever is still unresolved. Asking for every spelling up front would
  // quadruple the requests for the sake of a handful of games.
  for (const round of [0, 1]) {
    const pending = games.filter((g) => !results.has(g));
    if (!pending.length) break;
    await lookupRound(pending, round, results, namesakes, props, pick, batchSize, relevant, onProgress);
  }
  // Last resort for what is still unresolved: a search, one request per
  // game, accepted only when the article's title plainly contains the
  // game's -- "Pokémon Brilliant Diamond and Shining Pearl" for Shining Pearl.
  for (const game of games) {
    if (results.has(game)) continue;
    const title = await searchForGame(game);
    if (!title) continue;
    try {
      const batch = await queryTitles([title], props, pick);
      const page = batch.found.get(batch.alias.get(title) || title);
      if (page && relevant(page) && (!page.extract || sameGame(game, page.extract))) results.set(game, page);
    } catch { /* the search hit is lost, nothing else is */ }
  }
  for (const [game, page] of namesakes) if (!results.has(game)) results.set(game, page);
  return results;
}

const plain = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

async function searchForGame(game) {
  const hits = await searchTitles(searchableTitle(game.title), { limit: 3 }).catch(() => []);
  const want = plain(searchableTitle(game.title));
  if (!want) return null;
  const hit = hits.find((h) => {
    const got = plain(h.articleTitle.replace(/\s*\([^)]*\)\s*$/, ''));
    return got === want || (want.length >= 6 && got.includes(want));
  });
  if (!hit || (hit.extract && !sameGame(game, hit.extract))) return null;
  await new Promise((r) => setTimeout(r, 250));
  return hit.articleTitle;
}

async function lookupRound(games, round, results, namesakes, props, pick, batchSize, relevant, onProgress) {
  // Every candidate spelling for every game, remembered so a hit on any of
  // them can be traced back to the game that wanted it.
  const wanted = new Map();
  for (const game of games) {
    for (const candidate of candidates(game.title, game.platform, game.year, { round })) {
      if (!wanted.has(candidate)) wanted.set(candidate, []);
      wanted.get(candidate).push(game);
    }
  }

  const all = [...wanted.keys()];
  for (let i = 0; i < all.length; i += batchSize) {
    const slice = all.slice(i, i + batchSize);
    let batch;
    try {
      batch = await queryTitles(slice, props, pick);
    } catch (err) {
      if (process.env.GAMELOG_DEBUG) console.error(`wikipedia batch failed: ${err.message}`);
      continue; // A failed batch costs those titles, not the whole run.
    }

    for (const asked of slice) {
      const resolved = batch.alias.get(asked) || asked;
      const page = batch.found.get(resolved);
      if (!page || !relevant(page)) continue;
      for (const game of wanted.get(asked) || []) {
        // First candidate to hit wins; they are ordered most-exact first.
        if (results.has(game)) continue;
        if (page.extract && !sameGame(game, page.extract)) {
          if (!namesakes.has(game)) namesakes.set(game, page);
          continue;
        }
        results.set(game, page);
      }
    }

    onProgress?.(Math.min(i + batchSize, all.length), all.length);
    // Courtesy pause; well inside what the action API tolerates.
    await new Promise((r) => setTimeout(r, 250));
  }
}

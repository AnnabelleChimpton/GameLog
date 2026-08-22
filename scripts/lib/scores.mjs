// Metacritic scores with no signup.
//
// Metacritic has no public API, and the databases that carry its numbers all
// want a key. Wikipedia, though, records the score in nearly every game
// article's reception box -- the "Video game reviews" template -- and the
// action API hands the article source to anyone. So the score comes from
// there: find the template, read its MC fields, pick the one for this
// platform.
//
// The template records scores per platform when a game shipped on several
// (MC_XBOX = 95/100, MC_PC = 72/100), or as one value when it didn't, or as
// one value with the platforms spelled out inside it ("PS4: 85/100<br>PC:
// 83/100"). All three shapes are read. When an article lists several scores
// and none can be tied to this platform, the answer is no score rather than
// somebody else's -- a wrong number on a shelf is worse than a blank.

import { platformInfo } from '../../assets/js/platforms.mjs';
import { lookupAll, fetchWikitext, sameGame, yearFromExtract } from './wikipedia.mjs';

/* --- Reading the template ------------------------------------------------- */

/**
 * The first "Video game reviews" template in an article, as a map of its
 * parameters. Returns null when there isn't one.
 */
export function reviewTemplate(wikitext) {
  return templateParams(wikitext, /\{\{\s*(video game reviews|vg reviews)\b/i);
}

/**
 * The platforms the article's infobox lists, in the order it lists them --
 * which is release order, so the first is the platform the game came out on.
 * That is the one fact that decides whether an unlabelled score is yours.
 */
export function infoboxPlatforms(wikitext) {
  const params = templateParams(wikitext, /\{\{\s*infobox video game\b/i);
  if (!params) return [];
  const key = Object.keys(params).find((k) => /^platforms?$/i.test(k));
  if (!key) return [];
  return plainLines(params[key])
    .flatMap((line) => line.split(/\s*,\s*/))
    .map((name) => name.replace(/\(.*?\)/g, '').trim())
    .filter((name) => name && !/^(title|nobold|collapsible list)$/i.test(name));
}

/** The first template matching `opener` in an article, as a map of params. */
function templateParams(wikitext, opener) {
  const text = String(wikitext || '');
  const open = text.search(opener);
  if (open === -1) return null;

  // Walk to the matching close, counting nested templates and links.
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length - 1; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth += 1; i += 1; }
    else if (two === '}}' || two === ']]') {
      depth -= 1; i += 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;

  const body = text.slice(open + 2, end - 2);
  // Split on pipes that are not inside a nested template or link.
  const parts = [];
  let cur = '';
  depth = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth += 1; cur += two; i += 1; continue; }
    if (two === '}}' || two === ']]') { depth -= 1; cur += two; i += 1; continue; }
    if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);

  const params = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key) params[key] = part.slice(eq + 1).trim();
  }
  return params;
}

/**
 * Plain text out of a template value: references gone, nested templates and
 * line breaks turned into separators, so a value that lists several platforms
 * becomes one line per score.
 */
function plainLines(value) {
  return String(value || '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{\s*(small|nowrap|abbr|nobold)\s*\|([^{}|]*)(\|[^{}]*)?\}\}/gi, '$2')
    .replace(/\btitle\s*=\s*/gi, '')
    .replace(/\{\{[^{}|]*\|/g, '\n')
    .replace(/\}\}/g, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    // Any pipe still left is between the items of a nested list template.
    .replace(/\|/g, '\n')
    .replace(/'{2,}/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** "95/100", "73 of 100", "88%" -> 95, 73, 88. Anything else is null. */
export function scoreIn(text) {
  const m = /(\d{1,3})\s*(?:\/|of|out of)\s*100\b/i.exec(text) || /(\d{1,3})\s*%/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

/**
 * Names a line might use for this platform. The registry's wiki code and
 * short label, the key, and the key without its maker ("PlayStation 4",
 * "Xbox", "Switch", "GameCube").
 */
function aliases(platform) {
  const info = platformInfo(platform);
  const halves = String(info.key).split('/').map((x) => x.trim());
  const bare = halves[0].replace(/^(sony|microsoft|nintendo|sega)\s+/i, '');
  const list = [info.wiki, info.short, info.key, ...halves, bare, ...(LONG_NAMES[info.key] || [])];
  if (/^PS(\d)$/i.test(info.short)) list.push(`PlayStation ${info.short.slice(2)}`);
  if (/switch/i.test(bare)) list.push('Switch');
  if (/gamecube/i.test(bare)) list.push('GC', 'GCN');
  return [...new Set(list.filter(Boolean))];
}

/** The spelled-out names Wikipedia's infoboxes use where the registry abbreviates. */
const LONG_NAMES = {
  'NES/Famicom': ['Nintendo Entertainment System', 'Famicom'],
  'SNES/Super Famicom': ['Super Nintendo Entertainment System', 'Super NES', 'Super Famicom'],
  'Sega Genesis': ['Mega Drive', 'Genesis'],
  'Sega CD': ['Mega-CD', 'Mega CD'],
  'Sony PlayStation': ['PlayStation'],
  'Sony PSP': ['PlayStation Portable'],
  'Sony PS Vita': ['PlayStation Vita'],
  'TurboGrafx-16': ['PC Engine'],
  'TurboGrafx-CD': ['PC Engine CD'],
  'Microsoft Xbox Series X|S': ['Xbox Series X/S', 'Xbox Series X and Series S'],
  'PC': ['Windows', 'Microsoft Windows', 'MS-DOS', 'DOS'],
};

/**
 * Whether a line is talking about this platform, and not about a console
 * whose name merely starts the same way -- "Xbox" must not claim the
 * "Xbox 360" line, nor "Wii" the "Wii U" one.
 */
const SUCCESSOR_WORDS = /^(\d|one|series|u\b|advance|color|colour|pocket|mini|cd\b|32x|classic|lite|xl|vita|portable)/i;

function mentions(line, alias) {
  const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
  const m = re.exec(line);
  if (!m) return false;
  const after = line.slice(m.index + m[0].length).trimStart();
  return !(SUCCESSOR_WORDS.test(after) && !/\d$/.test(alias));
}

/**
 * The Metacritic score for one platform out of a parsed template, or null.
 *
 * `original` says this platform is the one the article is primarily about --
 * the game came out on it the year the article gives. That unlocks one more
 * reading: a value that opens with a bare score and goes on to label later
 * releases ("97/100<hr>Remastered: 94/100") is giving the original's score
 * first, by the template's own convention.
 */
export function metacriticFor(params, platform, { original = false, platforms = [] } = {}) {
  if (!params) return null;
  // The infobox is the better witness: when it lists platforms, an unlabelled
  // score is only this platform's if this platform is the first one listed.
  if (platforms.length) original = isFirstPlatform(platform, platforms);
  const info = platformInfo(platform);
  const keys = Object.keys(params);

  // A field for exactly this platform is the best answer there is.
  if (info.wiki) {
    const key = keys.find((k) => k.toLowerCase() === `mc_${info.wiki}`.toLowerCase());
    if (key) {
      for (const line of plainLines(params[key])) {
        const n = scoreIn(line);
        if (n != null) return n;
      }
    }
  }

  // Otherwise the single MC field, which may list several platforms inside.
  const general = keys.find((k) => k.toLowerCase() === 'mc');
  if (!general) return null;
  const scored = plainLines(params[general])
    .map((line) => ({ line, score: scoreIn(line) }))
    .filter((x) => x.score != null);
  if (!scored.length) return null;

  const names = aliases(platform);
  const mine = scored.find((x) => names.some((a) => mentions(x.line, a)));
  if (mine) return mine.score;
  // An unlabelled score is the original release's. It is only this
  // platform's if this platform *is* the original release.
  if (!original) return null;
  if (scored.length === 1 && !keys.some((k) => /^mc_/i.test(k))) return scored[0].score;
  if (/^\(?\d{1,3}\s*(\/|of|out of)\s*100\b/i.test(scored[0].line)) return scored[0].score;
  return null;
}

/** Whether the infobox's first-listed platform is this one. */
export function isFirstPlatform(platform, platforms) {
  const first = platforms[0];
  if (!first) return false;
  return aliases(platform).some((a) => mentions(first, a));
}

/* --- Wikidata, for articles that defer to it ------------------------------ */

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const METACRITIC = 'Q150248';
/** Wikidata files PC releases under Windows, or under "personal computer". */
const PC_ITEMS = new Set(['Q1406', 'Q16338']);

/**
 * Metacritic scores recorded on Wikidata items, as a Map of item id to a
 * list of { score, platforms } -- the platforms being Wikidata item ids.
 */
export async function wikidataScores(ids) {
  const out = new Map();
  const all = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < all.length; i += 50) {
    const params = new URLSearchParams({
      action: 'wbgetentities', format: 'json', props: 'claims', ids: all.slice(i, i + 50).join('|'),
    });
    let json;
    try {
      const res = await fetch(`${WIKIDATA_API}?${params}`, { headers: { 'User-Agent': 'GameLog/1.0 (collection manager)' } });
      if (!res.ok) continue;
      json = await res.json();
    } catch {
      continue;
    }
    for (const [id, entity] of Object.entries(json.entities || {})) {
      out.set(id, readClaims(entity));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

/** The Metacritic review-score claims on one entity. */
export function readClaims(entity) {
  const claims = entity?.claims?.P444 || [];
  const scores = [];
  for (const claim of claims) {
    const by = (claim.qualifiers?.P447 || []).map((q) => q.datavalue?.value?.id);
    if (!by.includes(METACRITIC)) continue;
    const score = scoreIn(String(claim.mainsnak?.datavalue?.value || ''));
    if (score == null) continue;
    const platforms = (claim.qualifiers?.P400 || []).map((q) => q.datavalue?.value?.id).filter(Boolean);
    scores.push({ score, platforms });
  }
  return scores;
}

/** One platform's score out of an entity's claims, or null. */
export function scoreFromClaims(scores, platform, { original = false } = {}) {
  const item = platformInfo(platform).wikidata;
  if (item) {
    const wanted = PC_ITEMS.has(item) ? PC_ITEMS : new Set([item]);
    const mine = scores.find((s) => s.platforms.some((p) => wanted.has(p)));
    if (mine) return mine.score;
  }
  const unlabelled = scores.filter((s) => !s.platforms.length);
  if (original && unlabelled.length === 1 && scores.length === 1) return unlabelled[0].score;
  return null;
}

/* --- Looking scores up ---------------------------------------------------- */

/**
 * Metacritic scores for many games at once.
 *
 * Returns a Map keyed by the game object, holding a number for each game an
 * article and a platform-matched score was found for. Two batched passes:
 * the intro extracts identify which article is which game (the same lookup
 * descriptions use), then only those articles' sources are fetched.
 */
export async function lookupScores(games, { onProgress } = {}) {
  const found = new Map();
  const origin = new Map();
  if (!games.length) return found;

  const pages = await lookupAll(games);
  const byTitle = new Map();
  for (const [game, page] of pages) {
    if (!byTitle.has(page.title)) byTitle.set(page.title, []);
    // Whether this platform is the one the article is about: the release it
    // dates itself by. A port or a namesake from another decade is not, so
    // only a score labelled with its platform can be its own.
    const articleYear = yearFromExtract(page.extract);
    const original = sameGame(game, page.extract)
      && (!game.year || !articleYear || Math.abs(game.year - articleYear) <= 1);
    byTitle.get(page.title).push({ game, original, wikidata: page.wikidata });
  }

  const sources = await fetchWikitext([...byTitle.keys()], { onProgress });
  const deferred = [];
  for (const [title, list] of byTitle) {
    const source = sources.get(title);
    const params = reviewTemplate(source);
    const platforms = infoboxPlatforms(source);
    for (const entry of list) {
      const score = params
        ? metacriticFor(params, entry.game.platform, { original: entry.original, platforms })
        : null;
      if (score != null) { found.set(entry.game, score); origin.set(entry.game, `Wikipedia: ${title}`); }
      // Some articles keep no number of their own and show Wikidata's.
      else if (entry.wikidata || entry.game.wikidataId) deferred.push(entry);
    }
  }

  if (deferred.length) {
    const items = await wikidataScores(deferred.map((e) => e.wikidata || e.game.wikidataId));
    for (const entry of deferred) {
      const scores = items.get(entry.wikidata || entry.game.wikidataId);
      if (!scores?.length) continue;
      const score = scoreFromClaims(scores, entry.game.platform, { original: entry.original });
      if (score != null) { found.set(entry.game, score); origin.set(entry.game, `Wikidata: ${entry.wikidata || entry.game.wikidataId}`); }
    }
  }
  // Where each score came from, so a run can say so and a doubter can check.
  found.origin = origin;
  return found;
}

/** One game's score, for the add paths. Null when there isn't one to find. */
export async function scoreFor(title, platform, year = null) {
  const game = { title, platform, year };
  const found = await lookupScores([game]);
  return found.get(game) ?? null;
}

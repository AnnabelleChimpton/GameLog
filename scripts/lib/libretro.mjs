// Cover art with no signup.
//
// libretro publishes scanned box art for emulated systems so that frontends can
// display it, and serves it openly -- no key, no account, no rate limit worth
// worrying about. That makes it the default art source here, because asking
// someone to register a Twitch developer application before their shelf looks
// like anything is a real barrier.
//
// Two honest caveats, both documented in the README:
//   * it is scanned publisher artwork, exactly like IGDB's. Keyless is a setup
//     improvement, not a licensing one.
//   * it covers emulated systems, so anything current-gen is simply absent.
//
// Matching works by downloading a system's file listing once (one request for
// a thousand-odd names) and comparing locally. Guessing urls per title would be
// both slower and far worse at finding things.

import { searchableTitle } from './collection.mjs';

const BASE = 'https://thumbnails.libretro.com';

/**
 * GameLog platform -> libretro's system directory, which follows No-Intro
 * naming. Platforms absent here simply have no keyless art source.
 */
export const SYSTEMS = {
  '3DO': 'The 3DO Company - 3DO',
  'Atari 2600': 'Atari - 2600',
  'Sega Genesis': 'Sega - Mega Drive - Genesis',
  'Sega Dreamcast': 'Sega - Dreamcast',
  'Sega Saturn': 'Sega - Saturn',
  'NES/Famicom': 'Nintendo - Nintendo Entertainment System',
  'SNES/Super Famicom': 'Nintendo - Super Nintendo Entertainment System',
  'Nintendo 64': 'Nintendo - Nintendo 64',
  'Nintendo GameCube': 'Nintendo - GameCube',
  'Nintendo Wii': 'Nintendo - Wii',
  'Nintendo Wii U': 'Nintendo - Wii U',
  'Nintendo Game Boy': 'Nintendo - Game Boy',
  'Nintendo Game Boy Advance': 'Nintendo - Game Boy Advance',
  'Nintendo DS': 'Nintendo - Nintendo DS',
  'Nintendo 3DS': 'Nintendo - Nintendo 3DS',
  'Sony PlayStation': 'Sony - PlayStation',
  'Sony PlayStation 2': 'Sony - PlayStation 2',
  'Sony PlayStation 3': 'Sony - PlayStation 3',
  'Sony PlayStation 4': 'Sony - PlayStation 4',
  'Sony PSP': 'Sony - PlayStation Portable',
  'Sony PS Vita': 'Sony - PlayStation Vita',
  'Microsoft Xbox': 'Microsoft - Xbox',
  'Microsoft Xbox 360': 'Microsoft - Xbox 360',
};

const UA = 'GameLog/1.0 (personal collection site; +https://github.com/AnnabelleChimpton/GameLog)';

/**
 * Reduce a title to something comparable across two very different naming
 * conventions. Three things differ in practice:
 *
 *   * "&" is not filesystem-safe, so libretro writes "Command _ Conquer".
 *     Both sides therefore drop the character rather than expanding it to
 *     "and", which would match one spelling and not the other.
 *   * No-Intro moves leading articles to the end: The Legend of Zelda is filed
 *     as "Legend of Zelda, The". Removing articles wherever they sit makes the
 *     two agree.
 *   * everything else -- punctuation, spacing, ":" versus " - " -- is dropped.
 */
function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,\s*(the|a|an)\b/g, '')
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * An href is escaped twice over: percent-encoding for the url, then HTML
 * entities for the attribute. Decoding only the first leaves "Command &amp;
 * Conquer", which matches nothing -- every ampersand title silently missed.
 */
function decodeHref(href) {
  return decodeURIComponent(href)
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Region and dump tags, e.g. "Banjo-Kazooie (USA) (Rev 1).png". */
function parseEntry(filename) {
  const stem = filename.replace(/\.png$/i, '');
  const tags = [...stem.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const title = stem.replace(/\s*\([^)]*\)/g, '').trim();
  return { filename, stem, title, tags };
}

/**
 * Rank a candidate. Region order reflects who is likely to be running this;
 * unfinished dumps are pushed below finished ones whatever their region.
 */
function score(entry, wanted, region) {
  if (normalize(entry.title) !== wanted) return -1;

  let points = 100;
  const tags = entry.tags.join(' ').toLowerCase();

  if (/\b(beta|proto|demo|sample|debug)\b/.test(tags)) points -= 60;

  // A plain release beats an alternate scan or a re-release of the same game.
  // These are usually the same box photographed or cropped differently, and
  // preferring them is how four different 3DO games ended up sharing one odd
  // 482x680 framing while their plain (USA) scans sat unused at longbox
  // proportions.
  if (/\balt\b/.test(tags)) points -= 25;
  if (/\bre\d\b/.test(tags)) points -= 20;
  if (/\b(usa)\b/.test(tags)) points += region === 'USA' ? 30 : 20;
  else if (/\bworld\b/.test(tags)) points += 18;
  else if (/\b(europe|pal)\b/.test(tags)) points += region === 'EU' ? 30 : 12;
  else if (/\bjapan\b/.test(tags)) points += region === 'JP' ? 30 : 6;
  // A plain name with no region tag at all is still a perfectly good match.
  if (!entry.tags.length) points += 10;
  // A revision tag is not a better scan, just a later pressing.
  if (/\brev\s*\d/.test(tags)) points -= 12;

  // Fewer qualifiers is a better default: "(USA)" over "(USA) (Alt)".
  points -= Math.max(0, entry.tags.length - 1) * 6;

  return points;
}

const cache = new Map();

/** Download and parse one system's boxart listing. Cached per run. */
export async function loadIndex(system) {
  if (cache.has(system)) return cache.get(system);

  const url = `${BASE}/${encodeURIComponent(system)}/Named_Boxarts/`;
  let entries = [];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const html = await res.text();
      entries = [...html.matchAll(/href="([^"]+\.png)"/gi)]
        .map((m) => parseEntry(decodeHref(m[1])));
    }
  } catch {
    entries = []; // Offline or unreachable: treated as "no art available".
  }

  cache.set(system, entries);
  return entries;
}

/**
 * Find cover art for one game. Returns a url, or null when the platform isn't
 * covered or nothing matches.
 */
export async function findCover(title, platform, { region = 'USA' } = {}) {
  const system = SYSTEMS[platform];
  if (!system) return null;

  const entries = await loadIndex(system);
  if (!entries.length) return null;

  // Try the title as written, then with edition wording removed.
  const attempts = [title, searchableTitle(title)]
    .map(normalize)
    .filter((v, i, a) => v && a.indexOf(v) === i);

  for (const wanted of attempts) {
    let best = null;
    for (const entry of entries) {
      const points = score(entry, wanted, region);
      if (points > 0 && (!best || points > best.points)) best = { entry, points };
    }
    if (best) {
      return `${BASE}/${encodeURIComponent(system)}/Named_Boxarts/` +
        `${encodeURIComponent(best.entry.filename)}`;
    }
  }
  return null;
}

/**
 * Which platforms have a keyless art source worth trying.
 *
 * A directory existing is not the same as it being populated -- PlayStation 4
 * has about twenty entries and Xbox 360 about twelve, versus several thousand
 * for the emulated consoles. Reporting those as "covered" would promise art
 * that isn't there, so a nearly-empty index counts as no source.
 */
const MIN_USEFUL_ENTRIES = 50;

export async function coverage(platforms) {
  const covered = [];
  const missing = [];
  for (const platform of platforms) {
    const system = SYSTEMS[platform];
    if (!system) { missing.push(platform); continue; }
    const entries = await loadIndex(system);
    (entries.length >= MIN_USEFUL_ENTRIES ? covered : missing).push(platform);
  }
  return { covered, missing };
}

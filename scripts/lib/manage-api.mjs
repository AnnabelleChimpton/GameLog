// The write API behind the local manager UI.
//
// This exists ONLY while `npm run manage` is running. The published site is
// static files on someone else's host -- there is no server there to talk to,
// and the manager page says so plainly when these endpoints are absent.
//
// A local server that writes files deserves care, so:
//   * it binds to 127.0.0.1, never a routable interface
//   * writes require a custom header, which a foreign page cannot send without
//     a CORS preflight this server refuses -- that is the CSRF defence
//   * an Origin header, when present, must be this very server
//   * only three known filenames can be written, never a path from the request
//   * every payload is shape-checked before it replaces a real file
//   * writes go to a temp file and are renamed, so an interrupted save cannot
//     leave a half-written collection behind

import { writeFile, rename, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ROOT, COLLECTION_PATH, CONFIG_PATH, LISTS_PATH, SCHEMA_VERSION,
} from './collection.mjs';
import { loadEnv, getToken, createClient, searchGames, coverUrl, tidySummary, releaseYear, companies } from './igdb.mjs';
import { searchFree, coverFor } from './freelookup.mjs';

/** The only files the manager may ever write. */
const WRITABLE = {
  collection: { path: COLLECTION_PATH, validate: validateCollection },
  lists: { path: LISTS_PATH, validate: validateLists },
  config: { path: CONFIG_PATH, validate: validateConfig },
};

const MAX_BODY_BYTES = 12 * 1024 * 1024;

/**
 * Profile photos land here, under a fixed name per type. The extension comes
 * from an allowlist keyed off the data url's declared type, never from anything
 * the request chooses to call the file.
 */
const PHOTO_DIR = join(ROOT, 'assets', 'profile');
const PHOTO_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function validateCollection(data) {
  if (!data || typeof data !== 'object') throw new Error('Expected an object.');
  if (!Array.isArray(data.games)) throw new Error('Expected a "games" list.');
  if (data.hardware != null && !Array.isArray(data.hardware)) {
    throw new Error('"hardware" should be a list.');
  }
  for (const game of data.games) {
    if (!game || typeof game.title !== 'string' || !game.title.trim()) {
      throw new Error('Every game needs a title.');
    }
    if (typeof game.platform !== 'string' || !game.platform.trim()) {
      throw new Error(`"${game.title}" needs a platform.`);
    }
  }
  return { gamelog: SCHEMA_VERSION, games: data.games, hardware: data.hardware || [] };
}

function validateLists(data) {
  if (!data || !Array.isArray(data.lists)) throw new Error('Expected a "lists" list.');
  for (const list of data.lists) {
    if (!list || typeof list.id !== 'string' || !list.id.trim()) {
      throw new Error('Every list needs an id.');
    }
    if (!Array.isArray(list.items)) throw new Error(`List "${list.id}" needs an items list.`);
    for (const item of list.items) {
      if (!item || (!item.ref && !item.title)) {
        throw new Error(`An entry on "${list.id}" has neither a ref nor a title.`);
      }
    }
  }
  return { lists: data.lists };
}

function validateConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Expected an object.');
  }
  if (data.friends != null && !Array.isArray(data.friends)) {
    throw new Error('"friends" should be a list.');
  }
  return data;
}

const INDEX_PATH = join(ROOT, 'index.html');
const META_START = '<!-- gamelog:meta';
const META_END = '<!-- /gamelog:meta -->';

const escapeAttr = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Strip the small markdown the bio allows, for a plain-text description. */
function plainText(value, limit = 200) {
  const text = String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/**
 * Rewrite the meta block in index.html from the config.
 *
 * Link previews are built by crawlers that don't run JavaScript, so a card for
 * a shared GameLog cannot be assembled at runtime the way the rest of the page
 * is -- these tags have to exist in the html on disk. Only the region between
 * the two markers is touched; without them the file is left alone entirely.
 */
async function syncMeta(config) {
  let html;
  try {
    html = await readFile(INDEX_PATH, 'utf8');
  } catch {
    return; // No index.html to update; not this function's problem.
  }

  const start = html.indexOf(META_START);
  const end = html.indexOf(META_END);
  if (start === -1 || end === -1 || end < start) return;

  const profile = config.profile || {};
  const siteTitle = config.title || 'GameLog';
  const title = profile.name ? `${profile.name} — ${siteTitle}` : siteTitle;
  const description = plainText(profile.about)
    || plainText(config.tagline)
    || 'A video game collection.';

  const lines = [
    `${META_START} — rewritten from data/config.json when you save in the manager.`,
    "     Crawlers don't run JavaScript, so a shared link's preview card has to live",
    '     in the html itself. Edit config.json rather than these lines. -->',
    `<title>${escapeAttr(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}">`,
    '<meta property="og:type" content="profile">',
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
  ];

  // A relative path can't be resolved by a crawler, so an absolute siteUrl is
  // what makes the image usable. Without one, the card falls back to text.
  const photo = profile.photo;
  const base = typeof config.siteUrl === 'string' ? config.siteUrl.trim().replace(/\/+$/, '') : '';
  if (photo && /^https?:\/\//i.test(photo)) {
    lines.push(`<meta property="og:image" content="${escapeAttr(photo)}">`);
    lines.push('<meta name="twitter:card" content="summary">');
  } else if (photo && base) {
    lines.push(`<meta property="og:image" content="${escapeAttr(`${base}/${photo.replace(/^\/+/, '')}`)}">`);
    lines.push('<meta name="twitter:card" content="summary">');
  } else {
    lines.push('<meta name="twitter:card" content="summary">');
  }
  if (base) lines.push(`<meta property="og:url" content="${escapeAttr(base)}/">`);

  lines.push(META_END);

  const updated = html.slice(0, start) + lines.join('\n') + html.slice(end + META_END.length);
  await writeAtomic(INDEX_PATH, updated);
}

/** Write via a temp file so an interrupted save can't truncate the real one. */
async function writeAtomic(path, contents) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('That payload is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readJsonFile(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * A foreign page can send a simple cross-origin POST, but it cannot set a
 * custom header without a preflight -- and this server answers no preflight.
 * Requiring the header is therefore what stops a random site in another tab
 * from rewriting your collection.
 */
function guard(req, port) {
  if (req.headers['x-gamelog-manage'] !== '1') {
    return 'This endpoint needs the manager UI.';
  }
  const origin = req.headers.origin;
  if (origin) {
    const allowed = [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
    ];
    if (!allowed.includes(origin)) return `Requests from ${origin} are not accepted.`;
  }
  return null;
}

let igdbQuery;
let igdbTried = false;

async function getIgdb() {
  if (igdbTried) return igdbQuery;
  igdbTried = true;
  try {
    const creds = await loadEnv();
    igdbQuery = createClient({ id: creds.id, token: await getToken(creds) });
  } catch {
    igdbQuery = null; // No keys configured; search simply isn't offered.
  }
  return igdbQuery;
}

/**
 * Handle a manager request. Returns true when it took the request, false to
 * let the static handler have it.
 */
export async function handleApi(req, res, { port }) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  const route = url.pathname.slice(5);

  // Never let a browser cache an API answer, and never allow a cross-origin
  // read of one.
  if (req.method === 'OPTIONS') {
    send(res, 405, { error: 'Preflight is not supported.' });
    return true;
  }

  const denied = guard(req, port);
  if (denied) { send(res, 403, { error: denied }); return true; }

  try {
    if (route === 'state' && req.method === 'GET') {
      const [collection, lists, config] = await Promise.all([
        readJsonFile(COLLECTION_PATH, { games: [], hardware: [] }),
        readJsonFile(LISTS_PATH, { lists: [] }),
        readJsonFile(CONFIG_PATH, {}),
      ]);
      send(res, 200, {
        collection, lists, config,
        igdb: Boolean(await getIgdb()),
        root: ROOT,
      });
      return true;
    }

    if (route === 'search' && req.method === 'GET') {
      const term = (url.searchParams.get('q') || '').trim();
      if (!term) { send(res, 200, { results: [] }); return true; }
      const platform = url.searchParams.get('platform') || null;

      // No IGDB configured is not a dead end -- the keyless sources answer the
      // same question, just without genres and companies.
      const query = await getIgdb();
      if (!query) {
        const free = await searchFree(term, { platform, limit: 8 });
        send(res, 200, { results: free, source: 'free' });
        return true;
      }

      const found = await searchGames(query, term, { platform, limit: 10 });
      send(res, 200, {
        source: 'igdb',
        results: found.map((g) => {
          const { developer, publisher } = companies(g);
          return {
            igdbId: g.id,
            title: g.name,
            year: releaseYear(g.first_release_date),
            cover: g.cover?.image_id ? coverUrl(g.cover.image_id) : null,
            description: tidySummary(g.summary, g.storyline),
            genres: g.genres?.map((x) => x.name) || [],
            developer,
            publisher,
            platforms: (g.platforms || []).map((p) => p?.name).filter(Boolean),
            // Ids as well as names: the client maps them straight onto its own
            // platform registry, which is exact where name-matching is not.
            platformIds: (g.platforms || [])
              .map((p) => (typeof p === 'object' ? p.id : p)).filter(Boolean),
            derivative: Boolean(g.parent_game || g.version_parent),
          };
        }),
      });
      return true;
    }

    if (route === 'cover' && req.method === 'GET') {
      // Keyless art is per-platform, and the platform is often chosen after
      // the search. This lets the UI fill the gap once it knows both.
      const title = (url.searchParams.get('title') || '').trim();
      const platform = (url.searchParams.get('platform') || '').trim();
      if (!title || !platform) { send(res, 200, { cover: null }); return true; }
      send(res, 200, {
        cover: await coverFor(title, platform, {
          region: url.searchParams.get('region') || 'USA',
        }),
      });
      return true;
    }

    if (route === 'photo' && req.method === 'PUT') {
      const { dataUrl } = await readJsonBody(req);
      const match = /^data:([a-z]+\/[a-z+]+);base64,(.+)$/i.exec(String(dataUrl || ''));
      if (!match) throw new Error('Expected a base64 image data url.');

      const ext = PHOTO_TYPES[match[1].toLowerCase()];
      if (!ext) {
        throw new Error(`${match[1]} isn't an image type this accepts (jpg, png, webp, gif).`);
      }

      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length) throw new Error('That image is empty.');
      if (bytes.length > MAX_PHOTO_BYTES) {
        throw new Error('That image is larger than 3 MB even after resizing.');
      }

      await mkdir(PHOTO_DIR, { recursive: true });
      // Drop the other extensions, or an old avatar.png would linger in the
      // repo forever after switching to a jpg.
      await Promise.all(Object.values(PHOTO_TYPES)
        .filter((other) => other !== ext)
        .map((other) => rm(join(PHOTO_DIR, `avatar.${other}`), { force: true })));

      const tmp = join(PHOTO_DIR, `avatar.${ext}.tmp`);
      await writeFile(tmp, bytes);
      await rename(tmp, join(PHOTO_DIR, `avatar.${ext}`));

      send(res, 200, { ok: true, path: `assets/profile/avatar.${ext}`, bytes: bytes.length });
      return true;
    }

    if (req.method === 'PUT' && WRITABLE[route]) {
      const { path, validate } = WRITABLE[route];
      const payload = await readJsonBody(req);
      const clean = validate(payload);
      await writeAtomic(path, JSON.stringify(clean, null, 2) + '\n');
      // The link-preview tags live in index.html and are derived from config,
      // so they are refreshed here rather than drifting until someone notices.
      if (route === 'config') await syncMeta(clean);
      send(res, 200, { ok: true, file: path.replace(ROOT + '/', '') });
      return true;
    }

    send(res, 404, { error: `No such endpoint: ${req.method} ${url.pathname}` });
  } catch (err) {
    send(res, 400, { error: err.message || String(err) });
  }
  return true;
}

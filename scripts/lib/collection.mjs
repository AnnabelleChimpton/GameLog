// Reading and writing data/collection.json.
//
// The file is meant to stay human-editable, so we write it back with stable key
// ordering and two-space indentation. Editing it by hand and editing it with the
// scripts should produce the same shape.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const COLLECTION_PATH = join(ROOT, 'data', 'collection.json');
export const CONFIG_PATH = join(ROOT, 'data', 'config.json');
export { ROOT };

/** Field order used when writing entries back out, so diffs stay readable. */
const GAME_KEYS = [
  'id', 'title', 'platform', 'year', 'cover', 'description', 'genres',
  'developer', 'publisher', 'region', 'release', 'condition', 'copies',
  'metacritic', 'notes', 'added', 'igdbId',
];

const HARDWARE_KEYS = [
  'id', 'name', 'platform', 'year', 'image', 'description', 'manufacturer',
  'region', 'release', 'condition', 'notes', 'added',
];

function orderKeys(obj, order) {
  const out = {};
  for (const k of order) if (obj[k] !== undefined) out[k] = obj[k];
  // Anything the user added by hand that we don't know about is preserved.
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

export async function loadCollection() {
  if (!existsSync(COLLECTION_PATH)) {
    return { games: [], hardware: [] };
  }
  const raw = await readFile(COLLECTION_PATH, 'utf8');
  const data = JSON.parse(raw);
  return {
    games: Array.isArray(data.games) ? data.games : [],
    hardware: Array.isArray(data.hardware) ? data.hardware : [],
  };
}

export async function saveCollection(collection) {
  const out = {
    games: collection.games.map((g) => orderKeys(g, GAME_KEYS)),
    hardware: collection.hardware.map((h) => orderKeys(h, HARDWARE_KEYS)),
  };
  await writeFile(COLLECTION_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

/** A stable, readable, URL-safe id like "nintendo-64-goldeneye-007". */
export function makeId(platform, title) {
  const slug = (s) =>
    String(s)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slug(platform)}-${slug(title)}`.replace(/-{2,}/g, '-');
}

/** Ensure an id is unique within the collection by suffixing -2, -3, ... */
export function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Strip edition/variant noise from a title before searching IGDB.
 * "Luigi's Mansion [Player's Choice]" -> "Luigi's Mansion"
 */
export function searchableTitle(title) {
  return String(title)
    .replace(/\s*[\[(][^\])]*[\])]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

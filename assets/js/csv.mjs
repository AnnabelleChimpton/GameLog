// The collection as a CSV file.
//
// data/collection.json is already the full backup, but JSON is not what a
// spreadsheet, an insurance list, or another collection app asks for. This is
// the same games in the shape those tools speak: one row per game, RFC 4180
// quoting, and only the fields a person would want in a table -- the asset
// paths and layout ratios stay home in the JSON.

import { playStatus } from './lib.js';

/** One CSV field: quoted (with "" escapes) only when it has to be. */
export function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const COLUMNS = [
  ['id', (g) => g.id],
  ['title', (g) => g.title],
  ['platform', (g) => g.platform],
  ['year', (g) => g.year],
  ['region', (g) => g.region],
  ['condition', (g) => g.condition],
  // The resolved word rather than the raw field, so "not started" reads as
  // `unplayed` instead of an empty cell that looks like missing data.
  ['status', (g) => playStatus(g)],
  ['copies', (g) => g.copies ?? 1],
  ['genres', (g) => (Array.isArray(g.genres) ? g.genres : []).join('; ')],
  ['developer', (g) => g.developer],
  ['publisher', (g) => g.publisher],
  ['metacritic', (g) => g.metacritic],
  ['notes', (g) => g.notes],
  ['added', (g) => g.added],
  // Kept so another tool can re-match the game without guessing from titles.
  ['igdbId', (g) => g.igdbId],
];

/**
 * The whole collection as one CSV string.
 *
 * Starts with a UTF-8 byte-order mark: without it Excel assumes a legacy
 * encoding and the very first shelf with a "1080°" or a "Pokémon" comes out
 * mangled. Everything else that reads CSV ignores the mark.
 */
export function collectionCsv(games) {
  const rows = [COLUMNS.map(([name]) => name).join(',')];
  for (const game of games) {
    rows.push(COLUMNS.map(([, get]) => csvCell(get(game))).join(','));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

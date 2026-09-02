// The collection as CSV files.
//
// data/collection.json and data/lists.json are already the full backup, but
// JSON is not what a spreadsheet, an insurance list, or another collection app
// asks for. These are the same records in the shape those tools speak: one row
// per thing, RFC 4180 quoting, and only the fields a person would want in a
// table -- the asset paths and layout ratios stay home in the JSON.
//
// Games, hardware and lists are three different shapes, so they are three
// files rather than one sheet with half its columns blank on every row.

import { playStatus, hardwareKind, hardwareQuantity } from './lib.js';
import { resolveList } from './lists.js';

/** One CSV field: quoted (with "" escapes) only when it has to be. */
export function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A cell for a file that will be opened in a spreadsheet. Excel and Sheets
 * treat a cell starting with = + - or @ as a formula, so a game note of
 * "=HYPERLINK(...)" would execute on the machine of whoever opens the export.
 * The standard defence is a leading apostrophe, which those apps display as
 * literal text. Export-only: nothing here parses CSV back in, and the guard
 * must never touch imported data.
 */
export function csvExportCell(value) {
  const text = value == null ? '' : String(value);
  return csvCell(/^[=+\-@]/.test(text) ? `'${text}` : text);
}

/**
 * Rows under a header, as one CSV string.
 *
 * Starts with a UTF-8 byte-order mark: without it Excel assumes a legacy
 * encoding and the very first shelf with a "1080°" or a "Pokémon" comes out
 * mangled. Everything else that reads CSV ignores the mark.
 */
function toCsv(columns, records) {
  const rows = [columns.map(([name]) => name).join(',')];
  for (const record of records) {
    rows.push(columns.map(([, get]) => csvExportCell(get(record))).join(','));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

const GAME_COLUMNS = [
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

const HARDWARE_COLUMNS = [
  ['id', (i) => i.id],
  ['name', (i) => i.name],
  ['platform', (i) => i.platform],
  // Resolved like the manager resolves them: an entry from before kinds
  // existed is a console, and a kind nobody recognises is an accessory.
  ['kind', (i) => hardwareKind(i)],
  ['quantity', (i) => hardwareQuantity(i)],
  ['year', (i) => i.year],
  ['manufacturer', (i) => i.manufacturer],
  ['region', (i) => i.region],
  ['condition', (i) => i.condition],
  ['notes', (i) => i.notes],
  ['added', (i) => i.added],
];

const LIST_COLUMNS = [
  ['list', (r) => r.listName],
  ['wishlist', (r) => (r.wants ? 'yes' : 'no')],
  ['title', (r) => r.game.title],
  ['platform', (r) => r.game.platform],
  ['year', (r) => r.game.year],
  ['owned', (r) => (r.owned ? 'yes' : 'no')],
  ['note', (r) => r.note],
  ['igdbId', (r) => r.item?.igdbId ?? r.game.igdbId],
];

/** The whole games collection as one CSV string. */
export function collectionCsv(games) {
  return toCsv(GAME_COLUMNS, games);
}

/** The hardware shelf as one CSV string. */
export function hardwareCsv(hardware) {
  return toCsv(HARDWARE_COLUMNS, hardware);
}

/**
 * Every list, flattened to one row per entry.
 *
 * Entries are resolved against the collection the same way the lists page
 * resolves them, so the `owned` column says what the site says today -- a
 * wishlist entry you have since bought exports as owned without the list
 * ever having been edited.
 */
export function listsCsv(lists, games) {
  const rows = [];
  for (const list of lists) {
    const resolved = resolveList(list, games);
    for (const entry of resolved.entries) {
      rows.push({ listName: list.name, wants: Boolean(list.wants), ...entry });
    }
  }
  return toCsv(LIST_COLUMNS, rows);
}

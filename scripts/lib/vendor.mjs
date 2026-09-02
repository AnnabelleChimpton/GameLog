// Copying every linked image into the repo.
//
// A GameLog is meant to be a complete thing you own: the JSON, the pages, and
// the pictures. Art arrives as a link because that is what the databases hand
// over, but leaving it that way means the shelf is only as durable as somebody
// else's hosting. This walks the collection and pulls all of it local.
//
// Nothing here is destructive. A download that fails leaves the original link
// in place, so the worst case is a game that stays linked rather than one that
// loses its art.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COVER_DIR, BOXART_DIR, fetchImage, storeImage, sizeOf, IMAGE_TYPES } from './images.mjs';
import { shrinkImage } from './shrink.mjs';
import { ROOT } from './collection.mjs';

/**
 * Where each kind of picture lives.
 *
 * Covers and box scans are separate directories because a game has both, under
 * the same id. Hardware photos share the covers directory, which is where the
 * manager has always put them, and ids are unique across both lists.
 */
export const ART_FIELDS = [
  { list: 'games', field: 'cover', dir: COVER_DIR, prefix: 'assets/covers', label: 'cover' },
  { list: 'games', field: 'boxart', dir: BOXART_DIR, prefix: 'assets/boxart', label: 'box scan' },
  { list: 'hardware', field: 'image', dir: COVER_DIR, prefix: 'assets/covers', label: 'photo' },
];

/** A link to somebody else's server, as opposed to a path inside this repo. */
export const isRemote = (url) => /^https?:\/\//i.test(String(url ?? '').trim());

/** A picture carried inline in the JSON: nothing to download, nothing on disk. */
export const isDataUrl = (url) => /^data:/i.test(String(url ?? '').trim());

/** An id becomes a filename, so it may only ever be an id. */
export const usableId = (id) => /^[a-z0-9][a-z0-9-]*$/i.test(String(id ?? ''));

/**
 * Every image in this collection, with where it is and where it belongs.
 *
 * Pure, so what gets downloaded is decided separately from the downloading.
 */
export function artInventory(collection, fields = ART_FIELDS) {
  const items = [];
  for (const spec of fields) {
    for (const entry of collection[spec.list] || []) {
      const url = entry[spec.field];
      // A data: url is self-contained -- neither a link to back up nor a repo
      // path a file could be missing from -- so it is no one's job here.
      if (!url || isDataUrl(url)) continue;
      items.push({
        entry,
        spec,
        id: entry.id,
        name: entry.title || entry.name || entry.id,
        url,
        remote: isRemote(url),
      });
    }
  }
  return items;
}

/** A one-line summary of how much of a collection is actually in the repo. */
export function artSummary(collection, fields = ART_FIELDS) {
  const items = artInventory(collection, fields);
  const remote = items.filter((i) => i.remote);
  return { total: items.length, remote: remote.length, stored: items.length - remote.length };
}

/** Run jobs a few at a time, so a whole collection does not hammer one host. */
async function pooled(items, limit, run) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await run(queue.shift());
  });
  await Promise.all(workers);
}

/**
 * Download everything still linked, and repoint the collection at the copies.
 *
 * The caller saves the collection afterwards: this mutates entries in memory so
 * that a run which is interrupted has still written whatever images it managed,
 * and a second run picks up the rest.
 */
export async function vendorArt(
  collection,
  { dryRun = false, onItem = () => {}, fields = ART_FIELDS } = {}
) {
  const pending = artInventory(collection, fields).filter((i) => i.remote);
  const done = [];
  const failed = [];
  let bytes = 0;

  await pooled(pending, 6, async (item) => {
    if (!usableId(item.id)) {
      failed.push({ ...item, error: 'no usable id: save the entry first' });
      onItem({ ...item, ok: false });
      return;
    }
    try {
      if (dryRun) {
        done.push({ ...item, path: `${item.spec.prefix}/${item.id}.…` });
        onItem({ ...item, ok: true });
        return;
      }
      const image = await fetchImage(item.url);
      const { ext, bytes: n } = await storeImage(image, item.spec.dir, item.id);
      const path = `${item.spec.prefix}/${item.id}.${ext}`;
      // Only now does the entry stop pointing at the original. If anything
      // above threw, the link it already had is still the working one.
      item.entry[item.spec.field] = path;
      bytes += n;
      done.push({ ...item, path, bytes: n });
      onItem({ ...item, ok: true, path });
    } catch (err) {
      failed.push({ ...item, error: err.message || String(err) });
      onItem({ ...item, ok: false, error: err.message });
    }
  });

  return { done, failed, bytes, attempted: pending.length };
}

/**
 * Store one entry's art, right when the entry gets it.
 *
 * Every route that puts art on a game -- the CLI, the manager, enrich, boxart --
 * calls this, so a picture is in the repo from the moment it is found. Waiting
 * until someone remembers to run the backup is how a collection ends up half
 * hotlinked, and the person most likely to forget is the one this is for.
 *
 * A failure here is not worth stopping an add over: the entry keeps the link,
 * which still displays, and the next backup picks it up.
 */
export async function vendorEntry(entry, list = 'games') {
  const one = { games: [], hardware: [], [list]: [entry] };
  const { done, failed } = await vendorArt(one);
  return { stored: done.length, failed: failed.length };
}

/**
 * Re-encode the pictures already stored in the repo so they weigh less.
 *
 * New art is shrunk as it is stored; this is for a collection built before
 * that was true, or one whose pictures were dropped in by hand. Like
 * vendorArt it mutates entries in memory and leaves saving to the caller.
 * A picture that is already as small as this can make it is left alone.
 */
export async function shrinkArt(collection, { dryRun = false, fields = ART_FIELDS, onItem = () => {} } = {}) {
  const done = [];
  let before = 0;
  let after = 0;
  for (const item of artInventory(collection, fields)) {
    if (item.remote) continue;
    const result = await shrinkStored(item.url, { dryRun });
    if (!result) continue;
    item.entry[item.spec.field] = result.path;
    before += result.before;
    after += result.after;
    done.push({ ...item, ...result });
    onItem({ ...item, ...result });
  }
  return { done, before, after };
}

/**
 * Copy the art changes of a finished run onto a freshly loaded collection.
 *
 * vendorArt and shrinkArt hold a collection in memory while they work, which
 * can be minutes -- long enough for the manager to save an edit. Writing the
 * held copy back wholesale would undo that edit, so the caller re-reads the
 * file and lays only the run's own changes over it: the one art field of each
 * entry the run touched, found again by id.
 */
export function mergeArtChanges(fresh, done) {
  for (const item of done) {
    const entry = (fresh[item.spec.list] || []).find((e) => e.id === item.id);
    if (entry) entry[item.spec.field] = item.entry[item.spec.field];
  }
  return fresh;
}

const TYPE_OF_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/**
 * One stored picture, by repo-relative path: replaced by its smaller self
 * when there is one. Returns the new path and both sizes, or null.
 */
export async function shrinkStored(relative, { dryRun = false } = {}) {
  const match = /\.(png|jpe?g|webp|gif)$/i.exec(relative);
  if (!match) return null;
  let bytes;
  try {
    bytes = await readFile(join(ROOT, relative));
  } catch {
    return null; // A path with no file behind it is `npm run check`'s problem.
  }
  const result = shrinkImage({ type: TYPE_OF_EXT[match[1].toLowerCase()], bytes });
  if (!result.shrunk) return null;

  const slash = relative.lastIndexOf('/');
  const dir = join(ROOT, relative.slice(0, slash));
  const basename = relative.slice(slash + 1).replace(/\.[^.]+$/, '');
  const path = `${relative.slice(0, slash)}/${basename}.${IMAGE_TYPES[result.type]}`;
  if (!dryRun) await storeImage({ type: result.type, bytes: result.bytes }, dir, basename);
  return { path, before: bytes.length, after: result.bytes.length };
}

/** What the stored art weighs, for the report at the end of a run. */
export async function artOnDisk(collection) {
  const local = artInventory(collection).filter((i) => !i.remote);
  const sizes = await Promise.all(local.map((i) => sizeOf(i.url)));
  return {
    files: local.length,
    bytes: sizes.reduce((a, b) => a + b, 0),
    missing: local.filter((_, i) => sizes[i] === 0).map((i) => i.url),
  };
}

// Downloading and storing artwork inside the repo.
//
// The point of all of this is that a published GameLog should not depend on
// anybody else's server staying up. A hotlinked cover works right until the day
// the host reorganises a directory, and then a shelf full of art turns into a
// shelf full of placeholders with no local copy to fall back on.
//
// Shared by the manager (which writes one image at a time, from a drop or a
// link) and by `npm run vendor` (which walks the whole collection).

import { writeFile, rename, rm, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './collection.mjs';

/**
 * Formats accepted, and the extension each one is stored under.
 *
 * The extension comes from the declared type, never from whatever a url or a
 * request chooses to call the file.
 */
export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Profile photos, game covers, and true-shape box scans. */
export const PHOTO_DIR = join(ROOT, 'assets', 'profile');
export const COVER_DIR = join(ROOT, 'assets', 'covers');
export const BOXART_DIR = join(ROOT, 'assets', 'boxart');

/** Hosts a fetch from this machine should never be pointed at. */
export const PRIVATE_HOST =
  /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.)/i;

const UA = 'GameLog/1.0 (collection manager)';

/**
 * Download a remote image.
 *
 * Pasting an address is how anyone actually finds box art: you search, you
 * right-click, you copy the image address. Fetching it here also fixes the
 * quieter problem that a hotlinked url is somebody else's to delete.
 */
export async function fetchImage(url) {
  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    throw new Error('That is not a web address.');
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error('Only http and https addresses can be fetched.');
  }
  // This runs on your machine, so a fetch from it reaches your network.
  if (PRIVATE_HOST.test(parsed.hostname)) {
    throw new Error('That address points back at this machine or a private network.');
  }

  const res = await fetch(parsed, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': UA },
  }).catch(() => { throw new Error('Could not reach that address.'); });

  if (!res.ok) throw new Error(`That address answered with HTTP ${res.status}.`);

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES[type]) {
    throw new Error(`That link is ${type || 'not an image'}, not a jpg, png, webp or gif.`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error('That image is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('That image is larger than 3 MB.');
  return { type, bytes };
}

export async function fetchImageAsDataUrl(url) {
  const { type, bytes } = await fetchImage(url);
  return `data:${type};base64,${bytes.toString('base64')}`;
}

/**
 * Store an image under a fixed name, replacing whatever extension that name
 * previously had. Written to a temp file and renamed, so an interrupted save
 * cannot leave a half-written picture behind.
 */
export async function storeImage({ type, bytes }, dir, basename) {
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error(`${type} isn't an image type this accepts (jpg, png, webp, gif).`);

  await mkdir(dir, { recursive: true });
  await Promise.all(Object.values(IMAGE_TYPES)
    .filter((other) => other !== ext)
    .map((other) => rm(join(dir, `${basename}.${other}`), { force: true })));

  const tmp = join(dir, `${basename}.${ext}.tmp`);
  await writeFile(tmp, bytes);
  await rename(tmp, join(dir, `${basename}.${ext}`));
  return { ext, bytes: bytes.length };
}

/** Decode a base64 image data url and store it. */
export async function writeImage(dataUrl, dir, basename, maxBytes = MAX_IMAGE_BYTES) {
  const match = /^data:([a-z]+\/[a-z+]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('Expected a base64 image data url.');

  const type = match[1].toLowerCase();
  if (!IMAGE_TYPES[type]) {
    throw new Error(`${type} isn't an image type this accepts (jpg, png, webp, gif).`);
  }

  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw new Error('That image is empty.');
  if (bytes.length > maxBytes) {
    throw new Error(`That image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  return storeImage({ type, bytes }, dir, basename);
}

/** Bytes on disk under a repo-relative path, or 0 if it isn't there. */
export async function sizeOf(relative) {
  try {
    return (await stat(join(ROOT, relative))).size;
  } catch {
    return 0;
  }
}

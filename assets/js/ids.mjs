// Ids for games and hardware.
//
// An id is a filename (the stored art is named after it) and a link target
// (lists and log posts point at it), so it has to be stable, readable and
// url-safe: "nintendo-64-goldeneye-007". The CLI, the importer and the
// browser manager all make ids here, so an entry gets the same id whichever
// door it came in by -- a manager that slugged differently from the scripts
// once left five games filed under "game-…" with no platform in the name.

/** Lowercase, url-safe slug: "Chrono Trigger" -> "chrono-trigger". */
export function slug(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A stable, readable, URL-safe id like "nintendo-64-goldeneye-007". */
export function makeId(platform, title) {
  return `${slug(platform)}-${slug(title)}`.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

/** Ensure an id is unique within the collection by suffixing -2, -3, ... */
export function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

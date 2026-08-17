// The platform registry.
//
// Every platform your collection mentions should ideally have an entry here, but
// nothing breaks if it doesn't -- unknown platforms fall back to a generated
// label and a neutral colour. Add your own as you need them.
//
//   key    canonical name, exactly as it appears in data/collection.json
//   short  the label used on filter chips and cover badges (keep it tiny)
//   color  used for the platform badge and the generated placeholder cover
//   igdb   IGDB's numeric platform id, used to narrow cover-art searches.
//          Find one at https://api-docs.igdb.com/#platform or just leave it
//          null to search across every platform.

export const PLATFORMS = [
  { key: '3DO',                  short: '3DO',    color: '#8b8b8b', igdb: 50 },
  { key: 'Atari 2600',           short: '2600',   color: '#c9702e', igdb: 59 },
  { key: 'Sega Genesis',         short: 'GEN',    color: '#2b6cb0', igdb: 29 },
  { key: 'Sega Dreamcast',       short: 'DC',     color: '#e06c3b', igdb: 23 },
  { key: 'Sega Saturn',          short: 'SAT',    color: '#4a5568', igdb: 32 },
  { key: 'NES/Famicom',          short: 'NES',    color: '#b03a3a', igdb: 18 },
  { key: 'SNES/Super Famicom',   short: 'SNES',   color: '#7b5ea7', igdb: 19 },
  { key: 'Nintendo 64',          short: 'N64',    color: '#2f8f4e', igdb: 4 },
  { key: 'Nintendo GameCube',    short: 'GCN',    color: '#5f5aa2', igdb: 21 },
  { key: 'Nintendo Wii',         short: 'Wii',    color: '#3a9bd5', igdb: 5 },
  { key: 'Nintendo Wii U',       short: 'Wii U',  color: '#2c7bb0', igdb: 41 },
  { key: 'Nintendo Switch',      short: 'NSW',    color: '#d9424a', igdb: 130 },
  { key: 'Nintendo Switch 2',    short: 'NSW2',   color: '#c0392b', igdb: 508 },
  { key: 'Nintendo Game Boy',    short: 'GB',     color: '#6b8f3a', igdb: 33 },
  { key: 'Nintendo Game Boy Advance', short: 'GBA', color: '#7a4fa3', igdb: 24 },
  { key: 'Nintendo DS',          short: 'DS',     color: '#4a6fa5', igdb: 20 },
  { key: 'Nintendo 3DS',         short: '3DS',    color: '#c0392b', igdb: 37 },
  { key: 'Sony PlayStation',     short: 'PS1',    color: '#5a5a6e', igdb: 7 },
  { key: 'Sony PlayStation 2',   short: 'PS2',    color: '#2f4f8f', igdb: 8 },
  { key: 'Sony PlayStation 3',   short: 'PS3',    color: '#33334d', igdb: 9 },
  { key: 'Sony PlayStation 4',   short: 'PS4',    color: '#1f5fa8', igdb: 48 },
  { key: 'Sony PlayStation 5',   short: 'PS5',    color: '#1a4f9c', igdb: 167 },
  { key: 'Sony PSP',             short: 'PSP',    color: '#3d3d52', igdb: 38 },
  { key: 'Sony PS Vita',         short: 'Vita',   color: '#2d3d52', igdb: 46 },
  { key: 'Microsoft Xbox',       short: 'Xbox',   color: '#3f8f3f', igdb: 11 },
  { key: 'Microsoft Xbox 360',   short: 'X360',   color: '#5aa02c', igdb: 12 },
  { key: 'Microsoft Xbox One',   short: 'XB1',    color: '#3a7a3a', igdb: 49 },
  { key: 'Microsoft Xbox Series X|S', short: 'XSX', color: '#2f6b2f', igdb: 169 },
  { key: 'PC',                   short: 'PC',     color: '#6b6b7b', igdb: 6 },
];

const BY_KEY = new Map(PLATFORMS.map((p) => [p.key.toLowerCase(), p]));

const FALLBACK_COLORS = [
  '#6b7fa8', '#a86b7f', '#7fa86b', '#a8956b', '#8b6ba8', '#6ba8a0',
];

/** Look up a platform, synthesising a reasonable entry for unknown ones. */
export function platformInfo(key) {
  if (!key) return { key: 'Unknown', short: '?', color: '#7a7a7a', igdb: null };
  const hit = BY_KEY.get(String(key).toLowerCase());
  if (hit) return hit;

  // Unknown platform: derive a short label from the initials, and pick a stable
  // colour by hashing the name so it stays the same between runs.
  const short = String(key)
    .split(/[\s/-]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
  let hash = 0;
  for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    key,
    short: short || '?',
    color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
    igdb: null,
  };
}

/**
 * IGDB's platform id -> the key used here.
 *
 * Search results say which platforms a game was released on, which is exactly
 * the question "which shelf does this go on?" -- so it is worth translating
 * rather than making someone pick from a list the answer was already in.
 */
export function platformFromIgdbId(id) {
  const hit = PLATFORMS.find((p) => p.igdb === id);
  return hit ? hit.key : null;
}

/** Sort order for platform filter chips: known platforms first, in registry order. */
export function platformSortIndex(key) {
  const i = PLATFORMS.findIndex((p) => p.key.toLowerCase() === String(key).toLowerCase());
  return i === -1 ? PLATFORMS.length : i;
}

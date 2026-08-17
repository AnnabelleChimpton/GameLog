// Sanity-check data/collection.json before you push.
//
//   npm run check
//
// Catches the things that actually break the site or look wrong on it:
// invalid JSON, missing required fields, duplicate ids, unknown platforms,
// and how much is still waiting on `npm run enrich`.

import { loadCollection, COLLECTION_PATH } from './lib/collection.mjs';
import { PLATFORMS, platformInfo } from '../assets/js/platforms.mjs';

const problems = [];
const warnings = [];

const known = new Set(PLATFORMS.map((p) => p.key.toLowerCase()));

let collection;
try {
  collection = await loadCollection();
} catch (err) {
  console.error(`data/collection.json is not valid JSON:\n  ${err.message}`);
  process.exit(1);
}

const { games, hardware } = collection;
const seenIds = new Map();

for (const [kind, items] of [['game', games], ['hardware', hardware]]) {
  items.forEach((item, i) => {
    const label = item.title || item.name || `<${kind} #${i + 1}>`;

    if (!item.id) problems.push(`${label}: missing "id"`);
    else if (seenIds.has(item.id)) {
      problems.push(`duplicate id "${item.id}" (${seenIds.get(item.id)} and ${label})`);
    } else seenIds.set(item.id, label);

    if (kind === 'game' && !item.title) problems.push(`${kind} #${i + 1}: missing "title"`);
    if (kind === 'hardware' && !item.name) problems.push(`${kind} #${i + 1}: missing "name"`);
    if (!item.platform) problems.push(`${label}: missing "platform"`);
    else if (!known.has(String(item.platform).toLowerCase())) {
      warnings.push(
        `${label}: platform "${item.platform}" is not in the registry — ` +
        `it will still show, with a generated "${platformInfo(item.platform).short}" badge. ` +
        `Add it to assets/js/platforms.mjs for a proper label and colour.`
      );
    }

    if (item.genres && !Array.isArray(item.genres)) {
      problems.push(`${label}: "genres" should be a list, e.g. ["Action", "RPG"]`);
    }
    if (item.copies != null && (!Number.isInteger(item.copies) || item.copies < 1)) {
      problems.push(`${label}: "copies" should be a whole number of 1 or more`);
    }
    if (item.cover && !/^(https?:)?\/\/|^data:|^assets\//.test(item.cover)) {
      warnings.push(`${label}: "cover" is not a url or an assets/ path — it may not load`);
    }
  });
}

const noCover = games.filter((g) => !g.cover);
const noDescription = games.filter((g) => !g.description);
const noYear = games.filter((g) => !g.year);

console.log(`${COLLECTION_PATH.replace(process.cwd() + '/', '')}`);
console.log(`  ${games.length} games, ${hardware.length} hardware items\n`);

if (problems.length) {
  console.log(`${problems.length} problem(s) to fix:`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log('');
}

if (warnings.length) {
  console.log(`${warnings.length} thing(s) worth a look:`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}

if (noCover.length || noDescription.length || noYear.length) {
  console.log('Waiting on `npm run enrich`:');
  if (noCover.length) console.log(`  ${noCover.length} without cover art`);
  if (noDescription.length) console.log(`  ${noDescription.length} without a description`);
  if (noYear.length) console.log(`  ${noYear.length} without a release year`);
  console.log('');
}

if (!problems.length) {
  console.log(warnings.length ? 'No blocking problems — safe to push.' : 'All good.');
}

process.exit(problems.length ? 1 : 0);

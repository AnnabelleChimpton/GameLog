// Re-encode the artwork already stored in this repo so it weighs less.
//
//   npm run shrink              convert every oversized PNG, update the paths
//   npm run shrink -- --dry-run say what would change, write nothing
//
// New art is shrunk as it is stored, so this is for a collection built before
// that was true, or one whose pictures were dropped in by hand. It walks every
// local cover, box scan, hardware photo and the profile picture; a PNG that
// comes out smaller as a JPEG is replaced and its entry repointed. Nothing is
// downloaded and nothing remote is touched. The manager's Site tab has a
// button that does the same.

import { readFile, writeFile } from 'node:fs/promises';
import { CONFIG_PATH, loadCollection, saveCollection } from './lib/collection.mjs';
import { shrinkArt, shrinkStored } from './lib/vendor.mjs';

const dryRun = process.argv.includes('--dry-run');

const kb = (n) => `${Math.round(n / 1024)} KB`;

async function main() {
  const collection = await loadCollection();
  const result = await shrinkArt(collection, {
    dryRun,
    onItem: (item) => console.log(`  ${item.name}: ${item.spec.label} ${kb(item.before)} → ${kb(item.after)}`),
  });
  let { before, after } = result;
  let count = result.done.length;
  if (count && !dryRun) await saveCollection(collection);

  // The profile photo lives in config rather than the collection.
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    const photo = config.profile?.photo;
    if (photo && !/^https?:/i.test(photo)) {
      const done = await shrinkStored(photo, { dryRun });
      if (done) {
        config.profile.photo = done.path;
        before += done.before; after += done.after; count += 1;
        console.log(`  profile photo: ${kb(done.before)} → ${kb(done.after)}`);
        if (!dryRun) await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
      }
    }
  } catch { /* no config, or not readable: nothing to shrink there */ }

  if (!count) {
    console.log('Nothing to shrink: every stored picture is already as small as this can make it.');
    return;
  }
  console.log(`\n${dryRun ? 'Would shrink' : 'Shrunk'} ${count} picture(s): ${kb(before)} → ${kb(after)}`
    + ` (${Math.round((1 - after / before) * 100)}% smaller)`);
  if (dryRun) console.log('--dry-run: nothing written.');
  else console.log('The old files are gone and the paths are updated; commit both together.');
}

main().catch((err) => {
  console.error(`\n${err.message || err}`);
  process.exit(1);
});

// Fill in cover art, descriptions and release years from IGDB.
//
//   npm run enrich              # only entries that are still missing something
//   npm run enrich -- --force   # redo everything, overwriting what's there
//   npm run enrich -- --only nintendo-64-goldeneye-007
//   npm run enrich -- --dry-run # show what would change, write nothing
//
// Safe to re-run: anything you have edited by hand is left alone unless you
// pass --force. Progress is saved as it goes, so a stop mid-run loses nothing.

import { loadCollection, saveCollection } from './lib/collection.mjs';
import { platformInfo } from '../assets/js/platforms.mjs';
import {
  loadEnv, getToken, createClient, findGame, coverUrl, tidySummary, releaseYear, companies,
} from './lib/igdb.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex !== -1 ? args[onlyIndex + 1] : null;

const needsWork = (g) => force || !g.cover || !g.description || !g.year;

async function enrichHardware(query, hardware) {
  // Hardware gets the platform's logo from IGDB -- there is no per-console
  // "cover", but a clean logo reads well in the hardware shelf.
  const wanted = [...new Set(hardware.filter((h) => !h.image).map((h) => h.platform))];
  const logos = new Map();

  for (const platform of wanted) {
    const id = platformInfo(platform).igdb;
    if (!id) continue;
    try {
      const res = await query('platforms', `fields name, platform_logo.image_id; where id = ${id};`);
      const imageId = res[0]?.platform_logo?.image_id;
      if (imageId) {
        logos.set(platform, `https://images.igdb.com/igdb/image/upload/t_logo_med/${imageId}.png`);
      }
    } catch {
      // A missing logo is cosmetic; carry on.
    }
  }

  let filled = 0;
  for (const h of hardware) {
    if (h.image && !force) continue;
    const logo = logos.get(h.platform);
    if (logo) { h.image = logo; filled += 1; }
  }
  return filled;
}

async function main() {
  const collection = await loadCollection();
  if (!collection.games.length) {
    console.error('data/collection.json has no games yet. Run `npm run import:gameye` first,');
    console.error('or add one with `npm run add "Some Game"`.');
    process.exit(1);
  }

  const creds = await loadEnv();
  const token = await getToken(creds);
  const query = createClient({ id: creds.id, token });

  const targets = collection.games.filter((g) =>
    only ? g.id === only || g.title.toLowerCase() === only.toLowerCase() : needsWork(g)
  );

  if (!targets.length) {
    console.log('Everything is already enriched. Use --force to refetch.');
    return;
  }

  console.log(`Looking up ${targets.length} of ${collection.games.length} games on IGDB…\n`);

  const unmatched = [];
  const lowConfidence = [];
  let updated = 0;
  let done = 0;

  for (const game of targets) {
    done += 1;
    const label = `${game.title} (${platformInfo(game.platform).short})`;
    let match = null;
    try {
      match = await findGame(query, { title: game.title, platform: game.platform });
    } catch (err) {
      console.log(`  !  ${label} — ${err.message}`);
      continue;
    }

    if (!match) {
      unmatched.push(game);
      console.log(`  ?  ${label} — no match`);
      continue;
    }

    const changes = [];
    if (match.cover?.image_id && (force || !game.cover)) {
      game.cover = coverUrl(match.cover.image_id);
      changes.push('cover');
    }
    const summary = tidySummary(match.summary, match.storyline);
    if (summary && (force || !game.description)) {
      game.description = summary;
      changes.push('description');
    }
    const year = releaseYear(match.first_release_date);
    if (year && (force || !game.year)) {
      game.year = year;
      changes.push('year');
    }
    if (match.genres?.length && !game.genres?.length) {
      game.genres = match.genres.map((x) => x.name);
      changes.push('genres');
    }
    const { developer, publisher } = companies(match);
    if (developer && !game.developer) { game.developer = developer; changes.push('developer'); }
    if (publisher && !game.publisher) { game.publisher = publisher; changes.push('publisher'); }
    if (match.id && (force || !game.igdbId)) game.igdbId = match.id;

    if (changes.length) updated += 1;

    const confident = match._matchScore >= 90;
    if (!confident) lowConfidence.push({ game, matchedName: match.name, score: match._matchScore });

    const mark = confident ? '✓' : '~';
    const note = confident ? '' : `  → matched "${match.name}"`;
    console.log(`  ${mark}  [${String(done).padStart(3)}/${targets.length}] ${label}${note}`);

    // Checkpoint every 20 so an interrupted run keeps its progress.
    if (!dryRun && done % 20 === 0) await saveCollection(collection);
  }

  const logosFilled = await enrichHardware(query, collection.hardware);

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
  } else {
    await saveCollection(collection);
    console.log(`\nUpdated ${updated} game(s) in data/collection.json`);
    if (logosFilled) console.log(`Added logos for ${logosFilled} hardware item(s)`);
  }

  if (lowConfidence.length) {
    console.log(`\n${lowConfidence.length} match(es) worth eyeballing (title did not match exactly):`);
    for (const { game, matchedName } of lowConfidence) {
      console.log(`  "${game.title}" → "${matchedName}"   [${game.id}]`);
    }
    console.log('  Wrong? Fix the entry in data/collection.json, or rerun:');
    console.log('    npm run enrich -- --force --only <id>');
  }

  if (unmatched.length) {
    console.log(`\n${unmatched.length} game(s) found nothing on IGDB:`);
    for (const g of unmatched) console.log(`  ${g.title} (${g.platform})   [${g.id}]`);
    console.log('  These keep a generated placeholder cover, which looks fine.');
    console.log('  To fix one, paste an image url into its "cover" field by hand.');
  }
}

main().catch((err) => {
  console.error(`\n${err.message || err}`);
  process.exit(1);
});

// Add a game to the collection, interactively.
//
//   npm run add "Chrono Trigger"
//   npm run add "Chrono Trigger" -- --platform "SNES/Super Famicom"
//   npm run add "Katamari Damacy" -- --platform "Nintendo Switch" --condition CIB
//
// It searches IGDB, shows you the matches, and writes the one you pick into
// data/collection.json with its cover art, description, year and genres.
//
// No IGDB keys? `--no-lookup` adds a bare entry you can fill in by hand.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadCollection, saveCollection, makeId, uniqueId } from './lib/collection.mjs';
import { PLATFORMS, platformInfo } from '../assets/js/platforms.mjs';
import {
  loadEnv, getToken, createClient, searchGames, coverUrl, tidySummary, releaseYear, companies,
} from './lib/igdb.mjs';

function parseArgs(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--no-lookup') opts.noLookup = true;
    else if (a.startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i += 1; }
    else opts.positional.push(a);
  }
  return opts;
}

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, fallback = '') => {
  const answer = (await rl.question(q)).trim();
  return answer || fallback;
};

function describeCandidate(g) {
  const year = releaseYear(g.first_release_date);
  const platforms = (g.platforms || [])
    .map((p) => (typeof p === 'object' ? p.name : null))
    .filter(Boolean)
    .slice(0, 4)
    .join(', ');
  const bits = [year, platforms].filter(Boolean).join(' · ');
  const art = g.cover?.image_id ? '' : '  (no cover art)';
  return `${g.name}${bits ? `\n        ${bits}` : ''}${art}`;
}

async function choosePlatform(collection, suggested) {
  const inUse = [...new Set(collection.games.map((g) => g.platform))].sort();
  const options = [...new Set([...(suggested || []), ...inUse])];

  console.log('\nWhich platform is your copy for?');
  options.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p}`));
  console.log('   or just type the platform name');

  const answer = await ask('\n  Platform: ');
  const asNumber = Number(answer);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  if (!answer) throw new Error('A platform is required.');

  // Accept a short label like "N64" as well as the full name.
  const bySort = PLATFORMS.find(
    (p) => p.short.toLowerCase() === answer.toLowerCase() || p.key.toLowerCase() === answer.toLowerCase()
  );
  return bySort ? bySort.key : answer;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const collection = await loadCollection();

  let title = opts.positional.join(' ').trim();
  if (!title) title = await ask('Game title: ');
  if (!title) throw new Error('A title is required.');

  let chosen = null;
  if (!opts.noLookup) {
    let query;
    try {
      const creds = await loadEnv();
      query = createClient({ id: creds.id, token: await getToken(creds) });
    } catch (err) {
      console.log(`\n${err.message}`);
      console.log('Continuing without lookup — the entry will have no cover art yet.\n');
    }

    if (query) {
      console.log(`\nSearching IGDB for "${title}"…`);
      const results = await searchGames(query, title, { platform: opts.platform || null });

      if (!results.length) {
        console.log('  No results. Adding a bare entry you can fill in by hand.');
      } else {
        console.log('');
        results.forEach((g, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describeCandidate(g)}`));
        console.log('   0. none of these — add a bare entry\n');
        const pick = Number(await ask('  Which one? [1] ', '1'));
        if (Number.isInteger(pick) && pick >= 1 && pick <= results.length) {
          chosen = results[pick - 1];
        }
      }
    }
  }

  const suggestedPlatforms = (chosen?.platforms || [])
    .map((p) => (typeof p === 'object' ? p.name : null))
    .filter(Boolean);
  const platform = opts.platform || (await choosePlatform(collection, suggestedPlatforms));

  const condition =
    opts.condition ||
    (await ask('  Condition [CIB / Loose / Boxed / New / blank]: ', ''));
  const notes = opts.notes || (await ask('  Notes (optional): ', ''));

  const finalTitle = chosen?.name || title;
  const taken = new Set([...collection.games, ...collection.hardware].map((x) => x.id));
  const id = uniqueId(makeId(platform, finalTitle), taken);
  const { developer, publisher } = chosen ? companies(chosen) : { developer: null, publisher: null };

  const entry = {
    id,
    title: finalTitle,
    platform,
    year: chosen ? releaseYear(chosen.first_release_date) : null,
    cover: chosen?.cover?.image_id ? coverUrl(chosen.cover.image_id) : null,
    description: chosen ? tidySummary(chosen.summary, chosen.storyline) : null,
    genres: chosen?.genres?.map((g) => g.name) || [],
    developer,
    publisher,
    region: opts.region || null,
    release: null,
    condition: condition || null,
    copies: 1,
    metacritic: null,
    notes: notes || null,
    added: new Date().toISOString().slice(0, 10),
    igdbId: chosen?.id ?? null,
  };

  const duplicate = collection.games.find(
    (g) => g.platform === platform && g.title.toLowerCase() === finalTitle.toLowerCase()
  );
  if (duplicate) {
    const bump = await ask(
      `\n  You already have "${finalTitle}" on ${platform}. Add as another copy? [y/N] `,
      'n'
    );
    if (bump.toLowerCase().startsWith('y')) {
      duplicate.copies = (duplicate.copies || 1) + 1;
      if (condition && duplicate.condition && !duplicate.condition.includes(condition)) {
        duplicate.condition = `${duplicate.condition}, ${condition}`;
      }
      await saveCollection(collection);
      console.log(`\n  Now showing ×${duplicate.copies}.`);
      return;
    }
  }

  collection.games.push(entry);
  collection.games.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  await saveCollection(collection);

  const p = platformInfo(platform);
  console.log(`\n  Added "${entry.title}" [${p.short}]${entry.year ? ` (${entry.year})` : ''}`);
  if (!entry.cover) console.log('  No cover art yet — run `npm run enrich` later, or paste a url into "cover".');
  console.log('\n  Commit and push to publish:');
  console.log(`    git add data/collection.json && git commit -m "Add ${entry.title}" && git push`);
}

main()
  .catch((err) => {
    console.error(`\n${err.message || err}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());

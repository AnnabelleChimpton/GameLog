// Checks the platform registry's outside references against the live
// services they point at. Needs the network, so it is opt-in:
//
//   GAMELOG_ONLINE=1 npm test
//
// What it proves: every `wikidata` item really is that console, every `wiki`
// code really exists in Wikipedia's reviews template, and every `libretro`
// directory really is served. Run it after editing the registry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORMS } from '../assets/js/platforms.mjs';

const online = process.env.GAMELOG_ONLINE === '1';
const UA = { 'User-Agent': 'GameLog/1.0 (registry check)' };

test('every wikidata item is a console whose label matches the platform', { skip: !online }, async () => {
  const ids = PLATFORMS.map((p) => p.wikidata).filter(Boolean);
  const labels = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({
      action: 'wbgetentities', format: 'json', props: 'labels|descriptions|aliases|sitelinks',
      ids: ids.slice(i, i + 50).join('|'),
    });
    const json = await (await fetch(`https://www.wikidata.org/w/api.php?${params}`, { headers: UA })).json();
    for (const [id, e] of Object.entries(json.entities)) {
      labels.set(id, {
        names: [e.labels?.en?.value, e.sitelinks?.enwiki?.title,
          ...(e.aliases?.en || []).map((a) => a.value)].filter(Boolean),
        description: e.descriptions?.en?.value || '',
      });
    }
  }
  const plain = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const p of PLATFORMS) {
    if (!p.wikidata) continue;
    const got = labels.get(p.wikidata);
    assert.ok(got, `${p.key}: ${p.wikidata} exists`);
    assert.match(got.description, /console|handheld|add-on|computer|operating system|peripheral|system/i,
      `${p.key}: ${p.wikidata} is "${got.description}"`);
    // "Xbox Series X|S" vs "Xbox Series X and Series S": compare the first words.
    const key = plain(p.key.replace(/^(sony|microsoft|nintendo|sega)\s+/i, '').split(/[/|]/)[0]);
    const matches = got.names.some((n) => plain(n).includes(key) || key.includes(plain(n)))
      || p.key === 'PC';
    assert.ok(matches, `${p.key}: ${p.wikidata} is labelled ${JSON.stringify(got.names)}`);
  }
});

test('every wiki code is one the reviews template defines', { skip: !online }, async () => {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'content',
    rvslots: 'main', titles: 'Module:Video game reviews/data',
  });
  const json = await (await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: UA })).json();
  const source = json.query.pages[0].revisions[0].slots.main.content;
  const codes = new Set([...source.matchAll(/\{\s*'[^']+'\s*,\s*'([^']+)'/g)].map((m) => m[1]));
  for (const p of PLATFORMS) {
    if (p.wiki) assert.ok(codes.has(p.wiki), `${p.key}: "${p.wiki}" is not a template code`);
  }
});

test('every libretro directory answers', { skip: !online }, async () => {
  for (const p of PLATFORMS) {
    if (!p.libretro) continue;
    const res = await fetch(`https://thumbnails.libretro.com/${encodeURIComponent(p.libretro)}/Named_Boxarts/`, {
      method: 'HEAD', headers: UA,
    });
    assert.ok(res.ok, `${p.key}: ${p.libretro} answered ${res.status}`);
    await new Promise((r) => setTimeout(r, 150));
  }
});

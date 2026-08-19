// The compare view reads somebody else's collection over the network, so its
// url handling and diffing are the parts most worth pinning down.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollectionUrl, diff, loadCollection } from '../assets/js/compare.js';

/** Stand in for the network for one call, then put the real fetch back. */
async function withFetch(handler, run) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => handler(String(url));
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('resolveCollectionUrl accepts the forms people actually paste', () => {
  const expected = 'https://someone.github.io/GameLog/data/collection.json';
  assert.equal(resolveCollectionUrl('someone/GameLog'), expected);
  assert.equal(resolveCollectionUrl('https://someone.github.io/GameLog'), expected);
  assert.equal(resolveCollectionUrl('https://someone.github.io/GameLog/'), expected);
  assert.equal(resolveCollectionUrl('someone.github.io/GameLog'), expected);
  // A github.com url points at the source, not the published site.
  assert.equal(resolveCollectionUrl('https://github.com/someone/GameLog'), expected);
  // An explicit json path is taken as given.
  assert.equal(resolveCollectionUrl('https://x.dev/c.json'), 'https://x.dev/c.json');
});

test('resolveCollectionUrl rejects anything that is not http', () => {
  for (const bad of ['ftp://host/file', 'file:///etc/passwd', 'javascript:alert(1)']) {
    assert.throws(() => resolveCollectionUrl(bad), /http/i, `should reject ${bad}`);
  }
});

test('resolveCollectionUrl rejects input that is not an address', () => {
  assert.throws(() => resolveCollectionUrl(''), /paste/i);
  assert.throws(() => resolveCollectionUrl('not a url'), /address/i);
});

test('resolveCollectionUrl allows localhost, for comparing against a preview', () => {
  assert.equal(resolveCollectionUrl('localhost:4321'),
    'http://localhost:4321/data/collection.json');
});

test('diff groups by title, not by platform', () => {
  const mine = [
    { title: 'GoldenEye 007', platform: 'Nintendo 64' },
    { title: 'Halo', platform: 'Microsoft Xbox' },
  ];
  const theirs = [
    // Same game, different shelf: still shared.
    { title: 'GoldenEye 007', platform: 'Nintendo Switch' },
    { title: 'Chrono Trigger', platform: 'SNES/Super Famicom' },
  ];
  const r = diff(mine, theirs);
  assert.equal(r.shared.length, 1);
  assert.equal(r.shared[0].mine[0].title, 'GoldenEye 007');
  assert.deepEqual(r.onlyMine.map((g) => g.title), ['Halo']);
  assert.deepEqual(r.onlyTheirs.map((g) => g.title), ['Chrono Trigger']);
});

test('loadCollection refuses a body larger than the cap, by its declared size', async () => {
  const huge = String(64 * 1024 * 1024);
  const result = withFetch(
    () => new Response('{"games":[]}', { status: 200, headers: { 'content-length': huge } }),
    () => loadCollection('https://x.dev/c.json'));
  await assert.rejects(result, /larger than|Refusing/i);
});

test('loadCollection still loads a normal collection', async () => {
  const body = JSON.stringify({ games: [{ title: 'Halo', platform: 'Microsoft Xbox' }] });
  const result = await withFetch(
    () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    () => loadCollection('https://x.dev/c.json'));
  assert.equal(result.games.length, 1);
  assert.equal(result.games[0].title, 'Halo');
});

test('diff ignores a leading article, which exporters disagree about', () => {
  const r = diff(
    [{ title: 'The Legend of Zelda', platform: 'NES/Famicom' }],
    [{ title: 'Legend of Zelda', platform: 'NES/Famicom' }],
  );
  assert.equal(r.shared.length, 1);
  assert.equal(r.onlyMine.length, 0);
});

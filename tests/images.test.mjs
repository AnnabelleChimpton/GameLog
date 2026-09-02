// The manager can fetch an image from a pasted link, and that fetch runs on
// your own machine -- so its job is to reach the public web and nothing else.
// These pin down the refusals that keep it from being pointed inward.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPrivateIp, fetchImage, storeImage } from '../scripts/lib/images.mjs';

/** Stand in for the network for one call, then put the real fetch back. */
async function withFetch(handler, run) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => handler(String(url), opts);
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('isPrivateIp knows the addresses a fetch must never reach', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1',
    '169.254.169.254', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1',
    // CGNAT and benchmarking space: never public hosts, often live routers.
    '100.64.0.1', '100.127.255.254', '198.18.0.1', '198.19.255.254']) {
    assert.equal(isPrivateIp(ip), true, `${ip} is private`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '140.82.113.3', '2001:4860:4860::8888',
    // The neighbours of the newly refused ranges stay reachable.
    '100.63.255.254', '100.128.0.1', '198.17.255.254', '198.20.0.1']) {
    assert.equal(isPrivateIp(ip), false, `${ip} is public`);
  }
});

test('a private host is refused before any request goes out', async () => {
  let called = false;
  await withFetch(() => { called = true; return new Response(''); }, async () => {
    await assert.rejects(fetchImage('http://127.0.0.1/secret.png'), /private network|this machine/);
  });
  assert.equal(called, false, 'no fetch should have been attempted');
});

test('a numeric-encoded private host is normalised and refused', async () => {
  // 2130706433 is 127.0.0.1 written as a single decimal, a classic guard bypass.
  await assert.rejects(fetchImage('http://2130706433/x.png'), /private network|this machine/);
  await assert.rejects(fetchImage('http://0x7f000001/x.png'), /private network|this machine/);
});

test('a redirect from a public url to a private one is caught mid-chain', async () => {
  // The first host does not resolve, so the guard lets it through to fetch,
  // which answers with a redirect pointing back at this machine. Only
  // re-checking the hop catches it.
  const result = withFetch(
    (url) => (url.includes('metadata')
      ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
      : new Response(null, { status: 200, headers: { 'content-type': 'image/png' } })),
    () => fetchImage('http://redirect-to-metadata.invalid/go'));
  await assert.rejects(result, /private network|this machine/);
});

test('only http and https are fetched', async () => {
  await assert.rejects(fetchImage('ftp://example.test/x.png'), /http/i);
});

test('a declared size over the cap is refused before any byte is buffered', async () => {
  await withFetch(
    () => new Response('x', {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(99 * 1024 * 1024) },
    }),
    async () => {
      await assert.rejects(fetchImage('http://cdn.example/x.png'), /3 MB/);
    });
});

test('the size cap holds even when the server does not declare a length', async () => {
  // A Content-Length header is the server's claim; the enforcement happens on
  // the bytes as they arrive, so a lying or silent server changes nothing.
  const big = new Uint8Array(4 * 1024 * 1024);
  await withFetch(
    () => new Response(big, { status: 200, headers: { 'content-type': 'image/png' } }),
    async () => {
      await assert.rejects(fetchImage('http://cdn.example/x.png'), /3 MB/);
    });
});

/* --- Storing --------------------------------------------------------------- */

test('a failed store leaves the picture the game already had', async () => {
  // The stale sibling extensions are only removed after the replacement is on
  // disk. The other order deleted the original png the moment a jpg
  // conversion started, and a failure then lost the game's only picture.
  const dir = await mkdtemp(join(tmpdir(), 'gamelog-store-'));
  await writeFile(join(dir, 'x.png'), Buffer.from('the picture on the shelf'));
  // A directory squatting on the temp filename makes the write fail after the
  // point where the old code had already deleted the sibling.
  await mkdir(join(dir, 'x.jpg.tmp'));

  await assert.rejects(storeImage({ type: 'image/jpeg', bytes: Buffer.from('new') }, dir, 'x'));
  assert.ok((await readdir(dir)).includes('x.png'), 'the original survives the failure');
});

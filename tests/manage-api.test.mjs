// The write API and the two local servers' defences.
//
// The manager writes real files on the owner's machine, so what these pin down
// is mostly refusals: a foreign page must not reach the API, a rebound DNS
// name must not reach either server, a dotfile must never be served, and a
// broken data file must surface as an error rather than an empty manager.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  guard, readJsonFile, parseStatusLine, filterPublishable, handleApi,
} from '../scripts/lib/manage-api.mjs';
import { hostAllowed, serveStatic } from '../scripts/lib/static.mjs';

/* --- The CSRF guard ------------------------------------------------------- */

const PORT = 4321;
const req = (headers = {}) => ({ headers });

test('the guard requires the custom header a foreign page cannot send', () => {
  assert.ok(guard(req({}), PORT), 'no header, no service');
  assert.equal(guard(req({ 'x-gamelog-manage': '1' }), PORT), null);
});

test('the guard rejects an Origin that is not this very server', () => {
  const withOrigin = (origin) => req({ 'x-gamelog-manage': '1', origin });
  assert.equal(guard(withOrigin(`http://localhost:${PORT}`), PORT), null);
  assert.equal(guard(withOrigin(`http://127.0.0.1:${PORT}`), PORT), null);
  assert.ok(guard(withOrigin('http://evil.test'), PORT));
  assert.ok(guard(withOrigin(`http://localhost:${PORT + 1}`), PORT), 'another local server is still foreign');
});

/** A stand-in http response that remembers what was sent. */
function fakeRes() {
  const res = {
    status: 0,
    body: null,
    writeHead(status) { res.status = status; return res; },
    end(body) { res.body = String(body ?? ''); return res; },
  };
  return res;
}

test('handleApi turns away an unguarded request before touching anything', async () => {
  const res = fakeRes();
  const taken = await handleApi({ url: '/api/state', method: 'GET', headers: {} }, res, { port: PORT });
  assert.equal(taken, true);
  assert.equal(res.status, 403);
});

test('handleApi leaves non-API paths to the static handler', async () => {
  const taken = await handleApi({ url: '/index.html', method: 'GET', headers: {} }, fakeRes(), { port: PORT });
  assert.equal(taken, false);
});

/* --- Host validation (DNS rebinding) --------------------------------------- */

test('only the loopback names may address a local server', () => {
  assert.equal(hostAllowed('localhost:4321', 4321), true);
  assert.equal(hostAllowed('127.0.0.1:4321', 4321), true);
  assert.equal(hostAllowed('LOCALHOST:4321', 4321), true, 'host names are case-insensitive');
  // DNS rebinding: an attacker's name resolving to 127.0.0.1 arrives with the
  // attacker's name in Host, and that is the whole tell.
  assert.equal(hostAllowed('evil.example:4321', 4321), false);
  assert.equal(hostAllowed('localhost:9999', 4321), false, 'wrong port is not this server');
  assert.equal(hostAllowed(undefined, 4321), false, 'no Host header, no service');
  assert.equal(hostAllowed('', 4321), false);
});

test('a bare loopback name only counts on the default http port', () => {
  // Browsers omit ":80" from Host, and only then.
  assert.equal(hostAllowed('localhost', 80), true);
  assert.equal(hostAllowed('localhost', 4321), false);
});

/* --- Static file refusals -------------------------------------------------- */

async function serve(url) {
  const res = fakeRes();
  await serveStatic({ url }, res);
  return res;
}

test('dotfiles are never served, whatever they hold', async () => {
  // .env carries live IGDB secrets and .git/config the remote; both sat one
  // GET away before this refusal existed.
  for (const path of ['/.env', '/.git/config', '/.claude/settings.json', '/data/.hidden']) {
    assert.equal((await serve(path)).status, 404, `${path} must 404`);
  }
});

test('a normal page is still served', async () => {
  assert.equal((await serve('/index.html')).status, 200);
});

test('an encoded traversal cannot leave the repo', async () => {
  // Encoded dots are collapsed by the URL parser before they can traverse;
  // encoded slashes are the vector that survives until decodeURIComponent.
  const res = await serve('/..%2F..%2F..%2Fetc%2Fpasswd');
  assert.equal(res.status, 403);
});

/* --- Reading data files ---------------------------------------------------- */

test('a missing file is a fresh start, and gets the fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamelog-api-'));
  const fallback = { games: [] };
  assert.equal(await readJsonFile(join(dir, 'nope.json'), fallback), fallback);
});

test('a file that exists but will not parse is an error, never the fallback', async () => {
  // The fallback here would show an empty manager over a recoverable file, and
  // the next save would overwrite someone's collection with nothing.
  const dir = await mkdtemp(join(tmpdir(), 'gamelog-api-'));
  const path = join(dir, 'collection.json');
  await writeFile(path, '{ "games": [ oops', 'utf8');
  await assert.rejects(readJsonFile(path, { games: [] }), (err) => {
    assert.match(err.message, /not valid JSON/);
    assert.match(err.message, /fix it by hand/i);
    assert.equal(err.status, 500, 'the server\'s problem, not the client\'s');
    return true;
  });
});

test('a valid file is simply read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gamelog-api-'));
  const path = join(dir, 'ok.json');
  await writeFile(path, '{"posts": [1]}', 'utf8');
  assert.deepEqual(await readJsonFile(path, null), { posts: [1] });
});

/* --- git status parsing ---------------------------------------------------- */

test('porcelain lines yield the path the change lives at', () => {
  assert.deepEqual(parseStatusLine(' M data/collection.json'),
    { state: 'M', path: 'data/collection.json' });
  assert.deepEqual(parseStatusLine('?? assets/covers/new.png'),
    { state: '??', path: 'assets/covers/new.png' });
});

test('a rename reports the new name, which is where the file is now', () => {
  assert.deepEqual(parseStatusLine('R  data/old.json -> data/new.json'),
    { state: 'R', path: 'data/new.json' });
});

test('a quoted path is unquoted, escapes and all', () => {
  assert.equal(parseStatusLine('?? "data/my file.json"').path, 'data/my file.json');
  assert.equal(parseStatusLine('?? "data/say \\"hi\\".json"').path, 'data/say "hi".json');
  // git writes non-ASCII as octal utf-8 bytes: ö is \303\266.
  assert.equal(parseStatusLine('?? "assets/covers/g\\303\\266tze.png"').path,
    'assets/covers/götze.png');
  assert.equal(parseStatusLine('R  "old name.png" -> "new name.png"').path, 'new name.png');
});

/* --- Publish pathspecs ----------------------------------------------------- */

test('publish only asks git to stage paths that can be staged', () => {
  // `git add` exits 128 on a pathspec matching nothing, which on a fresh fork
  // is most of the list -- no boxart yet, no feed.xml.
  const bases = ['data', 'assets/covers', 'assets/boxart', 'feed.xml'];
  const picked = filterPublishable(bases, {
    onDisk: (base) => base === 'data',
    tracked: [],
  });
  assert.deepEqual(picked, ['data']);
});

test('a tracked path deleted from disk is still staged, so the deletion publishes', () => {
  const picked = filterPublishable(['feed.xml', 'assets/boxart'], {
    onDisk: () => false,
    tracked: ['feed.xml', 'assets/boxart/n64-a.png'],
  });
  assert.deepEqual(picked, ['feed.xml', 'assets/boxart']);
});

test('a tracked file elsewhere does not qualify a similarly named base', () => {
  const picked = filterPublishable(['assets/box'], {
    onDisk: () => false,
    tracked: ['assets/boxart/n64-a.png'],
  });
  assert.deepEqual(picked, [], 'prefix matching stops at the path separator');
});

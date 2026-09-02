// The static file handler, shared by `npm run serve` and `npm run manage`.

import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { ROOT } from './collection.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Whether a request's Host header is this very server.
 *
 * Both local servers bind to 127.0.0.1, but DNS rebinding gets around that: a
 * page you visit resolves its own hostname to 127.0.0.1 and the browser
 * happily sends the request -- with the attacker's name in Host. Requiring the
 * loopback names (with the bound port, or bare on the default http port, which
 * is the only case a browser sends them without one) shuts that door.
 */
export function hostAllowed(host, port) {
  const names = ['localhost', '127.0.0.1'];
  const allowed = names.map((name) => `${name}:${port}`);
  if (port === 80) allowed.push(...names);
  return allowed.includes(String(host || '').toLowerCase());
}

/** A path with a dot-prefixed segment: .env, .git/config, .claude/… */
const DOTFILE = new RegExp(`(^|\\${sep})\\.`);

export async function serveStatic(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    // normalize() collapses "..", and the prefix check keeps requests inside
    // ROOT. The separator matters: without it "/GameLogOther" would pass too.
    let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    // Nothing dot-prefixed is ever served: .env holds live IGDB secrets and
    // .git/config the remote, and neither belongs to the published site.
    // 404 rather than 403, so probes learn nothing about what exists.
    if (DOTFILE.test(path.slice(ROOT.length))) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    const info = await stat(path).catch(() => null);
    if (info?.isDirectory()) path = join(path, 'index.html');

    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      // no-store, not no-cache: this server sends no ETag or Last-Modified, so
      // "revalidate" gives the browser nothing to revalidate against and it
      // keeps serving a stale file. You would edit CSS and see no change.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

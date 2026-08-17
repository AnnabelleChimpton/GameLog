// A tiny static file server for previewing locally.
//
//   npm run serve            -> http://localhost:4321
//   npm run serve -- 8080
//
// You need this rather than opening index.html directly, because the page
// fetches its JSON and loads ES modules -- both of which browsers block on
// file:// urls.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { ROOT } from './lib/collection.mjs';

const port = Number(process.argv[2]) || 4321;

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    // normalize() collapses "..", and the prefix check keeps requests inside
    // ROOT. The separator matters: without it "/GameLogOther" would pass too.
    let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
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
});

server.listen(port, () => {
  console.log(`GameLog is running at  http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});

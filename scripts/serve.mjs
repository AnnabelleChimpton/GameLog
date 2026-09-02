// A tiny static file server for previewing locally.
//
//   npm run serve            -> http://localhost:4321
//   npm run serve -- 8080
//
// You need this rather than opening index.html directly, because the page
// fetches its JSON and loads ES modules -- both of which browsers block on
// file:// urls.
//
// This one is read-only. For the editor, use `npm run manage`.

import { createServer } from 'node:http';
import { serveStatic, hostAllowed } from './lib/static.mjs';

const port = Number(process.argv[2]) || 4321;

// 127.0.0.1 rather than every interface: nothing here should be reachable from
// the rest of the network.
createServer(async (req, res) => {
  // Binding to loopback does not stop DNS rebinding -- a hostile page can
  // resolve its own name here and read files through the visitor's browser.
  // Only the loopback names may ask.
  if (!hostAllowed(req.headers.host, port)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
    return;
  }
  await serveStatic(req, res);
}).listen(port, '127.0.0.1', () => {
  console.log(`GameLog is running at  http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});

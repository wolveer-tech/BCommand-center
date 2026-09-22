import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('public');
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1:8787');
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Network-backed features are disabled in the local preview.' }));
      return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const path = resolve(root, relative);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const bytes = await readFile(path);
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.listen(8787, '127.0.0.1', () => console.log('Command Centre preview: http://127.0.0.1:8787/'));
process.on('SIGINT', () => server.close(() => process.exit(0)));

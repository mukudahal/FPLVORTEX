import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
createServer(async (req, res) => {
  try {
    const address = new URL(req.url || '/', 'http://localhost');
    if (await handleApi(req, res, address)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    const pathname = decodeURIComponent(address.pathname);
    const candidate = resolve(join(root, pathname));
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let filename = candidate;
    try {
      if (!(await stat(filename)).isFile()) filename = join(root, 'index.html');
    } catch {
      if (extname(pathname)) { res.writeHead(404).end('Not found'); return; }
      filename = join(root, 'index.html');
    }
    const bytes = await readFile(filename);
    res.writeHead(200, {
      'content-type': mime[extname(filename)] || 'application/octet-stream',
      'cache-control': extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "default-src 'self'; img-src 'self' https://resources.premierleague.com data:; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'"
    }).end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    console.error(error);
    res.writeHead(500).end('Internal server error');
  }
}).listen(port, '0.0.0.0', function () { console.log(`FPLVORTEX at http://localhost:${this.address().port}`); });
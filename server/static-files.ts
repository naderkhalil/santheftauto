import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

export async function serveStatic(req: IncomingMessage, res: ServerResponse, root = resolve('dist')) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(404); res.end(); return; }
    const original = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!original.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    let file = original, info = await stat(file), encoding = '';
    if (!info.isFile()) throw Error('Not a file');
    const accepted = (req.headers['accept-encoding'] ?? '').split(',').map(part => part.trim());
    for (const candidate of ['br', 'gzip']) {
      if (!accepted.some(part => part.split(';')[0] === candidate && !/;\s*q=0(?:\.0*)?$/.test(part))) continue;
      try { const compressed = original + (candidate === 'br' ? '.br' : '.gz'), data = await stat(compressed); if (data.isFile()) { file = compressed; info = data; encoding = candidate; break; } } catch { /* Uncompressed assets remain supported. */ }
    }
    const ext = extname(original), etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}-${encoding}"`;
    res.setHeader('ETag', etag); res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(pathname) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
    if (encoding) res.setHeader('Content-Encoding', encoding);
    res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream', 'Content-Length': info.size });
    if (req.method === 'HEAD') res.end();
    else { const stream = createReadStream(file); res.on('close', () => stream.destroy()); stream.on('error', () => res.destroy()).pipe(res); }
  } catch { if (!res.headersSent) res.writeHead(404); res.end('Not found'); }
}

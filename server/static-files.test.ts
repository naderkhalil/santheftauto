import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib';
import { serveStatic } from './static-files.ts';

const assetPath = '/assets/game-AbCd1234.js';
const asset = Buffer.from('export const game = "City Loop";\n'.repeat(80));
const html = Buffer.from('<!doctype html><title>City Loop</title>');

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'city-loop-static-'));
  const root = join(directory, 'dist');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(join(root, 'index.html'), html),
    writeFile(join(root, assetPath), asset),
    writeFile(join(root, assetPath + '.br'), brotliCompressSync(asset)),
    writeFile(join(root, assetPath + '.gz'), gzipSync(asset)),
    writeFile(join(root, 'assets', 'style-AbCd1234.css'), 'body { margin: 0; }'),
    writeFile(join(root, 'assets', 'plain.js'), asset),
    writeFile(join(root, 'assets', 'gzip-only.js'), asset),
    writeFile(join(root, 'assets', 'gzip-only.js.gz'), gzipSync(asset)),
    writeFile(join(root, '.env'), 'not public'),
    writeFile(join(directory, 'private-source.ts'), 'private source outside dist'),
  ]);
  const server = createServer((req, res) => { void serveStatic(req, res, root); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Static fixture did not start');
  return (path: string, headers: Record<string, string> = {}, method = 'GET') => new Promise<{
    status: number; headers: import('node:http').IncomingHttpHeaders; body: Buffer;
  }>((resolve, reject) => {
    // Raw HTTP preserves compressed bytes and does not normalize traversal paths.
    const req = request({ host: '127.0.0.1', port: address.port, path, method, headers, agent: false }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(3000, () => req.destroy(Error('Static request timed out')));
    req.on('error', reject);
    req.end();
  });
}

test('HTML revalidates, hashed script/style assets are immutable, and ordinary assets have a bounded cache', async t => {
  const get = await fixture(t);
  const index = await get('/?room=00123456');
  assert.equal(index.status, 200);
  assert.deepEqual(index.body, html);
  assert.equal(index.headers['cache-control'], 'no-cache');
  assert.match(index.headers['content-type']!, /^text\/html/);
  for (const path of [assetPath, '/assets/style-AbCd1234.css']) {
    assert.equal((await get(path)).headers['cache-control'], 'public, max-age=31536000, immutable');
  }
  const ordinary = await get('/assets/plain.js');
  assert.equal(ordinary.headers['cache-control'], 'public, max-age=3600');
  assert.equal(ordinary.headers['x-content-type-options'], 'nosniff');
  assert.equal(ordinary.headers['referrer-policy'], 'strict-origin-when-cross-origin');
});

test('Brotli and gzip serve the correct bytes, original MIME, encoded length, and distinct ETags', async t => {
  const get = await fixture(t);
  const plain = await get(assetPath);
  const br = await get(assetPath, { 'Accept-Encoding': 'gzip, br' });
  const gz = await get(assetPath, { 'Accept-Encoding': 'gzip' });
  for (const result of [br, gz]) {
    assert.equal(result.status, 200);
    assert.equal(result.headers.vary, 'Accept-Encoding');
    assert.match(result.headers['content-type']!, /^text\/javascript/);
    assert.equal(Number(result.headers['content-length']), result.body.length);
    assert.notEqual(result.headers.etag, plain.headers.etag);
  }
  assert.equal(br.headers['content-encoding'], 'br');
  assert.deepEqual(brotliDecompressSync(br.body), asset);
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.deepEqual(gunzipSync(gz.body), asset);
  assert.notEqual(br.headers.etag, gz.headers.etag);
});

test('compression honors q=0 and falls back when a sidecar is absent', async t => {
  const get = await fixture(t);
  const gzip = await get(assetPath, { 'Accept-Encoding': 'br;q=0, gzip' });
  assert.equal(gzip.headers['content-encoding'], 'gzip');
  for (const headers of [{ 'Accept-Encoding': 'br;q=0.000, gzip; q=0' }, { 'Accept-Encoding': 'identity' }]) {
    const plain = await get(assetPath, headers);
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.deepEqual(plain.body, asset);
  }
  const missingBr = await get('/assets/gzip-only.js', { 'Accept-Encoding': 'br, gzip' });
  assert.equal(missingBr.headers['content-encoding'], 'gzip');
  assert.deepEqual(gunzipSync(missingBr.body), asset);
  const missingBoth = await get('/assets/plain.js', { 'Accept-Encoding': 'br, gzip' });
  assert.equal(missingBoth.headers['content-encoding'], undefined);
  assert.deepEqual(missingBoth.body, asset);
});

test('conditional requests return an empty 304 only for the selected representation', async t => {
  const get = await fixture(t);
  const original = await get(assetPath, { 'Accept-Encoding': 'br' });
  const headers = { 'Accept-Encoding': 'br', 'If-None-Match': original.headers.etag! };
  const cached = await get(assetPath, headers);
  assert.equal(cached.status, 304);
  assert.equal(cached.body.length, 0);
  assert.equal(cached.headers.etag, original.headers.etag);
  assert.equal(cached.headers.vary, 'Accept-Encoding');
  assert.equal(cached.headers['cache-control'], original.headers['cache-control']);
  const differentEncoding = await get(assetPath, { ...headers, 'Accept-Encoding': 'gzip' });
  assert.equal(differentEncoding.status, 200);
  assert.deepEqual(gunzipSync(differentEncoding.body), asset);
});

test('HEAD returns GET metadata without transferring the body', async t => {
  const get = await fixture(t);
  const headers = { 'Accept-Encoding': 'br' };
  const full = await get(assetPath, headers);
  const head = await get(assetPath, headers, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  for (const name of ['content-length', 'content-type', 'content-encoding', 'cache-control', 'etag', 'vary']) {
    assert.equal(head.headers[name], full.headers[name]);
  }
});

test('missing files, directories, dotfiles, malformed paths, and traversal do not expose source', async t => {
  const get = await fixture(t);
  for (const path of ['/missing.js', '/assets/', '/.env', '/%2eenv', '/assets/../.env', '/private-source.ts', '/../private-source.ts', '/%2e%2e%2fprivate-source.ts', '/%E0%A4%A', '/src/main.ts', '/server/start.ts']) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body.includes('private source'), false, path);
    assert.equal(response.body.includes('not public'), false, path);
  }
});

test('unsupported methods are rejected with an explicit Allow header', async t => {
  const get = await fixture(t);
  const response = await get(assetPath, {}, 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
  assert.equal(response.body.length, 0);
});

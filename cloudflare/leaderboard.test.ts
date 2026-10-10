import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';

const ORIGIN = 'https://leaderboard.test';
let bundled: Promise<string> | undefined;
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'sf-leaderboard-test-'));
  bundled ??= build({ entryPoints: [resolve('cloudflare/index.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:*'], logLevel: 'silent' }).then(result => result.outputFiles![0].text);
  const config = convertV4MiniflareOptions({
    workers: [{ name: 'leaderboard-test', modules: true, script: await bundled, compatibilityDate: '2026-10-08',
      durableObjects: { ROOMS: { className: 'RaceRoom', useSQLite: true }, LEADERBOARD: { className: 'Leaderboard', useSQLite: true } },
      bindings: { PUBLIC_ORIGIN: ORIGIN, NEW_ROOMS_ENABLED: 'true' },
      ratelimits: {
        ADMISSION_LIMITER: { namespace_id: '2026101011', simple: { limit: 1000, period: 60 } },
        API_LIMITER: { namespace_id: '2026101012', simple: { limit: 10000, period: 60 } },
      },
      serviceBindings: { ASSETS: async () => new Response('static', { status: 404 }) },
    }], cf: false, log: new Log(LogLevel.ERROR), resourcePersistencePath: directory,
  });
  let mf = new Miniflare(config); await mf.ready;
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const raw = (path: string, init: any = {}) => mf.dispatchFetch(ORIGIN + path, { ...init, headers: { Origin: ORIGIN, ...init.headers } });
  const post = (path: string, value: unknown, headers: Record<string, string> = {}) => raw(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  return { raw, post,
    actor: async () => { const ns = await mf.getDurableObjectNamespace('LEADERBOARD'); return ns.get(ns.idFromName(COURSE_VERSION)); },
    restart: async () => { await mf.dispose(); mf = new Miniflare(config); await mf.ready; },
  };
}

test('public leaderboard refuses invented times and default names', async t => {
  const f = await fixture(t);
  const empty = await (await f.raw('/api/leaderboard?mode=solo')).json() as any;
  assert.equal(empty.total, 0); assert.deepEqual(empty.entries, []);
  const start = await f.post('/api/leaderboard/solo/start', { courseVersion: COURSE_VERSION });
  assert.equal(start.status, 201);
  const ticket = await start.json() as any;
  for (const name of ['', 'Racer']) {
    const response = await f.post('/api/leaderboard/solo/finish', { ...ticket, name, driver: 'mira', frames: [[.1, 1, 0, 0, 0]], timeMs: 1 });
    assert.equal(response.status, 400);
  }
  const invented = await f.post('/api/leaderboard/solo/finish', { ...ticket, name: 'Avery', driver: 'mira', frames: [[.1, 1, 0, 0, 0]], timeMs: 1 });
  assert.ok(invented.status >= 400);
  assert.equal((await (await f.raw('/api/leaderboard?mode=solo')).json() as any).total, 0);
  assert.equal((await f.post('/api/leaderboard/internal/multiplayer', {})).status, 404);
  assert.equal((await f.raw('/api/leaderboard', { headers: { Origin: 'https://foreign.example' } })).status, 403);
});

test('durable rankings survive restart, deduplicate retries and preserve ties', async t => {
  const f = await fixture(t), actor = await f.actor();
  const insert = (id: string, name: string, timeMs: number) => actor.fetch('https://internal/internal/multiplayer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, driver: 'mira', timeMs, createdAt: Date.now(), courseVersion: COURSE_VERSION }),
  });
  const first = `${crypto.randomUUID()}:0011223344556677`, second = `${crypto.randomUUID()}:1122334455667788`;
  assert.equal((await insert(first, 'Avery', 63000)).status, 200);
  assert.equal((await insert(first, 'Avery', 63000)).status, 200);
  assert.equal((await insert(second, 'Robin', 63000)).status, 200);
  await f.restart();
  const board = await (await f.raw('/api/leaderboard?mode=multiplayer&entryId=' + encodeURIComponent(first))).json() as any;
  assert.equal(board.total, 2); assert.deepEqual(board.entries.map((entry: any) => entry.rank), [1, 1]);
  assert.equal(board.own.name, 'Avery'); assert.equal(board.comparison.name, 'Robin');
  assert.equal((await (await f.raw('/api/leaderboard?mode=solo')).json() as any).total, 0);
});

test('room leaderboard submissions require an authenticated completed race', async t => {
  const f = await fixture(t);
  const placement = await (await f.post('/api/rooms/placement', {})).json() as any;
  const session = await (await f.post('/api/rooms', { idempotencyKey: placement.idempotencyKey, profile: { name: 'Avery' } })).json() as any;
  const path = `/api/rooms/${session.room.code}/leaderboard`;
  assert.equal((await f.post(path, { name: 'Avery' })).status, 401);
  assert.equal((await f.post(path, { name: 'Avery', timeMs: 1 }, { Authorization: 'Bearer ' + session.token, 'X-Room-Generation': String(session.generation) })).status, 409);
});

test('excessive socket heartbeats are rejected instead of causing unlimited writes', async t => {
  const f = await fixture(t);
  const placement = await (await f.post('/api/rooms/placement', {})).json() as any;
  const session = await (await f.post('/api/rooms', { idempotencyKey: placement.idempotencyKey, profile: { name: 'Avery' } })).json() as any;
  const response = await f.raw(`/api/rooms/${session.room.code}/input`, { headers: { Upgrade: 'websocket' } });
  assert.equal(response.status, 101);
  const socket = response.webSocket!; socket.accept();
  let ready = false, limited = false;
  socket.addEventListener('message', event => { const message = JSON.parse(String(event.data)); if (message.type === 'ready') ready = true; if (message.code === 'RATE_LIMITED') limited = true; });
  socket.send(JSON.stringify({ type: 'claim', token: session.token, generation: session.generation }));
  for (let i = 0; i < 200 && !ready; i++) await delay(10);
  assert.ok(ready);
  for (let i = 0; i < 61; i++) socket.send(JSON.stringify({ type: 'heartbeat' }));
  for (let i = 0; i < 200 && !limited; i++) await delay(10);
  assert.ok(limited);
});

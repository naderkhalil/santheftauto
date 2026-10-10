import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { LeaderboardService, LeaderboardError } from './leaderboard.ts';
import { FileLeaderboardStore, createLeaderboardApi } from './leaderboard-http.ts';
import { RoomService } from './rooms.ts';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';

function fixture(t: { after(fn: () => void): void }) {
  const directory = mkdtempSync(join(tmpdir(), 'sf1-leaderboard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'board.json');
  return { file, store: new FileLeaderboardStore(file) };
}
const known = (code: string) => (error: unknown) => error instanceof LeaderboardError && error.code === code;

test('a host-selected data path persists results across store reconstruction', t => {
  const { file } = fixture(t), previous = process.env.LEADERBOARD_DATA_FILE;
  process.env.LEADERBOARD_DATA_FILE = file;
  try {
    const service = new LeaderboardService(new FileLeaderboardStore());
    service.recordMultiplayer({ id: 'mounted:1', name: 'Mounted racer', driver: 'sam', timeMs: 20_000, createdAt: 1000, courseVersion: COURSE_VERSION });
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).entries[0].id, 'mounted:1');
    assert.equal(new LeaderboardService(new FileLeaderboardStore()).board('multiplayer').entries[0].name, 'Mounted racer');
  } finally {
    if (previous === undefined) delete process.env.LEADERBOARD_DATA_FILE;
    else process.env.LEADERBOARD_DATA_FILE = previous;
  }
});

test('all verified runs persist across reopen, with top twenty, competition ties and own nearest result', t => {
  const { file, store } = fixture(t), service = new LeaderboardService(store);
  for (let i = 0; i < 26; i++) service.recordMultiplayer({ id: 'race:' + i, name: 'Player ' + i, driver: 'sam', timeMs: 10_000 + Math.floor(i / 2) * 1000, createdAt: 100 + i, courseVersion: COURSE_VERSION });
  const restored = new LeaderboardService(new FileLeaderboardStore(file));
  const board = restored.board('multiplayer', 'race:25');
  assert.equal(board.total, 26); assert.equal(board.entries.length, 20);
  assert.deepEqual(board.entries.slice(0, 4).map(entry => entry.rank), [1, 1, 3, 3]);
  assert.equal(board.own?.rank, 25); assert.equal(board.comparison?.id, 'race:24');
  assert.equal(board.comparison?.rank, 25); assert.equal(restored.board('solo').total, 0);
  restored.recordMultiplayer({ id: 'race:25', name: 'Changed name', driver: 'sam', timeMs: 22_000, createdAt: 125, courseVersion: COURSE_VERSION });
  assert.equal(restored.board('multiplayer').total, 26);
  assert.equal(restored.board('multiplayer', 'race:25').own?.name, 'Player 25');
  assert.equal(restored.board('solo', 'race:25').own, null);
  assert.equal(restored.board('multiplayer', undefined, 15_100).comparison?.timeMs, 15_000);
});

test('solo tickets survive restart, derive time from verification, and retry without duplicate or re-verification', async t => {
  const { file, store } = fixture(t); let now = 100_000, verifications = 0;
  const service = new LeaderboardService(store, { now: () => now, verify: () => { verifications++; return { timeMs: 5000 }; } });
  const ticket = await service.start(COURSE_VERSION, 'player');
  assert.equal(readFileSync(file, 'utf8').includes(ticket.token), false);
  now += 5000;
  const resumed = new LeaderboardService(new FileLeaderboardStore(file), { now: () => now, verify: () => { verifications++; return { timeMs: 5000 }; } });
  const data = { ...ticket, name: 'Nader', driver: 'dario', frames: [], timeMs: 1 };
  const board = await resumed.finish(data, 'player');
  assert.equal(board.own?.timeMs, 5000); assert.equal(board.total, 1);
  const restarted = new LeaderboardService(new FileLeaderboardStore(file), { now: () => now, verify: () => { throw new Error('Must not replay accepted ticket'); } });
  const retried = await restarted.finish(data, 'player');
  assert.equal(retried.own?.id, ticket.runId); assert.equal(retried.total, 1); assert.equal(verifications, 1);
  assert.equal(JSON.stringify(retried).includes(ticket.token), false);
  await assert.rejects(restarted.finish({ ...data, token: 'f'.repeat(64) }, 'other'), known('INVALID_TICKET'));
});

test('unnamed, stale-course, unfinished, implausibly early and exhausted solo submissions stay off boards', async t => {
  const { store } = fixture(t); let now = 1000;
  const service = new LeaderboardService(store, { now: () => now, verify: () => ({ timeMs: 20_000 }) });
  await assert.rejects(service.start('old-course', 'player'), known('COURSE_MISMATCH'));
  const ticket = await service.start(COURSE_VERSION, 'player');
  for (const name of ['', 'Racer', ' Racer 1 ', 'x', 'x'.repeat(25)]) await assert.rejects(service.finish({ ...ticket, name, driver: 'sam', frames: [] }, 'names:' + name), known('NAME_REQUIRED'));
  await assert.rejects(service.finish({ ...ticket, name: 'Someone', driver: 'sam', frames: [] }, 'early'), known('INVALID_REPLAY'));
  now += 30_000;
  const real = new LeaderboardService(store, { now: () => now });
  for (let i = 0; i < 4; i++) await assert.rejects(real.finish({ ...ticket, name: 'Someone', driver: 'sam', frames: [], timeMs: 1 }, 'unfinished'), known('INVALID_REPLAY'));
  await assert.rejects(real.finish({ ...ticket, name: 'Someone', driver: 'sam', frames: [] }, 'unfinished'), known('TICKET_EXHAUSTED'));
  assert.equal(service.board('solo').total, 0);
  assert.throws(() => service.recordMultiplayer({ id: 'bad', name: 'Racer', driver: 'sam', timeMs: 1000, createdAt: now, courseVersion: COURSE_VERSION }), known('NAME_REQUIRED'));
});

test('ticket issue rate limit and expiry survive persistence; transaction failure keeps the previous file', async t => {
  const { file, store } = fixture(t); let now = 1000;
  const service = new LeaderboardService(store, { now: () => now });
  const ticket = await service.start(COURSE_VERSION, 'player');
  for (let i = 0; i < 9; i++) await service.start(COURSE_VERSION, 'player');
  await assert.rejects(new LeaderboardService(new FileLeaderboardStore(file), { now: () => now }).start(COURSE_VERSION, 'player'), known('RATE_LIMITED'));
  const before = readFileSync(file, 'utf8');
  assert.throws(() => store.transaction(() => { store.insert({ id: 'rollback', name: 'Player', driver: 'sam', mode: 'solo', timeMs: 5000, createdAt: now, courseVersion: COURSE_VERSION }); throw Error('fail'); }));
  assert.equal(readFileSync(file, 'utf8'), before); assert.equal(store.entry('rollback'), null);
  now += 3_600_001;
  await assert.rejects(service.finish({ ...ticket, name: 'Player', driver: 'sam', frames: [] }, 'player'), known('INVALID_TICKET'));
});

test('HTTP rejects unauthenticated multiplayer and forged solo times; only named public routes are available', async t => {
  const { store } = fixture(t), service = new LeaderboardService(store);
  const api = createLeaderboardApi({ service, rooms: new RoomService() });
  const server = createServer((req, res) => { void api.handler(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = 'http://127.0.0.1:' + address.port;
  const post = (path: string, data: unknown, headers: Record<string, string> = {}) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  const started = await post('/api/leaderboard/solo/start', { courseVersion: COURSE_VERSION }); assert.equal(started.status, 201);
  const ticket = await started.json();
  assert.equal((await post('/api/leaderboard/solo/finish', { ...ticket, name: 'Someone', driver: 'sam', frames: [], timeMs: 1 })).status, 400);
  assert.equal((await post('/api/rooms/AAAAAAAA/leaderboard', { name: 'Someone', timeMs: 1 })).status, 401);
  assert.equal((await post('/internal/multiplayer', { name: 'Someone', timeMs: 1 })).status, 404);
  assert.equal((await post('/api/leaderboard/internal/multiplayer', {})).status, 404);
  assert.equal((await post('/api/leaderboard/solo/start', { courseVersion: COURSE_VERSION }, { Origin: 'https://foreign.test' })).status, 403);
  assert.equal((await post('/api/leaderboard/solo/finish', { padding: 'x'.repeat(2 * 1024 * 1024) })).status, 413);
  assert.equal((await (await fetch(url + '/api/leaderboard?mode=solo')).json()).total, 0);
});

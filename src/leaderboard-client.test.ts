import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonText, leaderboardRequest, leaderboardTime, loadLeaderboard, SoloLeaderboardRecorder } from './leaderboard-client.ts';
import type { LeaderboardBoard, SoloRunTicket } from './leaderboard-protocol.ts';

const board: LeaderboardBoard = { courseVersion: 'city-loop-v1', mode: 'solo', total: 0, entries: [], own: null, comparison: null };
const ticket: SoloRunTicket = { runId: 'first-run', token: 'first-token', expiresAt: Date.now() + 60_000 };
const input = { throttle: .72, brake: .02, steer: -.3, drift: true, boost: true };

test('solo recording submits exact inputs and recovery in order without accepting a client finish time', async () => {
  const requests: { path: string; data: any }[] = [];
  const recorder = new SoloLeaderboardRecorder(async <T>(path: string, data?: unknown) => {
    requests.push({ path, data });
    return (path.endsWith('/start') ? ticket : board) as T;
  });
  recorder.start();
  recorder.record(0, input);
  recorder.record(1 / 59, input);
  recorder.recover();
  recorder.record(.03, { ...input, boost: false, drift: false });
  const submit = recorder.finish('sam');
  recorder.record(.04, input);
  assert.equal(await submit('  Ada  '), board);
  assert.deepEqual(requests[0], { path: '/api/leaderboard/solo/start', data: { courseVersion: 'city-loop-v1' } });
  assert.deepEqual(requests[1], { path: '/api/leaderboard/solo/finish', data: {
    runId: ticket.runId, token: ticket.token, name: 'Ada', driver: 'sam',
    frames: [[1 / 59, .72, .02, -.3, 3], [0, 0, 0, 0, 4], [.03, .72, .02, -.3, 0]],
  } });
  assert.equal('timeMs' in requests[1].data, false);
});

test('a stale start response cannot replace the restarted run’s ticket', async () => {
  const starts: ((ticket: SoloRunTicket) => void)[] = [];
  let posted: any;
  const recorder = new SoloLeaderboardRecorder(<T>(path: string, data?: unknown): Promise<T> => {
    if (path.endsWith('/start')) return new Promise<SoloRunTicket>(resolve => starts.push(resolve)) as Promise<T>;
    posted = data; return Promise.resolve(board as T);
  });
  recorder.start(); recorder.record(.1, input);
  recorder.start(); recorder.record(.2, input);
  const submit = recorder.finish('dario');
  starts[1]({ ...ticket, runId: 'second-run', token: 'second-token' });
  starts[0](ticket);
  await submit('Bea');
  assert.equal(posted.runId, 'second-run');
  assert.equal(posted.token, 'second-token');
  assert.deepEqual(posted.frames, [[.2, .72, .02, -.3, 3]]);
});

test('blank and default names never submit a leaderboard time', async () => {
  let finishes = 0;
  const recorder = new SoloLeaderboardRecorder(async <T>(path: string) => {
    if (path.endsWith('/finish')) finishes++;
    return ticket as T;
  });
  recorder.start(); recorder.record(.1, input);
  const submit = recorder.finish('sam');
  for (const name of ['', ' ', 'Racer', 'racer 2', 'A', 'x'.repeat(25)]) await assert.rejects(submit(name), /Choose your own name/);
  assert.equal(finishes, 0);
});

test('unregistered, canceled, and overlong races cannot post a partial recording', async () => {
  let finishes = 0;
  const recorder = new SoloLeaderboardRecorder(async <T>(path: string) => {
    if (path.endsWith('/finish')) finishes++;
    return ticket as T;
  });
  recorder.start(); recorder.cancel();
  await assert.rejects(recorder.finish('sam')('Ada'));
  recorder.start();
  for (let i = 0; i < 2401; i++) recorder.record(.25, input);
  await assert.rejects(recorder.finish('sam')('Ada'), /10 minutes/);
  const unavailable = new SoloLeaderboardRecorder(async () => { throw new Error('offline'); });
  unavailable.start(); unavailable.record(.1, input);
  await assert.rejects(unavailable.finish('sam')('Ada'), /at the start/);
  assert.equal(finishes, 0);
});

test('comparison labels distinguish beating, trailing, and tying a real player', () => {
  assert.equal(comparisonText(62500, { name: 'Bea', timeMs: 63000 }), '0.500s ahead of Bea');
  assert.equal(comparisonText(63123, { name: 'Bea', timeMs: 63000 }), '0.123s behind Bea');
  assert.equal(comparisonText(63000, { name: 'Bea', timeMs: 63000 }), 'Tied with Bea');
  assert.equal(leaderboardTime(63123), '1:03.123');
});

test('leaderboard reads encode mode and own entry, and malformed responses fail visibly', async t => {
  let requested = '';
  t.mock.method(globalThis, 'fetch', async (path: string) => { requested = path; return new Response(JSON.stringify(board), { status: 200 }); });
  assert.deepEqual(await loadLeaderboard('multiplayer', 63123, 'round/player'), board);
  assert.equal(requested, '/api/leaderboard?mode=multiplayer&timeMs=63123&entryId=round%2Fplayer');
  t.mock.method(globalThis, 'fetch', async () => new Response('server down', { status: 503 }));
  await assert.rejects(leaderboardRequest('/api/leaderboard'), /unavailable/);
});

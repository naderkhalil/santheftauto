import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomError, RoomService } from './rooms.ts';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { CHECKPOINTS, TRACK_LENGTH } from '../src/route.ts';

const setup = (count = 2) => {
  const service = new RoomService(), host = service.create(DEFAULT_PROFILE, 1000);
  const racers = [host];
  for (let index = 1; index < count; index++) racers.push(service.join(host.room.code, { ...DEFAULT_PROFILE, name: 'Racer ' + (index + 1) }, 1000));
  return { service, code: host.room.code, host, racers };
};
type Fixture = ReturnType<typeof setup>;
const ready = (s: Fixture, index: number, now = 1000) => {
  const racer = s.racers[index], revision = s.service.auth(s.code, racer.token).player.profileRevision;
  s.service.command(s.code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, now);
  s.service.command(s.code, racer.token, { type: 'ready', ready: true, profileRevision: revision, courseVersion: COURSE_VERSION }, now);
};
const start = (s: Fixture, now = 1000) => { s.racers.forEach((_, index) => ready(s, index, now)); s.service.command(s.code, s.host.token, { type: 'start' }, now); };
const nearFinish = (s: Fixture, index: number, distance = .1) => {
  const player = s.service.auth(s.code, s.racers[index].token).player;
  player.sim.seek(TRACK_LENGTH - distance, 0); player.sim.state.checkpoint = CHECKPOINTS.length; player.sim.state.speed = 10;
  return player;
};
const hasCode = (code: string) => (error: unknown) => error instanceof RoomError && error.code === code;

test('loading, profile revisions and admissions atomically gate Start', () => {
  const s = setup();
  assert.throws(() => s.service.command(s.code, s.host.token, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, 1100), hasCode('COURSE_MISMATCH'));
  s.racers.forEach((_, index) => ready(s, index, 1200));
  s.service.command(s.code, s.racers[1].token, { type: 'profile', profile: { ...DEFAULT_PROFILE, driver: 'jensen' }, revision: 1 }, 1250);
  assert.throws(() => s.service.command(s.code, s.racers[1].token, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, 1260), hasCode('PROFILE_CHANGED'));
  assert.throws(() => s.service.command(s.code, s.host.token, { type: 'start' }, 1270), hasCode('START_BLOCKED'));
  ready(s, 1, 1300);
  const late = s.service.join(s.code, DEFAULT_PROFILE, 1350);
  assert.throws(() => s.service.command(s.code, s.host.token, { type: 'start' }, 1400), hasCode('START_BLOCKED'));
  s.service.command(s.code, s.host.token, { type: 'remove', playerId: late.id }, 1450);
  s.service.command(s.code, s.host.token, { type: 'start' }, 1500);
  assert.equal(s.service.room(s.code).entrants.size, 2);
  assert.throws(() => s.service.join(s.code, DEFAULT_PROFILE, 1510), hasCode('RACE_STARTED'));
  assert.throws(() => s.service.command(s.code, s.racers[1].token, { type: 'profile', profile: DEFAULT_PROFILE, revision: 2 }, 1510), hasCode('RACE_STARTED'));
  assert.equal(s.service.snapshot(s.service.room(s.code), 1520).entrants.find(p => p.id === s.racers[1].id)?.profile.driver, 'jensen');
});

test('committed edits are ordered and failed loading becomes visible after 30 seconds', () => {
  const s = setup();
  s.service.command(s.code, s.host.token, { type: 'profile', profile: { ...DEFAULT_PROFILE, driver: 'jensen' }, revision: 2 }, 1100);
  assert.throws(() => s.service.command(s.code, s.host.token, { type: 'profile', profile: DEFAULT_PROFILE, revision: 1 }, 1150), hasCode('PROFILE_CHANGED'));
  s.service.command(s.code, s.host.token, { type: 'selection', status: 'loading' }, 1200);
  for (let now = 2200; now <= 31200; now += 1000) { for (const p of s.racers) s.service.touch(s.code, p.token, now); s.service.tick(now); }
  const player = s.service.auth(s.code, s.host.token).player;
  assert.equal(player.selectionStatus, 'load-failed');
  assert.equal(player.loadedCourseVersion, null);
  assert.equal(player.profile.driver, 'jensen');
  ready(s, 0, 31300); assert.equal(player.ready, true);
});

test('winner survives leaving, final result survives rematch and the next round', () => {
  const s = setup(); start(s);
  nearFinish(s, 0); s.service.tick(6050);
  const winnerTime = s.service.auth(s.code, s.host.token).player.finishTime;
  assert.ok(winnerTime !== null && winnerTime > 0 && winnerTime < .05);
  s.service.command(s.code, s.host.token, { type: 'leave' }, 6060);
  nearFinish(s, 1); s.service.tick(6100);
  const result = s.service.snapshot(s.service.room(s.code), 6100).results!;
  assert.match(result.roundId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(result.roundId, s.code + ':1');
  assert.equal(result.entries[0].id, s.host.id);
  assert.equal(result.entries[0].finishTime, winnerTime);
  assert.equal(result.entries[0].dnfReason, null);
  assert.equal(result.entries[1].place, 2);
  assert.equal(s.service.room(s.code).players.size, 1);
  const nextHost = s.racers[1];
  s.service.command(s.code, nextHost.token, { type: 'rematch' }, 6200);
  const guest = s.service.join(s.code, DEFAULT_PROFILE, 6300);
  for (const racer of [nextHost, guest]) {
    s.service.command(s.code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, 6400);
    s.service.command(s.code, racer.token, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, 6400);
  }
  s.service.command(s.code, nextHost.token, { type: 'start' }, 6500);
  const next = s.service.snapshot(s.service.room(s.code), 6500);
  assert.deepEqual(next.lastResults, result);
  assert.notEqual(next.roundId, result.roundId);
  assert.equal(next.results, null);
  assert.equal(next.entrants.length, 2);
  assert.ok(!next.entrants.some(p => p.id === s.host.id));
});

test('within-step finish timing distinguishes places and exact ties use competition ranks', () => {
  const s = setup(3); start(s);
  nearFinish(s, 0, .1); nearFinish(s, 1, .1); nearFinish(s, 2, .35);
  s.service.tick(6050);
  const snapshot = s.service.snapshot(s.service.room(s.code), 6050), result = snapshot.results!;
  assert.deepEqual(result.entries.map(e => e.place), [1, 1, 3]);
  assert.deepEqual(snapshot.entrants.map(e => e.rank), [1, 1, 3]);
  assert.deepEqual(result.entries.map(e => e.tied), [true, true, false]);
  assert.ok(result.entries.every(e => e.finishTime! < .05));
  assert.ok(result.entries[2].finishTime! > result.entries[0].finishTime!);
  assert.equal(result.entries[2].gap, Math.round((result.entries[2].finishTime! - result.entries[0].finishTime!) * 1000) / 1000);
});

test('leaving before finishing preserves a DNF row with final valid progress', () => {
  const s = setup(3); start(s);
  const departed = s.service.auth(s.code, s.racers[2].token).player;
  departed.sim.state.checkpoint = 2; departed.sim.state.progress = 1000;
  s.service.command(s.code, s.racers[2].token, { type: 'leave' }, 6010);
  nearFinish(s, 0); nearFinish(s, 1, .35); s.service.tick(6050);
  const entry = s.service.room(s.code).results!.entries[2];
  assert.equal(entry.id, s.racers[2].id); assert.equal(entry.dnfReason, 'left-race');
  assert.equal(entry.place, null); assert.equal(entry.finishTime, null);
  assert.equal(entry.checkpoint, 2); assert.equal(entry.progress, 1000);
});

test('deadline results have no invented winner and retain every DNF reason', () => {
  const s = setup(); start(s);
  s.service.disconnect(s.code, s.host.token, 6000);
  for (let now = 6000; now <= 36000; now += 1000) { s.service.touch(s.code, s.racers[1].token, now); s.service.tick(now); }
  assert.equal(s.service.room(s.code).players.size, 1);
  const room = s.service.room(s.code); room.deadline = 37000;
  s.service.touch(s.code, s.racers[1].token, 37000); s.service.tick(37000);
  assert.equal(room.phase, 'results');
  assert.equal(room.results!.entries.length, 2);
  assert.deepEqual(new Set(room.results!.entries.map(e => e.dnfReason)), new Set(['disconnected', 'time-limit']));
  assert.ok(room.results!.entries.every(e => e.place === null && e.finishTime === null && e.gap === null));
});

test('lobby disconnect clears readiness, transfers host once and preserves reconnect grace across rematch', () => {
  const s = setup(); s.racers.forEach((_, i) => ready(s, i));
  s.service.disconnect(s.code, s.host.token, 1100);
  assert.equal(s.service.room(s.code).host, s.racers[1].id);
  assert.equal(s.service.auth(s.code, s.host.token).player.ready, false);
  assert.equal(s.service.snapshot(s.service.room(s.code), 1200).players[0].reconnectUntil, 31100);
  s.service.touch(s.code, s.host.token, 1300);
  assert.equal(s.service.room(s.code).host, s.racers[1].id);
  ready(s, 0, 1400);
  s.service.command(s.code, s.racers[1].token, { type: 'start' }, 1500);
  nearFinish(s, 0); nearFinish(s, 1); s.service.tick(6550);
  s.service.disconnect(s.code, s.host.token, 6600);
  s.service.command(s.code, s.racers[1].token, { type: 'rematch' }, 6700);
  const snapshot = s.service.snapshot(s.service.room(s.code), 6700);
  assert.equal(snapshot.players[0].reconnectUntil, 36600);
  assert.ok(snapshot.players.every(p => !p.ready));
  assert.equal(snapshot.lastResults!.entries.length, 2);
  s.service.touch(s.code, s.host.token, 6800);
  assert.equal(s.service.auth(s.code, s.host.token).player.ready, false);
});

test('host removal revokes that session without banning a fresh admission', () => {
  const s = setup();
  assert.throws(() => s.service.command(s.code, s.racers[1].token, { type: 'remove', playerId: s.host.id }, 1100), /host/);
  assert.throws(() => s.service.command(s.code, s.host.token, { type: 'remove', playerId: s.host.id }, 1100), /Leave/);
  s.service.command(s.code, s.host.token, { type: 'remove', playerId: s.racers[1].id }, 1200);
  assert.throws(() => s.service.claim(s.code, s.racers[1].token, 1250), hasCode('REMOVED_FROM_ROOM'));
  const fresh = s.service.join(s.code, DEFAULT_PROFILE, 1300);
  assert.notEqual(fresh.id, s.racers[1].id); assert.equal(s.service.room(s.code).players.size, 2);
});

test('idempotent admissions recover the same room and slot, including after the start boundary', () => {
  const service = new RoomService();
  const first = service.create(DEFAULT_PROFILE, 1000, 'creation-key');
  const retried = service.create({ ...DEFAULT_PROFILE, name: 'Other' }, 1100, 'creation-key');
  assert.equal(first.id, retried.id); assert.equal(first.room.code, retried.room.code); assert.equal(service.rooms.size, 1);
  const guest = service.join(first.room.code, DEFAULT_PROFILE, 1200, 'admission-key');
  const guestRetry = service.join(first.room.code, DEFAULT_PROFILE, 1300, 'admission-key');
  assert.equal(guest.id, guestRetry.id); assert.equal(service.room(first.room.code).players.size, 2);
  for (const racer of [first, guest]) {
    service.command(first.room.code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, 1400);
    service.command(first.room.code, racer.token, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, 1400);
  }
  service.command(first.room.code, first.token, { type: 'start' }, 1500);
  assert.equal(service.join(first.room.code, DEFAULT_PROFILE, 1600, 'admission-key').id, guest.id);
  assert.throws(() => service.join(first.room.code, DEFAULT_PROFILE, 1600, 'different-key'), hasCode('RACE_STARTED'));
});

test('session takeover revokes old inputs and reconnects without letting an old stream disconnect the new claim', () => {
  const s = setup(); ready(s, 0);
  const claim = s.service.claim(s.code, s.host.token, 1100);
  assert.equal(claim.generation, s.host.generation + 1);
  assert.equal(s.service.auth(s.code, s.host.token).player.ready, false);
  assert.throws(() => s.service.command(s.code, s.host.token, { type: 'heartbeat' }, 1200, s.host.generation), hasCode('SESSION_TAKEN_OVER'));
  assert.throws(() => s.service.touch(s.code, s.host.token, 1200, s.host.generation), hasCode('SESSION_TAKEN_OVER'));
  s.service.disconnect(s.code, s.host.token, 1200, s.host.generation);
  assert.equal(s.service.auth(s.code, s.host.token).player.connected, true);
  s.service.command(s.code, s.host.token, { type: 'heartbeat' }, 1250, claim.generation);
  assert.equal(s.service.auth(s.code, s.host.token).player.lastSeen, 1250);
});

test('countdown cannot move early and disconnect does not move the shared start time', () => {
  const s = setup(); start(s);
  const before = s.service.snapshot(s.service.room(s.code), 1000).entrants.map(p => p.position);
  s.service.command(s.code, s.host.token, { type: 'input', sequence: 1, input: { throttle: 1, brake: 0, steer: 0, drift: false, boost: false } }, 5900);
  s.service.disconnect(s.code, s.racers[1].token, 5910);
  s.service.tick(5999);
  const snapshot = s.service.snapshot(s.service.room(s.code), 5999);
  assert.deepEqual(snapshot.entrants.map(p => p.position), before);
  assert.equal(snapshot.startAt, 6000); assert.equal(snapshot.phase, 'countdown');
  s.service.tick(6050);
  assert.equal(s.service.room(s.code).phase, 'racing');
  assert.equal(s.service.room(s.code).entrants.size, 2);
});

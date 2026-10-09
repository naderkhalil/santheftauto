import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomError, RoomService, type LiveRoomSession, type RoomServiceState } from './rooms.ts';
import { DrivingSimulation } from '../src/driving.ts';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { COURSE_VERSION, RECONNECT_GRACE_MS } from '../src/multiplayer-protocol.ts';
import { CHECKPOINTS, LAUNCH_ZONES, TRACK_LENGTH } from '../src/route.ts';

const code = 'AB123456';
const neutral = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false };
const input = { ...neutral, throttle: 1, steer: .25, boost: true };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const hasCode = (code: string) => (error: unknown) => error instanceof RoomError && error.code === code;
function setup(count = 2) {
  const service = new RoomService({ fixedRoomCode: code }), host = service.create(DEFAULT_PROFILE, 1000, 'creation-key');
  const racers = [host];
  for (let i = 1; i < count; i++) racers.push(service.join(code, { ...DEFAULT_PROFILE, name: `Racer ${i}` }, 1000, `join-key-${i}`));
  return { service, host, racers };
}
type Fixture = ReturnType<typeof setup>;
function ready(f: Fixture, now = 1000) {
  for (const racer of f.racers) {
    const revision = f.service.auth(code, racer.token).player.profileRevision;
    f.service.command(code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, now);
    f.service.command(code, racer.token, { type: 'ready', ready: true, profileRevision: revision, courseVersion: COURSE_VERSION }, now);
  }
}
function start(f: Fixture) { ready(f); f.service.command(code, f.host.token, { type: 'start' }, 1000); }
function restored(state: RoomServiceState, now: number, live: readonly LiveRoomSession[] = []) {
  const service = new RoomService({ fixedRoomCode: code }); service.restoreState(clone(state), now, live); return service;
}
function nearFinish(service: RoomService, token: string, distance = .1) {
  const player = service.auth(code, token).player;
  player.sim.seek(TRACK_LENGTH - distance); player.sim.state.checkpoint = CHECKPOINTS.length; player.sim.state.speed = 10;
}

test('fixed room ownership rejects collisions while Node random/prefixed ownership remains supported', () => {
  assert.throws(() => new RoomService({ fixedRoomCode: 'ab123456' }), /Fixed room/);
  assert.throws(() => new RoomService({ fixedRoomCode: code, workerId: 'CD' }), /Fixed room/);
  const f = setup();
  assert.equal(f.host.room.code, code); assert.equal(f.service.capacity, 1);
  assert.equal(f.service.create(DEFAULT_PROFILE, 1100, 'creation-key').token, f.host.token);
  assert.throws(() => f.service.create(DEFAULT_PROFILE, 1100, 'different-key'), hasCode('ROOM_EXISTS'));
  assert.equal(f.service.rooms.size, 1);
  assert.match(new RoomService().create({}, 1000).room.code, /^[A-F0-9]{8}$/);
  assert.match(new RoomService({ workerId: 'CD' }).create({}, 1000).room.code, /^CD[A-F0-9]{6}$/);
});

test('lobby roundtrip preserves live socket readiness, cosmetics, revisions, claims and admission keys', () => {
  const f = setup();
  f.service.command(code, f.host.token, { type: 'profile', profile: { ...DEFAULT_PROFILE, name: 'Saved host', driver: 'jensen' }, revision: 4 }, 1100);
  const claim = f.service.claim(code, f.host.token, 1150); ready(f, 1200);
  f.service.command(code, f.host.token, { type: 'input', sequence: 71, input }, 1250, claim.generation);
  const state = f.service.exportState(1250);
  const service = restored(state, 2000, [{ token: f.host.token, generation: claim.generation }]);
  const host = service.auth(code, f.host.token).player, guest = service.auth(code, f.racers[1].token).player;
  assert.equal(host.ready, true); assert.equal(host.readyRevision, 4); assert.equal(host.profile.driver, 'jensen');
  assert.equal(host.profile.name, 'Saved host'); assert.equal(host.generation, claim.generation); assert.equal(host.sequence, 71);
  assert.equal(host.connected, true); assert.equal(host.lastSeen, 2000); assert.equal(host.disconnectedAt, null);
  assert.deepEqual(host.input, neutral); assert.equal(host.inputAt, 0);
  assert.equal(guest.connected, false); assert.equal(guest.ready, false); assert.equal(guest.readyRevision, null);
  assert.equal(guest.disconnectedAt, 1200); assert.equal(guest.selectionStatus, 'car');
  const retried = service.create({}, 2000, 'creation-key');
  assert.equal(retried.id, f.host.id); assert.equal(retried.token, f.host.token); assert.equal(retried.generation, 1);
  assert.throws(() => service.command(code, f.host.token, { type: 'heartbeat' }, 2000, 1), hasCode('SESSION_TAKEN_OVER'));
  assert.equal(service.join(code, {}, 2000, 'join-key-1').token, f.racers[1].token);
  assert.equal(service.rooms.size, 1); assert.equal(service.room(code).players.size, 2);
  state.rooms[0].players[0].profile.name = 'Mutated checkpoint';
  assert.equal(f.service.auth(code, f.host.token).player.profile.name, 'Saved host');
  assert.equal(host.profile.name, 'Saved host');
});

test('active race restores the exact physics checkpoint and clock without offline movement or stale controls', () => {
  const f = setup(); start(f);
  for (let now = 6000; now <= 6500; now += 50) {
    f.racers.forEach(racer => f.service.command(code, racer.token, { type: 'input', sequence: now, input }, now));
    f.service.tick(now);
  }
  const old = f.service.room(code), checkpoints = f.racers.map(racer => f.service.auth(code, racer.token).player.sim.exportState());
  const service = restored(f.service.exportState(6500), 10000, f.racers);
  const room = service.room(code);
  assert.equal(room.phase, 'racing'); assert.equal(room.startAt, old.startAt); assert.equal(room.deadline, old.deadline); assert.equal(room.roundId, old.roundId);
  assert.equal(room.lastTick, 10000);
  for (let i = 0; i < f.racers.length; i++) {
    const racer = f.racers[i], player = service.auth(code, racer.token).player;
    assert.deepEqual(player.sim.exportState(), checkpoints[i]); assert.deepEqual(player.input, neutral);
    assert.equal(room.entrants.get(racer.id)!.player, player, 'membership and entrant must share the same Player');
  }
  service.tick(10000);
  for (let i = 0; i < f.racers.length; i++) {
    const player = service.auth(code, f.racers[i].token).player;
    assert.equal(player.sim.state.progress, checkpoints[i].state.progress);
    assert.equal(player.sim.state.elapsed, 4, 'race clock includes time offline');
    assert.equal(player.sequence, 6500);
  }
  service.command(code, f.host.token, { type: 'input', sequence: 6499, input }, 10010, f.host.generation);
  assert.deepEqual(service.auth(code, f.host.token).player.input, neutral, 'delayed pre-checkpoint input stays rejected');
});

test('countdown restores its original start and advances only on the next actor tick', () => {
  const f = setup(); start(f);
  const positions = f.racers.map(racer => f.service.auth(code, racer.token).player.sim.position);
  const service = restored(f.service.exportState(2000), 7500, f.racers);
  assert.equal(service.room(code).phase, 'countdown'); assert.equal(service.room(code).startAt, 6000);
  service.tick(7500);
  assert.equal(service.room(code).phase, 'racing');
  assert.deepEqual(f.racers.map(racer => service.auth(code, racer.token).player.sim.position), positions);
  assert.ok(f.racers.every(racer => service.auth(code, racer.token).player.sim.state.elapsed === 1.5));
});

test('departed entrants retain DNF progress, frozen cosmetics and revocation across an active restore', () => {
  const f = setup(3); start(f);
  const departed = f.racers[2], player = f.service.auth(code, departed.token).player;
  player.sim.seek(1000); player.sim.state.checkpoint = 2;
  f.service.command(code, departed.token, { type: 'leave' }, 6010);
  const service = restored(f.service.exportState(6020), 6100, f.racers.slice(0, 2));
  assert.equal(service.room(code).players.size, 2); assert.equal(service.room(code).entrants.size, 3);
  const entrant = service.room(code).entrants.get(departed.id)!;
  assert.equal(entrant.player.dnfReason, 'left-race'); assert.equal(entrant.player.sim.state.progress, 1000); assert.equal(entrant.player.sim.state.checkpoint, 2);
  assert.throws(() => service.claim(code, departed.token, 6100), hasCode('SESSION_EXPIRED'));
  nearFinish(service, f.host.token); nearFinish(service, f.racers[1].token, .3); service.tick(6150);
  assert.equal(service.room(code).results!.entries[2].id, departed.id);
  assert.equal(service.room(code).results!.entries[2].dnfReason, 'left-race');
});

test('final standings and last results survive restoration and rematch independently', () => {
  const f = setup(); start(f); nearFinish(f.service, f.host.token); nearFinish(f.service, f.racers[1].token, .3); f.service.tick(6050);
  const results = clone(f.service.room(code).results);
  const service = restored(f.service.exportState(6050), 6500, f.racers);
  assert.deepEqual(service.room(code).results, results); assert.deepEqual(service.room(code).lastResults, results);
  assert.ok(service.room(code).results!.entries.every(entry => entry.finishTime !== null));
  service.command(code, f.host.token, { type: 'rematch' }, 6600, f.host.generation);
  const lobby = restored(service.exportState(6600), 6800, f.racers);
  assert.equal(lobby.room(code).results, null); assert.equal(lobby.room(code).entrants.size, 0);
  assert.deepEqual(lobby.room(code).lastResults, results); assert.ok([...lobby.room(code).players.values()].every(player => !player.ready));
});

test('host removal stays revoked and draining persists across hibernation', () => {
  const f = setup();
  f.service.command(code, f.host.token, { type: 'remove', playerId: f.racers[1].id }, 1100);
  f.service.setDraining();
  const service = restored(f.service.exportState(1200), 1300, f.racers);
  assert.throws(() => service.claim(code, f.racers[1].token, 1300), hasCode('REMOVED_FROM_ROOM'));
  assert.equal(service.getHealth().draining, true); assert.equal(service.getHealth().accepting, false);
  assert.throws(() => service.join(code, {}, 1300), hasCode('SERVER_DRAINING'));
  assert.equal(service.create({}, 1300, 'creation-key').token, f.host.token, 'drain does not lose a committed retry');
});

test('original disconnect grace and room lifetime expire without being extended by repeated restoration', () => {
  const f = setup(); f.service.disconnect(code, f.racers[1].token, 1100);
  const state = f.service.exportState(1200), live = [f.host];
  const before = restored(state, 1100 + RECONNECT_GRACE_MS - 1, live);
  assert.equal(before.auth(code, f.racers[1].token).player.disconnectedAt, 1100);
  const after = restored(before.exportState(31099), 1100 + RECONNECT_GRACE_MS, live);
  assert.throws(() => after.auth(code, f.racers[1].token), hasCode('SESSION_EXPIRED'));
  const old = restored(state, 1000 + 2 * 3600000 + 1, f.racers);
  assert.equal(old.rooms.size, 0); assert.equal(old.exportState().admissions.length, 0);
  const noSockets = restored(state, 32000);
  assert.equal(noSockets.rooms.size, 0, 'a long outage cannot mint a fresh reconnect grace period');
});

test('an expired active deadline completes at the next tick without moving or inventing a finisher', () => {
  const f = setup(); start(f); f.service.tick(6100);
  const progress = f.service.auth(code, f.host.token).player.sim.state.progress;
  const service = restored(f.service.exportState(6100), 400000, f.racers);
  assert.equal(service.room(code).phase, 'racing');
  service.tick(400000);
  const results = service.room(code).results!;
  assert.equal(results.entries.length, 2); assert.ok(results.entries.every(entry => entry.place === null && entry.finishTime === null && entry.dnfReason === 'time-limit'));
  assert.equal(results.entries.find(entry => entry.id === f.host.id)!.progress, progress);
  assert.equal(service.auth(code, f.host.token).player.sim.state.elapsed, 300);
});

test('malformed or incompatible checkpoints fail atomically instead of corrupting existing rooms', () => {
  const f = setup(); ready(f);
  const state = f.service.exportState(1200), before = f.service.exportState(1200);
  const invalid: unknown[] = [null, { ...state, version: 2 }, { ...state, courseVersion: 'other-course' }];
  const nan = clone(state); nan.rooms[0].players[0].sim.state.speed = NaN; invalid.push(nan);
  const duplicate = clone(state); duplicate.rooms[0].players.push(duplicate.rooms[0].players[0]); invalid.push(duplicate);
  const wrongOwner = clone(state); wrongOwner.rooms[0].code = 'CD123456'; invalid.push(wrongOwner);
  const generation = clone(state); generation.rooms[0].players[0].generation = 0; invalid.push(generation);
  const dangling = clone(state); dangling.rooms[0].memberIds.push('0000000000000000'); invalid.push(dangling);
  for (const candidate of invalid) {
    assert.throws(() => f.service.restoreState(candidate, 1300, f.racers), /checkpoint/);
    assert.deepEqual(f.service.exportState(1200), before);
  }
});

test('driving checkpoint includes private airborne and steering state for deterministic continuation', () => {
  const first = new DrivingSimulation([], { exploration: true }), second = new DrivingSimulation([], { exploration: true });
  first.seek(LAUNCH_ZONES[0].progress - .5); first.state.speed = 40;
  first.update(.05, { ...input, steer: -.2 }); assert.equal(first.state.airborne, true);
  const checkpoint = clone(first.exportState()); assert.notEqual(checkpoint.activeLaunch, null);
  second.restoreState(checkpoint); assert.deepEqual(second.position, first.position);
  for (let i = 0; i < 15; i++) {
    first.update(.05, neutral); second.update(.05, neutral);
    assert.deepEqual(second.exportState(), first.exportState());
  }
  const before = second.exportState(), malformed = clone(before); malformed.activeLaunch = 999;
  assert.throws(() => second.restoreState(malformed), /checkpoint/); assert.deepEqual(second.exportState(), before);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomService } from './rooms.ts';
import { verifiedMultiplayerResult } from './leaderboard-result.ts';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';

function fixture() {
  const service = new RoomService();
  const session = service.create({ name: 'Avery', driver: 'mira' }, 1000);
  const { room, player } = service.auth(session.room.code, session.token, session.generation);
  room.roundId = crypto.randomUUID(); room.startAt = 1000; room.phase = 'racing';
  room.entrants.set(player.id, { player, profile: { ...player.profile }, profileRevision: player.profileRevision, order: 0 });
  return { service, session, room, player };
}

test('leaderboard times and identity come from the authenticated server result', () => {
  const f = fixture(); f.player.finishTime = 87.123;
  const result = verifiedMultiplayerResult(f.service, f.room.code, f.session.token, f.session.generation, ' Avery ', f.room.roundId);
  assert.equal(result.timeMs, 87123); assert.equal(result.name, 'Avery'); assert.equal(result.driver, 'mira');
  assert.equal(result.id, `${f.room.roundId}:${f.player.id}`); assert.equal(result.courseVersion, COURSE_VERSION);
  assert.ok(!JSON.stringify(result).includes(f.session.token)); assert.ok(!result.id.includes(f.room.code));
});

test('unfinished races, DNF, default names and foreign sessions cannot post a score', () => {
  const f = fixture();
  const submit = (name: unknown = 'Avery', token = f.session.token, generation = f.session.generation) => verifiedMultiplayerResult(f.service, f.room.code, token, generation, name);
  assert.throws(() => submit(), /completed races/);
  f.player.finishTime = 87; f.player.dnf = true;
  assert.throws(() => submit(), /completed races/);
  f.player.dnf = false;
  for (const name of ['', '   ', 'Racer', 'rAcEr', null]) assert.throws(() => submit(name), /Enter your name/);
  assert.throws(() => submit('Avery', 'invalid'), /session/);
  assert.throws(() => submit('Avery', f.session.token, 0), /Restore/);
  assert.throws(() => submit('Avery', f.session.token, f.session.generation + 1), /another tab/);
});

test('a post in flight across a rematch uses the requested completed round', () => {
  const f = fixture(), roundId = f.room.roundId!;
  f.room.lastResults = { roundId, round: 1, courseVersion: COURSE_VERSION, completedAt: 88000, entries: [
    { id: f.player.id, profile: { ...f.player.profile }, place: 1, finishTime: 87, gap: 0, tied: false, dnfReason: null, checkpoint: 4, progress: 2000 },
  ] };
  f.room.phase = 'lobby'; f.room.entrants.clear(); f.player.finishTime = null;
  const result = verifiedMultiplayerResult(f.service, f.room.code, f.session.token, f.session.generation, 'Avery', roundId);
  assert.equal(result.timeMs, 87000); assert.equal(result.createdAt, 88000);
  assert.throws(() => verifiedMultiplayerResult(f.service, f.room.code, f.session.token, f.session.generation, 'Avery', crypto.randomUUID()), /completed races/);
});

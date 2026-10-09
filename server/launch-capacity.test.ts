import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomError, RoomService } from './rooms.ts';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';

test('capacity rejects new rooms but preserves admitted retries and existing joins', () => {
  const service = new RoomService({ workerId: 'AB', maxRooms: 1, maxPlayers: 8 });
  const first = service.create({}, 1000, 'AB_first-attempt');
  assert.match(first.room.code, /^AB[A-F0-9]{6}$/);
  assert.throws(() => service.create({}, 1000, 'AB_another-attempt'), error => error instanceof RoomError && error.code === 'ROOM_CAPACITY' && error.admitted === false);
  assert.equal(service.create({}, 1000, 'AB_first-attempt').token, first.token);
  assert.equal(service.join(first.room.code, {}, 1000).room.players.length, 2);
});

test('player capacity, overload and drain preserve already admitted identities', () => {
  const service = new RoomService({ maxRooms: 3, maxPlayers: 2 });
  const host = service.create({}, 1000, 'create-first');
  const guest = service.join(host.room.code, {}, 1000, 'join-second');
  assert.throws(() => service.join(host.room.code, {}, 1000), error => error instanceof RoomError && error.code === 'ROOM_CAPACITY');
  service.setDraining();
  assert.equal(service.getHealth().accepting, false);
  assert.equal(service.create({}, 1000, 'create-first').token, host.token);
  assert.equal(service.join(host.room.code, {}, 1000, 'join-second').token, guest.token);
  assert.equal(service.claim(host.room.code, host.token, 1000).id, host.id);
  service.setDraining(false); service.setOverloaded(true);
  assert.throws(() => service.create({}, 1000), error => error instanceof RoomError && error.code === 'SERVICE_BUSY' && error.admitted === false);
});

test('drain allows ongoing races to finish but refuses a new start', () => {
  const service = new RoomService();
  const host = service.create({}, 1000), guest = service.join(host.room.code, {}, 1000);
  for (const racer of [host, guest]) {
    service.command(host.room.code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, 1000);
    service.command(host.room.code, racer.token, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, 1000);
  }
  service.setDraining();
  assert.throws(() => service.command(host.room.code, host.token, { type: 'start' }, 1000), error => error instanceof RoomError && error.code === 'SERVER_DRAINING');
  service.setDraining(false); service.command(host.room.code, host.token, { type: 'start' }, 1000); service.setDraining();
  service.tick(6050);
  assert.equal(service.room(host.room.code).phase, 'racing');
  assert.equal(service.getHealth().activeRaces, 1);
});

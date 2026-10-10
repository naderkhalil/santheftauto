import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIVERS, DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';
import { RoomService } from './rooms.ts';

test('every selectable driver survives room admission, live changes and the frozen race lineup', () => {
  const service = new RoomService();
  const host = service.create({ ...DEFAULT_PROFILE, driver: 'mira' }, 1000);
  const code = host.room.code;
  const racers = [host, ...DRIVERS.slice(1).map(driver => service.join(code, { ...DEFAULT_PROFILE, name: driver.short, driver: driver.id }, 1000))];
  assert.equal(service.snapshot(service.room(code), 1000).players[0].profile.driver, 'mira');
  racers.forEach((racer, i) => {
    service.command(code, racer.token, { type: 'profile', profile: { ...DEFAULT_PROFILE, driver: DRIVERS[i].id }, revision: 1 }, 1100);
  });
  assert.deepEqual(service.snapshot(service.room(code), 1100).players.map(player => player.profile.driver), DRIVERS.map(driver => driver.id));
  for (const racer of racers) {
    service.command(code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, 1200);
    service.command(code, racer.token, { type: 'ready', ready: true, profileRevision: 1, courseVersion: COURSE_VERSION }, 1200);
  }
  service.command(code, host.token, { type: 'start' }, 1300);
  assert.deepEqual(service.snapshot(service.room(code), 1300).entrants.map(player => player.profile.driver), DRIVERS.map(driver => driver.id));
});

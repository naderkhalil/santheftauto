import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingSimulation } from './driving.ts';
import { normalizeLeaderboardName } from './leaderboard-protocol.ts';
import { playgroundHeight } from './playground.ts';
import { CITY_LOOP_OBSTACLES, PLAYGROUND_POSTCARDS, RaceCollectibles, SKY_RINGS } from './race-replay.ts';
import { LAUNCH_ZONES, routePoint, routeProgressAt, sampleGlidePath } from './route.ts';

test('leaderboard names require an intentional bounded nickname', () => {
  for (const name of [undefined, null, 42, '', ' ', 'A', ' Racer ', 'rAcEr', 'Racer 3', 'a'.repeat(25)]) {
    assert.equal(normalizeLeaderboardName(name), null);
  }
  assert.equal(normalizeLeaderboardName(' <Ada>\u0000\u200b '), 'Ada');
  assert.equal(normalizeLeaderboardName('a'.repeat(24)), 'a'.repeat(24));
});

test('replay obstacles match the rendered City Loop parked vehicles', () => {
  assert.deepEqual(CITY_LOOP_OBSTACLES, [
    { progress: routeProgressAt(-75, 139), lateral: -3.4, width: 2.25, length: 7.2, kind: 'cablecar' },
    { progress: routeProgressAt(175, 385), lateral: 4.6, width: 1.85, length: 4.2, kind: 'car' },
    { progress: routeProgressAt(350, 700), lateral: -4.7, width: 1.85, length: 4.2, kind: 'car' },
    { progress: routeProgressAt(590, 450), lateral: 4.6, width: 1.85, length: 4.2, kind: 'car' },
  ]);
});

test('ring positions preserve the original three flights and their collection geometry', () => {
  const collector = new RaceCollectibles();
  const base = new DrivingSimulation();
  LAUNCH_ZONES.forEach((zone, zoneIndex) => [.24, .48, .73].forEach((fraction, index) => {
    const ring = SKY_RINGS[zoneIndex * 3 + index];
    const progress = zone.progress * (1 - fraction) + zone.end * fraction;
    const position = routePoint(progress, index === 1 ? (zoneIndex % 2 ? 2 : -2) : 0);
    assert.ok(Math.abs(ring.progress - progress) < 1e-9);
    assert.ok(Math.hypot(ring.x - position.x, ring.z - position.z) < 1e-9);
    assert.ok(Math.abs(ring.y - (sampleGlidePath(progress, zone) + 1.25)) < 1e-9);
    const sim = {
      state: { ...base.state, progress: ring.progress, y: ring.y - 1.03, boost: 0 },
      position: { x: ring.x, y: ring.y - 1.03, z: ring.z }, exploring: false,
    };
    assert.deepEqual(collector.update(sim), { rings: 1, postcards: 0 });
    assert.equal(sim.state.boost, .14);
    assert.deepEqual(collector.update(sim), { rings: 0, postcards: 0 });
  }));
});

test('ring crossings use the swept car position and reject jumps or misses', () => {
  const collector = new RaceCollectibles(), ring = SKY_RINGS[0], base = new DrivingSimulation();
  const sim = {
    state: { ...base.state, progress: ring.progress - 3, y: ring.y - 1.03, boost: .9 },
    position: { x: ring.x, y: ring.y - 1.03, z: ring.z - 3 }, exploring: false,
  };
  assert.equal(collector.update(sim).rings, 0);
  sim.state.progress = ring.progress + 3; sim.position.z = ring.z + 3;
  assert.equal(collector.update(sim).rings, 1);
  assert.equal(sim.state.boost, 1);
  collector.reset();
  sim.state.progress = ring.progress - 41; collector.update(sim);
  sim.state.progress = ring.progress + 3;
  assert.equal(collector.update(sim).rings, 0);
  collector.reset();
  sim.state.progress = ring.progress; sim.state.y = ring.y + 9;
  assert.equal(collector.update(sim).rings, 0);
});

test('postcards preserve proximity, elevation, one-time rewards, and reset behavior', () => {
  const collector = new RaceCollectibles(), base = new DrivingSimulation();
  const point = PLAYGROUND_POSTCARDS[0], y = playgroundHeight(point.x, point.z);
  const sim = { state: { ...base.state, y, boost: .5 }, position: { ...point, y }, exploring: false };
  assert.equal(collector.update(sim).postcards, 0);
  sim.exploring = true; sim.position.y = y + 4;
  assert.equal(collector.update(sim).postcards, 0);
  sim.position.y = y;
  assert.deepEqual(collector.update(sim), { postcards: 1, rings: 0 });
  assert.equal(sim.state.boost, .7);
  assert.equal(collector.update(sim).postcards, 0);
  collector.reset();
  assert.equal(collector.update(sim).postcards, 1);
});

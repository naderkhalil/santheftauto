import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation } from './driving.ts';
import type { DrivingRoute, DriveInput, RaceEvent } from './driving.ts';

const throttle: DriveInput = { throttle: 1, brake: 0, steer: 0, boost: false, drift: false };

/** A short, elevated eastbound course deliberately unlike Union Square. */
const route: DrivingRoute = {
  CHECKPOINTS: [40, 80, 120] as const,
  checkpointLabels: ['First custom gate', 'Second custom gate', 'Custom finish'] as const,
  LAUNCH_ZONES: [] as const,
  ROAD_HALF_WIDTH: 4,
  START_PROGRESS: 7,
  TRACK_LENGTH: 120,
  sampleRoute: progress => ({ x: 1000 + progress, y: 60, z: -300 }),
  routePoint: (progress, lateral = 0) => ({ x: 1000 + progress, y: 60, z: -300 - lateral }),
  routeYaw: () => Math.PI / 2,
  routeSlope: () => 0,
  routeCurvature: () => 0,
  routeProgressAt: x => Math.max(0, Math.min(120, x - 1000)),
  sampleGlidePath: (progress, zone) => 60 + 8 * Math.sin(Math.PI * (progress - zone.progress) / (zone.end - zone.progress)) ** 2,
  glideSlope: (progress, zone) => 8 * Math.PI * Math.sin(2 * Math.PI * (progress - zone.progress) / (zone.end - zone.progress)) / (zone.end - zone.progress),
};

function advanceUntil(sim: DrivingSimulation, done: () => boolean) {
  const events: RaceEvent[] = [];
  for (let frame = 0; frame < 1200 && !done(); frame++) events.push(...sim.update(1 / 120, throttle));
  assert.ok(done());
  return events;
}

test('an injected route controls spawn, world position, ordered gates, and the finish distance', () => {
  const sim = new DrivingSimulation([], { route });
  assert.equal(sim.state.progress, 7);
  assert.equal(sim.state.heading, Math.PI / 2);
  assert.equal(sim.state.y, 60);
  assert.deepEqual(sim.position, { x: 1007, y: 60, z: -300 });
  assert.equal(sim.groundHeight, 60);
  assert.equal(sim.nextRaceGate?.label, 'First custom gate');
  assert.equal(sim.nextRaceGate?.x, 1040);
  const events = advanceUntil(sim, () => sim.state.finished);
  assert.equal(sim.state.progress, 120);
  assert.equal(sim.state.checkpoint, 3);
  assert.deepEqual(events.filter(event => event === 'checkpoint' || event === 'finish'), ['checkpoint', 'checkpoint', 'checkpoint', 'finish']);
  assert.equal(sim.nextRaceGate, undefined);
  assert.deepEqual(sim.update(1, throttle), []);
  sim.reset();
  assert.deepEqual(sim.state, new DrivingSimulation([], { route }).state);
  assert.equal(sim.nextRaceGate?.label, 'First custom gate');
});

test('custom recovery returns to the earned gate and seeking retains race time and statistics', () => {
  const sim = new DrivingSimulation([], { route });
  advanceUntil(sim, () => sim.state.progress > 60);
  const elapsed = sim.state.elapsed;
  assert.equal(sim.state.checkpoint, 1);
  sim.state.collisions = 2;
  sim.state.distanceDrifted = 11;
  sim.recover();
  assert.equal(sim.state.progress, 43);
  assert.equal(sim.state.heading, Math.PI / 2);
  assert.equal(sim.state.y, 60);
  assert.equal(sim.state.speed, 0);
  assert.equal(sim.state.elapsed, elapsed);
  assert.equal(sim.state.collisions, 2);
  assert.equal(sim.state.distanceDrifted, 11);
  assert.equal(sim.nextRaceGate?.label, 'Second custom gate');
  sim.seek(22, -2);
  assert.deepEqual(sim.position, { x: 1022, y: 60, z: -298 });
  assert.equal(sim.state.elapsed, elapsed);
  assert.equal(sim.state.checkpoint, 1, 'retry repositioning never awards or erases gates');
  sim.recover();
  assert.equal(sim.state.progress, 43, 'seeking does not change the last earned recovery gate');
});

test('custom courses use their own curbs and cannot enter the Union Square playground', () => {
  const sim = new DrivingSimulation([], { route, exploration: true });
  assert.equal(sim.exploring, false);
  sim.explore();
  assert.equal(sim.exploring, false);
  assert.deepEqual(sim.position, { x: 1007, y: 60, z: -300 });
  sim.seek(25, 100);
  assert.equal(sim.state.lateral, 3.05);
  sim.seek(25);
  sim.state.speed = 40;
  sim.update(1, { ...throttle, steer: 1 });
  assert.ok(Math.abs(sim.state.lateral) <= 3.05);
  assert.ok(sim.state.collisions > 0);
  assert.equal(sim.groundHeight, 60);
  assert.equal(new DrivingSimulation().nextRaceGate?.label, 'Powell Street · climb the hill');
});

test('custom launch zones and flight paths remain course specific after recovery', () => {
  const flyingRoute: DrivingRoute = { ...route, LAUNCH_ZONES: [{ progress: 30, end: 70, label: 'Custom crest' }] };
  const sim = new DrivingSimulation([], { route: flyingRoute });
  const launch = () => {
    sim.seek(29.9);
    sim.state.speed = 40;
    assert.ok(sim.update(.1, throttle).includes('launch'));
    assert.equal(sim.state.airborne, true);
    assert.ok(sim.state.y > 60);
    assert.ok(sim.state.y < 68);
  };
  launch();
  sim.recover();
  assert.equal(sim.state.progress, route.START_PROGRESS);
  assert.equal(sim.state.airborne, false);
  launch();
  assert.equal(sim.state.launches, 2, 'recovery re-arms future launch zones and retains stats');
  const events = advanceUntil(sim, () => sim.state.progress >= 71);
  assert.ok(events.includes('land'));
  assert.equal(sim.state.y, 60);
  assert.equal(sim.state.airborne, false);
});

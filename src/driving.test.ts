import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation } from './driving.ts';
import type { DriveInput, RaceEvent } from './driving.ts';
import { CHECKPOINTS, ROAD_HALF_WIDTH, START_PROGRESS, TRACK_LENGTH, sampleRoute } from './route.ts';

const throttle: DriveInput = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };
const neutral: DriveInput = { ...throttle, throttle: 0 };
function drive(sim: DrivingSimulation, seconds: number, input: DriveInput = throttle, hz = 120) {
  const events: RaceEvent[] = [];
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) events.push(...sim.update(1 / hz, input));
  return events;
}

test('reset restores a fresh race, including hidden collision and boost state', () => {
  const sim = new DrivingSimulation([{ progress: 30, lateral: 0, width: 2, length: 4, kind: 'car' }]);
  const first = drive(sim, 5, { ...throttle, boost: true });
  assert.ok(first.includes('crash'));
  assert.ok(sim.state.progress > START_PROGRESS);
  sim.reset();
  assert.deepEqual(sim.state, new DrivingSimulation().state);
  assert.equal(sim.state.y, sampleRoute(START_PROGRESS).y);
  assert.ok(drive(sim, 5, { ...throttle, boost: true }).includes('crash'));
});

test('30, 60 and 120 Hz produce matching routes, handling and timers', () => {
  const states = [30, 60, 120].map(hz => {
    const sim = new DrivingSimulation();
    drive(sim, 3, throttle, hz);
    drive(sim, .5, { ...throttle, steer: .65, drift: true }, hz);
    drive(sim, 2, { ...throttle, boost: true }, hz);
    drive(sim, .5, { ...throttle, steer: -.65 }, hz);
    drive(sim, 5, throttle, hz);
    return sim.state;
  });
  for (const state of states.slice(1)) {
    for (const key of ['progress', 'lateral', 'speed', 'elapsed', 'boost', 'y', 'driftAngle'] as const) {
      assert.ok(Math.abs(state[key] - states[0][key]) < 1e-6, `${key} diverged: ${state[key]} vs ${states[0][key]}`);
    }
  }
});

test('boost is faster, depletes, recharges, and can be triggered again', () => {
  const fast = new DrivingSimulation();
  const normal = new DrivingSimulation();
  drive(fast, 3.9, { ...throttle, boost: true });
  drive(normal, 3.9);
  assert.ok(fast.state.speed > normal.state.speed + 8);
  assert.ok(fast.state.boost < .03);
  drive(fast, .1, { ...throttle, boost: true });
  assert.ok(fast.state.boost < .002);
  drive(fast, 3, throttle);
  assert.ok(fast.state.boost > .29);
  const previousBoost = fast.state.boost;
  drive(fast, .5, { ...throttle, boost: true });
  assert.ok(fast.state.boost < previousBoost);
  assert.ok(fast.state.boost >= 0 && fast.state.boost <= 1);
});

test('a long update crosses checkpoints in order and finishes exactly once', () => {
  const sim = new DrivingSimulation();
  const events = sim.update(60, throttle);
  assert.equal(sim.state.checkpoint, CHECKPOINTS.length);
  assert.equal(sim.state.finished, true);
  assert.equal(sim.state.progress, TRACK_LENGTH);
  assert.deepEqual(events.filter(event => event === 'checkpoint' || event === 'finish'), ['checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'finish']);
  assert.ok(sim.state.elapsed > 20 && sim.state.elapsed < 60);
  const finished = { ...sim.state };
  assert.deepEqual(sim.update(60, throttle), []);
  assert.deepEqual(sim.state, finished);
});

test('boost effects reflect actual power after depletion, release, braking, reset and finish', () => {
  const sim = new DrivingSimulation();
  const boost = { ...throttle, boost: true };
  assert.equal(sim.boosting, false);
  drive(sim, 1, boost);
  assert.equal(sim.boosting, true);
  drive(sim, 4, boost);
  assert.ok(sim.state.boost > .09, 'the gauge recharges while the held button remains locked');
  assert.equal(sim.boosting, false, 'recharging must not reactivate effects without releasing boost');
  sim.update(1 / 120, throttle);
  sim.update(1 / 120, boost);
  assert.equal(sim.boosting, true, 'release and repress should activate available boost');
  sim.update(1 / 120, { ...boost, brake: 1 });
  assert.equal(sim.boosting, false);
  sim.update(1 / 120, { ...boost, throttle: 0 });
  assert.equal(sim.boosting, false);
  sim.update(1 / 120, boost);
  sim.reset();
  assert.equal(sim.boosting, false);
  sim.state.progress = TRACK_LENGTH - .1;
  sim.state.speed = 40;
  sim.update(.1, boost);
  assert.equal(sim.state.finished, true);
  assert.equal(sim.boosting, false);
});

test('obstacle collision is swept, costs speed, and allows recovery', () => {
  const sim = new DrivingSimulation([{ progress: 35, lateral: 0, width: 2, length: .1, kind: 'barrier' }]);
  sim.state.speed = 58;
  const events = sim.update(.5, neutral);
  assert.ok(events.includes('crash'));
  assert.equal(sim.state.collisions, 1);
  assert.ok(sim.state.speed < 30);
  assert.ok(Math.abs(sim.state.lateral) > 1.9);
  drive(sim, 4);
  assert.ok(sim.state.progress > 100);
  assert.ok(sim.state.speed > 35);
  assert.equal(sim.state.collisions, 1);
});

test('passing an obstacle in an adjacent lane does not collide', () => {
  const sim = new DrivingSimulation([{ progress: 35, lateral: -5, width: 2, length: 4, kind: 'car' }]);
  assert.ok(!drive(sim, 5).includes('crash'));
  assert.equal(sim.state.collisions, 0);
});

test('curb impacts stay inside the road and the driver can steer away', () => {
  const sim = new DrivingSimulation();
  drive(sim, 4);
  const events = drive(sim, 3, { ...throttle, steer: 1 });
  assert.ok(events.includes('crash'));
  assert.ok(Math.abs(sim.state.lateral) <= ROAD_HALF_WIDTH - .95);
  drive(sim, 1, { ...throttle, steer: -1 });
  assert.ok(sim.state.lateral < 7);
  assert.ok(sim.state.speed > 0);
});

test('brakes stop the car, and steering cannot move a stopped car sideways', () => {
  const sim = new DrivingSimulation();
  drive(sim, 4);
  assert.ok(sim.state.speed > 40);
  drive(sim, 2, { ...neutral, brake: 1 });
  assert.equal(sim.state.speed, 0);
  const progress = sim.state.progress;
  const lateral = sim.state.lateral;
  drive(sim, 2, { ...neutral, steer: 1, brake: 1 });
  assert.equal(sim.state.progress, progress);
  assert.equal(sim.state.lateral, lateral);
});

test('hill jumps land above the road and return finite state through a full run', () => {
  const sim = new DrivingSimulation();
  let airborne = false;
  let landed = false;
  for (let i = 0; i < 7200 && !sim.state.finished; i++) {
    const events = sim.update(1 / 120, { ...throttle, boost: i < 480 });
    airborne ||= sim.state.airborne;
    landed ||= events.includes('land');
    assert.ok(sim.state.y >= sampleRoute(sim.state.progress).y - 1e-6);
    for (const value of Object.values(sim.state)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  assert.ok(airborne, 'fast descents should produce a small crest jump');
  assert.ok(landed, 'the jump must land');
  assert.ok(sim.state.finished);
});

test('invalid time and controls cannot poison the simulation', () => {
  const sim = new DrivingSimulation();
  const original = { ...sim.state };
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(sim.update(dt, throttle), []);
  assert.deepEqual(sim.state, original);
  sim.update(.5, { ...throttle, throttle: NaN, steer: Infinity, brake: -100 });
  for (const value of Object.values(sim.state)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  assert.equal(sim.state.speed, 0);
});

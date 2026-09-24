import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation } from './driving.ts';
import type { DriveInput } from './driving.ts';
import { START_PROGRESS, routeYaw } from './route.ts';

const throttle: DriveInput = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };
const neutral: DriveInput = { ...throttle, throttle: 0 };

function advance(sim: DrivingSimulation, seconds: number, input: DriveInput, hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) sim.update(1 / hz, input);
}

test('releasing the accelerator slows to a full stop without reaching a curb', () => {
  const sim = new DrivingSimulation();
  advance(sim, 1, throttle);
  const releasedAt = sim.state.progress;
  assert.ok(sim.state.speed > 10, 'the car must have meaningful momentum before release');
  advance(sim, 12, neutral);
  assert.equal(sim.state.speed, 0, 'lift-off must eventually stop the car');
  assert.equal(sim.state.collisions, 0, 'the stop must come from lift-off, not hitting a wall');
  assert.ok(sim.state.progress > releasedAt, 'the car should coast naturally before stopping');
  assert.ok(sim.state.progress - releasedAt < 65, 'lift-off should be apparent within the first block');
  const stoppedAt = sim.state.progress;
  advance(sim, 5, neutral);
  assert.equal(sim.state.progress, stoppedAt, 'a stopped car must not creep forward on its own');
});

test('holding only the accelerator cannot steer around the first corner', () => {
  const sim = new DrivingSimulation();
  const initialHeading = sim.state.heading;
  advance(sim, 20, throttle);
  assert.ok(sim.state.collisions > 0, 'missing the turn should reach the street boundary');
  assert.ok(sim.state.progress < 166, `the car drove onto Stockton without steering: ${sim.state.progress}`);
  assert.equal(sim.state.finished, false);
  assert.ok(Math.abs(sim.state.heading - initialHeading) < .02,
    'the road must not rotate the car into the turn');
});

test('steering turns the heading in the requested direction and cannot rotate a stationary car', () => {
  for (const steer of [-1, 1]) {
    const sim = new DrivingSimulation();
    const initialHeading = routeYaw(START_PROGRESS);
    assert.equal(sim.state.heading, initialHeading);
    advance(sim, 1, { ...neutral, steer });
    assert.equal(sim.state.heading, initialHeading, 'steering alone cannot spin a stationary car');
    assert.equal(sim.state.progress, START_PROGRESS);
    sim.state.speed = 12;
    advance(sim, .25, { ...throttle, steer });
    assert.ok((sim.state.heading - initialHeading) * steer > .02,
      'right should turn clockwise in city coordinates; left should turn anticlockwise');
  }
});

test('braking before the corner and deliberately steering right reaches Stockton cleanly', () => {
  const sim = new DrivingSimulation();
  let phase: 'accelerate' | 'brake' | 'approach' | 'turn' | 'exit' = 'accelerate';
  let brakingFrames = 0;
  let steeringFrames = 0;
  for (let frame = 0; frame < 2400 && sim.state.progress < 200; frame++) {
    if (phase === 'accelerate' && sim.state.progress >= 65) phase = 'brake';
    if (phase === 'brake' && sim.state.speed <= 19) phase = 'approach';
    if (phase === 'approach' && sim.state.progress >= 130) phase = 'turn';
    if (phase === 'turn' && sim.state.heading >= Math.PI - .11) phase = 'exit';
    let controls = throttle;
    if (phase === 'brake') {
      controls = { ...neutral, brake: .55 };
      brakingFrames++;
    } else if (phase === 'approach') {
      controls = { ...throttle, throttle: .3 };
    } else if (phase === 'turn') {
      controls = { ...throttle, throttle: .3, steer: .56 };
      steeringFrames++;
    } else if (phase === 'exit') {
      controls = { ...throttle, throttle: .6 };
    }
    sim.update(1 / 120, controls);
  }
  assert.ok(brakingFrames > 30 && steeringFrames > 60, 'the driver must brake and hold steering for the turn');
  assert.equal(phase, 'exit');
  assert.ok(sim.state.progress >= 200, 'a controlled right turn should continue onto Stockton');
  assert.equal(sim.state.collisions, 0, 'the first turn should be negotiable without bouncing off curbs');
  const southError = Math.atan2(Math.sin(sim.state.heading - Math.PI), Math.cos(sim.state.heading - Math.PI));
  assert.ok(Math.abs(southError) < .08, 'straightened wheels should leave the car facing south');
});

test('manual throttle, cornering and braking remain consistent at different frame rates', () => {
  const states = [30, 60, 120].map(hz => {
    const sim = new DrivingSimulation();
    advance(sim, 1.5, throttle, hz);
    advance(sim, .5, { ...throttle, steer: .35 }, hz);
    advance(sim, .5, { ...neutral, brake: .3, steer: -.35 }, hz);
    advance(sim, 6, neutral, hz);
    return sim.state;
  });
  for (const state of states.slice(1)) {
    for (const key of ['heading', 'progress', 'lateral', 'speed', 'elapsed'] as const) {
      assert.ok(Math.abs(state[key] - states[0][key]) < 1e-6,
        `${key} changed with frame rate: ${state[key]} vs ${states[0][key]}`);
    }
  }
});

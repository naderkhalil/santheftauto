import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation } from './driving.ts';
import type { DriveInput } from './driving.ts';
import { DemoAutopilot } from './autopilot.ts';
import { playgroundHeight } from './playground.ts';
import { CHECKPOINTS, ROAD_HALF_WIDTH, ROUTE_STOPS, START_PROGRESS, TRACK_LENGTH, routeProgressAt, routeYaw, sampleRoute } from './route.ts';

const gas: DriveInput = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };
const neutral: DriveInput = { ...gas, throttle: 0 };
const reverse: DriveInput = { ...neutral, brake: 1 };
function advance(sim: DrivingSimulation, seconds: number, input: DriveInput, hz = 120) {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) sim.update(1 / hz, input);
}
function until(sim: DrivingSimulation, predicate: () => boolean, input: DriveInput, seconds = 15) {
  for (let i = 0; i < seconds * 120 && !predicate(); i++) sim.update(1 / 120, input);
  assert.ok(predicate(), `did not reach destination from ${JSON.stringify(sim.position)}`);
}

test('the square and surrounding streets have independent world positions, without an asphalt clamp', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  const heading = sim.state.heading;
  until(sim, () => sim.position.x > 120, gas);
  assert.equal(sim.exploring, true);
  assert.ok(Math.abs(sim.position.z - 65) < 1e-8);
  assert.equal(sim.state.heading, heading, 'the Stockton corner cannot turn the car');
  assert.equal(sim.state.collisions, 0);
  assert.equal(sim.state.checkpoint, 0, 'going off the route cannot award a checkpoint');
});

test('a car crosses the plaza curb and climbs the south stairs onto the raised terrace', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  sim.explore();
  advance(sim, 1.15, reverse);
  assert.ok(sim.position.z < -50, 'the car must first back onto the road');
  assert.equal(sim.state.y, 22);
  let highest = 22, steepest = 0;
  for (let i = 0; i < 4 * 120 && sim.position.z < -15; i++) {
    sim.update(1 / 120, gas);
    highest = Math.max(highest, sim.state.y);
    steepest = Math.max(steepest, sim.state.surfacePitch);
    assert.ok(Math.abs(sim.state.y - playgroundHeight(sim.position.x, sim.position.z)) < 1e-9);
  }
  assert.ok(highest > 24.35, 'the tires must reach the real elevated plaza');
  assert.ok(steepest > .16, 'the body should follow the stair slope');
  assert.equal(sim.state.collisions, 0, 'the steps and curb are traversable surfaces');
  assert.equal(sim.state.airborne, false, 'ordinary steps do not deploy the hover hardware');
});

test('the solid monument stops a fast car, reverse backs out, and recovery preserves race statistics', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  sim.explore();
  advance(sim, 6, gas);
  assert.ok(sim.position.z < -6.49, 'the whole car must remain outside the monument plinth');
  assert.equal(sim.state.speed, 0);
  assert.equal(sim.state.collisions, 1, 'holding gas at a wall must not spam collisions');
  const contact = sim.position.z;
  advance(sim, 1.5, reverse);
  assert.ok(sim.position.z < contact - 8);
  assert.ok(sim.state.speed < -8);
  advance(sim, 5, neutral);
  assert.equal(sim.state.speed, 0, 'a reversing car also coasts to rest');
  const { elapsed, collisions, checkpoint, progress } = sim.state;
  sim.recover();
  assert.equal(sim.state.elapsed, elapsed);
  assert.equal(sim.state.collisions, collisions);
  assert.equal(sim.state.checkpoint, checkpoint);
  assert.ok(sim.state.progress <= progress && sim.state.progress >= progress-84, 'recovery stays on nearby road');
  assert.equal(sim.state.speed, 0);
});

test('parked cars stay solid on repeated contact and cannot be tunneled through at low frame rates', () => {
  for (const hz of [30, 60, 120]) {
    const sim = new DrivingSimulation([{ progress: 35, lateral: 0, width: 2, length: 4, kind: 'car' }], { exploration: true });
    advance(sim, 6, gas, hz);
    assert.ok(sim.position.x <= -44.09, 'contact should stop at the parked car bumper');
    assert.equal(sim.state.speed, 0);
    assert.equal(sim.state.collisions, 1);
    const impactX = sim.position.x;
    advance(sim, 1, reverse, hz);
    assert.ok(sim.position.x < impactX - 3, 'the driver can reverse out without a reset');
  }
});

test('rolling off a terrace falls under gravity and settles without deploying hover wheels', () => {
  const sim = new DrivingSimulation([], { exploration: true }); sim.explore();
  sim.state.heading = Math.PI / 2;
  until(sim, () => sim.position.x >= 20, gas);
  sim.state.speed = 0; sim.state.heading = 0;
  until(sim, () => sim.position.z >= 21.5, gas);
  sim.state.speed = 0; sim.state.heading = Math.PI / 2;
  let sawDrop = false, greatestStepDown = 0, previousY = sim.state.y;
  const events: string[] = [];
  for (let i = 0; i < 4 * 120; i++) {
    events.push(...sim.update(1 / 120, gas));
    greatestStepDown = Math.max(greatestStepDown, previousY - sim.state.y);
    previousY = sim.state.y;
    if (sim.state.airborne) {
      sawDrop = true;
      assert.equal(sim.state.glide, 0);
    }
  }
  assert.ok(sawDrop, 'the two-metre terrace edge should produce a natural short fall');
  assert.ok(greatestStepDown < .2, `a single step teleported down ${greatestStepDown} metres`);
  assert.equal(sim.state.airborne, false);
  assert.ok(Math.abs(sim.state.y - sim.groundHeight) < 1e-8);
  assert.equal(sim.state.launches, 0);
  assert.equal(events.includes('launch'), false);
});

test('a Union Square shortcut earns the Powell exit and can finish the race', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  sim.explore();
  // Move east of the actual sidewalk lamp before backing out onto Geary.
  sim.state.heading = Math.PI / 2;
  until(sim, () => sim.position.x >= 5, gas);
  sim.state.speed = 0; sim.state.heading = 0;
  until(sim, () => sim.position.z <= -65, reverse);
  // Isolate gate crossing from steering accuracy: orient the stopped car at
  // each leg, then cover every metre through the normal movement integrator.
  sim.state.speed = 0; sim.state.heading = -Math.PI / 2;
  until(sim, () => sim.position.x <= -75, gas);
  sim.state.speed = 0; sim.state.heading = 0;
  until(sim, () => sim.position.z >= 190, gas);
  assert.equal(sim.exploring, false, 'the shortcut may physically rejoin Powell');
  assert.ok(sim.state.progress > CHECKPOINTS[0], 'nearest route progress has moved past Powell');
  assert.equal(sim.state.checkpoint, 1, 'crossing Powell validates the plaza shortcut');
  const driver = new DemoAutopilot();
  const events: string[] = [];
  for (let i = 0; i < 120 * 90 && !sim.state.finished; i++) events.push(...sim.update(1 / 120, driver.input(sim.state)));
  assert.equal(events.includes('missed-gate'), false);
  assert.equal(sim.state.finished, true);
  assert.equal(sim.state.checkpoint, CHECKPOINTS.length);
});

test('the north Powell corridor can be driven back into the square', () => {
  const sim = new DrivingSimulation([], { exploration: true }), driver = new DemoAutopilot();
  for (let i = 0; i < 120 * 40 && sim.position.z < 170; i++) sim.update(1 / 120, driver.input(sim.state));
  // Slow before the crest; braking intentionally suppresses the launch.
  until(sim, () => sim.state.speed <= .1, { ...neutral, brake: 1 }, 4);
  assert.equal(sim.exploring, false);
  assert.equal(sim.state.airborne, false);
  sim.state.heading = Math.PI;
  until(sim, () => sim.exploring, gas, 8);
  assert.ok(sim.position.z < 182);
  assert.ok(Math.abs(sim.position.x + 75) < 1);
  assert.equal(sim.state.checkpoint, 1);
});

test('opening the square preserves all three glides and a legitimate complete race', () => {
  const sim = new DrivingSimulation([], { exploration: true }), driver = new DemoAutopilot();
  const events: string[] = [];
  for (let i = 0; i < 120 * 100 && !sim.state.finished; i++) events.push(...sim.update(1 / 120, driver.input(sim.state)));
  assert.equal(sim.state.finished, true);
  assert.equal(sim.state.checkpoint, CHECKPOINTS.length);
  assert.equal(sim.state.launches, 3);
  assert.equal(events.filter(event => event === 'land').length, 3);
  assert.equal(sim.state.collisions, 0);
  assert.ok(sim.state.elapsed < 70);
});

test('world driving, stair contact, reversing and steering are deterministic at30/60/120Hz', () => {
  const results = [30, 60, 120].map(hz => {
    const sim = new DrivingSimulation([], { exploration: true }); sim.explore();
    advance(sim, 1.4, reverse, hz);
    advance(sim, 4, gas, hz);
    advance(sim, 1, reverse, hz);
    advance(sim, .5, { ...reverse, steer: .3 }, hz);
    advance(sim, 5, neutral, hz);
    return { ...sim.state, ...sim.position };
  });
  for (const result of results.slice(1)) for (const key of ['x', 'y', 'z', 'speed', 'heading', 'surfacePitch', 'elapsed'] as const) {
    assert.ok(Math.abs(result[key] - results[0][key]) < 1e-7, `${key} changed with frame rate`);
  }
});

test('outdoor rail sections and cafe furniture scatter without braking the car or scoring a crash', () => {
  const sim = new DrivingSimulation([], { exploration: true }); sim.explore();
  sim.state.heading = Math.PI / 2;
  until(sim, () => sim.position.x >= 11, gas);
  sim.state.speed = 0; sim.state.heading = 0;
  until(sim, () => sim.position.z >= 18, gas);
  const rails = sim.drainPropImpacts();
  assert.equal(rails.filter(hit => hit.id.startsWith('south-stair-rail-11/')).length, 4,
    'each visible span should scatter once even though it owns several collision pieces');
  assert.ok(sim.state.speed > 40);
  assert.equal(sim.state.collisions, 0);
  assert.deepEqual(sim.drainPropImpacts(), []);
  sim.state.speed = 0; sim.state.heading = Math.PI / 2;
  until(sim, () => sim.position.x >= 38, gas);
  const furniture = sim.drainPropImpacts();
  assert.ok(furniture.some(hit => hit.id === 'cafe-table-28-18'));
  assert.ok(furniture.some(hit => hit.id.startsWith('cafe-chair-28-18-')));
  assert.ok(sim.state.speed > 28, 'furniture should not act as a brake');
  assert.equal(sim.state.collisions, 0);
  assert.equal(new Set(furniture.map(hit => hit.id)).size, furniture.length);
});

test('reversing into furniture delivers the actual backward travel impulse', () => {
  const sim = new DrivingSimulation([], { exploration: true }); sim.explore();
  sim.state.heading = Math.PI / 2;
  until(sim, () => sim.position.x >= 20, gas);
  sim.state.speed = 0; sim.state.heading = 0;
  until(sim, () => sim.position.z >= 18, gas);
  sim.drainPropImpacts();
  sim.state.speed = 0; sim.state.heading = -Math.PI / 2;
  until(sim, () => sim.position.x >= 31, reverse);
  const hit = sim.drainPropImpacts().find(hit => hit.id === 'cafe-table-28-18');
  assert.ok(hit);
  assert.ok(sim.state.speed < 0);
  assert.ok(hit.vx > 8, 'the car faces west but its reverse impulse travels east');
  assert.ok(Math.abs(hit.vz) < 1e-8);
  assert.ok(hit.speed > 8 && hit.speed <= 10);
  assert.equal(sim.state.collisions, 0);
});

test('recovery preserves displaced props and a new run restores them', () => {
  const sim = new DrivingSimulation([], { exploration: true }); sim.explore();
  sim.state.heading = Math.PI / 2;
  until(sim, () => sim.position.x >= 11, gas);
  sim.state.speed = 0; sim.state.heading = 0;
  until(sim, () => sim.position.z >= -18, gas);
  const first = sim.drainPropImpacts().map(hit => hit.id);
  assert.equal(first.length, 4);
  const driveFromStartToRail = () => {
    const driver = new DemoAutopilot(), geary = routeProgressAt(11, -65);
    for (let i = 0; i < 120 * 25 && sim.state.progress < geary; i++) sim.update(1 / 120, driver.input(sim.state));
    assert.ok(sim.state.progress >= geary);
    sim.state.speed = 0; sim.state.heading = 0;
    until(sim, () => sim.position.z >= -18, gas);
  };
  sim.recover(); driveFromStartToRail();
  assert.equal(sim.drainPropImpacts().filter(hit => first.includes(hit.id)).length, 0);
  sim.reset(); driveFromStartToRail();
  assert.equal(sim.drainPropImpacts().filter(hit => first.includes(hit.id)).length, 4);
  sim.reset();
  assert.deepEqual(sim.drainPropImpacts(), []);
});

test('props behind a solid terrace wall cannot be knocked by attempted blocked movement', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  until(sim, () => sim.position.x >= 28, gas);
  sim.state.speed = 0;
  sim.state.heading = Math.PI;
  advance(sim, 5, gas);
  assert.ok(sim.position.z > 43, 'the raised north garden and its retaining face remain solid');
  assert.equal(sim.state.speed, 0);
  assert.equal(sim.drainPropImpacts().some(hit => hit.id.startsWith('cafe-table-') || hit.id.startsWith('cafe-chair-')), false);
});

test('glancing along a building retains tangential speed without turning the car', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  sim.state.heading = Math.PI / 2 - .55;
  until(sim, () => sim.state.collisions > 0, gas);
  const p = sim.position, heading = sim.state.heading, speed = sim.state.speed;
  advance(sim, .5, gas);
  assert.ok(sim.position.x > p.x + 10, 'the car should slide down the facade, not stick to it');
  assert.ok(sim.state.speed > speed && sim.state.speed > 25);
  assert.ok(sim.position.z < 79.1, 'the whole car must stay outside the building');
  assert.equal(sim.state.heading, heading, 'contact must not supply steering');
  assert.equal(sim.state.collisions, 1, 'one sustained scrape should not repeat the impact');
});

test('the district boundary permits sliding and steering away without a reset', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  until(sim, () => sim.position.x >= 183, gas);
  sim.state.heading = .2; sim.state.speed = 25;
  advance(sim, 2, gas);
  assert.ok(sim.position.z > 130, 'the boundary should preserve northbound momentum');
  assert.ok(sim.position.x < 185.66);
  assert.ok(sim.state.speed > 40);
  assert.equal(sim.state.heading, .2);
  const x = sim.position.x;
  advance(sim, .4, { ...gas, steer: -1 });
  assert.ok(sim.position.x < x - 1.5, 'a small deliberate turn should leave the boundary');
  assert.ok(sim.state.speed > 35);
});

test('road-edge scrapes outside the square stay responsive and frame-rate independent', () => {
  const states = [30, 60, 120].map(hz => {
    const sim = new DrivingSimulation();
    sim.state.progress = ROUTE_STOPS.embarcadero;
    sim.state.lateral = ROAD_HALF_WIDTH - 1;
    sim.state.heading = routeYaw(sim.state.progress) + .22;
    sim.state.y = sampleRoute(sim.state.progress).y;
    sim.state.speed = 30;
    advance(sim, 1, gas, hz);
    assert.ok(sim.state.progress > ROUTE_STOPS.embarcadero + 30);
    assert.ok(sim.state.speed > 35);
    assert.equal(sim.state.heading, routeYaw(ROUTE_STOPS.embarcadero) + .22);
    const atSpeed = { ...sim.state };
    advance(sim, 14, neutral, hz);
    assert.equal(sim.state.speed, 0, 'releasing gas must still stop a scraping car');
    return atSpeed;
  });
  for (const state of states.slice(1)) for (const key of ['speed', 'progress', 'lateral', 'heading'] as const) {
    assert.ok(Math.abs(state[key] - states[0][key]) < 1e-8, `${key} changed with frame rate`);
  }
});


test('Ferry finish completes across lanes and frame rates, or recovers missing gates without resetting time', () => {
  for (const hz of [30, 60, 120]) {
    for (const lateral of [-5.5, 0, 5.5]) {
      const sim = new DrivingSimulation([], { exploration: true }), driver = new DemoAutopilot();
      for (let i = 0; i < hz * 100 && sim.state.checkpoint < 3; i++) sim.update(1 / hz, driver.input(sim.state));
      assert.equal(sim.state.checkpoint, 3);
      sim.seek(TRACK_LENGTH - 4, lateral);
      sim.state.speed = 20;
      const events: string[] = [];
      for (let i = 0; i < hz * 2 && !sim.state.finished; i++) events.push(...sim.update(1 / hz, gas));
      assert.equal(sim.state.finished, true, `${hz} Hz / lane ${lateral}`);
      assert.equal(sim.state.checkpoint, 4);
      assert.equal(events.filter(e => e === 'finish').length, 1);
      assert.equal(events.includes('missed-gate'), false);
    }
  }
  const sim = new DrivingSimulation([], { exploration: true });
  sim.seek(TRACK_LENGTH - 1); sim.state.speed = 20; sim.state.elapsed = 50;
  const events = sim.update(.1, gas);
  assert.ok(events.includes('missed-gate'));
  assert.equal(sim.state.finished, false);
  assert.ok(sim.state.elapsed >= 50);
  const driver = new DemoAutopilot();
  for (let i = 0; i < 120 * 100 && !sim.state.finished; i++) sim.update(1 / 120, driver.input(sim.state));
  assert.equal(sim.state.finished, true, 'a returned driver can complete the entire route');
});

test('untimed exploration can finish at the Ferry Building without race gates', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  sim.explore(true); sim.seek(TRACK_LENGTH - 1); sim.state.speed = 20;
  assert.ok(sim.update(.1, gas).includes('finish'));
  assert.equal(sim.state.finished, true);
  assert.equal(sim.state.checkpoint, 0);
  sim.reset(); sim.seek(TRACK_LENGTH - 1); sim.state.speed = 20;
  assert.ok(sim.update(.1, gas).includes('missed-gate'), 'reset restores race checkpoint rules');
});

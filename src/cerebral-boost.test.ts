import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourseRoute } from './course-route.ts';
import { COURSES } from './courses.ts';
import { DrivingSimulation, type DriveInput } from './driving.ts';

const gas: DriveInput = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };
const flatCourse = {
  ...COURSES[0], terrainHeight: undefined, roadHalfWidth: 6.4,
  points: [{ x: 0, y: 10, z: 0, label: 'Start' }, { x: 0, y: 10, z: 500, label: 'Finish' }],
  launches: [], boosts: [], widths: [],
};

test('a park run-up accelerator respects its lower target speed at full throttle', () => {
  const route = createCourseRoute({ ...flatCourse, boosts: [{
    from: 0, to: 0, startOffset: 20, endOffset: 40,
    label: 'Skyline Run-up', speed: 36, duration: 1.5, halfWidth: 2.8,
  }] });
  const sim = new DrivingSimulation([], { route });
  sim.seek(15); sim.state.speed = 28;
  let collected = false, peak = 0, duration = 0;
  for (let frame = 0; frame < 180; frame++) {
    if (sim.update(1 / 120, gas).includes('boost-pad')) collected = true;
    if (!collected) continue;
    if (sim.state.surge === 0) break;
    duration += 1 / 120;
    peak = Math.max(peak, sim.state.speed);
    assert.ok(sim.state.speed <= 36 + 1e-8, `run-up overshot its target: ${sim.state.speed}`);
  }
  assert.equal(collected, true);
  assert.ok(duration > 1.3, 'check the full surge, not just its initial impulse');
  assert.ok(peak >= 35.9, 'the strip still accelerates the car to its target');

  // A faster approach should shed excess momentum over time, not snap down.
  const fast = new DrivingSimulation([], { route });
  fast.seek(17); fast.state.speed = 52;
  while (!fast.update(1 / 120, gas).includes('boost-pad')) {
    assert.ok(fast.state.progress < 20, 'the accelerator must be collected');
  }
  const entrySpeed = fast.state.speed;
  fast.update(1 / 120, gas);
  assert.ok(fast.state.speed > 36);
  assert.ok(fast.state.speed <= entrySpeed);
  assert.ok(entrySpeed - fast.state.speed <= 24 / 120 + 1e-8);
});

test('recovering from flight clamps the car to the destination path width', () => {
  const route = createCourseRoute({
    ...flatCourse,
    launches: [{ from: 0, to: 0, startOffset: 100, endOffset: 200, label: 'Glide', halfWidth: 7, minSpeed: 24 }],
    widths: [{ from: 0, to: 0, startOffset: 20, endOffset: 70, halfWidth: 4.2 }],
  });
  const sim = new DrivingSimulation([], { route });
  sim.seek(99.8); sim.state.speed = 35;
  assert.ok(sim.update(1 / 60, gas).includes('launch'));
  assert.equal(sim.state.airborne, true);
  sim.seek(40, 6);
  assert.equal(sim.state.airborne, false);
  assert.equal(sim.state.lateral, 4.2 - .95);
  assert.equal(sim.state.y, 10);
  assert.equal(sim.state.surge, 0);
});

test('the Alamo flight corridor narrows smoothly into the actual landing path', () => {
  const route = createCourseRoute(COURSES.find(course => course.id === 'cerebral-valley')!);
  const zone = route.LAUNCH_ZONES[0], sim = new DrivingSimulation([], { route });
  sim.seek(zone.progress - .2, 5.8); sim.state.speed = 35;
  let launched = false, landed = false, largestLateralStep = 0;
  for (let frame = 0; frame < 120 * 10 && sim.state.progress < zone.end + 8; frame++) {
    const before = sim.state.lateral;
    const events = sim.update(1 / 120, gas);
    launched ||= events.includes('launch');
    landed ||= events.includes('land');
    largestLateralStep = Math.max(largestLateralStep, Math.abs(sim.state.lateral - before));
  }
  assert.ok(launched && landed);
  assert.ok(sim.state.progress >= zone.end + 8, 'check beyond the outgoing path width transition');
  assert.ok(largestLateralStep < .1, `landing pulled the car sideways by ${largestLateralStep} m in one step`);
  assert.ok(Math.abs(sim.state.lateral) <= route.roadHalfWidth!(sim.state.progress) - .95 + 1e-8);
});

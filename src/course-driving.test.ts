import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation, steeringCurvature } from './driving.ts';
import type { DriveInput, DriveState, DrivingRoute } from './driving.ts';
import { createCourseRoute } from './course-route.ts';
import { COURSES } from './courses.ts';
import { FogChallenge } from './fog-challenge.ts';
import { cerebralGroundHeight } from './cerebral-geography.ts';

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

test('Cerebral road-mode driving keeps the car on measured lateral ground after seeking and finishing', () => {
  const route = createCourseRoute(COURSES.find(course => course.id === 'cerebral-valley')!);
  const stopped: DriveInput = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false };
  const nearGround = (sim: DrivingSimulation) => {
    const position = sim.position;
    assert.ok(Math.abs(position.y - cerebralGroundHeight(position.x, position.z)) < 1e-8,
      'the rendered simulation position must follow ground beneath its actual lateral position');
  };
  for (const lateral of [-5, 5]) {
    const sim = new DrivingSimulation([], { route });
    sim.seek(1437, lateral); // Fulton's real cross-slope differs by up to 81 cm.
    assert.ok(Math.abs(sim.position.y - route.sampleRoute(1437).y) > (lateral > 0 ? .75 : .1));
    nearGround(sim);
    sim.update(1 / 60, stopped);
    nearGround(sim);

    sim.seek(route.TRACK_LENGTH - .2, lateral);
    sim.state.speed = 6;
    sim.update(.1, stopped);
    assert.equal(sim.state.finished, true);
    nearGround(sim);
    assert.equal(sim.state.altitude, 0);
  }
});

/** Test driver supplies the same pedal/steering inputs as a human. Never seeks. */
function guidedInput(route: DrivingRoute, state: DriveState, targetLateral = 0): DriveInput {
  const { progress, speed, lateral, heading } = state;
  let targetSpeed = 44;
  for (let ahead = 0; ahead <= 90; ahead += 2) {
    const curve = Math.abs(route.routeCurvature(progress + ahead));
    if (curve < .001) continue;
    const cornerSpeed = Math.min(23, 1.4 / curve);
    targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed ** 2 + 40 * Math.max(0, ahead - 7)));
  }
  const speedError = targetSpeed - speed;
  const desiredHeading = route.routeYaw(progress) + clamp(Math.atan2((targetLateral - lateral) * 2.5, Math.max(speed, 8)), -.38, .38);
  const headingError = angle(desiredHeading - heading);
  const curvature = route.routeCurvature(progress + speed * .1);
  const forwardRatio = Math.max(.4, Math.cos(angle(heading - route.routeYaw(progress)))) / Math.max(.4, 1 - curvature * lateral);
  const desiredCurvature = curvature * forwardRatio + headingError * 4 / Math.max(speed, 5);
  return {
    throttle: clamp(.37 + speedError * .32, 0, 1), brake: clamp(-speedError * .17, 0, 1),
    steer: clamp(desiredCurvature / steeringCurvature(speed), -1, 1), drift: false, boost: false,
  };
}

test('Hawk Hill retains race time after missing fog, then clears all beacons and finishes', () => {
  const course = COURSES.find(course => course.id === 'hawk-hill')!;
  const route = createCourseRoute(course);
  const start = course.fog!.start * route.TRACK_LENGTH;
  const fog = new FogChallenge(start, course.fog!.end * route.TRACK_LENGTH);
  const sim = new DrivingSimulation([], { route });
  const dt = 1 / 60;
  let missed = false;
  for (let frame = 0; frame < 60 * 200 && !missed; frame++) {
    const previous = sim.state.progress, previousLateral = sim.state.lateral;
    sim.update(dt, guidedInput(route, sim.state));
    const event = fog.update(previous, sim.state.progress, sim.state.lateral, previousLateral);
    if (event === 'retry') missed = true;
    assert.equal(sim.state.finished, false, 'the missed beacon occurs before the race finish');
  }
  assert.ok(missed, 'driving straight through fog must require a retry');
  const elapsed = sim.state.elapsed, checkpoints = sim.state.checkpoint;
  sim.seek(start - 8);
  fog.reset();
  assert.equal(sim.state.elapsed, elapsed);
  assert.equal(sim.state.checkpoint, checkpoints);
  assert.equal(sim.state.progress, start - 8);
  let collected = 0;
  let fogCleared = false;
  for (let frame = 0; frame < 60 * 200 && !sim.state.finished; frame++) {
    const previous = sim.state.progress, previousLateral = sim.state.lateral;
    const targetLateral = fog.nextBeacon?.lateral ?? 0;
    const raceEvents = sim.update(dt, guidedInput(route, sim.state, targetLateral));
    const fogEvent = fog.update(previous, sim.state.progress, sim.state.lateral, previousLateral);
    assert.notEqual(fogEvent, 'retry', 'all fog gates are reachable with ordinary steering');
    if (fogEvent === 'beacon' || fogEvent === 'complete') collected++;
    if (fogEvent === 'complete') fogCleared = true;
    if (raceEvents.includes('finish')) assert.ok(fogCleared, 'clear the fog before completing Hawk Hill');
  }
  assert.equal(collected, 3);
  assert.equal(fog.complete, true);
  assert.equal(sim.state.finished, true);
  assert.equal(sim.state.checkpoint, route.CHECKPOINTS.length);
  assert.ok(sim.state.elapsed > elapsed);
  assert.equal(sim.state.collisions, 0);
});

for (const course of COURSES) {
  test(`${course.name} is manually driveable through all ordered gates at 30, 60, and 120 Hz`, () => {
    const route = createCourseRoute(course);
    const times: number[] = [];
    for (const hz of [30, 60, 120]) {
      const sim = new DrivingSimulation([], { route });
      let checkpoints = 0, finishes = 0;
      for (let frame = 0; frame < hz * 300 && !sim.state.finished; frame++) {
        const events = sim.update(1 / hz, guidedInput(route, sim.state));
        checkpoints += events.filter(event => event === 'checkpoint').length;
        finishes += events.filter(event => event === 'finish').length;
        assert.ok(Number.isFinite(sim.state.y));
        assert.ok(Math.abs(sim.state.lateral) <= route.ROAD_HALF_WIDTH - .95 + 1e-8);
      }
      assert.equal(sim.state.finished, true, `${hz} Hz stuck at ${sim.state.progress.toFixed(1)} / ${route.TRACK_LENGTH.toFixed(1)} m`);
      assert.equal(sim.state.progress, route.TRACK_LENGTH);
      assert.equal(sim.state.checkpoint, route.CHECKPOINTS.length);
      assert.equal(checkpoints, route.CHECKPOINTS.length);
      assert.equal(finishes, 1);
      assert.equal(sim.state.collisions, 0, 'the authored corners can be driven without wall assistance');
      times.push(sim.state.elapsed);
    }
    assert.ok(Math.max(...times) - Math.min(...times) < .6, `frame-rate finish times diverged: ${times}`);
  });
}

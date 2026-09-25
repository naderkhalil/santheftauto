import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from './courses.ts';
import { createCourseRoute, type CourseRoute } from './course-route.ts';
import { DrivingSimulation, steeringCurvature, type DriveInput, type DriveState } from './driving.ts';
import { cerebralGroundHeight } from './cerebral-geography.ts';

const course = COURSES.find(course => course.id === 'cerebral-valley')!;
const route = createCourseRoute(course);
const clamp = (value:number, low:number, high:number) => Math.min(high, Math.max(low, value));
const angle = (value:number) => Math.atan2(Math.sin(value), Math.cos(value));
const gas: DriveInput = { throttle: 1, brake: 0, steer: 0, boost: false, drift: false };

/** Ordinary controller inputs only. Small sweeping bends can be taken at speed;
 * the park entry and street corners require braking. Flight steers laterally. */
function adventureInput(route: CourseRoute, state: DriveState): DriveInput {
  if (state.airborne) return { ...gas, steer: clamp(-state.lateral * .5, -1, 1) };
  const pad = [...(route.BOOST_ZONES ?? [])].reverse().find(zone => state.progress >= zone.progress - 2.2);
  let targetSpeed = state.surge > 0 ? pad?.speed ?? 44 : 44;
  for (let ahead = 0; ahead <= 140; ahead += 2) {
    const progress = state.progress + ahead, curvature = Math.abs(route.routeCurvature(progress));
    if (curvature < .001) continue;
    const bend = Math.abs(angle(route.routeYaw(progress + 12) - route.routeYaw(progress - 12)));
    if (bend < .55) continue;
    const cornerSpeed = Math.min(23, 1.4 / curvature);
    targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed ** 2 + 40 * Math.max(0, ahead - 7)));
  }
  const speedError = targetSpeed - state.speed;
  const desiredHeading = route.routeYaw(state.progress) + clamp(Math.atan2(-state.lateral * 2.5, Math.max(state.speed, 8)), -.38, .38);
  const headingError = angle(desiredHeading - state.heading);
  const curvature = route.routeCurvature(state.progress + state.speed * .1);
  const forwardRatio = Math.max(.4, Math.cos(angle(state.heading - route.routeYaw(state.progress)))) / Math.max(.4, 1 - curvature * state.lateral);
  const desiredCurvature = curvature * forwardRatio + headingError * 4 / Math.max(state.speed, 5);
  return {
    throttle: clamp(.37 + speedError * .32, 0, 1), brake: clamp(-speedError * .17, 0, 1),
    steer: clamp(desiredCurvature / steeringCurvature(state.speed), -1, 1), drift: false, boost: false,
  };
}

test('rainbow strips are physical, trigger once, and braking or reset clears their surge', () => {
  const pad = route.BOOST_ZONES![0];
  const sim = new DrivingSimulation([], { route });
  sim.seek(pad.progress - 12);sim.state.speed = 20;
  let collected = 0, peak = 0;
  for (let frame = 0; frame < 180 && sim.state.progress < pad.end + 10; frame++) {
    collected += sim.update(1 / 60, gas).filter(event => event === 'boost-pad').length;
    peak = Math.max(peak, sim.state.speed);
  }
  assert.equal(collected, 1);
  assert.ok(peak > 65 && sim.state.surge > 0);
  sim.update(1 / 60, { ...gas, throttle: 0, brake: 1 });
  assert.equal(sim.state.surge, 0);
  sim.reset();assert.equal(sim.state.surge, 0);
  sim.seek(pad.progress - 12);sim.state.speed = 20;
  let recollected = 0;
  for (let frame = 0; frame < 120 && sim.state.progress < pad.end; frame++) recollected += sim.update(1 / 60, gas).filter(event => event === 'boost-pad').length;
  assert.equal(recollected, 1, 'a new race can collect the strip again');

  const bypass = new DrivingSimulation([], { route });
  bypass.seek(pad.progress - 12, 5);bypass.state.speed = 20;
  const events: string[] = [];
  for (let frame = 0; frame < 180 && bypass.state.progress < pad.end + 10; frame++) events.push(...bypass.update(1 / 60, gas));
  assert.ok(!events.includes('boost-pad'), 'driving alongside the coloured strip cannot collect it');
  assert.equal(bypass.state.surge, 0);
});

test('the full Hayes sprint, skyline launch and landing finish at 30, 60 and 120 Hz', () => {
  assert.equal(route.LAUNCH_ZONES.length, 1);
  assert.equal(route.BOOST_ZONES!.length, 3);
  const times: number[] = [];
  for (const hz of [30, 60, 120]) {
    const sim = new DrivingSimulation([], { route });
    let pads = 0, launches = 0, landings = 0, finishes = 0, peakSpeed = 0, peakAltitude = 0;
    for (let frame = 0; frame < hz * 180 && !sim.state.finished; frame++) {
      const events = sim.update(1 / hz, adventureInput(route, sim.state));
      pads += events.filter(event => event === 'boost-pad').length;
      launches += events.filter(event => event === 'launch').length;
      landings += events.filter(event => event === 'land').length;
      finishes += events.filter(event => event === 'finish').length;
      peakSpeed = Math.max(peakSpeed, sim.state.speed);
      peakAltitude = Math.max(peakAltitude, sim.state.altitude);
      assert.ok(Number.isFinite(sim.position.y));
      if (!sim.state.airborne) assert.ok(Math.abs(sim.position.y - cerebralGroundHeight(sim.position.x, sim.position.z)) < 1e-7);
    }
    assert.equal(sim.state.finished, true, `${hz} Hz stopped at ${sim.state.progress} m`);
    assert.equal(pads, 3, `${hz} Hz should collect both Hayes pads and the park run-up`);
    assert.equal(launches, 1, `${hz} Hz reaches launch speed on the crest`);
    assert.equal(landings, 1);
    assert.equal(finishes, 1);
    assert.ok(peakSpeed > 70, `${hz} Hz: Hayes reaches sprint speed, got ${peakSpeed}`);
    assert.ok(peakAltitude > 12, `${hz} Hz: the skyline glide provides a real elevated vista`);
    assert.equal(sim.state.checkpoint, route.CHECKPOINTS.length);
    assert.equal(sim.state.collisions, 0, `${hz} Hz: no corner needs wall assistance`);
    assert.equal(sim.state.airborne, false);
    assert.equal(sim.state.glide, 0);
    times.push(sim.state.elapsed);
  }
  assert.ok(Math.max(...times) - Math.min(...times) < .8, `frame-rate finish times diverged: ${times}`);
});

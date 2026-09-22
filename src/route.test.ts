import test from 'node:test';
import assert from 'node:assert/strict';
import { LAUNCH_ZONES, ROUTE_STOPS, TRACK_LENGTH, groundHeight, routeFrame, routePoint, routeProgressAt, sampleRoute } from './route.ts';
import { CityTour } from './tour.ts';

const near = (a: number, b: number, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);

test('the lap follows Post, Stockton, Geary and Powell before Bush and Grant', () => {
  const stations = [
    [0, 0, 65, 1, 0], [1, 75, 0, 0, -1], [2, 0, -65, -1, 0],
    [3, -75, 0, 0, 1], [4, -75, 150, 0, 1], [5, 0, 300, 1, 0],
    [6, 175, 400, 0, 1], [7, 350, 700, 1, 0], [8, 590, 500, 0, -1], [9, 640, 250, 1, 0],
  ];
  let previous = -1;
  for (const [, x, z, dx, dz] of stations) {
    const s = routeProgressAt(x, z), frame = routeFrame(s);
    assert.ok(s > previous, 'streets must be encountered in geographic order'); previous = s;
    near(frame.position.x, x); near(frame.position.z, z);
    near(frame.tangent.x, dx); near(frame.tangent.z, dz);
  }
  near(sampleRoute(TRACK_LENGTH).x, 670); near(sampleRoute(TRACK_LENGTH).z, 250);
});

test('route metres remain continuous through rounded corners and offsets rotate with the road', () => {
  for (let s = 0; s < TRACK_LENGTH - .1; s += .3) {
    const a = routeFrame(s), b = routeFrame(s + .1), offset = routePoint(s, 3);
    near(Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z), .1, 2e-6);
    near(a.normal.x * a.tangent.x + a.normal.z * a.tangent.z, 0);
    near(Math.hypot(offset.x - a.position.x, offset.z - a.position.z), 3);
    const yawStep = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    assert.ok(Math.abs(yawStep) < .006, 'heading cannot snap at an intersection');
    assert.ok(Math.abs(b.position.y - a.position.y) < .08, 'street grade cannot step at district boundaries');
  }
});

test('Union Square is flat and the lap meets the original Powell/Post corner without a U-turn', () => {
  for (let x = -90; x <= 90; x += 15) for (let z = -80; z <= 80; z += 15) near(groundHeight(x, z), 22);
  const northwest = sampleRoute(0);
  const lastSide = routeProgressAt(-75, 64.9) + .1;
  const afterLap = routeFrame(lastSide);
  near(afterLap.position.x, northwest.x); near(afterLap.position.z, northwest.z);
  near(afterLap.tangent.x, 0); near(afterLap.tangent.z, 1);
  assert.ok(lastSide > 500);
});

test('flights stay within straight hill corridors and every landing clears the following turn', () => {
  for (const zone of LAUNCH_ZONES) {
    const entry = routeFrame(zone.progress), end = routeFrame(zone.end);
    assert.ok(entry.slope > 0, 'takeoff must carry uphill momentum');
    near(end.slope, 0, .0002);
    for (let s = zone.progress; s <= zone.end + 5; s += 1) near(routeFrame(s).curvature, 0);
    near(entry.tangent.x, end.tangent.x); near(entry.tangent.z, end.tangent.z);
  }
});

test('city terrain blends between districts without cliffs and both road edges share the street grade', () => {
  for (let x = -200; x <= 700; x += 8) for (let z = -100; z <= 850; z += 8) {
    const h = groundHeight(x, z);
    assert.ok(Math.abs(groundHeight(x + .02, z) - h) < .03, 'east-west terrain must not step at a district seam');
    assert.ok(Math.abs(groundHeight(x, z + .02) - h) < .03, 'north-south terrain must not step at a district seam');
  }
  for (let s = 0; s < TRACK_LENGTH; s += 3) {
    if (Math.abs(routeFrame(s).curvature) > .001) continue;
    for (const offset of [-7.4, 7.4]) {
      const p = routePoint(s, offset);
      assert.ok(Math.abs(p.y - groundHeight(p.x, p.z)) < .06, 'terrain should join the racing surface at the road edge');
    }
  }
});

test('tour navigates the entire turning route at 30, 60 and 120 Hz and stops at the bay', () => {
  for (const hz of [30, 60, 120]) {
    const tour = new CityTour([]);
    let sawFlight = false;
    for (let i = 0; i < hz * 80 && !tour.paused; i++) {
      tour.update(1 / hz);
      sawFlight ||= tour.airborne;
      assert.ok(Math.abs(tour.lateral) < .35, 'autopilot should compensate for corner weight');
      const pose = tour.getPose(), frame = routeFrame(tour.progress);
      near(pose.car.x, routePoint(tour.progress, tour.lateral).x);
      near(pose.car.z, routePoint(tour.progress, tour.lateral).z);
      const cameraBehind = (pose.car.x - pose.camera.x) * frame.tangent.x + (pose.car.z - pose.camera.z) * frame.tangent.z;
      assert.ok(cameraBehind > 9.8, 'chase camera must stay behind the car through compass turns');
      for (const vector of [pose.car, pose.camera, pose.look]) assert.ok(vector.toArray().every(Number.isFinite));
    }
    assert.ok(sawFlight); assert.ok(tour.paused); near(tour.progress, TRACK_LENGTH);
  }
});

test('named preview stops produce a valid camera and retain the chosen location', () => {
  const tour = new CityTour([]);
  for (const s of Object.values(ROUTE_STOPS)) {
    tour.jump(s); tour.paused = true; tour.update(1);
    near(tour.progress, s);
    const pose = tour.getPose();
    for (const vector of [pose.car, pose.camera, pose.look]) assert.ok(vector.toArray().every(Number.isFinite));
  }
});

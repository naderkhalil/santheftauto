import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from './courses.ts';
import { createCourseRoute } from './course-route.ts';
import { DrivingSimulation, type DriveInput } from './driving.ts';
import { parkedCarObstacles } from './cerebral-obstacles.ts';

const course = COURSES.find(course => course.id === 'cerebral-valley')!;
const route = createCourseRoute(course);
const scott = course.points.findIndex(point => point.label.includes('Hayes → Scott'));
const progress = (route.anchorProgress[scott - 1] + route.anchorProgress[scott]) / 2;
const position = route.routePoint(progress, 5.28);
const car = { x: position.x, z: position.z, yaw: route.routeYaw(progress) };
const coasting: DriveInput = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false };

test('one real car on Hayes occupies both lap visits without duplicate collision records', () => {
  const obstacles = parkedCarObstacles(route, [car, car]);
  assert.equal(obstacles.length, 2);
  assert.ok(obstacles[1].progress - obstacles[0].progress > 900);
  for (const obstacle of obstacles) {
    const actual = route.routePoint(obstacle.progress, obstacle.lateral);
    assert.ok(Math.hypot(actual.x - car.x, actual.z - car.z) < .001);
    assert.ok(Math.abs(obstacle.lateral - 5.28) < .001);
    assert.ok(Math.abs(obstacle.width - 1.88) < .001);
    assert.ok(Math.abs(obstacle.length - 4.6) < .001);
    assert.equal(obstacle.kind, 'car');
  }
  const opposite = parkedCarObstacles(route, [{ ...car, yaw: car.yaw + Math.PI }]);
  assert.equal(opposite.length, 2, 'cars parked against the race direction remain solid');
});

test('cross-street cars, adjacent blocks and invalid placements do not create phantom obstacles', () => {
  const distant = route.routePoint(progress, 60);
  assert.deepEqual(parkedCarObstacles(route, [
    { ...car, yaw: car.yaw + Math.PI / 2 },
    { ...distant, yaw: car.yaw },
    { ...car, x: NaN },
  ]), []);
  const beforeStart = route.sampleRoute(-30);
  assert.deepEqual(parkedCarObstacles(route, [{ ...beforeStart, yaw: route.routeYaw(0) }]), []);
});

test('parked cars cause physical contacts on both lap passes while the centre lane stays clear', () => {
  const obstacles = parkedCarObstacles(route, [car]);
  for (const hz of [30, 60, 120]) {
    const sim = new DrivingSimulation(obstacles, { route });
    for (const obstacle of obstacles) {
      sim.seek(obstacle.progress - 9, 4.8);
      sim.state.speed = 14;
      for (let frame = 0; frame < hz * 2; frame++) sim.update(1 / hz, coasting);
    }
    assert.equal(sim.state.collisions, 2, `${hz} Hz: the same physical car can be hit on each route visit`);
    const clear = new DrivingSimulation(obstacles, { route });
    clear.seek(obstacles[0].progress - 9, 0);
    clear.state.speed = 14;
    for (let frame = 0; frame < hz * 2; frame++) clear.update(1 / hz, coasting);
    assert.equal(clear.state.collisions, 0, 'normal centre-lane driving clears parked traffic');
  }
});

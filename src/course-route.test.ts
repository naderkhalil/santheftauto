import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, courseById } from './courses.ts';
import { createCourseRoute } from './course-route.ts';

const near = (actual: number, expected: number, epsilon = 1e-5) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);

test('all six city races have ordered gates, distinct identities, and a reachable finish', () => {
  assert.equal(COURSES.length, 6);
  assert.equal(new Set(COURSES.map(course => course.id)).size, 6);
  for (const course of COURSES) {
    assert.equal(courseById(course.id), course);
    const route = createCourseRoute(course);
    assert.ok(route.TRACK_LENGTH > 1000 && route.TRACK_LENGTH < 4000, `${course.name} should be a compact race`);
    near(route.ROAD_HALF_WIDTH, course.roadHalfWidth ?? 7.4);
    assert.equal(route.CHECKPOINTS.length, course.points.length - 1);
    assert.equal(route.checkpointLabels!.length, route.CHECKPOINTS.length);
    let previous = route.START_PROGRESS;
    for (const gate of route.CHECKPOINTS) {
      assert.ok(gate > previous, 'each physical gate belongs to a later route station'); previous = gate;
    }
    near(route.CHECKPOINTS.at(-1)!, route.TRACK_LENGTH);
    const start = route.sampleRoute(0), first = course.points[0];
    near(start.x, first.x); near(start.z, first.z);
    near(start.y, course.terrainHeight?.(first.x, first.z) ?? first.y);
    const finish = route.sampleRoute(route.TRACK_LENGTH), expected = course.points.at(-1)!;
    near(finish.x, expected.x); near(finish.y, course.terrainHeight?.(expected.x, expected.z) ?? expected.y); near(finish.z, expected.z);
    assert.ok(course.landmarks.every(landmark => landmark.at >= 0 && landmark.at <= 1));
  }
  assert.equal(courseById('not-a-course'), undefined);
});

test('rounded roads preserve metres, tangent continuity, authored height, and usable lane radii', () => {
  for (const course of COURSES) {
    const route = createCourseRoute(course);
    course.points.forEach((point, index) => {
      const actual = route.sampleRoute(route.anchorProgress[index]);
      // A rounded corner is offset from its authored street intersection;
      // its elevation must follow the ground at that physical location.
      near(actual.y, course.terrainHeight?.(actual.x, actual.z) ?? point.y);
    });
    for (let s = 0; s < route.TRACK_LENGTH - .1; s += .7) {
      const a = route.sampleRoute(s), b = route.sampleRoute(s + .1), offset = route.routePoint(s, route.ROAD_HALF_WIDTH);
      near(Math.hypot(b.x - a.x, b.z - a.z), .1, .00002);
      near(Math.hypot(offset.x - a.x, offset.z - a.z), route.ROAD_HALF_WIDTH);
      const yaw = route.routeYaw(s), nextYaw = route.routeYaw(s + .1);
      const headingLimit = course.cornerRadius ? .1 / course.cornerRadius + .0001 : .006;
      assert.ok(Math.abs(Math.atan2(Math.sin(nextYaw - yaw), Math.cos(nextYaw - yaw))) < headingLimit, `${course.name} has a heading snap`);
      assert.ok(Math.abs(b.y - a.y) < .055, `${course.name} has an abrupt grade`);
      if (course.cornerRadius) {
        const curve = Math.abs(route.routeCurvature(s));
        assert.ok(curve < 1e-6 || 1 / curve - route.ROAD_HALF_WIDTH > 5.5, 'the measured street corner retains a 5.5 m inner lane radius');
        near(a.y, course.terrainHeight!(a.x, a.z));
        near(offset.y, course.terrainHeight!(offset.x, offset.z));
      } else {
        assert.ok(Math.abs(route.routeCurvature(s)) * route.ROAD_HALF_WIDTH < .4, 'the inner lane must retain a positive driveable radius');
      }
      assert.ok([a.x, a.y, a.z, route.routeSlope(s), route.groundHeight(a.x, a.z)].every(Number.isFinite));
    }
  }
});

test('overlapping lap locations keep separate ordered progress and can be disambiguated', () => {
  const course = courseById('cerebral-valley')!, route = createCourseRoute(course);
  const outbound = course.points.findIndex(point => point.label.includes('Hayes → Scott'));
  const returning = course.points.findIndex(point => point.label.includes('lap complete'));
  const west = course.points[outbound], east = course.points[outbound - 1];
  const x = (west.x + east.x) / 2, z = (west.z + east.z) / 2;
  const first = route.routeProgressAt(x, z, route.anchorProgress[outbound]);
  const second = route.routeProgressAt(x, z, route.anchorProgress[returning]);
  assert.ok(second > first + 700, 'Alamo Square return must not collapse onto the outbound approach');
  near(route.sampleRoute(first).x, route.sampleRoute(second).x);
  near(route.sampleRoute(first).z, route.sampleRoute(second).z);
  const vc = createCourseRoute(courseById('vc-circle')!);
  const arrival = vc.routeProgressAt(-200, -100, 800), finish = vc.routeProgressAt(-200, -100, vc.TRACK_LENGTH);
  assert.ok(finish > arrival + 700, 'South Park finish must follow a complete loop');
});

test('Cerebral Valley visits 531 Page before Webster and detours on Waller to Réveille', () => {
  const labels = courseById('cerebral-valley')!.points.map(point => point.label);
  const at = (label: string) => labels.findIndex(candidate => candidate.includes(label));
  assert.ok(at('Page & Pierce') < at('531 Page'));
  assert.ok(at('531 Page') < at('Page → Webster'));
  assert.ok(at('Page → Webster') < at('Webster → Waller'));
  assert.ok(at('Webster → Waller') < at('Waller → Steiner'));
  assert.equal(at('Waller → Steiner'), at('Café Réveille'), 'Réveille is at the northwest corner of Waller and Steiner');
  assert.ok(at('Café Réveille') < at('Duboce Park'));
});

test('Hawk Hill fog lies on the bridge, before its north exit and the climb', () => {
  const course = courseById('hawk-hill')!, route = createCourseRoute(course);
  const begin = course.fog!.start * route.TRACK_LENGTH, end = course.fog!.end * route.TRACK_LENGTH;
  const entrance = course.points.findIndex(point => point.label.includes('south entrance'));
  const exit = course.points.findIndex(point => point.label.includes('bridge complete'));
  assert.ok(begin > route.anchorProgress[entrance]);
  assert.ok(end > begin + 300 && end < route.anchorProgress[exit]);
  for (let s = begin; s <= end; s += 10) near(route.routeCurvature(s), 0);
  assert.ok(route.sampleRoute(route.TRACK_LENGTH).y > route.sampleRoute(end).y + 60);
});

test('short adjacent corners trim without reversing streets and invalid geometry fails clearly', () => {
  const base = courseById('vc-circle')!;
  const route = createCourseRoute({ ...base, points: [
    { x: 0, z: 0, y: 0, label: 'a' }, { x: 50, z: 0, y: 2, label: 'b' },
    { x: 50, z: 40, y: 3, label: 'c' }, { x: 95, z: 60, y: 1, label: 'd' },
  ] });
  for (let s = 0; s < route.TRACK_LENGTH - .1; s += .1) {
    const a = route.sampleRoute(s), b = route.sampleRoute(s + .1);
    near(Math.hypot(b.x - a.x, b.z - a.z), .1, .0001);
    assert.ok(b.x >= a.x - .0001 && b.z >= a.z - .0001, 'fillets may not overlap and reverse the authored direction');
  }
  assert.throws(() => createCourseRoute({ ...base, points: [
    { x: 0, z: 0, y: 0, label: 'a' }, { x: 50, z: 0, y: 0, label: 'b' }, { x: 0, z: 0, y: 0, label: 'c' },
  ] }), /U-turn/);
  assert.throws(() => createCourseRoute({ ...base, points: [{ x: NaN, y: 0, z: 0, label: 'invalid' }] }), /finite/);
});

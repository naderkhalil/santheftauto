import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCourseRoute } from './course-route.ts';
import type { CourseDefinition } from './courses.ts';
import { CEREBRAL_POINTS, CEREBRAL_LANDMARKS, cerebralGroundHeight } from './cerebral-geography.ts';
import {
  CEREBRAL_PLAY_POINTS as points,
  CEREBRAL_PLAY_ANCHORS as A,
  CEREBRAL_PLAY_FEATURES as features,
} from './cerebral-play-route.ts';

// Standalone fixture: the original source itinerary and live course registration
// can change independently without changing the route this module promises.
const course: CourseDefinition = {
  id: 'cerebral-valley', name: 'Cerebral Skyline route geometry', subtitle: '', description: '',
  theme: 'victorian', accent: '#d0b2ff', difficulty: '', highlights: [], landmarks: [],
  points, cornerRadius: 12, roadHalfWidth: 6.4, terrainHeight: cerebralGroundHeight,
};
const route = createCourseRoute(course);
const layout = JSON.parse(readFileSync(new URL('../art/references/cerebral-valley-layout.json', import.meta.url), 'utf8'));
const park = layout.parks.find((park: { name: string }) => park.name === 'Alamo Square');
const distance = (a: { x:number; z:number }, b: { x:number; z:number }) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (actual: number, expected: number, epsilon = .001) => assert.ok(Math.abs(actual - expected) < epsilon);

function inPark(point: { x:number; z:number }) {
  const polygon: { x:number; z:number }[] = park.polygon;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

test('the park adventure retains source geography and replaces the perimeter lap with a 2.53 km race', () => {
  assert.equal(CEREBRAL_POINTS.length, 24, 'the source survey remains intact');
  assert.equal(points.length, 25);
  assert.ok(route.TRACK_LENGTH > 2520 && route.TRACK_LENGTH < 2550);
  assert.ok(!points.some(point => point.label.includes('Pierce') || point.label.includes('Fulton')));
  assert.ok(A.landing < A.page && A.page < A.page531 && A.page531 < A.websterPage);
  assert.ok(A.websterPage < A.waller && A.waller < A.reveille && A.reveille < A.duboce);
  for (const point of points) near(point.y, cerebralGroundHeight(point.x, point.z), .000001);
});

test('park climb, crest, landing and exit use real asphalt-path anchors', () => {
  for (const [anchor, path] of [[A.parkClimb, 6], [A.summitApproach, 25], [A.launchCrest, 25], [A.landing, 54], [A.southeastPath, 54], [A.paintedLadiesExit, 54]]) {
    assert.ok(park.paths[path].some((point: { x:number; z:number }) => distance(point, points[anchor]) < .002));
  }
  // The southwest bend is intentionally simplified into one steerable sweep.
  // Dense literal gate nodes would squeeze this same turn to a 5 m radius.
  for (let progress = 0; progress < route.TRACK_LENGTH; progress += .1) {
    const curvature = Math.abs(route.routeCurvature(progress));
    assert.ok(curvature < 1e-6 || 1 / curvature >= 11.99, 'every corner retains the requested 12 m minimum radius');
  }
});

test('the stable east-facing glide crosses open park and lands on asphalt before descending Steiner', () => {
  const launch = features.launches[0];
  const start = route.anchorProgress[launch.from] + launch.startOffset;
  const end = route.anchorProgress[launch.to];
  assert.ok(end - start > 100 && end - start < 112);
  const midpoint = route.sampleRoute((start + end) / 2), yaw = route.routeYaw((start + end) / 2);
  near(yaw * 180 / Math.PI, 83.82749, .01);
  for (let progress = start; progress < end - 3; progress += 2) {
    near(route.routeYaw(progress), yaw, .00001);
    assert.ok(inPark(route.sampleRoute(progress)), 'the airborne corridor stays over the park, not houses');
  }
  assert.ok(distance(route.sampleRoute(end), points[A.landing]) < .3);
  for (const landmark of CEREBRAL_LANDMARKS.filter(landmark => landmark.name.endsWith('Steiner Street'))) {
    const dx = landmark.x - midpoint.x, dz = landmark.z - midpoint.z;
    const angle = Math.atan2(dx, dz) - yaw;
    assert.ok(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < Math.PI / 7, 'all seven Painted Ladies are directly ahead within the vista');
  }
  assert.ok(route.sampleRoute(start).y - route.sampleRoute(end).y > 3);
});

test('Hayes boost effects finish well before the park bend and the final pad feeds the launch', () => {
  const entrance = route.anchorProgress[A.parkEntrance];
  for (const boost of features.boosts.slice(0, 2)) {
    const end = route.anchorProgress[boost.to] + boost.endOffset;
    const furthestPoweredPosition = end + boost.speed * boost.duration;
    assert.ok(entrance - furthestPoweredPosition > 150, 'boosted Hayes leaves a meaningful braking approach');
  }
  const last = features.boosts.at(-1)!;
  const padEnd = route.anchorProgress[last.to] + last.endOffset;
  const takeoff = route.anchorProgress[A.launchCrest] + features.launches[0].startOffset;
  assert.ok(takeoff - padEnd > 10 && takeoff - padEnd < 25);
  assert.ok(last.speed > features.launches[0].minSpeed);
});

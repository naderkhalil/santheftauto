import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCourseRoute } from './course-route.ts';
import { COURSES } from './courses.ts';
import { cerebralRaceTurns, createCerebralRaceArt } from './cerebral-race-art.ts';

const route = () => createCourseRoute({
  ...COURSES[0], cornerRadius: 12,
  points: [[0, 0], [0, 120], [120, 120], [120, 240]].map(([x, z], i) => ({ x, z, y: 10, label: `corner ${i}` })),
});

test('Cerebral chevrons follow physical left/right turns after north-axis reflection', () => {
  const course = route(), turns = cerebralRaceTurns(course);
  assert.deepEqual(turns.map(turn => turn.direction), ['right', 'left']);
  assert.deepEqual(turns.map(turn => turn.signSide), [-1, 1]);
  for (const turn of turns) {
    assert.ok(turn.entry < turn.apex && turn.apex < turn.exit);
    assert.ok(turn.exit - turn.entry > 15);
  }
});

test('survey waypoints along a straight street do not become false corner boards', () => {
  const course = createCourseRoute({ ...COURSES[0], points: [0, 80, 160, 240].map(z => ({ x: 0, z, y: 10, label: 'straight' })) });
  assert.equal(cerebralRaceTurns(course).length, 0);
});

test('rainbow art uses canonical terrain coordinates and supports simulation boost ranges', () => {
  const scene = new THREE.Scene(), course = route();
  const art = createCerebralRaceArt(scene, course, { boosts: [{ progress: 20, end: 44, halfWidth: 4 }], launches: [] });
  const pad = art.group.getObjectByName('Rainbow boost surface / forward-moving chevrons') as THREE.Mesh;
  assert.ok(pad); pad.geometry.computeBoundingBox();
  const bounds = pad.geometry.boundingBox!;
  assert.ok(Math.abs(bounds.min.z + 44) < .01 && Math.abs(bounds.max.z + 20) < .01);
  assert.ok(Math.abs(bounds.min.y - 10.20) < .01);
  assert.equal(bounds.max.x, 4); assert.equal(bounds.min.x, -4);
  art.update(1, 30, 'racing'); assert.ok(art.group.visible);
  art.update(2, 30, 'finished'); assert.equal(art.group.visible, false);
  art.dispose(); assert.equal(scene.children.length, 0);
});

test('corner panels remain outside the driving width and outside the flight span', () => {
  const scene = new THREE.Scene(), course = route(), apex = course.anchorProgress[1];
  const art = createCerebralRaceArt(scene, course, {
    boosts: [], launches: [{ progress: apex - 15, end: apex + 15, label: 'clear flight vista' }],
  });
  const first = art.group.getObjectByName(`right turn at ${Math.round(apex)}m`)!;
  assert.equal(first.children.length, 0);
  const second = art.group.getObjectByName(`left turn at ${Math.round(course.anchorProgress[2])}m`)!;
  assert.equal(second.children.length, 3);
  for (const panel of second.children) {
    const s = course.routeProgressAt(panel.position.x, -panel.position.z), point = course.sampleRoute(s);
    assert.ok(Math.hypot(point.x - panel.position.x, point.z + panel.position.z) > course.ROAD_HALF_WIDTH + 1.9);
  }
  art.dispose();
});

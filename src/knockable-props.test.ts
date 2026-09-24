import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKnockableProps, type PropImpact } from './knockable-props.ts';
import { DrivingSimulation } from './driving.ts';
import { PLAZA_RAIL_SEGMENTS } from './playground-props.ts';

const hit = (id: string, speed = 24): PropImpact => ({ id, x: -1, y: .5, z: 0, vx: speed, vz: 0, speed });
const advance = (props: ReturnType<typeof createKnockableProps>, seconds: number, fps = 60) => {
  for (let i = 0; i < Math.round(seconds * fps); i++) props.update(1 / fps);
};
function setup(height = (_x: number, _z: number) => 0) {
  const props = createKnockableProps(height), a = new THREE.Group(), b = new THREE.Group();
  a.position.set(0, height(0, 0) + .5, 0); b.position.set(0, height(0, 2) + .5, 2);
  props.add('rail/0', a, new THREE.Vector3(.07, .5, 1), 'rail');
  props.add('rail/1', b, new THREE.Vector3(.07, .5, 1), 'rail');
  return { props, a, b };
}

test('a hit knocks only its short rail span, hops, and ignores repeated impacts', () => {
  const { props, a, b } = setup(), originalB = b.position.clone();
  props.knock([hit('rail/0')]); advance(props, .1);
  assert(a.position.x > .4, 'struck rail slides in the car velocity direction');
  assert(a.position.y > .5, 'initial impact lifts the rail');
  assert(a.quaternion.angleTo(new THREE.Quaternion()) > .2);
  assert.deepEqual(b.position.toArray(), originalB.toArray(), 'neighboring rail stays mounted');
  const before = a.position.clone();
  props.knock([hit('rail/0', -100)]); props.update(1 / 60);
  assert(a.position.x > before.x, 'same prop cannot get a second contradictory impulse');
  assert.deepEqual(props.stats, { total: 2, moved: 1, awake: 1, asleep: 0 });
});

test('scattered furniture settles on sloping ground and stays within a small radius', () => {
  const ground = (x: number, _z: number) => 3 + x * .08;
  const { props, a } = setup(ground);
  props.knock([hit('rail/0', 58)]); advance(props, 4);
  assert.deepEqual(props.stats, { total: 2, moved: 1, awake: 0, asleep: 1 });
  assert(Math.hypot(a.position.x, a.position.z) <= 4.5 + 1e-8);
  let clearance = Infinity;
  for (const x of [-.07, .07]) for (const y of [-.5, .5]) for (const z of [-1, 1]) {
    const point = new THREE.Vector3(x, y, z).applyQuaternion(a.quaternion).add(a.position);
    clearance = Math.min(clearance, point.y - ground(point.x, point.z));
  }
  assert(Math.abs(clearance - .025) < 1e-6, 'lowest rotated bounds rest on the terrain');
  const settled = a.matrix.clone(); advance(props, 5);
  assert.deepEqual(a.matrix.elements, settled.elements, 'sleeping props remain scattered without jitter');
});

test('reset restores exact transforms and batched render matrices, then permits another hit', () => {
  const props = createKnockableProps(() => 0), object = new THREE.Group();
  object.position.set(5, .5, 8); object.rotation.y = .3; object.updateMatrix();
  const initial = object.matrix.clone();
  const geometry = new THREE.BoxGeometry(.6, 1, .6);
  const batch = new THREE.BatchedMesh(1, geometry.getAttribute('position').count, geometry.index!.count, new THREE.MeshStandardMaterial());
  const instance = batch.addInstance(batch.addGeometry(geometry)); batch.setMatrixAt(instance, initial);
  props.add('chair', object, new THREE.Vector3(.3, .5, .3), 'chair', () => batch.setMatrixAt(instance, object.matrix));
  props.knock([hit('chair')]); advance(props, 4);
  assert.notDeepEqual(object.matrix.elements, initial.elements);
  const rendered = new THREE.Matrix4(); batch.getMatrixAt(instance, rendered);
  for (let i = 0; i < 16; i++) assert(Math.abs(rendered.elements[i] - object.matrix.elements[i]) < 1e-5);
  props.reset();
  assert.deepEqual(object.matrix.elements, initial.elements);
  batch.getMatrixAt(instance, rendered);
  for (let i = 0; i < 16; i++) assert(Math.abs(rendered.elements[i] - initial.elements[i]) < 1e-5);
  assert.deepEqual(props.stats, { total: 1, moved: 0, awake: 0, asleep: 0 });
  props.knock([hit('chair')]); props.update(1 / 60); assert.equal(props.stats.awake, 1);
  geometry.dispose(); batch.dispose();
});

test('prop trajectories agree at 30, 60 and 120 Hz', () => {
  const results = [30, 60, 120].map(fps => {
    const { props, a } = setup(); props.knock([hit('rail/0')]); advance(props, 1, fps);
    return [...a.position.toArray(), ...a.quaternion.toArray()];
  });
  for (const values of results.slice(1)) values.forEach((value, i) => assert(Math.abs(value - results[0][i]) < 1e-9));
});

test('unknown or malformed impacts and invalid update times do not poison the renderer', () => {
  const { props, a } = setup();
  props.knock([hit('missing'), { ...hit('rail/0'), vx: NaN }]);
  props.update(NaN); props.update(Infinity); props.update(-1);
  assert.equal(props.stats.moved, 0);
  props.knock([{ ...hit('rail/0'), vx: 0, vz: 0 }]);
  props.update(1000); advance(props, 4);
  assert([...a.position.toArray(), ...a.quaternion.toArray()].every(Number.isFinite));
  assert.equal(props.stats.asleep, 1);
});

test('an actual car impact uses the shared rail identity to move, settle and reset its renderer', () => {
  const sim = new DrivingSimulation([], { exploration: true }); sim.explore();
  const gas = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };
  sim.state.heading = Math.PI / 2;
  for (let i = 0; i < 1200 && sim.position.x < 11; i++) sim.update(1 / 120, gas);
  assert(sim.position.x >= 11);
  sim.state.speed = 0; sim.state.heading = 0;
  for (let i = 0; i < 1200 && sim.position.z < -18; i++) sim.update(1 / 120, gas);
  assert(sim.position.z >= -18);
  const rail = PLAZA_RAIL_SEGMENTS.find(rail => rail.id === 'south-stair-rail-11/0')!;
  const impacts = sim.drainPropImpacts();
  assert(impacts.some(impact => impact.id === rail.id));
  const object = new THREE.Group(), props = createKnockableProps();
  object.position.set((rail.a.x + rail.b.x) / 2, (rail.a.y + rail.b.y) / 2 + .47, (rail.a.z + rail.b.z) / 2);
  const home = object.position.clone();
  props.add(rail.id, object, new THREE.Vector3(.11, (rail.b.y - rail.a.y + .94) / 2, (rail.b.z - rail.a.z) / 2 + .11), 'rail');
  props.knock(impacts); advance(props, 4);
  assert.equal(props.stats.asleep, 1);
  assert(object.position.distanceTo(home) > .5);
  props.reset(); assert.deepEqual(object.position.toArray(), home.toArray());
  assert.equal(props.stats.moved, 0);
});

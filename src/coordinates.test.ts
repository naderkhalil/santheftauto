import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cityToRender, createCityRoot, renderToCity, setCameraFromCity, steeringFromControls } from './coordinates.ts';
import { DrivingSimulation } from './driving.ts';
import { routePoint, routeProgressAt, routeYaw, sampleRoute } from './route.ts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const projectCity = (p: THREE.Vector3, camera: THREE.Camera) => cityToRender(p).project(camera);

test('Apple is to the right of Saks when looking north across Union Square', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 2000);
  setCameraFromCity(camera, V(0, 28, -50), V(0, 28, 100));
  const apple = projectCity(V(41, 28, 98.8), camera);
  const saks = projectCity(V(-40, 28, 106), camera);
  assert.ok(apple.x > 0 && saks.x < 0, 'east must appear right; this failed in the mirrored city');
  assert.ok(camera.matrixWorld.determinant() > 0, 'the camera must remain right-handed');
  assert.equal(camera.parent, null, 'do not cancel the correction by putting the camera under the reflected root');
});

test('Apple and Neiman Marcus occupy opposite ends of the east side from the Westin view', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, .1, 2000);
  setCameraFromCity(camera, V(-75, 28, 0), V(160, 28, 0));
  assert.ok(projectCity(V(41, 28, 98.8), camera).x < 0, 'Apple is north/left when facing east');
  assert.ok(projectCity(V(104, 28, -93), camera).x > 0, 'Neiman Marcus is south/right when facing east');
});

test('the Post to Stockton corner is visibly a right turn, matching the clockwise square lap', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 2000);
  setCameraFromCity(camera, V(35, 28, 65), V(100, 28, 65));
  const afterCorner = sampleRoute(routeProgressAt(75, 40));
  assert.ok(projectCity(V(afterCorner.x, 28, afterCorner.z), camera).x > 0);
});

test('right and left controls move toward their screen side in every street heading', () => {
  const stations = [[0, 65], [75, 0], [0, -65], [-75, 0]];
  const inputs = [
    { steer: steeringFromControls(false, true), expected: 1 },
    { steer: steeringFromControls(true, false), expected: -1 },
    { steer: steeringFromControls(false, false, .8), expected: 1 },
    { steer: steeringFromControls(false, false, -.8), expected: -1 },
  ];
  for (const [x, z] of stations) for (const input of inputs) {
    const sim = new DrivingSimulation([]);
    sim.state.progress = routeProgressAt(x, z);
    sim.state.y = sampleRoute(sim.state.progress).y;
    sim.state.heading = routeYaw(sim.state.progress);
    sim.state.speed = 25;
    for (let frame = 0; frame < 15; frame++) sim.update(1 / 60, {
      throttle: 1, brake: 0, steer: input.steer, drift: false, boost: false,
    });
    const camera = new THREE.PerspectiveCamera(65, 1, .1, 2000);
    const back = routePoint(sim.state.progress - 10), ahead = routePoint(sim.state.progress + 25);
    setCameraFromCity(camera, V(back.x, sim.state.y + 4, back.z), V(ahead.x, sim.state.y + 1, ahead.z));
    const car = routePoint(sim.state.progress, sim.state.lateral);
    const screen = projectCity(V(car.x, sim.state.y, car.z), camera);
    assert.ok(screen.x * input.expected > .001, `control direction reversed on the street at ${x},${z}`);
  }
});

test('world geometry, particle points and camera conversions share one reflection without mutating city state', () => {
  const root = createCityRoot();
  const car = new THREE.Object3D(); car.position.set(42, 27, 115); root.add(car);
  root.updateMatrixWorld(true);
  const world = car.getWorldPosition(new THREE.Vector3());
  assert.deepEqual(world.toArray(), cityToRender(car.position).toArray());
  assert.deepEqual(renderToCity(world).toArray(), car.position.toArray());
  const eye = V(42, 31, 105), look = V(42, 30, 140), beforeEye = eye.clone(), beforeLook = look.clone();
  const camera = new THREE.PerspectiveCamera();
  for (let frame = 0; frame < 3; frame++) setCameraFromCity(camera, eye, look);
  assert.deepEqual(eye.toArray(), beforeEye.toArray());
  assert.deepEqual(look.toArray(), beforeLook.toArray());
  assert.deepEqual(renderToCity(camera.position).toArray(), eye.toArray(), 'finish snapshots must use the semantic eye, not reflected camera.position');
});

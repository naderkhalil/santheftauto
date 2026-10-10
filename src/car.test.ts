import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARS, DRIVERS, DEFAULT_PROFILE } from './racer-profile.ts';

// Vite resolves the game's extensionless local imports. Give Node's test runner
// that same resolution while importing the actual car, without mocking its code.
const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(new URL('.', import.meta.url).href) && /^\.\.?\/[^.]+$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
let createCar: typeof import('./car.ts').createCar;
try { ({ createCar } = await import('./car.ts')); }
finally { resolver.deregister(); }

function makeKit() {
  const kit = new THREE.Group(), vehicle = new THREE.Group(); vehicle.name = 'Vehicle'; kit.add(vehicle);
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const paint = new THREE.MeshStandardMaterial({ color: '#427e7c', map: texture }); paint.name = 'Coupe paint';
  const chrome = new THREE.MeshStandardMaterial({ map: texture }); chrome.name = 'Shared trim';
  const tail = new THREE.MeshStandardMaterial(); tail.name = 'Tail lamp';
  vehicle.add(new THREE.Mesh(geometry, paint), new THREE.Mesh(geometry, chrome), new THREE.Mesh(geometry, tail));
  for (const name of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Steering']) {
    const pivot = new THREE.Group(); pivot.name = name;
    pivot.position.set(name.endsWith('L') ? -.9 : .9, .4, name.includes('_F') ? 1 : -1);
    pivot.add(new THREE.Mesh(geometry, chrome)); vehicle.add(pivot);
  }
  const skin = new THREE.MeshStandardMaterial({ map: texture }); skin.name = 'Cartoon skin';
  for (const { id } of DRIVERS) {
    const driver = new THREE.Group(); driver.name = `Seated_${id}`;
    driver.add(new THREE.Mesh(geometry, skin)); kit.add(driver);
  }
  return { kit, geometry, texture, paint, materials: [paint, chrome, tail, skin] };
}

function drivers(root: THREE.Object3D) {
  const result: THREE.Object3D[] = [];
  root.traverse(object => { if (object.name.startsWith('Seated_')) result.push(object); });
  return result;
}
function materials(root: THREE.Object3D) {
  const result = new Set<THREE.Material>();
  root.traverse(object => { if (object instanceof THREE.Mesh) for (const material of [object.material].flat()) result.add(material); });
  return result;
}

test('playable cartoon cars preserve choices and private material lifetimes through loading and swaps', async t => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const context = new Proxy({}, { get: () => () => {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: class { src = ''; onload?: () => void; naturalWidth = 128; naturalHeight = 64; } });
  const fixture = makeKit();
  let resolveKit!: (value: { scene: THREE.Group }) => void;
  const pendingKit = new Promise<{ scene: THREE.Group }>(resolve => { resolveKit = resolve; });
  const loader = t.mock.method(GLTFLoader.prototype, 'loadAsync', () => pendingKit);
  const cars: ReturnType<typeof createCar>[] = [];
  const create = () => { const car = createCar(); cars.push(car); return car; };
  let sharedDisposals = 0;
  for (const resource of [fixture.geometry, fixture.texture, ...fixture.materials]) resource.addEventListener('dispose', () => sharedDisposals++);
  try {
    await t.test('latest customization survives loading and disposed cars never acquire a model', async () => {
      const car = create(), abandoned = create(), remote = create();
      car.customize({ ...DEFAULT_PROFILE, driver: 'sam', car: 'comet', sponsor: 'none' });
      const latest = { ...DEFAULT_PROFILE, driver: 'mira', car: 'tide', sponsor: 'none' };
      car.customize(latest);
      remote.setRemoteDetail(100); remote.customize({ ...DEFAULT_PROFILE, driver: 'feifei', sponsor: 'none' });
      abandoned.dispose();
      resolveKit({ scene: fixture.kit });
      await Promise.all(cars.map(candidate => candidate.ready));
      assert.equal(loader.mock.callCount(), 1, 'The kit download is shared by local and remote cars');
      assert.deepEqual(car.group.userData.profile, latest);
      assert.deepEqual(drivers(car.group).map(driver => driver.name), ['Seated_mira']);
      const paint = [...materials(car.group)].find(material => material.name === 'Coupe paint') as THREE.MeshStandardMaterial;
      assert.equal(paint.color.getHex(), new THREE.Color(CARS.find(candidate => candidate.id === 'tide')!.color).getHex());
      assert.equal(abandoned.group.getObjectByName('Vehicle'), undefined);
      assert.equal(drivers(abandoned.group).length, 0);
      const remoteDriver = drivers(remote.group)[0];
      assert.equal(remoteDriver.name, 'Seated_feifei'); assert.equal(remoteDriver.visible, false);
      assert.equal(remote.group.userData.driverVisible, false);
      assert.equal(fixture.paint.color.getHex(), new THREE.Color('#427e7c').getHex(), 'Pending paint cannot alter the kit');
    });

    await t.test('rapid roster selection retains one clone and disposes each old material once', async () => {
      const car = create(); await car.ready;
      for (const { id } of DRIVERS) {
        const previous = drivers(car.group)[0], previousMaterials = materials(previous);
        const disposals = new Map([...previousMaterials].map(material => [material, 0]));
        for (const material of previousMaterials) material.addEventListener('dispose', () => disposals.set(material, disposals.get(material)! + 1));
        car.customize({ ...DEFAULT_PROFILE, driver: id, sponsor: 'none' });
        const current = drivers(car.group);
        assert.equal(current.length, 1); assert.equal(current[0].name, `Seated_${id}`);
        if (previous.name === current[0].name) {
          assert.equal(current[0], previous, 'Repeating the selected character does not allocate a new clone');
          assert.ok([...disposals.values()].every(count => count === 0));
        } else {
          assert.equal(previous.parent, null);
          assert.ok([...disposals.values()].every(count => count === 1), 'Every replaced material is released once');
        }
      }
      assert.equal(sharedDisposals, 0);
    });

    await t.test('a distant opponent remains hidden when its driver changes and recovers shadows nearby', async () => {
      const car = create(); await car.ready; car.setRemoteDetail(100);
      car.customize({ ...DEFAULT_PROFILE, driver: 'jensen', sponsor: 'none' });
      const driver = drivers(car.group)[0];
      assert.equal(driver.visible, false); assert.equal(car.group.userData.driverVisible, false);
      const driverMesh = driver.children[0] as THREE.Mesh;
      assert.equal(driverMesh.castShadow, false);
      car.setRemoteDetail(40); assert.equal(driver.visible, false, 'Distance hysteresis prevents detail flicker');
      car.setRemoteDetail(30); assert.equal(driver.visible, true); assert.equal(driverMesh.castShadow, true);
      car.update(1 / 60, { speed: 10, steer: .6, braking: true, boosting: false, time: 1 });
      assert.equal(driver.rotation.z, -.6 * .035);
      assert.equal(car.group.getObjectByName('Steering')!.rotation.z, .6 * .22);
      assert.notEqual(car.group.getObjectByName('Wheel_FL')!.rotation.x, 0);
    });

    await t.test('new contacts bounce the body once without moving authoritative pose or tires', async () => {
      const car = create(); await car.ready;
      car.group.position.set(7, 2, 12);
      const body = car.group.getObjectByName('Vehicle')!.parent!;
      const wheel = car.group.getObjectByName('Wheel_FL')!;
      const wheelPosition = wheel.getWorldPosition(new THREE.Vector3());
      const state = { speed: 0, steer: 0, braking: false, boosting: false, time: 0, collisions: 6 };
      car.update(1 / 60, state);
      assert.equal(body.rotation.x, 0, 'Joining a car with old contacts must not replay a collision');
      assert.equal(body.position.y, 0);
      car.update(1 / 60, { ...state, collisions: 7 });
      assert.ok(Math.abs(body.rotation.x) > .001, 'A new contact should visibly compress the suspension');
      assert.ok(Math.abs(body.position.y) > .001 && Math.abs(body.position.y) < .08);
      assert.deepEqual(car.group.position.toArray(), [7, 2, 12], 'Feedback cannot alter the physics pose');
      assert.deepEqual(wheel.getWorldPosition(new THREE.Vector3()), wheelPosition, 'The tires stay grounded beneath the body motion');
      for (let frame = 0; frame < 60; frame++) car.update(1 / 60, { ...state, collisions: 7 });
      assert.equal(body.rotation.x, 0); assert.equal(body.position.y, 0, 'Repeated snapshots let the one bounce settle');
      car.update(1 / 60, { ...state, collisions: 8 });
      assert.ok(Math.abs(body.rotation.x) > .001, 'A subsequent distinct contact can bounce again');
      car.update(1 / 60, { ...state, collisions: 0 });
      assert.equal(body.rotation.x, 0); assert.equal(body.position.y, 0, 'Starting a new race clears an active impact');
    });

    await t.test('detached wheels release shared private materials once without affecting other cars', async () => {
      const car = create(), peer = create(); await Promise.all([car.ready, peer.ready]);
      const privateMaterials = materials(car.group), peerMaterials = materials(peer.group);
      const counts = new Map([...privateMaterials].map(material => [material, 0]));
      let peerDisposals = 0;
      for (const material of privateMaterials) material.addEventListener('dispose', () => counts.set(material, counts.get(material)! + 1));
      for (const material of peerMaterials) material.addEventListener('dispose', () => peerDisposals++);
      assert.ok([...privateMaterials].every(material => !peerMaterials.has(material)));
      car.dispose(); car.dispose();
      assert.ok([...counts.values()].every(count => count === 1), 'Wheel/body reuse must not cause repeated material disposal');
      assert.equal(peerDisposals, 0); assert.equal(sharedDisposals, 0);
      const revision = car.group.userData.visualRevision;
      car.customize({ ...DEFAULT_PROFILE, driver: 'mark' });
      assert.equal(car.group.userData.visualRevision, revision, 'Disposed cars ignore subsequent changes');
      peer.customize({ ...DEFAULT_PROFILE, driver: 'elon', sponsor: 'none' });
      assert.equal(drivers(peer.group)[0].name, 'Seated_elon');
    });
  } finally {
    cars.forEach(car => car.dispose());
    loader.mock.restore();
    fixture.geometry.dispose(); fixture.texture.dispose(); fixture.materials.forEach(material => material.dispose());
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage); else Reflect.deleteProperty(globalThis, 'Image');
  }
});

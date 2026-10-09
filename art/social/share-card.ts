import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar } from '../../src/car';

/** Deterministic 1200 × 630 poster. Screenshot #cover when body[data-ready=true]. */
const status = document.querySelector<HTMLOutputElement>('#render-status')!;
const canvas = document.querySelector<HTMLCanvasElement>('#racers')!;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(2);
renderer.setSize(820, 550, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.07;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const studio = new RoomEnvironment();
const environment = pmrem.fromScene(studio, .055);
scene.environment = environment.texture;
scene.environmentIntensity = .66;
studio.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight('#fff7e6', '#698f82', 1.5));

const key = new THREE.DirectionalLight('#fff0d5', 3.6);
key.position.set(-4, 9, -6);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 9, bottom: -9, near: .5, far: 30 });
key.shadow.normalBias = .012;
key.shadow.bias = -.000035;
key.shadow.radius = 3;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#d6f2ef', 1.25);
fill.position.set(6, 4, 1);
scene.add(fill);
const rim = new THREE.DirectionalLight('#fff1bb', 1.8);
rim.position.set(-3, 3, 6);
scene.add(rim);

const viewHeight = 5.6;
const camera = new THREE.OrthographicCamera(-viewHeight * 820 / 550 / 2, viewHeight * 820 / 550 / 2, viewHeight / 2, -viewHeight / 2, .1, 100);
camera.position.set(7.5, 6, -12);
camera.lookAt(.8, .8, 0);

// The game reflects its city Z axis; retain that convention for the actual cars.
const stage = new THREE.Group();
stage.scale.z = -1;
scene.add(stage);
const roadMaterial = new THREE.ShadowMaterial({ color: '#174e4e', opacity: .2 });
const road = new THREE.Mesh(new THREE.PlaneGeometry(6.55, 35), roadMaterial);
road.rotation.x = -Math.PI / 2;
road.position.set(-.25, -.055, -3);
road.receiveShadow = true;
stage.add(road);

const hero = createCar();
hero.customize({ name: 'Jensen', driver: 'jensen', car: 'comet', sponsor: 'none' });
hero.group.position.set(.95, 0, .8);
hero.group.rotation.y = -.10;
hero.group.scale.setScalar(1.08);
stage.add(hero.group);
const rival = createCar();
rival.customize({ name: 'Sam', driver: 'sam', car: 'sundrop', sponsor: 'none' });
rival.group.position.set(-1.8, .015, -2.8);
rival.group.rotation.y = .07;
rival.group.scale.setScalar(.88);
stage.add(rival.group);

function finishCar(car: ReturnType<typeof createCar>, color: string, steer: number) {
  if (car.group.userData.asset !== 'blender') throw new Error('The actual game racer model did not load.');
  car.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.name === 'Coupe paint') material.color.set(color);
        material.envMapIntensity = .8;
      }
    }
  });
  car.update(0, { speed: 0, steer, braking: false, boosting: false, time: 0 });
}

async function renderCover() {
  const city = document.querySelector<HTMLImageElement>('.city')!;
  await Promise.all([hero.ready, rival.ready, city.decode(), document.fonts.ready]);
  finishCar(hero, '#ed755a', -.18);
  finishCar(rival, '#297f79', .09);
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  renderer.render(scene, camera);
  canvas.dataset.loaded = 'true';
  document.body.dataset.ready = 'true';
  status.value = 'Cover ready — 1200 × 630';
}

void renderCover().catch(error => {
  document.body.dataset.ready = 'error';
  status.value = `Cover failed: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});

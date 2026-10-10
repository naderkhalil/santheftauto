import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRacerLoader, cloneRacerPart, releaseRacerPart, RACER_ASSET_VERSION } from '../../src/racer-assets';
import { createAtmosphere } from '../../src/atmosphere';
import { DRIVERS } from '../../src/racer-profile';

const query = new URLSearchParams(location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#review')!;
const driverSelect = document.querySelector<HTMLSelectElement>('#driver')!;
const status = document.querySelector<HTMLElement>('#status')!;
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const portraitScene = new THREE.Scene();
portraitScene.background = new THREE.Color('#e8e6de');
const portraitWorld = new THREE.Group(); portraitWorld.scale.z = -1; portraitScene.add(portraitWorld);
const portraitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 100);
const carScene = new THREE.Scene();
const carCamera = new THREE.PerspectiveCamera(38, 1, .1, 4200);
const carWorld = new THREE.Group(); carWorld.scale.z = -1; carScene.add(carWorld);
const atmosphere = createAtmosphere(renderer, carScene, carCamera, {
  sampleRoute: () => new THREE.Vector3(0, -18, 0), shadowExtent: 13,
  sunDirection: { x: -.57, y: .682, z: .461 },
  reflectionPoints: [{ x: 0, y: 1.5, z: 1 }],
});
atmosphere.update(0, 0);
carScene.traverse(object => {
  if (object instanceof THREE.DirectionalLight && object.castShadow) {
    object.shadow.normalBias = .012; object.shadow.bias = -.000035; object.intensity = 3;
  }
});
const road = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#6f7779', roughness: .87 }));
road.rotation.x = -Math.PI / 2; road.receiveShadow = true; road.position.y = -.015; carWorld.add(road);
const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(room, .05);
portraitScene.environment = environment.texture; portraitScene.environmentIntensity = .4;
room.dispose(); pmrem.dispose();
portraitScene.add(new THREE.HemisphereLight('#fffbf1', '#b4b5b0', .55));
const key = new THREE.DirectionalLight('#fff4e4', 1.7);
key.position.set(-1.6, 3.5, -2.5); key.target.position.set(0, 1.6, 0); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.000025; key.shadow.normalBias = .002; key.shadow.radius = 3;
Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: .1, far: 8 }); key.shadow.camera.updateProjectionMatrix();
portraitScene.add(key, key.target);
const fill = new THREE.DirectionalLight('#e5eef5', .5); fill.position.set(2, 2.2, -1.4); fill.target.position.y = 1;
const rim = new THREE.DirectionalLight('#fff7e8', .7); rim.position.set(1.5, 2.8, 1.8); rim.target.position.y = 1;
portraitScene.add(fill, fill.target, rim, rim.target);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: '#687062', opacity: .12 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = .997; floor.receiveShadow = true; portraitWorld.add(floor);
const carOrbit = new OrbitControls(carCamera, canvas);
carOrbit.enableDamping = false; carOrbit.enablePan = false; carOrbit.enableZoom = false; carOrbit.rotateSpeed = .7;
carOrbit.minPolarAngle = .85; carOrbit.maxPolarAngle = 1.6;
let kit: THREE.Group | undefined, portrait: THREE.Object3D | undefined, seated: THREE.Object3D | undefined, vehicle: THREE.Object3D | undefined;
let selected = query.get('driver') || 'mark';
let mode = query.get('view') === 'car' ? 'car' : 'portrait';
let angle = query.get('angle') || 'three-quarter';
let bustHeight = 1, bustTop = 2;
let portraitTarget = 1.65, dragX: number | null = null;
let disposed = false;
function render() { if (!disposed) renderer.render(mode === 'car' ? carScene : portraitScene, mode === 'car' ? carCamera : portraitCamera); }
function resize() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  const aspect = width / height, half = Math.max(bustHeight * .8, bustHeight * .64 / aspect) / 2;
  Object.assign(portraitCamera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
  portraitCamera.updateProjectionMatrix(); carCamera.aspect = aspect; carCamera.updateProjectionMatrix();
  portraitTarget = bustTop + bustHeight * .055 - half;
  portraitCamera.position.set(0, portraitTarget, -6);
  portraitCamera.lookAt(0, portraitTarget, 0); render();
}
function syncURL() {
  query.set('driver', selected); query.set('view', mode); query.set('angle', angle);
  history.replaceState(null, '', `${location.pathname}?${query}`);
}
function setAngle(next: string) {
  angle = next;
  const yaw = ({ front: 0, 'three-quarter': .48, side: Math.PI / 2, back: Math.PI } as Record<string, number>)[angle] ?? .48;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  // Rotate the actor under fixed studio lights, exactly as the game showroom
  // does. Orbiting the camera gave the same silhouette but different shading.
  if (portrait) portrait.rotation.y = yaw;
  const distance = Math.max(5.25, 8.2 / aspect);
  carOrbit.target.set(0, .92, .15);
  carCamera.position.set(Math.sin(yaw) * distance, aspect < 1 ? 2.2 : 2, -Math.cos(yaw) * distance);
  carCamera.lookAt(carOrbit.target); carOrbit.update();
  for (const id of ['front', 'three-quarter', 'side', 'back']) button(id).setAttribute('aria-pressed', String(id === angle));
  syncURL(); render();
}
function setMode(next: string) {
  mode = next; carOrbit.enabled = mode === 'car';
  button('portrait').setAttribute('aria-pressed', String(mode === 'portrait'));
  button('car').setAttribute('aria-pressed', String(mode === 'car'));
  syncURL(); resize();
}
function selectDriver(id: string) {
  if (!kit) return;
  if (portrait) releaseRacerPart(portrait);
  if (seated) releaseRacerPart(seated);
  selected = id;
  portrait = cloneRacerPart(kit, `Standing_${id}`); portraitWorld.add(portrait);
  seated = cloneRacerPart(kit, `Seated_${id}`); seated.scale.multiplyScalar(.88); seated.position.set(-.35, .30, -.37); carWorld.add(seated);
  for (const root of [portrait, seated]) root.traverse(object => {
    if (object instanceof THREE.Mesh) for (const material of [object.material].flat()) for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.anisotropy = renderer.capabilities.getMaxAnisotropy();
  });
  const bounds = new THREE.Box3().setFromObject(portrait); bustHeight = bounds.max.y - bounds.min.y; bustTop = bounds.max.y;
  driverSelect.value = id;
  status.textContent = `${DRIVERS.find(driver => driver.id === id)?.name || id} · optimized game model · ${query.get('kit') === 'live' ? 'local public kit' : 'staged kit'}`;
  document.body.dataset.driver = id; document.body.dataset.ready = 'true';
  resize(); setAngle(angle); syncURL();
}
carOrbit.addEventListener('change', render);
canvas.addEventListener('pointerdown', event => {
  if (mode !== 'portrait') return;
  dragX = event.clientX; canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (dragX === null || !portrait || mode !== 'portrait') return;
  portrait.rotation.y = THREE.MathUtils.euclideanModulo(portrait.rotation.y + (event.clientX - dragX) * .004 + Math.PI, Math.PI * 2) - Math.PI;
  dragX = event.clientX; render();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => dragX = null);
button('portrait').addEventListener('click', () => setMode('portrait'));
button('car').addEventListener('click', () => setMode('car'));
for (const id of ['front', 'three-quarter', 'side', 'back']) button(id).addEventListener('click', () => setAngle(id));
driverSelect.addEventListener('change', () => selectDriver(driverSelect.value));
const observer = new ResizeObserver(resize); observer.observe(canvas);
setMode(mode); resize(); setAngle(angle);
const single = query.get('kit') === 'single';
if (!DRIVERS.some(driver => driver.id === selected)) selected = 'mark';
const kitPath = single ? `./${selected}-runtime.glb` : query.get('kit') === 'live' ? `/assets/models/racer-kit.glb?v=${RACER_ASSET_VERSION}` : query.get('kit') === 'full' ? './racer-kit.glb' : './mark-trial-kit.glb';
createRacerLoader().loadAsync(kitPath).then(async asset => {
  const carKit = single ? (await createRacerLoader().loadAsync('./mark-trial-kit.glb')).scene : asset.scene;
  if (disposed) return;
  kit = asset.scene; vehicle = cloneRacerPart(carKit, 'Vehicle'); carWorld.add(vehicle);
  const available = DRIVERS.filter(driver => kit!.getObjectByName(`Standing_${driver.id}`) && kit!.getObjectByName(`Seated_${driver.id}`));
  for (const driver of available) { const option = document.createElement('option'); option.value = driver.id; option.textContent = driver.name; driverSelect.append(option); }
  if (!available.some(driver => driver.id === selected)) selected = available[0].id;
  selectDriver(selected);
  atmosphere.loadPhotographicSky().then(() => { if (!disposed) { atmosphere.bakeCityReflections(vehicle!); render(); } });
}).catch(error => { document.body.dataset.ready = 'error'; status.textContent = 'The staged kit could not be opened.'; console.error(error); });
window.addEventListener('pagehide', () => {
  disposed = true; observer.disconnect(); carOrbit.dispose();
  if (portrait) releaseRacerPart(portrait); if (seated) releaseRacerPart(seated); if (vehicle) releaseRacerPart(vehicle);
  environment.dispose(); key.shadow.dispose(); floor.geometry.dispose(); floor.material.dispose(); road.geometry.dispose(); road.material.dispose(); atmosphere.dispose(); renderer.dispose();
}, { once: true });

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRacerLoader, RACER_ASSET_VERSION } from '../../src/racer-assets';

// A development-only close view of the real GLB, never a runtime portrait swap.
const canvas = document.querySelector<HTMLCanvasElement>('#portraits')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ece7da');
const room = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(room, .04).texture;
scene.environmentIntensity = .38;
room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight('#fff6eb', '#8c9899', .9));
for (const [color, intensity, position] of [
  ['#fff3df', 2.4, [-3, 5, -5]], ['#d5e7f4', .9, [4, 2, -3]], ['#fff0dc', 1.7, [2, 4, 3]],
] as const) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(position[0], position[1], position[2]); scene.add(light);
}
const camera = new THREE.OrthographicCamera(-1.24, 1.24, .4, -.4, .1, 100);
camera.position.set(0, 1.76, -10); camera.lookAt(0, 1.76, 0);
const city = new THREE.Group(); city.scale.z = -1; scene.add(city);
const actors: THREE.Object3D[] = [];
let angle = 0;
function render() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.top = 1.24 * height / width; camera.bottom = -camera.top;
  camera.updateProjectionMatrix();
  actors.forEach(actor => { actor.rotation.y = angle; });
  renderer.render(scene, camera);
}
for (const [id, value] of [['front', 0], ['angle', -.48]] as const) {
  document.querySelector<HTMLButtonElement>('#' + id)!.onclick = () => {
    angle = value;
    document.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.id === id)));
    render();
  };
}
const asset = await createRacerLoader().loadAsync(`/assets/models/racer-kit.glb?v=${RACER_ASSET_VERSION}`);
for (const [i, id] of ['dario', 'sam', 'elon', 'jensen'].entries()) {
  const actor = asset.scene.getObjectByName('Standing_' + id)!;
  city.add(actor); actor.position.x = -(i - 1.5) * .62;
  // Bring different statures into a shared eye line for an honest comparison.
  actor.position.y = (2.0 - new THREE.Box3().setFromObject(actor).max.y);
  actors.push(actor);
}
window.addEventListener('resize', render);
render(); document.body.dataset.ready = 'true';

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRacerLoader, RACER_ASSET_VERSION } from '../../src/racer-assets';
import { DRIVERS } from '../../src/racer-profile';
const options = new URLSearchParams(location.search);
const ids = (options.get('ids') || 'dario,sam,elon,jensen').split(',').filter(id => DRIVERS.some(driver => driver.id === id));
const halfWidth = Math.max(.42, ids.length * .22);

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
const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, .4, -.4, .1, 100);
camera.position.set(0, 1.80, -10); camera.lookAt(0, 1.80, 0);
const city = new THREE.Group(); city.scale.z = -1; scene.add(city);
const actors: THREE.Object3D[] = [];
let angle = 0;
function render() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.top = Math.max(.29, halfWidth * height / width); camera.bottom = -camera.top;
  camera.left = -camera.top * width / height; camera.right = -camera.left;
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
const asset = await createRacerLoader().loadAsync(options.has('heads') ? './heads-preview.glb?review=' + (options.get('v') || '1') : `/assets/models/racer-kit.glb?v=${RACER_ASSET_VERSION}`);
const footer = document.querySelector('footer')!;
footer.style.gridTemplateColumns = `repeat(${ids.length},1fr)`;
footer.replaceChildren();
for (const [i, id] of ids.entries()) {
  const actor = asset.scene.getObjectByName('Standing_' + id)!;
  city.add(actor); actor.position.x = -(i - (ids.length - 1) / 2) * .44;
  const caption = document.createElement('div');
  const name = document.createElement('strong'); name.textContent = DRIVERS.find(driver => driver.id === id)!.name;
  caption.append(name); footer.append(caption);
  // Bring different statures into a shared eye line for an honest comparison.
  actor.position.y = (2.0 - new THREE.Box3().setFromObject(actor).max.y);
  actors.push(actor);
}
window.addEventListener('resize', render);
render(); document.body.dataset.ready = 'true';

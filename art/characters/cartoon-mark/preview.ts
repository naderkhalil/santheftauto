import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Standalone art review: the whole GLB is Y-up and faces +Z. No mirrored scale,
// gameplay catalogue, shared model cache, or production scene participates here.
const canvas = document.querySelector<HTMLCanvasElement>('#prototype')!;
const viewer = document.querySelector<HTMLElement>('#viewer')!;
const loadState = document.querySelector<HTMLElement>('#load-state')!;
const status = document.querySelector<HTMLElement>('#model-status')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const modelLink = document.querySelector<HTMLAnchorElement>('#model-link')!;
const button = (id: string) => document.querySelector<HTMLButtonElement>('#' + id)!;
const controlsButtons = ['front', 'three-quarter', 'bust', 'face'].map(button);

function showError(message: string, retryable = true) {
  viewer.dataset.state = 'error';
  document.body.dataset.ready = 'error';
  loadState.hidden = false;
  status.textContent = message;
  retry.hidden = !retryable;
  controlsButtons.forEach(control => { control.disabled = true; });
  modelLink.hidden = true;
}

function startViewer() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ece9e0');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 100);
  const environmentRoom = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentRoom, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .3;
  environmentRoom.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fff7e9', '#b6b9b3', .8));

  const key = new THREE.DirectionalLight('#fff3df', 2.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.normalBias = .003;
  key.shadow.bias = -.000025;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#dce9ef', .75);
  const rim = new THREE.DirectionalLight('#fff4d9', 1.1);
  scene.add(fill, rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: '#657263', opacity: .14 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.001;
  floor.receiveShadow = true;
  scene.add(floor);

  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = false;
  orbit.enablePan = false;
  orbit.rotateSpeed = .6;
  orbit.minPolarAngle = Math.PI * .18;
  orbit.maxPolarAngle = Math.PI * .76;
  orbit.minZoom = .65;
  orbit.maxZoom = 3;
  orbit.enabled = false;

  const draco = new DRACOLoader().setDecoderPath('/assets/draco/').setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  let model: THREE.Group | undefined;
  let modelSize = new THREE.Vector3(.8, 1, .5);
  let closeUp = false;
  let loading = false;
  let disposed = false;

  const render = () => {
    if (!disposed && model) renderer.render(scene, camera);
  };
  const markAngle = (id: 'front' | 'three-quarter' | null) => {
    for (const name of ['front', 'three-quarter']) button(name).setAttribute('aria-pressed', String(id === name));
  };
  orbit.addEventListener('change', render);
  orbit.addEventListener('start', () => markAngle(null));

  function fitFrame() {
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const frameHeight = modelSize.y * (closeUp ? .65 : 1.12);
    const frameWidth = closeUp ? modelSize.y * .75 : Math.max(modelSize.x, modelSize.z) * 1.25;
    const halfHeight = Math.max(frameHeight, frameWidth / aspect) / 2;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.updateProjectionMatrix();
    render();
  }

  function setAngle(angle: number, id: 'front' | 'three-quarter' | null) {
    const distance = Math.max(2, modelSize.y * 3.5);
    camera.position.set(Math.sin(angle) * distance, orbit.target.y, Math.cos(angle) * distance);
    camera.lookAt(orbit.target);
    orbit.update();
    markAngle(id);
    render();
  }

  function setFraming(close: boolean) {
    closeUp = close;
    const oldTarget = orbit.target.clone();
    orbit.target.set(0, modelSize.y * (closeUp ? .70 : .5), 0);
    camera.position.add(orbit.target.clone().sub(oldTarget));
    camera.zoom = 1;
    orbit.update();
    button('face').setAttribute('aria-pressed', String(closeUp));
    button('bust').setAttribute('aria-pressed', String(!closeUp));
    fitFrame();
  }

  function disposeModel(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    textures.forEach(texture => texture.dispose());
    materials.forEach(material => material.dispose());
    root.removeFromParent();
  }

  async function loadModel() {
    if (loading || disposed) return;
    loading = true;
    orbit.enabled = false;
    viewer.dataset.state = 'loading';
    document.body.dataset.ready = 'loading';
    loadState.hidden = false;
    status.textContent = 'Loading the exported Mark prototype…';
    retry.hidden = true;
    controlsButtons.forEach(control => { control.disabled = true; });
    try {
      const source = new URL('./mark-prototype.glb', location.href);
      source.searchParams.set('review', new URLSearchParams(location.search).get('v') || String(Date.now()));
      const asset = await loader.loadAsync(source.href);
      if (disposed) { disposeModel(asset.scene); return; }
      const bounds = new THREE.Box3().setFromObject(asset.scene);
      if (bounds.isEmpty()) { disposeModel(asset.scene); throw new Error('The GLB contains no visible mesh geometry.'); }
      modelSize = bounds.getSize(new THREE.Vector3());
      if (modelSize.y < .001) { disposeModel(asset.scene); throw new Error('The GLB has no usable vertical size.'); }
      const center = bounds.getCenter(new THREE.Vector3());
      if (model) disposeModel(model);
      model = asset.scene;
      model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.anisotropy = renderer.capabilities.getMaxAnisotropy();
          }
        }
      });
      scene.add(model);

      const h = modelSize.y;
      key.position.set(-h * 1.6, h * 2.3, h * 2.8);
      key.target.position.set(0, h * .6, 0);
      fill.position.set(h * 2, h * 1.1, h * 1.2);
      rim.position.set(h * 1.5, h * 1.8, -h * 1.8);
      Object.assign(key.shadow.camera, { left: -h, right: h, top: h, bottom: -h, near: .01, far: h * 8 });
      key.shadow.camera.updateProjectionMatrix();
      camera.far = Math.max(100, h * 12);
      floor.scale.setScalar(Math.max(1, h));
      setFraming(closeUp);
      setAngle(Math.PI / 6, 'three-quarter');
      orbit.enabled = true;
      controlsButtons.forEach(control => { control.disabled = false; });
      viewer.dataset.state = 'ready';
      document.body.dataset.ready = 'true';
      loadState.hidden = true;
      status.textContent = 'The exported 3D Mark prototype is ready.';
      modelLink.hidden = false;
      render();
    } catch (error) {
      console.warn('Mark prototype could not load.', error);
      showError('The Mark prototype could not be opened. It may not have been exported yet. The concept reference is available while the model is being prepared.');
    } finally {
      loading = false;
    }
  }

  button('front').addEventListener('click', () => setAngle(0, 'front'));
  button('three-quarter').addEventListener('click', () => setAngle(Math.PI / 6, 'three-quarter'));
  button('face').addEventListener('click', () => setFraming(true));
  button('bust').addEventListener('click', () => setFraming(false));
  retry.addEventListener('click', () => { void loadModel(); });
  canvas.addEventListener('keydown', event => {
    if (!model || !orbit.enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const offset = camera.position.clone().sub(orbit.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (event.key === 'ArrowLeft') spherical.theta -= .12;
    if (event.key === 'ArrowRight') spherical.theta += .12;
    if (event.key === 'ArrowUp') spherical.phi -= .08;
    if (event.key === 'ArrowDown') spherical.phi += .08;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, orbit.minPolarAngle, orbit.maxPolarAngle);
    camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(spherical));
    orbit.update();
    markAngle(null);
    render();
  });
  const observer = new ResizeObserver(fitFrame);
  observer.observe(viewer);
  window.addEventListener('pagehide', () => {
    disposed = true;
    observer.disconnect();
    orbit.dispose();
    draco.dispose();
    if (model) disposeModel(model);
    floor.geometry.dispose();
    floor.material.dispose();
    environment.dispose();
    renderer.dispose();
  }, { once: true });
  void loadModel();
}

try {
  startViewer();
} catch (error) {
  console.warn('Mark prototype viewer is unavailable.', error);
  showError('This browser could not start the 3D preview. The concept reference is still available. Try reopening this page in a browser with 3D graphics enabled.', false);
}

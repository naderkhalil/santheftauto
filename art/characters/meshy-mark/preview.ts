import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Isolated review only: normalize the imported Y-up model without changing its file.
const canvas = document.querySelector<HTMLCanvasElement>('#prototype')!;
const viewer = document.querySelector<HTMLElement>('#viewer')!;
const loadState = document.querySelector<HTMLElement>('#load-state')!;
const status = document.querySelector<HTMLElement>('#model-status')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const modelLink = document.querySelector<HTMLAnchorElement>('#model-link')!;
const surfaceNote = document.querySelector<HTMLElement>('#surface-note')!;
const button = (id: string) => document.querySelector<HTMLButtonElement>('#' + id)!;
const angleIds = ['front', 'three-quarter', 'profile', 'back'] as const;
const surfaceIds = ['studio', 'paint', 'clay'] as const;
type Angle = typeof angleIds[number];
type Surface = typeof surfaceIds[number];
const controlsButtons = [...angleIds, ...surfaceIds, 'bust', 'face', 'rotate-model'].map(button);
const query = new URLSearchParams(location.search);

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
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8e6de');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 30);
  const environmentRoom = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentRoom, .05);
  scene.environment = environment.texture;
  scene.environmentIntensity = .4;
  environmentRoom.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fffbf1', '#b4b5b0', .55));
  const key = new THREE.DirectionalLight('#fff4e4', 1.7);
  key.position.set(-1.6, 2.5, 2.5);
  key.target.position.set(0, .6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.normalBias = .002;
  key.shadow.bias = -.000025;
  key.shadow.radius = 3;
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: .1, far: 8 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#e5eef5', .5);
  fill.position.set(2, 1.2, 1.4);
  const rim = new THREE.DirectionalLight('#fff7e8', .7);
  rim.position.set(1.5, 1.8, -1.8);
  scene.add(fill, rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: '#687062', opacity: .12 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.003;
  floor.receiveShadow = true;
  scene.add(floor);

  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = false;
  orbit.enablePan = false;
  orbit.rotateSpeed = .6;
  orbit.minPolarAngle = Math.PI * .14;
  orbit.maxPolarAngle = Math.PI * .82;
  orbit.minZoom = .65;
  orbit.maxZoom = 3;
  orbit.enabled = false;
  const draco = new DRACOLoader().setDecoderPath('/assets/draco/').setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const materials = new Map<THREE.Mesh, { studio: THREE.Material | THREE.Material[]; paint: THREE.Material | THREE.Material[] }>();
  const clay = new THREE.MeshStandardMaterial({ color: '#c7bfae', roughness: .86, metalness: 0 });
  let model: THREE.Group | undefined;
  let modelSize = new THREE.Vector3(.9, 1, .65);
  let closeUp = query.get('frame') === 'face';
  let surface: Surface = surfaceIds.find(id => id === query.get('material')) || 'studio';
  const requestedTurn = Number(query.get('turn') || 0);
  let modelTurn = Number.isFinite(requestedTurn) ? THREE.MathUtils.degToRad(requestedTurn % 360) : 0;
  let loading = false;
  let disposed = false;

  const render = () => { if (!disposed && model) renderer.render(scene, camera); };
  const markAngle = (id: Angle | null) => {
    angleIds.forEach(name => button(name).setAttribute('aria-pressed', String(id === name)));
  };
  orbit.addEventListener('change', render);
  orbit.addEventListener('start', () => markAngle(null));

  function fitFrame() {
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const frameHeight = closeUp ? .63 : 1.16;
    const frameWidth = closeUp ? .62 : Math.max(modelSize.x, modelSize.z) * 1.17;
    const halfHeight = Math.max(frameHeight, frameWidth / aspect) / 2;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.updateProjectionMatrix();
    render();
  }

  function setAngle(id: Angle) {
    const angle = { front: 0, 'three-quarter': -Math.PI / 6, profile: Math.PI / 2, back: Math.PI }[id];
    camera.position.set(Math.sin(angle) * 4, orbit.target.y, Math.cos(angle) * 4);
    camera.lookAt(orbit.target);
    orbit.update();
    markAngle(id);
    render();
  }

  function setFraming(close: boolean) {
    closeUp = close;
    const oldTarget = orbit.target.clone();
    orbit.target.set(0, closeUp ? .715 : .5, 0);
    camera.position.add(orbit.target.clone().sub(oldTarget));
    camera.zoom = 1;
    orbit.update();
    button('face').setAttribute('aria-pressed', String(closeUp));
    button('bust').setAttribute('aria-pressed', String(!closeUp));
    fitFrame();
  }

  function setSurface(next: Surface) {
    surface = next;
    for (const [mesh, variants] of materials) mesh.material = next === 'clay' ? clay : variants[next];
    surfaceIds.forEach(id => button(id).setAttribute('aria-pressed', String(id === surface)));
    floor.visible = next !== 'paint';
    surfaceNote.textContent = {
      studio: 'Studio shows the exported materials under soft light. Compare paint and clay to see which details come from color and which are in the shape.',
      paint: 'Paint only shows the colors baked into the model, without added light. Switch to clay to check the actual sculpted face and hair.',
      clay: 'Clay removes the painted detail so the face, curls, and silhouette can be judged as shapes. The mesh itself is unchanged.',
    }[next];
    render();
  }

  function paintMaterial(source: THREE.Material) {
    const original = source as THREE.MeshStandardMaterial;
    const paint = new THREE.MeshBasicMaterial({
      color: original.color?.clone() || new THREE.Color('white'),
      map: original.map || null,
      alphaMap: original.alphaMap || null,
      side: original.side,
      opacity: original.opacity,
      transparent: original.transparent,
      alphaTest: original.alphaTest,
      vertexColors: original.vertexColors,
      toneMapped: false,
    });
    paint.name = `${source.name || 'material'} / paint inspection`;
    return paint;
  }

  function disposeModel(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const uniqueMaterials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const variants = materials.get(object);
      const used = variants ? [variants.studio, variants.paint].flat() : [object.material].flat();
      for (const material of used) {
        if (material === clay) continue;
        uniqueMaterials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
      materials.delete(object);
    });
    geometries.forEach(geometry => geometry.dispose());
    textures.forEach(texture => texture.dispose());
    uniqueMaterials.forEach(material => material.dispose());
    root.removeFromParent();
  }

  async function loadModel() {
    if (loading || disposed) return;
    loading = true;
    orbit.enabled = false;
    viewer.dataset.state = 'loading';
    document.body.dataset.ready = 'loading';
    loadState.hidden = false;
    status.textContent = 'Opening the 3D study…';
    retry.hidden = true;
    controlsButtons.forEach(control => { control.disabled = true; });
    try {
      const source = new URL('./mark-meshy-v1.glb', location.href);
      source.searchParams.set('review', query.get('v') || String(Date.now()));
      const asset = await loader.loadAsync(source.href);
      if (disposed) { disposeModel(asset.scene); return; }
      const bounds = new THREE.Box3().setFromObject(asset.scene);
      const size = bounds.getSize(new THREE.Vector3());
      if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 0) {
        disposeModel(asset.scene);
        throw new Error('The model has no usable geometry.');
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const placement = new THREE.Group();
      placement.position.set(-center.x, -bounds.min.y, -center.z);
      placement.add(asset.scene);
      const normalized = new THREE.Group();
      normalized.scale.setScalar(1 / size.y);
      normalized.add(placement);
      if (model) disposeModel(model);
      model = new THREE.Group();
      model.add(normalized);
      model.rotation.y = modelTurn;
      modelSize = size.multiplyScalar(1 / size.y);
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        originals.forEach(material => {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          }
        });
        materials.set(object, {
          studio: object.material,
          paint: Array.isArray(object.material) ? originals.map(paintMaterial) : paintMaterial(originals[0]),
        });
      });
      scene.add(model);
      setFraming(closeUp);
      setAngle(angleIds.find(id => id === query.get('view')) || 'three-quarter');
      setSurface(surface);
      orbit.enabled = true;
      controlsButtons.forEach(control => { control.disabled = false; });
      viewer.dataset.state = 'ready';
      document.body.dataset.ready = 'true';
      loadState.hidden = true;
      status.textContent = 'The 3D study is ready to inspect.';
      modelLink.hidden = false;
      render();
    } catch (error) {
      console.warn('The Meshy Mark study could not load.', error);
      showError('The 3D study could not be opened. It may still be generating or downloading. The reference is ready; try again once the model has arrived.');
    } finally {
      loading = false;
    }
  }

  angleIds.forEach(id => button(id).addEventListener('click', () => setAngle(id)));
  surfaceIds.forEach(id => button(id).addEventListener('click', () => setSurface(id)));
  button('face').addEventListener('click', () => setFraming(true));
  button('bust').addEventListener('click', () => setFraming(false));
  button('rotate-model').addEventListener('click', () => {
    if (!model) return;
    modelTurn += Math.PI / 2;
    model.rotation.y = modelTurn;
    render();
  });
  retry.addEventListener('click', () => { void loadModel(); });
  canvas.addEventListener('keydown', event => {
    if (!model || !orbit.enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
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
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    showError('The browser paused 3D graphics. Reload this page to reopen the study.', false);
  });
  const observer = new ResizeObserver(fitFrame);
  observer.observe(viewer);
  window.addEventListener('pagehide', () => {
    disposed = true;
    observer.disconnect();
    orbit.dispose();
    draco.dispose();
    if (model) disposeModel(model);
    clay.dispose();
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
  console.warn('The Meshy Mark viewer is unavailable.', error);
  showError('This browser could not start the 3D viewer. Open this page in a browser with 3D graphics enabled to inspect the study.', false);
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Local workshop only. Source meshes stay out of the production asset loader.
const names = [
  ['dario', 'Dario Amodei'], ['sam', 'Sam Altman'], ['elon', 'Elon Musk'],
  ['jensen', 'Jensen Huang'], ['mira', 'Mira Murati'], ['feifei', 'Fei-Fei Li'], ['mark', 'Mark Zuckerberg'],
] as const;
const drivers = names.map(([id, name]) => ({
  id, name,
  art: id === 'mark' ? '../direction/mark-meshy-bust-input-v1.png' : `./${id}/${id}-cartoon-bust-v1.png`,
  model: id === 'mark' ? '../meshy-mark/mark-meshy-v1.glb' : `./${id}/${id}-meshy-v1.glb`,
  tagline: id === 'jensen' ? 'Fully accelerated.' : '',
}));
type Driver = typeof drivers[number];
const angleIds = ['front', 'three-quarter', 'profile', 'back'] as const;
const surfaceIds = ['studio', 'paint', 'clay'] as const;
type Angle = typeof angleIds[number];
type Surface = typeof surfaceIds[number];
const query = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);
const canvas = $<HTMLCanvasElement>('prototype');
const viewer = $('viewer');
const status = $('model-status');
const loadState = $('load-state');
const modelLink = $<HTMLAnchorElement>('model-link');
const reference = $<HTMLImageElement>('reference');
const referenceLink = $<HTMLAnchorElement>('reference-link');
const controls = [...angleIds, ...surfaceIds, 'bust', 'face'].map(button);
let selected = drivers.find(driver => driver.id === query.get('driver')) || drivers[0];
let angle: Angle = angleIds.find(id => id === query.get('view')) || (query.get('view') === '3quarter' ? 'three-quarter' : 'three-quarter');
let closeUp = query.get('frame') === 'face';
let surface: Surface = surfaceIds.find(id => id === query.get('material')) || 'studio';
let layout = query.get('layout') === 'lineup' ? 'lineup' : 'study';
let selectModel: ((driver: Driver) => void) | undefined;
let clearModel: (() => void) | undefined;

function syncURL() {
  const url = new URL(location.href);
  url.searchParams.set('driver', selected.id);
  url.searchParams.set('view', angle);
  url.searchParams.set('frame', closeUp ? 'face' : 'bust');
  url.searchParams.set('material', surface);
  if (layout === 'lineup') url.searchParams.set('layout', 'lineup');
  else url.searchParams.delete('layout');
  history.replaceState(null, '', url);
}

function showState(state: 'loading' | 'pending' | 'error', message: string, retryable = false) {
  viewer.dataset.state = state;
  document.body.dataset.ready = state;
  loadState.hidden = false;
  status.textContent = message;
  button('retry').hidden = !retryable;
  controls.forEach(control => { control.disabled = true; });
  modelLink.hidden = true;
}

function updateSelection() {
  document.title = `${selected.name} — San Theft Auto character workshop`;
  document.body.dataset.driver = selected.id;
  $('model-heading').textContent = selected.name;
  $('driver-tagline').textContent = selected.tagline;
  $('source-caption').textContent = `${selected.name} · Source portrait`;
  canvas.setAttribute('aria-label', `Interactive 3D study of ${selected.name}. Drag to rotate or use the arrow keys.`);
  reference.alt = `Cartoon source portrait of ${selected.name}, used to create the corresponding 3D bust study.`;
  reference.src = selected.art;
  referenceLink.href = selected.art;
  referenceLink.setAttribute('aria-label', `Open ${selected.name}'s source portrait at full resolution in a new tab`);
  $('reference-frame').dataset.state = 'loading';
  $('reference-status').hidden = true;
  referenceLink.hidden = false;
  for (const card of document.querySelectorAll<HTMLButtonElement>('[data-driver]')) {
    card.setAttribute('aria-pressed', String(card.dataset.driver === selected.id));
  }
  syncURL();
}

function chooseDriver(driver: Driver) {
  selected = driver;
  updateSelection();
  if (layout === 'lineup') setLayout('study');
  else selectModel?.(selected);
}

for (const driver of drivers) {
  const card = document.createElement('button');
  card.type = 'button'; card.className = 'driver-card'; card.dataset.driver = driver.id;
  card.setAttribute('aria-label', `Inspect ${driver.name}`);
  const thumb = document.createElement('img');
  thumb.src = driver.art; thumb.alt = ''; thumb.width = 92; thumb.height = 112; thumb.decoding = 'async';
  const copy = document.createElement('span');
  const name = document.createElement('strong'); name.textContent = driver.name;
  const label = document.createElement('small'); label.textContent = driver.tagline || 'Cartoon study';
  copy.append(name, label); card.append(thumb, copy);
  card.addEventListener('click', () => chooseDriver(driver));
  $('roster').append(card);

  const concept = document.createElement('button');
  concept.type = 'button'; concept.className = 'concept-card';
  concept.setAttribute('aria-label', `Inspect the 3D study for ${driver.name}`);
  const art = document.createElement('img'); art.src = driver.art; art.alt = `Generated cartoon bust concept of ${driver.name}`; art.width = art.height = 1024; art.decoding = 'async';
  const title = document.createElement('strong'); title.textContent = driver.name;
  const caption = document.createElement('small'); caption.textContent = driver.tagline || 'Generated source portrait';
  concept.append(art, title, caption);
  concept.addEventListener('click', () => chooseDriver(driver));
  $('concept-grid').append(concept);
}
reference.addEventListener('load', () => { $('reference-frame').dataset.state = 'ready'; $('reference-status').hidden = true; });
reference.addEventListener('error', () => {
  $('reference-frame').dataset.state = 'error';
  $('reference-status').hidden = false;
  $('reference-status').textContent = 'This source portrait is not available yet.';
  referenceLink.hidden = true;
});

function setLayout(next: string) {
  const previous = layout;
  layout = next;
  $('study').hidden = layout === 'lineup';
  $('lineup').hidden = layout !== 'lineup';
  $('roster').hidden = layout === 'lineup';
  button('study-layout').setAttribute('aria-pressed', String(layout === 'study'));
  button('lineup-layout').setAttribute('aria-pressed', String(layout === 'lineup'));
  document.body.dataset.layout = layout;
  syncURL();
  if (layout === 'lineup') {
    clearModel?.();
    document.body.dataset.ready = 'concepts';
  } else if (previous === 'lineup') {
    if (!selectModel) initializeViewer();
    selectModel?.(selected);
  }
}
button('study-layout').addEventListener('click', () => setLayout('study'));
button('lineup-layout').addEventListener('click', () => setLayout('lineup'));

function startViewer() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e8e6de');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 30);
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .05);
  scene.environment = environment.texture; scene.environmentIntensity = .4;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fffbf1', '#b4b5b0', .55));
  const key = new THREE.DirectionalLight('#fff4e4', 1.7);
  key.position.set(-1.6, 2.5, 2.5); key.target.position.set(0, .6, 0); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.normalBias = .002; key.shadow.bias = -.000025; key.shadow.radius = 3;
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: .1, far: 8 });
  key.shadow.camera.updateProjectionMatrix(); scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#e5eef5', .5); fill.position.set(2, 1.2, 1.4);
  const rim = new THREE.DirectionalLight('#fff7e8', .7); rim.position.set(1.5, 1.8, -1.8); scene.add(fill, rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: '#687062', opacity: .12 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.003; floor.receiveShadow = true; scene.add(floor);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = false; orbit.enablePan = false; orbit.rotateSpeed = .6;
  orbit.minPolarAngle = Math.PI * .14; orbit.maxPolarAngle = Math.PI * .82; orbit.minZoom = .65; orbit.maxZoom = 3; orbit.enabled = false;
  const draco = new DRACOLoader().setDecoderPath('/assets/draco/').setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const clay = new THREE.MeshStandardMaterial({ color: '#c7bfae', roughness: .86, metalness: 0 });
  type Variants = { studio: THREE.Material | THREE.Material[]; paint: THREE.Material | THREE.Material[] };
  const variants = new Map<THREE.Mesh, Variants>();
  let model: THREE.Group | undefined;
  let modelSize = new THREE.Vector3(.9, 1, .65);
  let requestRevision = 0;
  let activeFetch: AbortController | undefined;
  let queue = Promise.resolve();
  let disposed = false;
  const render = () => { if (!disposed && model && layout === 'study') renderer.render(scene, camera); };
  const markAngle = (current: Angle | null) => angleIds.forEach(id => button(id).setAttribute('aria-pressed', String(id === current)));
  orbit.addEventListener('change', render);
  orbit.addEventListener('start', () => markAngle(null));

  function fitFrame() {
    const width = viewer.clientWidth, height = viewer.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfHeight = Math.max(closeUp ? .63 : 1.16, (closeUp ? .62 : Math.max(modelSize.x, modelSize.z) * 1.17) / aspect) / 2;
    Object.assign(camera, { top: halfHeight, bottom: -halfHeight, left: -halfHeight * aspect, right: halfHeight * aspect });
    camera.updateProjectionMatrix(); render();
  }
  function setAngle(next: Angle) {
    angle = next;
    const radians = { front: 0, 'three-quarter': -Math.PI / 6, profile: Math.PI / 2, back: Math.PI }[next];
    camera.position.set(Math.sin(radians) * 4, orbit.target.y, Math.cos(radians) * 4);
    camera.lookAt(orbit.target); orbit.update(); markAngle(next); syncURL(); render();
  }
  function setFraming(close: boolean) {
    closeUp = close;
    const oldTarget = orbit.target.clone(); orbit.target.set(0, close ? .715 : .5, 0);
    camera.position.add(orbit.target.clone().sub(oldTarget)); camera.zoom = 1; orbit.update();
    button('face').setAttribute('aria-pressed', String(close)); button('bust').setAttribute('aria-pressed', String(!close));
    syncURL(); fitFrame();
  }
  function setSurface(next: Surface) {
    surface = next;
    for (const [mesh, material] of variants) mesh.material = next === 'clay' ? clay : material[next];
    surfaceIds.forEach(id => button(id).setAttribute('aria-pressed', String(id === next)));
    floor.visible = next !== 'paint';
    $('surface-note').textContent = {
      studio: 'Studio shows the exported materials under soft light. Compare Paint and Clay to separate painted details from the shape.',
      paint: 'Paint shows the model’s colors without added lighting. Switch to Clay to inspect the underlying face and hair.',
      clay: 'Clay removes painted detail so you can judge the actual face, hair, and silhouette. The geometry stays the same.',
    }[next]; syncURL(); render();
  }
  function paintMaterial(source: THREE.Material) {
    const original = source as THREE.MeshStandardMaterial;
    return new THREE.MeshBasicMaterial({ color: original.color?.clone() || new THREE.Color('white'), map: original.map || null, alphaMap: original.alphaMap || null, side: original.side, opacity: original.opacity, transparent: original.transparent, alphaTest: original.alphaTest, vertexColors: original.vertexColors, toneMapped: false });
  }

  function disposeModel(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    const bitmaps = new Set<ImageBitmap>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const stored = variants.get(object);
      for (const material of stored ? [stored.studio, stored.paint].flat() : [object.material].flat()) {
        if (material === clay) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
      variants.delete(object);
    });
    textures.forEach(texture => {
      const data = texture.source?.data;
      for (const image of Array.isArray(data) ? data : [data]) if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) bitmaps.add(image);
      texture.dispose();
    });
    bitmaps.forEach(bitmap => bitmap.close());
    materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose()); root.removeFromParent();
  }
  function releaseCurrent() {
    orbit.enabled = false;
    if (model) { disposeModel(model); model = undefined; }
    renderer.renderLists.dispose();
    renderer.clear();
  }
  clearModel = () => { requestRevision++; activeFetch?.abort(); releaseCurrent(); };

  // Fetches are abortable. Parsing is serialized because GLTFLoader cannot abort
  // decode; a stale decode is disposed before a newer 80 MB source starts loading.
  selectModel = (driver: Driver) => {
    const revision = ++requestRevision;
    activeFetch?.abort(); releaseCurrent();
    showState('loading', `Opening ${driver.name}’s 3D study…`);
    queue = queue.catch(() => {}).then(async () => {
      if (disposed || revision !== requestRevision || layout !== 'study') return;
      const controller = new AbortController(); activeFetch = controller;
      let candidate: THREE.Group | undefined;
      try {
        const url = new URL(driver.model, location.href);
        url.searchParams.set('review', query.get('v') || String(Date.now()));
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          if (response.status === 404) throw new Error('pending');
          throw new Error(`Model request failed (${response.status}).`);
        }
        const bytes = await response.arrayBuffer();
        if (disposed || revision !== requestRevision) return;
        if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) throw new Error('pending');
        const asset = await loader.parseAsync(bytes, new URL('.', url).href);
        candidate = asset.scene;
        if (disposed || revision !== requestRevision || layout !== 'study') { disposeModel(candidate); candidate = undefined; return; }
        const bounds = new THREE.Box3().setFromObject(candidate);
        const size = bounds.getSize(new THREE.Vector3());
        if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 0) throw new Error('The model has no usable geometry.');
        const center = bounds.getCenter(new THREE.Vector3());
        const placement = new THREE.Group(); placement.position.set(-center.x, -bounds.min.y, -center.z); placement.add(candidate);
        const normalized = new THREE.Group(); normalized.scale.setScalar(1 / size.y); normalized.add(placement);
        model = normalized; candidate = undefined; modelSize = size.multiplyScalar(1 / size.y);
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true; object.receiveShadow = true;
          const originals = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of originals) for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          variants.set(object, { studio: object.material, paint: Array.isArray(object.material) ? originals.map(paintMaterial) : paintMaterial(originals[0]) });
        });
        scene.add(model); setFraming(closeUp); setAngle(angle); setSurface(surface);
        orbit.enabled = true; controls.forEach(control => { control.disabled = false; });
        viewer.dataset.state = 'ready'; document.body.dataset.ready = 'true'; loadState.hidden = true;
        status.textContent = `${driver.name}’s 3D study is ready.`;
        modelLink.href = driver.model; modelLink.setAttribute('aria-label', `Download ${driver.name}'s GLB model`); modelLink.hidden = false;
        render();
      } catch (error) {
        if (candidate) disposeModel(candidate);
        if (disposed || revision !== requestRevision || controller.signal.aborted) return;
        releaseCurrent();
        if (error instanceof Error && error.message === 'pending') showState('pending', `${driver.name}’s model is still being prepared. The source portrait is ready; try again when the 3D study arrives.`, true);
        else { console.warn(`Could not open ${driver.name}'s study.`, error); showState('error', `This 3D study could not be opened. You can still inspect ${driver.name}’s portrait or choose another character.`, true); }
      } finally {
        if (activeFetch === controller) activeFetch = undefined;
      }
    });
  };
  angleIds.forEach(id => button(id).addEventListener('click', () => setAngle(id)));
  surfaceIds.forEach(id => button(id).addEventListener('click', () => setSurface(id)));
  button('face').addEventListener('click', () => setFraming(true)); button('bust').addEventListener('click', () => setFraming(false));
  button('retry').addEventListener('click', () => selectModel?.(selected));
  canvas.addEventListener('keydown', event => {
    if (!model || !orbit.enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    if (event.key === 'ArrowLeft') spherical.theta -= .12;
    if (event.key === 'ArrowRight') spherical.theta += .12;
    if (event.key === 'ArrowUp') spherical.phi -= .08;
    if (event.key === 'ArrowDown') spherical.phi += .08;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, orbit.minPolarAngle, orbit.maxPolarAngle);
    camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(spherical)); orbit.update(); markAngle(null); render();
  });
  const observer = new ResizeObserver(fitFrame); observer.observe(viewer);
  window.addEventListener('pagehide', () => {
    disposed = true; requestRevision++; activeFetch?.abort(); releaseCurrent(); observer.disconnect(); orbit.dispose(); draco.dispose();
    clay.dispose(); floor.geometry.dispose(); floor.material.dispose(); environment.dispose(); key.shadow.dispose(); renderer.dispose();
  }, { once: true });
}

function initializeViewer() {
  try { startViewer(); }
  catch (error) { console.warn('Character review viewer is unavailable.', error); showState('error', 'This browser could not start the 3D viewer. Source portraits are still available in the Concept lineup.'); }
}
updateSelection();
setLayout(layout);
if (layout === 'study') { initializeViewer(); selectModel?.(selected); }

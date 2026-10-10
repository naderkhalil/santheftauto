import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAtmosphere } from './atmosphere';
import { createCar } from './car';
import { createRacerLoader, cloneRacerPart, loadRacerKit, releaseRacerPart, RACER_ASSET_VERSION } from './racer-assets';
import { CARS, DEFAULT_PROFILE, DRIVERS, type RacerProfile } from './racer-profile';
import { getRenderProfile } from './render-profile';

type Showroom = { resize(): void; setMode(mode: string): void; setProfile(profile: RacerProfile): void; render(now: number): void; dispose(): void };

/** Touch devices keep the city's only WebGL context; selection needs no second scene. */
export class RacerShowroom implements Showroom {
  private preview: Showroom;
  constructor(canvas: HTMLCanvasElement) {
    this.preview = getRenderProfile().mobile ? new MobileRacerShowroom(canvas) : new DesktopRacerShowroom(canvas);
  }
  resize() { this.preview.resize(); }
  setMode(mode: string) { this.preview.setMode(mode); }
  setProfile(profile: RacerProfile) { this.preview.setProfile(profile); }
  render(now: number) { this.preview.render(now); }
  dispose() { this.preview.dispose(); }
}

/** No model downloads, environment maps, postprocessing targets, or WebGL allocation. */
export class MobileRacerShowroom implements Showroom {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D | null;
  private observer: ResizeObserver;
  private profile = { ...DEFAULT_PROFILE };
  private mode = 'driver';
  private dirty = true;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    canvas.dataset.preview = 'lightweight';
    canvas.dataset.loaded = 'true';
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  resize() {
    if (this.disposed || !this.canvas.clientWidth || !this.canvas.clientHeight) return;
    // One backing pixel per CSS pixel is sufficient for this small, static card.
    const width = Math.min(800, Math.round(this.canvas.clientWidth));
    const height = Math.min(600, Math.round(this.canvas.clientHeight));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    this.canvas.dataset.renderSize = `${width}×${height}`;
    this.dirty = true;
  }

  setMode(mode: string) { if (this.mode !== mode) { this.mode = mode; this.dirty = true; } }
  setProfile(profile: RacerProfile) { this.profile = { ...profile }; this.dirty = true; }

  render(_now: number) {
    const context = this.context;
    if (this.disposed || !context || !this.dirty) return;
    this.dirty = false;
    const width = this.canvas.width, height = this.canvas.height;
    const driver = DRIVERS.find(entry => entry.id === this.profile.driver) ?? DRIVERS[0];
    const car = CARS.find(entry => entry.id === this.profile.car) ?? CARS[0];
    const carMode = this.mode === 'car';
    context.fillStyle = carMode ? '#dce9e5' : '#eee9dc'; context.fillRect(0, 0, width, height);
    context.save();
    context.translate(width / 2, height / 2);
    if (carMode) {
      const scale = Math.min(width / 380, height / 220, 1.8);
      context.scale(scale, scale);
      context.fillStyle = '#b9cec5'; context.beginPath(); context.ellipse(0, 51, 154, 12, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#244b50';
      for (const x of [-88, 88]) { context.beginPath(); context.arc(x, 35, 26, 0, Math.PI * 2); context.fill(); }
      context.fillStyle = car.color; context.beginPath(); context.moveTo(-143, 21); context.lineTo(-128, -15); context.lineTo(-67, -23); context.lineTo(-42, -50); context.lineTo(31, -50); context.lineTo(62, -20); context.lineTo(124, -14); context.lineTo(145, 21); context.lineTo(141, 40); context.lineTo(-140, 40); context.closePath(); context.fill();
      context.fillStyle = '#f9f3df'; context.beginPath(); context.moveTo(-49, -21); context.lineTo(-32, -43); context.lineTo(26, -43); context.lineTo(48, -21); context.closePath(); context.fill();
      context.strokeStyle = '#fff4d5'; context.lineWidth = 4; context.beginPath(); context.moveTo(-128, 10); context.lineTo(126, 10); context.stroke();
      context.fillStyle = '#ead7ad';
      for (const x of [-88, 88]) { context.beginPath(); context.arc(x, 35, 14, 0, Math.PI * 2); context.fill(); }
      context.fillStyle = '#ffedb0'; context.fillRect(124, -9, 10, 8);
      context.fillStyle = '#244b50'; context.textAlign = 'center'; context.font = '600 13px Arial, sans-serif';
      context.fillText(driver.name + ' · ' + car.name, 0, 92);
      this.canvas.setAttribute('aria-label', `${car.name} in ${car.id === 'sundrop' ? 'teal' : car.id === 'comet' ? 'terracotta' : 'buttercream'}, driven by ${driver.name}`);
    } else {
      const radius = Math.max(35, Math.min(width * .22, height * .25, 90));
      context.fillStyle = driver.color; context.beginPath(); context.arc(0, -15, radius, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#244b50'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.font = `800 ${radius * .74}px Arial, sans-serif`;
      context.fillText(driver.name.split(' ').map(part => part[0]).slice(0, 2).join(''), 0, -13);
      context.font = `700 ${Math.min(24, width * .07)}px Arial, sans-serif`;
      context.fillText(driver.name, 0, radius + 17);
      context.font = '600 10px Arial, sans-serif'; context.fillStyle = '#647c6e';
      context.fillText(driver.title, 0, radius + 39);
      this.canvas.setAttribute('aria-label', `Selected driver: ${driver.name}, ${driver.title}`);
    }
    context.restore();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.observer.disconnect();
    this.canvas.width = this.canvas.height = 1;
    this.context = null;
  }
}

/** Approved cartoon portraits in a soft studio, beside the playable car preview. */
class DesktopRacerShowroom {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private pass: RenderPass;
  private ao: GTAOPass;
  private smaa: SMAAPass;
  private scene = new THREE.Scene();
  private portraitScene = new THREE.Scene();
  private lineup = new THREE.Group();
  private garage = new THREE.Group();
  private world = new THREE.Group();
  private car = createCar();
  private founders: THREE.Object3D[] = [];
  private camera = new THREE.PerspectiveCamera(38, 1, .1, 4200);
  private lineupCamera = new THREE.OrthographicCamera(-5, 5, 2, -2, .1, 100);
  private atmosphere: ReturnType<typeof createAtmosphere>;
  private portraitKey: THREE.DirectionalLight;
  private portraitEnvironment: THREE.WebGLRenderTarget;
  private mode = 'driver';
  private selected: string = DRIVERS[0].id;
  private rotation = .48;
  private portraitRotation = -.08;
  private dragX: number | null = null;
  private last = 0;
  private dirty = true;
  private visualRevision = -1;
  private observer: ResizeObserver;
  private disposed = false;
  private canvas: HTMLCanvasElement;
  private events = new AbortController();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.lineup.scale.z = -1;
    this.world.scale.z = -1;
    this.world.add(this.garage, this.car.group);
    this.scene.add(this.world);
    this.portraitScene.add(this.lineup);
    this.atmosphere = createAtmosphere(this.renderer, this.scene, this.camera, {
      sampleRoute: () => new THREE.Vector3(0, -18, 0), shadowExtent: 13,
      sunDirection: { x: -.57, y: .682, z: .461 },
      reflectionPoints: [{ x: 0, y: 1.5, z: 1 }],
    });
    this.atmosphere.update(0, 0);
    this.scene.traverse(object => {
      if (object instanceof THREE.DirectionalLight && object.castShadow) {
        object.shadow.normalBias = .012;
        object.shadow.bias = -.000035;
        object.intensity = 3.0;
      }
    });

    // One large portrait keeps facial detail legible as the roster grows.
    this.portraitScene.background = new THREE.Color('#e8e6de');
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.portraitEnvironment = pmrem.fromScene(room, .05);
    this.portraitScene.environment = this.portraitEnvironment.texture;
    this.portraitScene.environmentIntensity = .4;
    room.dispose();
    pmrem.dispose();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: '#687062', opacity: .12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = .997;
    floor.receiveShadow = true;
    this.lineup.add(floor);
    this.portraitScene.add(new THREE.HemisphereLight('#fffbf1', '#b4b5b0', .55));
    this.portraitKey = new THREE.DirectionalLight('#fff4e4', 1.7);
    this.portraitKey.position.set(-1.6, 3.5, -2.5);
    this.portraitKey.target.position.set(0, 1.6, 0);
    this.portraitKey.castShadow = true;
    this.portraitKey.shadow.mapSize.set(2048, 2048);
    // Frame the single bust closely enough to retain eyelid and nose shadows.
    Object.assign(this.portraitKey.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: .1, far: 8 });
    this.portraitKey.shadow.camera.updateProjectionMatrix();
    this.portraitKey.shadow.bias = -.000025;
    this.portraitKey.shadow.normalBias = .002;
    this.portraitKey.shadow.radius = 3;
    this.portraitScene.add(this.portraitKey, this.portraitKey.target);
    const portraitFill = new THREE.DirectionalLight('#e5eef5', .5);
    portraitFill.position.set(2, 2.2, -1.4);
    portraitFill.target.position.y = 1;
    this.portraitScene.add(portraitFill, portraitFill.target);
    const rim = new THREE.DirectionalLight('#fff7e8', .7);
    rim.position.set(1.5, 2.8, 1.8);
    rim.target.position.y = 1;
    this.portraitScene.add(rim, rim.target);

    // Canvas antialias alone does not cover an offscreen composer. Multisample
    // its actual render target, then smooth the remaining subpixel trim/shadows.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.pass = new RenderPass(this.portraitScene, this.lineupCamera);
    this.composer.addPass(this.pass);
    this.ao = new GTAOPass(this.portraitScene, this.lineupCamera, 640, 360);
    this.ao.blendIntensity = .32;
    this.ao.updateGtaoMaterial({ radius: .3, thickness: .3, distanceExponent: 1.6, samples: 16 });
    this.ao.updatePdMaterial({ radius: 4, rings: 2, samples: 16 });
    this.composer.addPass(this.ao);
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.composer.addPass(new OutputPass());
    const renderAO = this.ao.render.bind(this.ao);
    this.ao.render = (renderer, write, read, dt, mask) => {
      const hidden: THREE.Mesh[] = [];
      this.pass.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.visible) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.every(m => m.transparent || m.alphaTest > 0)) { object.visible = false; hidden.push(object); }
      });
      const shadows = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      try { renderAO(renderer, write, read, dt, mask); }
      finally { hidden.forEach(object => object.visible = true); renderer.shadowMap.autoUpdate = shadows; }
    };

    const people = loadRacerKit().then(kit => {
      if (this.disposed) return;
      DRIVERS.forEach(driver => {
        const actor = new THREE.Group();
        actor.name = `Portrait / ${driver.id}`;
        actor.add(cloneRacerPart(kit, `Standing_${driver.id}`));
        actor.visible = driver.id === this.selected;
        this.prepareMaterials(actor);
        this.lineup.add(actor);
        this.founders.push(actor);
      });
      this.canvas.dataset.loaded = 'true';
      this.resize();
    });
    const building = createRacerLoader().loadAsync(`/assets/models/racer-garage.glb?v=${RACER_ASSET_VERSION}`).then(asset => {
      if (this.disposed) { this.release(asset.scene); return; }
      asset.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
      this.prepareMaterials(asset.scene);
      this.garage.add(asset.scene);
    });
    const textures = new THREE.TextureLoader();
    const street = Promise.all(['asphalt-color.jpg', 'asphalt-normal.jpg', 'asphalt-roughness.jpg'].map(path => textures.loadAsync('/assets/' + path))).then(([color, normal, roughness]) => {
      if (this.disposed) { [color, normal, roughness].forEach(t => t.dispose()); return; }
      color.colorSpace = THREE.SRGBColorSpace;
      for (const texture of [color, normal, roughness]) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(12, 8);
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      }
      const road = new THREE.Mesh(new THREE.PlaneGeometry(72, 48), new THREE.MeshStandardMaterial({ map: color, normalMap: normal, normalScale: new THREE.Vector2(.14, .14), roughnessMap: roughness, color: '#b2bbcb', roughness: .87 }));
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, -.16, 20);
      road.receiveShadow = true;
      this.garage.add(road);
    });
    Promise.all([people, building, street, this.car.ready, this.atmosphere.loadPhotographicSky()]).then(() => {
      if (this.disposed) return;
      this.prepareMaterials(this.car.group);
      this.scene.updateMatrixWorld(true);
      this.atmosphere.bakeCityReflections(this.car.group);
      this.canvas.dataset.loaded = 'true';
      this.resize();
    }).catch(error => { this.canvas.dataset.loaded = 'error'; console.warn('Racer showroom assets could not load.', error); });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', event => {
      if (this.mode !== 'car' && this.mode !== 'driver') return;
      this.dragX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    }, { signal: this.events.signal });
    canvas.addEventListener('pointermove', event => {
      if (this.dragX === null) return;
      const delta = (event.clientX - this.dragX) * .004;
      if (this.mode === 'driver') this.portraitRotation = THREE.MathUtils.euclideanModulo(this.portraitRotation + delta + Math.PI, Math.PI * 2) - Math.PI;
      else this.rotation = THREE.MathUtils.clamp(this.rotation + delta, -.65, .75);
      this.dragX = event.clientX;
      this.resize();
    }, { signal: this.events.signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => this.dragX = null, { signal: this.events.signal });
    this.resize();
  }

  private prepareMaterials(root: THREE.Object3D) {
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.anisotropy = anisotropy;
      }
    });
  }

  resize() {
    if (this.disposed) return;
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.dirty = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.canvas.dataset.renderSize = `${this.canvas.width}×${this.canvas.height}`;
    const aspect = width / height;
    this.camera.aspect = aspect;
    const distance = Math.max(5.25, 8.2 / aspect);
    this.camera.position.set(Math.sin(this.rotation) * distance, aspect < 1 ? 2.2 : 2.0, -Math.cos(this.rotation) * distance);
    this.camera.lookAt(0, .92, .15);
    this.camera.updateProjectionMatrix();
    let portraitBounds: THREE.Box3 | undefined;
    this.founders.forEach((actor, i) => {
      actor.visible = DRIVERS[i].id === this.selected;
      actor.rotation.y = this.portraitRotation;
      if (actor.visible) portraitBounds = new THREE.Box3().setFromObject(actor);
    });
    const bustHeight = portraitBounds ? portraitBounds.max.y - portraitBounds.min.y : 1;
    const top = (portraitBounds?.max.y ?? 2) + bustHeight * .055;
    // Frame the face and upper shoulders consistently. Fitting the entire bust
    // width made broad jackets shrink the face, especially on narrow screens.
    const vertical = Math.max(bustHeight * .80, bustHeight * .64 / aspect) / 2;
    const horizontal = vertical * aspect;
    Object.assign(this.lineupCamera, { left: -horizontal, right: horizontal, top: vertical, bottom: -vertical });
    this.lineupCamera.position.set(0, top - vertical, -6);
    this.lineupCamera.lookAt(0, top - vertical, 0);
    this.lineupCamera.updateProjectionMatrix();
    this.lineupCamera.updateMatrixWorld();
  }

  setMode(mode: string) {
    if (mode === this.mode) return;
    this.mode = mode;
    const perspective = mode === 'car' ? 1 : 0;
    // GTAO compiles its depth reconstruction for a specific projection type.
    for (const material of [this.ao.gtaoMaterial, this.ao.depthRenderMaterial]) {
      if (material.defines.PERSPECTIVE_CAMERA !== perspective) {
        material.defines.PERSPECTIVE_CAMERA = perspective;
        material.needsUpdate = true;
      }
    }
    this.resize();
  }
  setProfile(profile: RacerProfile) {
    const changedDriver = this.selected !== profile.driver;
    this.selected = profile.driver;
    this.car.customize(profile);
    if (changedDriver) { this.portraitRotation = -.08; this.resize(); }
    this.dirty = true;
    this.renderer.shadowMap.needsUpdate = true;
  }
  render(now: number) {
    if (this.disposed) return;
    // The models hold their pose. Repaint on selection, asset load or orbit,
    // rather than spending a full game's GPU budget on an unchanged menu.
    const revision = this.car.group.userData.visualRevision ?? 0;
    if (!this.dirty && revision === this.visualRevision) return;
    this.visualRevision = revision;
    this.dirty = false;
    const dt = this.last ? Math.min(.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.car.update(dt, { speed: 0, steer: 0, braking: false, boosting: false, time: now / 1000 });
    const carMode = this.mode === 'car';
    const camera = carMode ? this.camera : this.lineupCamera;
    const scene = carMode ? this.scene : this.portraitScene;
    this.pass.camera = camera;
    this.pass.scene = scene;
    this.ao.camera = camera;
    this.ao.scene = scene;
    // The painted character textures already carry their sculpted shading.
    // Extra screen-space occlusion muddies eyes and hair; keep it for the car.
    this.ao.enabled = carMode;
    this.composer.render();
    this.renderer.shadowMap.autoUpdate = false;
  }

  private release(root: THREE.Object3D) {
    const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    textures.forEach(texture => texture.dispose());
    materials.forEach(material => material.dispose());
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.observer.disconnect();
    this.car.dispose();
    this.founders.forEach(actor => releaseRacerPart(actor));
    this.release(this.garage);
    this.release(this.lineup);
    this.portraitKey.shadow.map?.dispose();
    this.portraitEnvironment.dispose();
    this.ao.dispose();
    this.smaa.dispose();
    this.composer.dispose();
    this.atmosphere.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.width = this.canvas.height = 1;
  }
}

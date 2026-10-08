import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createAtmosphere } from './atmosphere';
import { createCar } from './car';
import { createRacerLoader, cloneRacerPart, loadRacerKit, releaseRacerPart, RACER_ASSET_VERSION } from './racer-assets';
import { DRIVERS, type RacerProfile } from './racer-profile';

/** The playable models, rendered at display resolution with the city's materials. */
export class RacerShowroom {
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
  private mode = 'driver';
  private selected = 'jensen';
  private rotation = .48;
  private dragX: number | null = null;
  private last = 0;
  private dirty = true;
  private visualRevision = -1;
  private observer: ResizeObserver;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
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

    // A seamless warm portrait space lets the sculpt and clothes carry the lineup.
    this.portraitScene.background = new THREE.Color('#eee9dc');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#e2ddcf', roughness: .92 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.018;
    floor.receiveShadow = true;
    this.lineup.add(floor);
    this.portraitScene.add(new THREE.HemisphereLight('#fff6e8', '#b0a998', 1.15));
    this.portraitKey = new THREE.DirectionalLight('#fff3dd', 2.6);
    this.portraitKey.position.set(-3, 7, -5);
    this.portraitKey.target.position.set(0, 1, 0);
    this.portraitKey.castShadow = true;
    this.portraitKey.shadow.mapSize.set(4096, 4096);
    Object.assign(this.portraitKey.shadow.camera, { left: -9, right: 9, top: 5, bottom: -5, near: .5, far: 30 });
    this.portraitKey.shadow.bias = -.00004;
    this.portraitKey.shadow.normalBias = .012;
    this.portraitKey.shadow.radius = 3;
    this.portraitScene.add(this.portraitKey, this.portraitKey.target);
    const portraitFill = new THREE.DirectionalLight('#dce9f2', 1.1);
    portraitFill.position.set(4, 3, -2);
    this.portraitScene.add(portraitFill);
    const rim = new THREE.DirectionalLight('#fff3da', 1.4);
    rim.position.set(2, 5, 3);
    this.portraitScene.add(rim);

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
        actor.scale.setScalar(1.35);
        this.prepareMaterials(actor);
        this.lineup.add(actor);
        this.founders.push(actor);
      });
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
      this.portraitScene.environment = this.scene.environment;
      this.portraitScene.environmentIntensity = .25;
      this.canvas.dataset.loaded = 'true';
      this.resize();
    }).catch(error => { this.canvas.dataset.loaded = 'error'; console.warn('Racer showroom assets could not load.', error); });

    this.lineupCamera.position.set(0, 2.7, -12);
    this.lineupCamera.lookAt(0, 1.36, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', event => {
      if (this.mode !== 'car') return;
      this.dragX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (this.dragX === null) return;
      this.rotation = THREE.MathUtils.clamp(this.rotation + (event.clientX - this.dragX) * .004, -.65, .75);
      this.dragX = event.clientX;
      this.resize();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => this.dragX = null);
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
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.dirty = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.canvas.dataset.renderSize = `${this.canvas.width}×${this.canvas.height}`;
    const aspect = width / height;
    this.camera.aspect = aspect;
    const distance = aspect < 1 ? 8.5 : 5.25;
    this.camera.position.set(Math.sin(this.rotation) * distance, aspect < 1 ? 2.2 : 2.0, -Math.cos(this.rotation) * distance);
    this.camera.lookAt(0, .92, .15);
    this.camera.updateProjectionMatrix();
    const horizontal = Math.max(3.65, 1.68 * aspect), vertical = horizontal / aspect;
    Object.assign(this.lineupCamera, { left: -horizontal, right: horizontal, top: vertical, bottom: -vertical });
    this.lineupCamera.updateProjectionMatrix();
    this.founders.forEach((actor, i) => {
      actor.position.x = -horizontal * [-.75, -.25, .25, .75][i];
      actor.rotation.y = (i < 2 ? -1 : 1) * .045;
    });
    this.lineupCamera.updateMatrixWorld();
    const head = new THREE.Vector3(0, 2.86, 0).project(this.lineupCamera);
    this.canvas.closest('dialog')?.style.setProperty('--tag-y', `${Math.max(0, (1 - head.y) * height / 2 - 34)}px`);
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
    this.selected = profile.driver;
    this.car.customize(profile);
    this.dirty = true;
    this.renderer.shadowMap.needsUpdate = true;
  }
  render(now: number) {
    // The models hold their pose. Repaint on selection, asset load or orbit,
    // rather than spending a full game's GPU budget on an unchanged menu.
    const revision = this.car.group.userData.visualRevision ?? 0;
    if (!this.dirty && revision === this.visualRevision) return;
    this.visualRevision = revision;
    this.dirty = false;
    const dt = this.last ? Math.min(.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.founders.forEach((actor, i) => {
      actor.scale.setScalar(DRIVERS[i].id === this.selected ? 1.38 : 1.35);
      actor.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(actor);
      const head = new THREE.Vector3(0, bounds.max.y + .06, 0).project(this.lineupCamera);
      const tags = this.canvas.closest('dialog')?.querySelector<HTMLElement>(`[data-tags="${DRIVERS[i].id}"]`);
      if (tags) tags.style.top = `${Math.max(0, (1 - head.y) * this.canvas.clientHeight / 2 - 30)}px`;
    });
    this.car.update(dt, { speed: 0, steer: 0, braking: false, boosting: false, time: now / 1000 });
    const carMode = this.mode === 'car';
    const camera = carMode ? this.camera : this.lineupCamera;
    const scene = carMode ? this.scene : this.portraitScene;
    this.pass.camera = camera;
    this.pass.scene = scene;
    this.ao.camera = camera;
    this.ao.scene = scene;
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
    this.disposed = true;
    this.observer.disconnect();
    this.car.dispose();
    this.founders.forEach(actor => releaseRacerPart(actor));
    this.release(this.garage);
    this.release(this.lineup);
    this.portraitKey.shadow.map?.dispose();
    this.ao.dispose();
    this.smaa.dispose();
    this.composer.dispose();
    this.atmosphere.dispose();
    this.renderer.dispose();
  }
}

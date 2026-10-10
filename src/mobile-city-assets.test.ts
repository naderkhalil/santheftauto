import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Resolve Vite's extensionless imports while exercising the actual asset loaders.
const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(new URL('.', import.meta.url).href) && /^\.\.?\/[^.]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
let createWestin: typeof import('./westin.ts').createWestin;
let createNorthSquare: typeof import('./north-square.ts').createNorthSquare;
let createSquareFrontages: typeof import('./square-frontages.ts').createSquareFrontages;
let createWaterfrontAssets: typeof import('./waterfront-assets.ts').createWaterfrontAssets;
let createPlazaAssets: typeof import('./plaza-assets.ts').createPlazaAssets;
let createSquareStreetDetails: typeof import('./square-street-details.ts').createSquareStreetDetails;
try {
  ({ createWestin } = await import('./westin.ts'));
  ({ createNorthSquare } = await import('./north-square.ts'));
  ({ createSquareFrontages } = await import('./square-frontages.ts'));
  ({ createWaterfrontAssets } = await import('./waterfront-assets.ts'));
  ({ createPlazaAssets } = await import('./plaza-assets.ts'));
  ({ createSquareStreetDetails } = await import('./square-street-details.ts'));
} finally { resolver.deregister(); }

function model() {
  const scene = new THREE.Group(), material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  material.name = 'Stone';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); mesh.name = 'Facade'; scene.add(mesh);
  return { scene };
}
function profile(mobile: boolean) {
  const saved = new Map(['navigator', 'matchMedia', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: mobile ? 'iPhone' : 'Desktop', platform: mobile ? 'iPhone' : 'Linux', maxTouchPoints: mobile ? 5 : 0 } });
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: mobile }) });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '' } });
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
}

test('mobile city loaders request only LOD architecture, serialize waterfront decoding, and keep shadows off', async t => {
  const restore = profile(true); t.after(restore);
  const requests: string[] = [];
  let activeWaterfront = 0, maximumWaterfront = 0;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => {
    requests.push(url.split('?')[0]);
    if (url.includes('/waterfront/')) {
      activeWaterfront++; maximumWaterfront = Math.max(maximumWaterfront, activeWaterfront);
      await new Promise<void>(resolve => setImmediate(resolve));
      activeWaterfront--;
    }
    return model();
  });
  const workers = t.mock.method(DRACOLoader.prototype, 'setWorkerLimit');
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected mobile scan or planting download'); });
  const parent = new THREE.Group(), fallbacks = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  const buildings = [createWestin(parent, fallbacks[0]), createNorthSquare(parent, fallbacks[1]), createSquareFrontages(parent, fallbacks[2])];
  await Promise.all(buildings.map(asset => asset.ready));
  const waterfront = createWaterfrontAssets(parent); await waterfront.ready;
  assert.deepEqual(requests, [
    '/assets/hero/westin-lod.glb', '/assets/north-square/north-square-lod.glb', '/assets/square-frontages/square-frontages-lod.glb',
    '/assets/waterfront/ferry-building-lod.glb', '/assets/waterfront/embarcadero-lod.glb', '/assets/waterfront/bay-bridge.glb',
  ]);
  assert.deepEqual(workers.mock.calls.map(call => call.arguments[0]), [1, 1, 1, 1]);
  assert.equal(maximumWaterfront, 1, 'Waterfront exports must not overlap their decode/merge lifetimes');
  assert.ok(fallbacks.every(fallback => !fallback.visible), 'Loaded LODs replace the old building placeholders');
  assert.equal(network.mock.callCount(), 0);
  const camera = new THREE.PerspectiveCamera();
  for (const asset of [...buildings, waterfront]) {
    asset.setQuality(false); asset.update(camera);
    let visibleMeshes = 0;
    asset.group.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      visibleMeshes++;
      assert.equal(object.castShadow, false, 'Switching quality must not re-enable mobile shadow maps');
      for (const material of [object.material].flat()) if (material instanceof THREE.MeshStandardMaterial && material.map) assert.equal(material.map.anisotropy, 1);
    });
    assert.ok(visibleMeshes > 0, 'LOD-only architecture must still render without a near/far pair');
  }
});

test('mobile plaza and street details preserve procedural fallbacks without creating loaders', async t => {
  const restore = profile(true); t.after(restore);
  const downloads = t.mock.method(GLTFLoader.prototype, 'loadAsync', () => { throw new Error('Decorative asset requested on mobile'); });
  const decoders = t.mock.method(DRACOLoader.prototype, 'setDecoderPath');
  const parent = new THREE.Group(), monument = new THREE.Group(), palms = new THREE.Group();
  const plaza = createPlazaAssets(parent, monument, palms), details = createSquareStreetDetails(parent);
  await Promise.all([plaza.ready, details.ready]);
  plaza.setQuality(false); details.setQuality(false); details.update(new THREE.PerspectiveCamera());
  assert.equal(monument.visible, true); assert.equal(palms.visible, true);
  assert.equal(plaza.group.children.length, 0); assert.equal(details.group.children.length, 0);
  assert.equal(downloads.mock.callCount(), 0, 'No monument, palm, jacaranda, or street-detail GLB should load');
  assert.equal(decoders.mock.callCount(), 0, 'No decoder should be allocated for skipped decoration');
});

test('desktop landmark loaders still retain both complete and distant exports', async t => {
  const restore = profile(false); t.after(restore);
  const requests: string[] = [];
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => { requests.push(url.split('?')[0]); return model(); });
  const workers = t.mock.method(DRACOLoader.prototype, 'setWorkerLimit');
  const parent = new THREE.Group();
  const assets = [createWestin(parent, new THREE.Group()), createNorthSquare(parent, new THREE.Group()), createSquareFrontages(parent, new THREE.Group())];
  await Promise.all(assets.map(asset => asset.ready));
  assert.deepEqual(requests.sort(), [
    '/assets/hero/westin.glb', '/assets/hero/westin-lod.glb', '/assets/north-square/north-square.glb',
    '/assets/north-square/north-square-lod.glb', '/assets/square-frontages/square-frontages.glb', '/assets/square-frontages/square-frontages-lod.glb',
  ].sort());
  assert.equal(workers.mock.callCount(), 0, 'Keep the existing desktop decoder policy');
  for (const asset of assets) {
    const lod = asset.group.children.find(child => child instanceof THREE.LOD) as THREE.LOD;
    assert.equal(lod.levels.length, 2);
  }
});

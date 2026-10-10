import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(new URL('.', import.meta.url).href) && /^\.\.?\/[^.]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
let createAtmosphere: typeof import('./atmosphere.ts').createAtmosphere;
try { ({ createAtmosphere } = await import('./atmosphere.ts')); }
finally { resolver.deregister(); }

test('lightweight atmosphere keeps a lit sky without renderer targets, HDR downloads, or shadows', async t => {
  const downloads = t.mock.method(HDRLoader.prototype, 'loadAsync', () => { throw new Error('HDR should not load on mobile'); });
  const renderer = new Proxy({}, { get(_target, key) { throw new Error('Lightweight atmosphere touched renderer: ' + String(key)); } }) as THREE.WebGLRenderer;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(10, 30, -40);
  let reflectionPreparations = 0;
  const atmosphere = createAtmosphere(renderer, scene, camera, { lightweight: true, prepareReflection: () => { reflectionPreparations++; } });
  try {
    await atmosphere.loadPhotographicSky(); atmosphere.bakeCityReflections();
    for (const low of [true, false]) {
      atmosphere.setQuality(low, true); atmosphere.update(10, 35);
      assert.equal(scene.environment, null, 'An environment texture can trigger automatic PMREM allocation');
      assert.equal(atmosphere.captured, false);
      assert.ok(scene.children.filter(child => child instanceof THREE.DirectionalLight).every(light => !light.castShadow));
    }
    assert.equal(downloads.mock.callCount(), 0);
    assert.equal(reflectionPreparations, 0);
    assert.equal(scene.children.some(child => child instanceof THREE.CubeCamera), false);
    const sky = scene.getObjectByName('Pacific blue sky');
    assert.ok(sky instanceof THREE.Mesh && sky.visible);
    assert.deepEqual(sky.position.toArray(), camera.position.toArray());
    assert.ok(scene.children.some(child => child instanceof THREE.HemisphereLight && child.intensity > 0), 'Direct light provides the environment fallback');
  } finally { atmosphere.dispose(); }
  await atmosphere.loadPhotographicSky(); atmosphere.bakeCityReflections();
  assert.equal(downloads.mock.callCount(), 0, 'Disposed lightweight skies must stay inert');
});

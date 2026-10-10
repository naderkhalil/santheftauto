import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_PROFILE } from './racer-profile.ts';

const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(new URL('.', import.meta.url).href) && /^\.\.?\/[^.]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
let RacerShowroom: typeof import('./racer-showroom.ts').RacerShowroom;
try { ({ RacerShowroom } = await import('./racer-showroom.ts')); }
finally { resolver.deregister(); }

test('mobile showroom keeps selection functional without another WebGL context or any asset downloads', t => {
  const previous = new Map(['matchMedia', 'ResizeObserver', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let disconnects = 0, observations = 0;
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
    observe() { observations++; }
    disconnect() { disconnects++; }
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { throw new Error('Mobile showroom must not create renderer/car assets'); } } });
  const download = t.mock.method(GLTFLoader.prototype, 'loadAsync', () => { throw new Error('Mobile showroom must not load the high-detail kit'); });
  const contexts: string[] = [], labels: string[] = [], drawn: string[] = [];
  const context = new Proxy({}, { get(_target, key) { return key === 'fillText' ? (text: string) => drawn.push(text) : () => {}; } });
  const canvas = {
    clientWidth: 1200, clientHeight: 1000, width: 0, height: 0, dataset: {} as Record<string,string>,
    getContext(type: string) { contexts.push(type); return context; },
    setAttribute(name: string, value: string) { if (name === 'aria-label') labels.push(value); },
  };
  try {
    const showroom = new RacerShowroom(canvas as unknown as HTMLCanvasElement);
    showroom.render(0);
    assert.deepEqual(contexts, ['2d']);
    assert.equal(download.mock.callCount(), 0);
    assert.equal(observations, 1);
    assert.equal(canvas.dataset.preview, 'lightweight');
    assert.equal(canvas.width * canvas.height, 800 * 600, 'Even a large tablet preview has a bounded backing surface');
    assert.ok(drawn.includes('Dario Amodei'));
    const drawCount = drawn.length;
    showroom.render(16);
    assert.equal(drawn.length, drawCount, 'An unchanged preview does not redraw each frame');
    showroom.setProfile({ ...DEFAULT_PROFILE, driver: 'mira', car: 'tide' });
    showroom.render(32);
    assert.ok(drawn.includes('Mira Murati'));
    showroom.setMode('car'); showroom.render(48);
    assert.ok(drawn.some(text => text.includes('Mira Murati') && text.includes('Tide Roadster')));
    assert.ok(labels.at(-1)?.includes('buttercream'));
    showroom.dispose(); showroom.dispose(); showroom.resize(); showroom.render(64);
    assert.equal(disconnects, 1);
    assert.equal(canvas.width, 1); assert.equal(canvas.height, 1);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

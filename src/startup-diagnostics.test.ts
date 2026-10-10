import assert from 'node:assert/strict';
import test from 'node:test';
import { StartupDiagnostics, STARTUP_STORAGE_KEY } from './startup-diagnostics.ts';
import type { StartupContext, StartupEvent } from './startup-diagnostics.ts';

function fixture() {
  let now = 1_000_000;
  const data = new Map<string, string>();
  const events: { event: StartupEvent; properties: Record<string, unknown> }[] = [];
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const create = () => new StartupDiagnostics({ storage, now: () => now, capture: (event, properties) => { events.push({ event, properties }); } });
  return { data, events, storage, create, advance(ms: number) { now += ms; } };
}

test('a fresh pending reload reports interruption without claiming a crash', () => {
  const f = fixture(), first = f.create();
  first.start({ buildVersion: '990926f', browser: 'safari', os: 'ios', osVersion: '18.6.2' });
  f.advance(750);
  first.stage('reflections:start', ['drivers and cars']);
  f.advance(250);
  const second = f.create(); second.start({ buildVersion: 'diagnostics-1' });
  const interrupted = f.events.find(entry => entry.event === 'startup_interrupted')!;
  assert.equal(interrupted.properties.crash_confirmed, false);
  assert.equal(interrupted.properties.stage, 'reflections:start');
  assert.equal(interrupted.properties.buildVersion, '990926f');
  assert.equal(interrupted.properties.elapsed_ms, 750);
  assert.deepEqual(interrupted.properties.pending_assets, ['drivers and cars']);
  assert.equal(second.snapshot()?.context.buildVersion, 'diagnostics-1');
  assert.equal(second.snapshot()?.status, 'pending');
  assert.equal(JSON.parse(f.data.get(STARTUP_STORAGE_KEY)!).startedAt, 1_001_000);
});

test('success, known failure, and ordinary navigation are never reclassified as interruptions', () => {
  for (const terminal of ['complete', 'failed', 'navigated'] as const) {
    const f = fixture(), diagnostic = f.create(); diagnostic.start();
    if (terminal === 'complete') diagnostic.complete();
    else if (terminal === 'failed') diagnostic.failure('timeout', new Error('PRIVATE'));
    else diagnostic.pagehide();
    diagnostic.pagehide(); diagnostic.complete(); diagnostic.failure('startup'); diagnostic.stage('city');
    assert.equal(diagnostic.snapshot()?.status, terminal);
    if (terminal === 'failed') assert.deepEqual(diagnostic.snapshot()?.failure, { kind: 'timeout', errorType: 'Error' });
    f.create().start();
    assert.equal(f.events.filter(entry => entry.event === 'startup_interrupted').length, 0);
  }
});

test('stale, future, oversized, and malformed storage is ignored without blocking startup', () => {
  const f = fixture(); f.create().start();
  const valid = JSON.parse(f.data.get(STARTUP_STORAGE_KEY)!);
  const examples = [
    '', '{bad json', 'null', '[]', 'x'.repeat(16001),
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, startedAt: -1_000_001 }),
    JSON.stringify({ ...valid, updatedAt: 1_000_001 }),
    JSON.stringify({ ...valid, status: 'PRIVATE' }),
    JSON.stringify({ ...valid, checkpoints: [] }),
    JSON.stringify({ ...valid, checkpoints: [{ stage: 'https://private/?room=SECRET', elapsedMs: 0 }] }),
    JSON.stringify({ ...valid, checkpoints: [{ stage: 'city', elapsedMs: -1 }] }),
    JSON.stringify({ ...valid, checkpoints: Array(25).fill({ stage: 'city', elapsedMs: 0 }) }),
  ];
  for (const raw of examples) {
    f.events.length = 0; f.data.set(STARTUP_STORAGE_KEY, raw);
    const diagnostic = f.create(); assert.doesNotThrow(() => diagnostic.start());
    assert.equal(diagnostic.snapshot()?.status, 'pending');
    assert.deepEqual(f.events.map(entry => entry.event), ['startup_started']);
  }
  const stale = fixture(); stale.create().start(); stale.advance(30 * 60 * 1000 + 1);
  stale.create().start();
  assert.equal(stale.events.some(entry => entry.event === 'startup_interrupted'), false);
});

test('only approved context, stages, assets, and error types survive sanitization', () => {
  const f = fixture(), diagnostic = f.create();
  diagnostic.start({
    buildVersion: 'https://private/?room=SECRET', browser: 'safari', os: 'ios', browserVersion: '18.6', osVersion: 'SECRET',
    width: 390, height: 844, pixelRatio: 3, quality: 'high',
    url: 'https://private/?room=SECRET', room: 'SECRET', player: 'SECRET', referrer: 'SECRET', userAgent: 'SECRET',
  } as StartupContext);
  assert.deepEqual(diagnostic.snapshot()?.context, { browserVersion: '18.6', browser: 'safari', os: 'ios', quality: 'high', width: 390, height: 844, pixelRatio: 3 });
  diagnostic.stage('SECRET');
  diagnostic.stage('assets', ['road textures', 'SECRET', 'https://private/?room=SECRET', 'road textures']);
  diagnostic.failure('https://private/?room=SECRET', new TypeError('SECRET https://private/?room=SECRET'));
  assert.deepEqual(diagnostic.snapshot()?.failure, { kind: 'startup', errorType: 'TypeError' });
  assert.deepEqual(diagnostic.snapshot()?.checkpoints.at(-1)?.pendingAssets, ['road textures']);
  assert.doesNotMatch(JSON.stringify([diagnostic.snapshot(), f.events, [...f.data.values()]]), /SECRET|https:|room|referrer|player|userAgent/);
});

test('stored context and asset names are sanitized again before interruption capture', () => {
  const f = fixture(); f.create().start({ buildVersion: '990926f' });
  const saved = JSON.parse(f.data.get(STARTUP_STORAGE_KEY)!);
  saved.context.url = 'SECRET'; saved.context.browser = 'SECRET'; saved.context.width = 1e99;
  saved.checkpoints[0].pendingAssets = ['SECRET', 'Pacific sky'];
  saved.checkpoints[0].privateMetadata = 'SECRET'; saved.failure = { kind: 'SECRET', errorType: 'SECRET' };
  f.data.set(STARTUP_STORAGE_KEY, JSON.stringify(saved)); f.events.length = 0;
  f.create().start();
  assert.doesNotMatch(JSON.stringify(f.events), /SECRET/);
  assert.deepEqual(f.events[0].properties.pending_assets, ['Pacific sky']);
  assert.equal(f.events[0].properties.width, undefined);
});

test('checkpoints and emitted stage count stay bounded, with terminal events still delivered', () => {
  const f = fixture(), diagnostic = f.create(); diagnostic.start();
  for (let i = 0; i < 1000; i++) { f.advance(1); diagnostic.stage(i % 2 ? 'city' : 'assets'); }
  assert.equal(diagnostic.snapshot()?.checkpoints.length, 24);
  assert.equal(f.events.filter(entry => entry.event === 'startup_stage').length, 28);
  assert.ok(f.data.get(STARTUP_STORAGE_KEY)!.length < 8000);
  diagnostic.complete();
  assert.equal(f.events.at(-1)?.event, 'startup_complete');
  assert.equal(f.events.at(-1)?.properties.elapsed_ms, 1000);
});

test('snapshots are defensive copies and duplicate stages/start calls produce no duplicate events', () => {
  const f = fixture(), diagnostic = f.create(); diagnostic.start(); diagnostic.start(); diagnostic.stage('boot');
  const copy = diagnostic.snapshot()!;
  copy.context.buildVersion = 'modified'; copy.checkpoints[0].stage = 'ready'; copy.checkpoints[0].pendingAssets.push('PRIVATE');
  assert.equal(diagnostic.snapshot()?.checkpoints[0].stage, 'boot');
  assert.equal(diagnostic.snapshot()?.context.buildVersion, undefined);
  assert.deepEqual(diagnostic.snapshot()?.checkpoints[0].pendingAssets, []);
  assert.equal(f.events.length, 1);
});

test('storage, capture, clock, and thrown error getters cannot break boot', async () => {
  const fail = () => { throw new Error('optional service unavailable'); };
  const diagnostic = new StartupDiagnostics({ storage: { getItem: fail, setItem: fail }, capture: fail, now: fail });
  assert.equal(diagnostic.snapshot(), null);
  assert.doesNotThrow(() => {
    diagnostic.stage('boot'); diagnostic.failure('startup'); diagnostic.complete(); diagnostic.pagehide();
    diagnostic.start(); diagnostic.stage('assets');
    diagnostic.failure('javascript', Object.defineProperty({}, 'name', { get: fail }));
    diagnostic.complete(); diagnostic.pagehide();
  });
  assert.deepEqual(diagnostic.snapshot()?.failure, { kind: 'javascript', errorType: 'Unknown' });
  const asyncCapture = new StartupDiagnostics({ capture: () => Promise.reject(new Error('offline')) });
  asyncCapture.start(); asyncCapture.complete();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(asyncCapture.snapshot()?.status, 'complete');
});

test('persistence happens before capture so a diagnostic panel sees the newest checkpoint', () => {
  const f = fixture();
  const states: string[] = [];
  const snapshots: unknown[] = [], storedSnapshots: unknown[] = [];
  const diagnostic = new StartupDiagnostics({ storage: f.storage, now: () => 1_000_000, capture: () => {
    const stored = JSON.parse(f.data.get(STARTUP_STORAGE_KEY)!);
    states.push(`${stored.status}/${stored.checkpoints.at(-1).stage}`);
    storedSnapshots.push(stored); snapshots.push(diagnostic.snapshot());
  } });
  diagnostic.start(); diagnostic.stage('first-frame:start'); diagnostic.complete();
  assert.deepEqual(states, ['pending/boot', 'pending/first-frame:start', 'complete/first-frame:start']);
  assert.deepEqual(storedSnapshots, snapshots);
});

test('saved reports can be recovered without starting, writing storage, or emitting analytics', () => {
  const f = fixture(), original = f.create();
  original.start({ buildVersion: '990926f', os: 'ios' });
  f.advance(500); original.stage('reflections:start');
  original.failure('webgl-context-lost', new TypeError('PRIVATE'));
  const before = f.data.get(STARTUP_STORAGE_KEY)!;
  let writes = 0, captures = 0;
  const reader = new StartupDiagnostics({
    storage: { getItem: f.storage.getItem, setItem: () => { writes++; } },
    now: () => 1_001_000,
    capture: () => { captures++; },
  });
  assert.equal(reader.snapshot(), null);
  const saved = reader.savedSnapshot()!;
  assert.deepEqual(saved, original.snapshot());
  assert.deepEqual(saved.failure, { kind: 'webgl-context-lost', errorType: 'TypeError' });
  saved.checkpoints[0].stage = 'ready'; saved.context.buildVersion = 'modified';
  assert.deepEqual(reader.savedSnapshot(), original.snapshot());
  assert.equal(reader.snapshot(), null);
  assert.equal(writes, 0); assert.equal(captures, 0);
  assert.equal(f.data.get(STARTUP_STORAGE_KEY), before);
});

test('saved reports retain only approved failure metadata and reject stale reports', () => {
  const f = fixture(), original = f.create(); original.start(); original.failure('startup', new Error('PRIVATE'));
  const saved = JSON.parse(f.data.get(STARTUP_STORAGE_KEY)!);
  saved.context.url = 'PRIVATE'; saved.failure = { kind: 'https://private/', errorType: 'PRIVATE', message: 'PRIVATE' };
  f.data.set(STARTUP_STORAGE_KEY, JSON.stringify(saved));
  const reader = f.create();
  assert.equal(reader.savedSnapshot()?.status, 'failed');
  assert.equal(reader.savedSnapshot()?.failure, undefined);
  assert.doesNotMatch(JSON.stringify(reader.savedSnapshot()), /PRIVATE|https:/);
  f.advance(30 * 60 * 1000 + 1);
  assert.equal(reader.savedSnapshot(), null);
  assert.equal(reader.snapshot(), null);
});

import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { DemoAutopilot } from '../src/autopilot.ts';
import { COURSE_VERSION, type RoomSnapshot } from '../src/multiplayer-protocol.ts';
import { applyRoomWireFrame } from '../src/room-wire.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://sf1.test';
const OPS_TOKEN = 'native-integration-operations-token-1234567890';
const WORKER = 'sf1-native-integration';
const CLASS = 'NativeTestRaceRoom';
type Session = { id: string; token: string; generation: number; room: RoomSnapshot; transport: string };
let bundled: Promise<string> | undefined;

function bundle() {
  // Test seams only age persisted expiry and inspect socket attachment sizes.
  // Real routing, room implementation, WebSockets, alarms, and storage run in workerd.
  return bundled ??= build({
    stdin: { resolveDir: resolve(ROOT, 'cloudflare'), sourcefile: 'native-integration-entry.ts', contents: `
      import worker, { RaceRoom as ProductionRaceRoom } from './index.ts';
      export default worker;
      export class NativeTestRaceRoom extends ProductionRaceRoom {
        constructor(state, env) { super(state, env); this.testStorage = state.storage; this.testState = state; this.maxObservedAttachment = 0; }
        async webSocketMessage(socket, message) {
          await super.webSocketMessage(socket, message);
          for (const retained of this.testState.getWebSockets()) {
            this.maxObservedAttachment = Math.max(this.maxObservedAttachment, new TextEncoder().encode(JSON.stringify(retained.deserializeAttachment())).byteLength);
          }
        }
        async fetch(request) {
          if (new URL(request.url).pathname === '/__test/socket-attachment-sizes') {
            return Response.json({maximum:this.maxObservedAttachment,current:this.testState.getWebSockets().map(socket => new TextEncoder().encode(JSON.stringify(socket.deserializeAttachment())).byteLength)});
          }
          if (new URL(request.url).pathname === '/__test/age-persisted-room') {
            const record = await this.testStorage.get('room:v1');
            if (!record?.core?.rooms?.length) return new Response('No persisted room', {status:409});
            for (const room of record.core.rooms) room.created = Date.now() - 3 * 60 * 60 * 1000;
            await this.testStorage.put('room:v1', record);
            return Response.json({aged:true});
          }
          return super.fetch(request);
        }
      }
    ` },
    bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:*'], logLevel: 'silent',
  }).then(result => result.outputFiles![0].text);
}

async function fixture(t: TestContext, extra: { admissionLimit?: number; apiLimit?: number; bindings?: Record<string, string> } = {}) {
  const persisted = await mkdtemp(join(tmpdir(), 'sf1-workerd-integration-'));
  const configuration = JSON.parse(await readFile(resolve(ROOT, 'wrangler.jsonc'), 'utf8'));
  const worker: any = {
    name: WORKER, modules: true, script: await bundle(), compatibilityDate: configuration.compatibility_date,
    compatibilityFlags: configuration.compatibility_flags ?? [],
    durableObjects: { ROOMS: { className: CLASS, useSQLite: true } },
    bindings: { PUBLIC_ORIGIN: ORIGIN, OPS_TOKEN, NEW_ROOMS_ENABLED: 'true', ...extra.bindings },
    ratelimits: {
      ADMISSION_LIMITER: { namespace_id: '2026100891', simple: { limit: extra.admissionLimit ?? 1000, period: 60 } },
      API_LIMITER: { namespace_id: '2026100892', simple: { limit: extra.apiLimit ?? 10000, period: 60 } },
    },
    serviceBindings: { ASSETS: async () => new Response('test static asset', { status: 200 }) },
  };
  const base = { workers: [worker], cf: false, log: new Log(LogLevel.ERROR), resourcePersistencePath: persisted };
  let mf = new Miniflare(convertV4MiniflareOptions(base));
  const cleanup: (() => void | Promise<void>)[] = [];
  t.after(async () => {
    for (const close of cleanup.reverse()) await close();
    await mf.dispose(); await rm(persisted, { recursive: true, force: true });
  });
  await mf.ready;
  const raw = (path: string, init: any = {}) => mf.dispatchFetch(ORIGIN + path, { ...init, headers: { Origin: ORIGIN, ...init.headers } });
  async function post(path: string, body: unknown, session?: Session, headers: Record<string, string> = {}) {
    const response = await raw(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}`, 'X-Room-Generation': String(session.generation) } : {}), ...headers }, body: JSON.stringify(body) });
    const data = await response.json() as any;
    return { status: response.status, data, headers: response.headers };
  }
  async function place() {
    const result = await post('/api/rooms/placement', {}); assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.match(result.data.idempotencyKey, /^[A-F0-9]{8}_[a-f0-9]{48}$/); return result.data.idempotencyKey as string;
  }
  async function create(key?: string) {
    const idempotencyKey = key ?? await place();
    const result = await post('/api/rooms', { idempotencyKey, profile: { ...DEFAULT_PROFILE, name: 'Native host' } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    const session = result.data as Session;
    assert.equal(session.room.code, idempotencyKey.slice(0, 8)); assert.equal(session.transport, 'duplex-v2');
    return { ...session, key: idempotencyKey };
  }
  async function joinRoom(host: Session, key = 'native-guest-admission') {
    const result = await post(`/api/rooms/${host.room.code}/join`, { idempotencyKey: key, profile: { ...DEFAULT_PROFILE, name: 'Native guest', driver: 'sam', car: 'comet' } });
    assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data as Session;
  }
  const command = (session: Session, body: unknown, headers: Record<string, string> = {}) => post(`/api/rooms/${session.room.code}/command`, body, session, headers);
  async function ready(session: Session) {
    assert.equal((await command(session, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION })).status, 200);
    const profileRevision = session.room.players.find(player => player.id === session.id)!.profileRevision;
    assert.equal((await command(session, { type: 'ready', ready: true, profileRevision, courseVersion: COURSE_VERSION })).status, 200);
  }
  async function ops(code: string, operation = 'metrics', method = 'GET') {
    const response = await raw(`/ops/rooms/${code}/${operation}`, { method, headers: { Authorization: `Bearer ${OPS_TOKEN}` } });
    return { status: response.status, data: await response.json() as any };
  }
  async function evict(code: string, sockets: 'close' | 'hibernate' = 'close') { await mf.unsafeEvictDurableObject(WORKER, CLASS, { name: code, webSockets: sockets }); }
  return { get mf() { return mf; }, raw, post, place, create, joinRoom, command, ready, ops, evict, cleanup,
    restart: async () => { await mf.dispose(); mf = new Miniflare(convertV4MiniflareOptions(base)); await mf.ready; },
    update: async (values: Record<string, string>) => { worker.bindings = { ...worker.bindings, ...values }; await mf.setOptions(convertV4MiniflareOptions(base)); await mf.ready; } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function eventually<T>(read: () => T, valid: (value: T) => boolean, label: string, timeout = 8000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = read(); if (valid(value)) return value; await delay(20); }
  throw Error(`Timed out: ${label}`);
}

async function duplex(t: TestContext, f: Fixture, session: Session, claim = true, autoAck = true) {
  const response = await f.raw(`/api/rooms/${session.room.code}/socket`, { headers: { Upgrade: 'websocket' } });
  assert.equal(response.status, 101); const socket = response.webSocket!; assert.ok(socket);
  const state: { latest: RoomSnapshot | null; ready: boolean; errors: string[]; closed: boolean; closeCode?: number; messages: any[] } = { latest: null, ready: false, errors: [], closed: false, messages: [] };
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)); state.messages.push(message);
    if (message.type === 'ready') state.ready = true;
    else if (message.type === 'error') state.errors.push(message.code);
    else state.latest = applyRoomWireFrame(state.latest, message);
    if (autoAck && Number.isSafeInteger(message.deliveryId) && socket.readyState === 1) socket.send(JSON.stringify({ type: 'ack', deliveryId: message.deliveryId }));
  });
  socket.addEventListener('close', event => { state.closed = true; state.closeCode = event.code; });
  socket.accept(); f.cleanup.push(() => { try { socket.close(); } catch {} });
  if (claim) {
    socket.send(JSON.stringify({ type: 'claim', token: session.token, generation: session.generation }));
    await eventually(() => state, value => value.ready && !!value.latest, 'duplex ready and initial snapshot');
  }
  return { socket, state, send: (message: unknown) => socket.send(JSON.stringify(message)) };
}

async function events(t: TestContext, f: Fixture, session: Session, wire = 'v2') {
  const controller = new AbortController();
  const response = await f.raw(`/api/rooms/${session.room.code}/events?wire=${wire}`, { signal: controller.signal, headers: { Authorization: `Bearer ${session.token}`, 'X-Room-Generation': String(session.generation) } });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  const state: { latest: RoomSnapshot | null; errors: string[]; finished: boolean } = { latest: null, errors: [], finished: false };
  let buffer = '', stopping = false;
  const consume = (async () => {
    try {
      while (!stopping) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const value = JSON.parse(data);
          if (frame.includes('event: room-error')) state.errors.push(value.code);
          else state.latest = applyRoomWireFrame(state.latest, value);
        }
      }
    } catch (error) { if (!stopping) state.errors.push(error instanceof Error ? error.message : 'STREAM_ERROR'); }
    finally { state.finished = true; }
  })();
  const close = async () => { stopping = true; controller.abort(); await reader.cancel().catch(() => {}); await consume; };
  f.cleanup.push(close);
  await eventually(() => state.latest, Boolean, 'SSE initial snapshot');
  return { state, close };
}

test('workerd: public routing, origin checks, internal-header stripping and room isolation', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create(), other = await f.create();
  assert.notEqual(host.room.code, other.room.code);
  assert.equal((await f.raw('/assets/example.txt')).status, 200);
  const foreign = await f.post('/api/rooms/placement', {}, undefined, { Origin: 'https://foreign.test' });
  assert.equal(foreign.status, 403); assert.equal(foreign.data.code, 'FOREIGN_ORIGIN');
  assert.equal((await f.raw('/healthz', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const wrongHost = await f.mf.dispatchFetch('https://different.test/api/rooms/placement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(wrongHost.status, 403);
  const spoof = await f.command(host, { type: 'heartbeat' }, { 'X-Room-Code': other.room.code, 'X-Worker-Secret': OPS_TOKEN, 'X-Room-New-Rooms': 'disabled', 'X-Forwarded-For': '198.51.100.12' });
  assert.equal(spoof.status, 200);
  const wrongRoom = await f.post(`/api/rooms/${other.room.code}/command`, { type: 'heartbeat' }, host);
  assert.equal(wrongRoom.status, 401);
  const secretSpoof = await f.raw(`/ops/rooms/${host.room.code}/metrics`, { headers: { 'X-Worker-Secret': OPS_TOKEN } });
  assert.equal(secretSpoof.status, 403);
  assert.equal((await f.ops(host.room.code)).status, 200);
  assert.equal((await f.raw('/api/rooms/health')).status, 403);
  const malformed = await f.post('/api/rooms', { idempotencyKey: 'not-a-placement' });
  assert.equal(malformed.status, 409); assert.equal(malformed.data.admitted, false);
  assert.equal((await f.post('/api/rooms/placement', { padding: 'x'.repeat(4097) })).status, 413);
});

test('workerd: admission retries remain one identity, including kill-switch retry and DO eviction', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create();
  const repeat = await f.create(host.key); assert.equal(repeat.id, host.id); assert.equal(repeat.token, host.token);
  const guest = await f.joinRoom(host), repeatedGuest = await f.joinRoom(host);
  assert.equal(guest.id, repeatedGuest.id); assert.equal(repeatedGuest.room.players.length, 2);
  await f.evict(host.room.code);
  const afterEviction = await f.create(host.key); assert.equal(afterEviction.id, host.id); assert.equal(afterEviction.token, host.token);
  const freshPlacement = await f.place();
  await f.update({ NEW_ROOMS_ENABLED: 'false' });
  const blocked = await f.post('/api/rooms/placement', {}); assert.equal(blocked.status, 503); assert.equal(blocked.data.admitted, false);
  const fresh = await f.post('/api/rooms', { idempotencyKey: freshPlacement, profile: DEFAULT_PROFILE }, undefined, { 'X-Room-New-Rooms': 'enabled' });
  assert.equal(fresh.status, 503); assert.equal(fresh.data.admitted, false);
  const previous = await f.create(host.key); assert.equal(previous.id, host.id); assert.equal(previous.token, host.token);
});

test('workerd: native duplex sockets authenticate, share selection, gate host start and race together', { timeout: 30000 }, async t => {
  const f = await fixture(t), host = await f.create();
  const hostSocket = await duplex(t, f, host);
  await f.ready(host);
  assert.equal((await f.command(host, { type: 'start' })).status, 409);
  const guest = await f.joinRoom(host), guestSocket = await duplex(t, f, guest);
  assert.equal((await f.command(host, { type: 'start' })).status, 409);
  assert.equal((await f.command(guest, { type: 'start' })).status, 403);
  const selected = { ...DEFAULT_PROFILE, name: 'Guest changed', driver: 'jensen', car: 'tide' };
  assert.equal((await f.command(guest, { type: 'profile', profile: selected, revision: 1 })).status, 200);
  await eventually(() => hostSocket.state.latest, room => room?.players.some(player => player.id === guest.id && player.profile.driver === 'jensen') ?? false, 'peer driver selection');
  guest.room.players.find(player => player.id === guest.id)!.profileRevision = 1;
  await f.ready(guest);
  const heartbeat = setInterval(() => { void Promise.all([f.command(host, { type: 'heartbeat' }), f.command(guest, { type: 'heartbeat' })]); }, 2000);
  f.cleanup.push(() => clearInterval(heartbeat));
  assert.equal((await f.command(host, { type: 'start' })).status, 200);
  const countdown = await eventually(() => hostSocket.state.latest, room => room?.phase === 'countdown', 'shared countdown');
  await eventually(() => guestSocket.state.latest, room => room?.startAt === countdown!.startAt && room?.phase === 'countdown', 'same guest start time');
  assert.equal(countdown!.entrants.length, 2);
  assert.ok(countdown!.startAt - countdown!.serverNow > 4000);
  let sequence = 0;
  const accelerate = () => hostSocket.send({ type: 'input', sequence: ++sequence, input: { throttle: 1, brake: 0, steer: 0, drift: false, boost: false } });
  const inputs = setInterval(accelerate, 50); f.cleanup.push(() => clearInterval(inputs));
  const startProgress = countdown!.players.find(player => player.id === host.id)!.state.progress;
  await delay(200);
  assert.equal(hostSocket.state.latest!.players.find(player => player.id === host.id)!.state.progress, startProgress);
  await eventually(() => guestSocket.state.latest, room => room?.phase === 'racing' && room.players.some(player => player.id === host.id && player.state.speed > 0), 'guest sees host moving after shared start', 9000);
  assert.equal(hostSocket.state.latest!.roundId, guestSocket.state.latest!.roundId);
  assert.deepEqual(hostSocket.state.errors, []); assert.deepEqual(guestSocket.state.errors, []);
  const serialized = JSON.stringify(hostSocket.state.latest);
  assert.ok(!serialized.includes(host.token)); assert.ok(!serialized.includes(guest.token));
});

test('workerd: physics timestamps track tick cadence without advancing on heartbeat broadcasts', { timeout: 18000 }, async t => {
  const f = await fixture(t), host = await f.create(), guest = await f.joinRoom(host);
  const feed = await duplex(t, f, host); await duplex(t, f, guest);
  await f.ready(host); await f.ready(guest);
  assert.equal((await f.command(host, { type: 'start' })).status, 200);
  await eventually(() => feed.state.latest, room => room?.phase === 'racing', 'racing physics clock', 8000);
  const samples: { clock: number; physics: number; elapsed: number; x: number; z: number }[] = [];
  feed.socket.addEventListener('message', () => {
    const room = feed.state.latest;
    if (room?.phase !== 'racing') return;
    const racer = room.players.find(player => player.id === host.id)!;
    samples.push({ clock: room.serverNow, physics: room.simulationAt!, elapsed: racer.state.elapsed, x: racer.position.x, z: racer.position.z });
  });
  let sequence = 0;
  const controls = setInterval(() => feed.send({ type: 'input', sequence: ++sequence, input: { throttle: 1, brake: 0, steer: 0, drift: false, boost: false } }), 50);
  const heartbeats = setInterval(() => feed.send({ type: 'heartbeat' }), 113);
  f.cleanup.push(() => clearInterval(controls), () => clearInterval(heartbeats));
  await delay(2000);
  assert.ok(samples.length > 25);
  let duplicatePhysics = 0, maximumStep = 0;
  for (const [index, sample] of samples.entries()) {
    assert.ok(Number.isFinite(sample.physics));
    assert.ok(Math.abs(sample.elapsed * 1000 - (sample.physics - feed.state.latest!.startAt)) < .001);
    assert.ok(sample.physics <= sample.clock);
    if (!index) continue;
    const previous = samples[index - 1], step = sample.physics - previous.physics;
    assert.ok(step >= 0, 'physics frames remain ordered'); maximumStep = Math.max(maximumStep, step);
    if (step === 0 && sample.clock > previous.clock) {
      duplicatePhysics++; assert.equal(sample.x, previous.x); assert.equal(sample.z, previous.z);
    }
  }
  assert.ok(duplicatePhysics >= 5, 'heartbeat positions retain their previous physics timestamp');
  // The timer targets 50 ms; allow native scheduler jitter without allowing a stalled feed.
  assert.ok(maximumStep <= 150, `physics feed remains near its 50 ms cadence (maximum ${maximumStep} ms)`);
  assert.deepEqual(feed.state.errors, []); assert.equal(feed.state.closed, false);
  t.diagnostic(`Heartbeat-only duplicates: ${duplicatePhysics}; maximum native physics step: ${maximumStep} ms.`);
});

test('workerd: full race finishes through real driving inputs and both racers receive the same ordered results', {
  timeout: 330000, skip: process.env.SF1_FULL_RACE === '1' ? false : 'Opt in with SF1_FULL_RACE=1 for the real-time complete race smoke.',
}, async t => {
  const f = await fixture(t), host = await f.create(), guest = await f.joinRoom(host);
  const hostSocket = await duplex(t, f, host), guestSocket = await duplex(t, f, guest);
  await f.ready(host); await f.ready(guest);
  const drivers = [
    { session: host, connection: hostSocket, pilot: new DemoAutopilot(), sequence: 0, reactionDelay: 0 },
    { session: guest, connection: guestSocket, pilot: new DemoAutopilot(), sequence: 0, reactionDelay: 2000 },
  ];
  const heartbeat = setInterval(() => {
    for (const driver of drivers) if (driver.connection.socket.readyState === 1) driver.connection.send({ type: 'heartbeat' });
  }, 2000);
  f.cleanup.push(() => clearInterval(heartbeat));
  assert.equal((await f.command(host, { type: 'start' })).status, 200);
  const drive = setInterval(() => {
    for (const driver of drivers) {
      const room = driver.connection.state.latest;
      const racer = room?.players.find(player => player.id === driver.session.id);
      if (room?.phase !== 'racing' || !racer || racer.dnf || racer.finishTime !== null || driver.connection.socket.readyState !== 1) continue;
      if (room.serverNow - room.startAt < driver.reactionDelay) continue;
      driver.connection.send({ type: 'input', sequence: ++driver.sequence, input: driver.pilot.input(racer.state) });
    }
  }, 50);
  f.cleanup.push(() => clearInterval(drive));
  const results = await eventually(() => hostSocket.state.latest, room => room?.phase === 'results', 'complete race reaches results', 310000);
  await eventually(() => guestSocket.state.latest, room => room?.phase === 'results', 'peer receives final results');
  assert.deepEqual(hostSocket.state.errors, []); assert.deepEqual(guestSocket.state.errors, []);
  assert.deepEqual(results!.results, guestSocket.state.latest!.results);
  const entries = results!.results!.entries;
  assert.equal(entries.length, 2); assert.deepEqual(entries.map(entry => entry.place), [1, 2]);
  assert.ok(entries.every(entry => entry.finishTime !== null && entry.dnfReason === null));
  assert.ok(entries[0].finishTime! < entries[1].finishTime!);
  assert.equal(entries[0].gap, 0); assert.ok(entries[1].gap! > 0);
  assert.deepEqual(new Set(entries.map(entry => entry.id)), new Set([host.id, guest.id]));
  assert.equal(entries.find(entry => entry.id === guest.id)!.profile.driver, 'sam');
  t.diagnostic(`Native race finish times: ${entries.map(entry => entry.finishTime!.toFixed(3)).join(', ')} seconds; runner-up gap ${entries[1].gap!.toFixed(3)} seconds.`);
  assert.equal((await f.command(guest, { type: 'rematch' })).status, 403);
  assert.equal((await f.command(host, { type: 'rematch' })).status, 200);
  await eventually(() => guestSocket.state.latest, room => room?.phase === 'lobby', 'rematch returns both players to selection');
  assert.equal(guestSocket.state.latest!.players.length, 2);
  assert.equal(guestSocket.state.latest!.players.some(player => player.ready), false);
  assert.deepEqual(guestSocket.state.latest!.lastResults, results!.results);
});

test('workerd: SSE fallback broadcasts picks and claim takeover retires the previous controller', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create(), guest = await f.joinRoom(host);
  const hostEvents = await events(t, f, host), guestSocket = await duplex(t, f, guest);
  assert.equal((await f.command(guest, { type: 'profile', profile: { ...DEFAULT_PROFILE, name: 'Visible via SSE', driver: 'elon' }, revision: 1 })).status, 200);
  await eventually(() => hostEvents.state.latest, room => room?.players.some(player => player.id === guest.id && player.profile.driver === 'elon') ?? false, 'SSE receives guest profile');
  const takeover = await f.post(`/api/rooms/${guest.room.code}/claim`, {}, guest);
  assert.equal(takeover.status, 200); assert.equal(takeover.data.id, guest.id); assert.equal(takeover.data.generation, guest.generation + 1);
  assert.equal((await f.command(guest, { type: 'heartbeat' })).status, 409);
  await eventually(() => guestSocket.state, state => state.closed || state.errors.includes('SESSION_TAKEN_OVER'), 'old duplex controller retired');
  const replacement = { ...guest, ...takeover.data } as Session;
  const resumed = await duplex(t, f, replacement);
  assert.equal(resumed.state.latest!.players.filter(player => player.id === guest.id).length, 1);
  assert.equal((await f.command(replacement, { type: 'heartbeat' })).status, 200);
  assert.deepEqual(hostEvents.state.errors, []);
});

test('workerd: hibernated duplex sessions and persisted selections survive object eviction', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create(), socket = await duplex(t, f, host);
  assert.equal((await f.command(host, { type: 'profile', profile: { ...DEFAULT_PROFILE, name: 'Persistent racer', driver: 'sam', car: 'tide' }, revision: 1 })).status, 200);
  host.room.players.find(player => player.id === host.id)!.profileRevision = 1;
  await f.ready(host);
  await eventually(() => socket.state.latest, room => room?.players.some(player => player.id === host.id && player.ready) ?? false, 'ready snapshot before hibernation');
  const beforeEviction = socket.state.messages.length;
  await f.evict(host.room.code, 'hibernate');
  assert.equal((await f.command(host, { type: 'heartbeat' })).status, 200);
  socket.send({ type: 'input', sequence: 1, input: { throttle: 0, brake: 0, steer: 0, drift: false, boost: false } });
  await eventually(() => socket.state.latest, room => socket.state.messages.length > beforeEviction && (room?.players.some(player => player.id === host.id && player.connected && player.ready && player.profile.name === 'Persistent racer') ?? false), 'hibernated session restored');
  assert.equal(socket.state.closed, false); assert.deepEqual(socket.state.errors, []);
  const restored = await f.create(host.key);
  assert.equal(restored.id, host.id); assert.equal(restored.room.players[0].profile.car, 'tide');
});

test('workerd: valid duplex acknowledgements keep an otherwise idle host ready through hibernation', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create(), guest = await f.joinRoom(host);
  const hostSocket = await duplex(t, f, host); await duplex(t, f, guest);
  await f.ready(host);
  // Only the guest sends heartbeat commands. The host's valid room-frame ACKs
  // prove its duplex connection is alive beyond the eight-second idle cutoff.
  for (let second = 0; second < 9; second++) {
    await delay(1000);
    assert.equal((await f.command(guest, { type: 'heartbeat' })).status, 200);
  }
  await eventually(() => hostSocket.state.latest, room => !!room && room.serverNow > host.room.serverNow + 8000, 'fresh snapshot after idle cutoff');
  assert.equal(hostSocket.state.latest!.host, host.id);
  const idleHost = hostSocket.state.latest!.players.find(player => player.id === host.id)!;
  assert.equal(idleHost.connected, true); assert.equal(idleHost.ready, true);
  const priorMessages = hostSocket.state.messages.length;
  await f.evict(host.room.code, 'hibernate');
  assert.equal((await f.command(guest, { type: 'heartbeat' })).status, 200);
  await eventually(() => hostSocket.state.messages.length, count => count > priorMessages, 'fresh frame after ACK-backed host hibernation');
  assert.equal(hostSocket.state.latest!.host, host.id);
  const restoredHost = hostSocket.state.latest!.players.find(player => player.id === host.id)!;
  assert.equal(restoredHost.connected, true); assert.equal(restoredHost.ready, true);
});

test('workerd: persisted room expiry cannot be bypassed by join or creation retry', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create();
  const namespace = await f.mf.getDurableObjectNamespace('ROOMS');
  const actor = namespace.get(namespace.idFromName(host.room.code));
  const aged = await actor.fetch('https://internal.test/__test/age-persisted-room');
  assert.equal(aged.status, 200);
  await f.evict(host.room.code);
  const lateJoin = await f.post(`/api/rooms/${host.room.code}/join`, { profile: DEFAULT_PROFILE, idempotencyKey: 'too-late-guest' });
  assert.equal(lateJoin.status, 404);
  const retry = await f.post('/api/rooms', { profile: DEFAULT_PROFILE, idempotencyKey: host.key });
  assert.equal(retry.status, 404);
});

test('workerd: native rate limit bindings enforce admission and gameplay budgets', { timeout: 25000 }, async t => {
  const f = await fixture(t, { admissionLimit: 2, apiLimit: 2 });
  const host = await f.create(); // placement and create consume the two admission slots
  const limited = await f.post('/api/rooms/placement', {}, undefined, { 'X-Room-Client-IP': '198.51.100.55', 'X-Forwarded-For': '198.51.100.56' });
  assert.equal(limited.status, 429); assert.equal(limited.data.code, 'RATE_LIMITED'); assert.equal(limited.data.admitted, false);
  assert.equal((await f.command(host, { type: 'heartbeat' })).status, 200);
  assert.equal((await f.command(host, { type: 'heartbeat' })).status, 200);
  assert.equal((await f.command(host, { type: 'heartbeat' }, { 'X-Worker-Secret': OPS_TOKEN })).status, 429);
});

test('workerd: websocket claims reject invalid authentication and input-only fallback stays usable', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create();
  const missing = await duplex(t, f, host, false);
  missing.send({ type: 'heartbeat' });
  await eventually(() => missing.state, state => state.closed, 'missing claim closes socket');
  assert.deepEqual(missing.state.errors, ['SESSION_CLAIM_REQUIRED']);
  const invalid = await duplex(t, f, host, false);
  invalid.send({ type: 'claim', token: 'invalid-token', generation: 1 });
  await eventually(() => invalid.state, state => state.closed, 'invalid claim closes socket');
  assert.equal(invalid.state.ready, false); assert.equal(invalid.state.errors.length, 1);
  const feed = await events(t, f, host);
  const response = await f.raw(`/api/rooms/${host.room.code}/input`, { headers: { Upgrade: 'websocket' } });
  assert.equal(response.status, 101);
  const input = response.webSocket!, messages: any[] = [];
  input.addEventListener('message', event => messages.push(JSON.parse(String(event.data))));
  input.accept(); f.cleanup.push(() => { try { input.close(); } catch {} });
  input.send(JSON.stringify({ type: 'claim', token: host.token, generation: host.generation }));
  await eventually(() => messages, values => values.some(value => value.type === 'ready'), 'input-only claim ready');
  input.send(JSON.stringify({ type: 'input', sequence: 1, input: { throttle: 1, brake: 0, steer: 0, drift: false, boost: false } }));
  await delay(50);
  assert.equal((await f.ops(host.room.code)).data.acceptedInputs, 1);
  assert.equal(messages.some(value => value.v === 2), false);
  assert.equal(feed.state.latest!.players[0].connected, true);
});

test('workerd: unacknowledged duplex frames close a slow reader without closing a healthy peer', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create(), guest = await f.joinRoom(host);
  const healthy = await duplex(t, f, host), slow = await duplex(t, f, guest, true, false);
  await f.ready(host); await f.ready(guest);
  assert.equal((await f.command(host, { type: 'start' })).status, 200);
  await eventually(() => slow.state.messages.filter(message => message.v === 2).length, count => count >= 35, 'slow-reader queue approaches frame limit', 10000);
  const namespace = await f.mf.getDurableObjectNamespace('ROOMS');
  const actor = namespace.get(namespace.idFromName(host.room.code));
  const sizes = await (await actor.fetch('https://internal.test/__test/socket-attachment-sizes')).json() as {maximum:number;current:number[]};
  assert.ok(sizes.maximum > 0 && sizes.maximum < 2048, `native socket attachments fit the 2 KiB limit: ${JSON.stringify(sizes)}`);
  assert.ok(sizes.current.every(size => size < 2048));
  // Countdown sends sparse metadata; the 20 Hz racing feed begins five seconds later.
  await eventually(() => slow.state, state => state.closed, 'bounded slow-reader connection closes', 10000);
  assert.equal(slow.state.closeCode, 1013);
  const frames = slow.state.messages.filter(message => message.v === 2);
  assert.ok(frames.length <= 40, `at most 40 unacknowledged frames, got ${frames.length}`);
  assert.ok(frames.every(message => Number.isSafeInteger(message.deliveryId)));
  assert.equal(healthy.state.closed, false); assert.deepEqual(healthy.state.errors, []);
  assert.equal((await f.command(host, { type: 'heartbeat' })).status, 200);
});

test('workerd: room identity and profile persist across a full runtime restart', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create(), guest = await f.joinRoom(host);
  await f.command(guest, { type: 'profile', profile: { ...DEFAULT_PROFILE, name: 'After restart', driver: 'jensen' }, revision: 1 });
  await f.restart();
  const recoveredHost = await f.create(host.key), recoveredGuest = await f.joinRoom(host);
  assert.equal(recoveredHost.id, host.id); assert.equal(recoveredHost.token, host.token);
  assert.equal(recoveredGuest.id, guest.id); assert.equal(recoveredGuest.token, guest.token);
  assert.equal(recoveredGuest.room.players.length, 2);
  assert.equal(recoveredGuest.room.players.find(player => player.id === guest.id)!.profile.name, 'After restart');
  assert.equal(recoveredGuest.room.players.some(player => player.ready), false);
  const reconnected = await duplex(t, f, recoveredGuest);
  assert.equal(reconnected.state.latest!.players.find(player => player.id === guest.id)!.connected, true);
});

test('workerd: authenticated per-room draining survives eviction and leaves existing claims usable', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create(), guest = await f.joinRoom(host);
  await duplex(t, f, host); await duplex(t, f, guest);
  await f.ready(host); await f.ready(guest);
  const drain = await f.ops(host.room.code, 'drain', 'POST');
  assert.equal(drain.status, 200); assert.equal(drain.data.draining, true);
  const start = await f.command(host, { type: 'start' });
  assert.equal(start.status, 503); assert.equal(start.data.code, 'SERVER_DRAINING');
  assert.equal((await f.command(host, { type: 'heartbeat' })).status, 200);
  assert.equal((await f.create(host.key)).id, host.id);
  await f.evict(host.room.code, 'hibernate');
  assert.equal((await f.ops(host.room.code)).data.health.draining, true);
  assert.equal((await f.command(guest, { type: 'heartbeat' })).status, 200);
});

test('workerd: stalled placement, creation and command uploads time out without blocking room actions', { timeout: 25000 }, async t => {
  const f = await fixture(t), host = await f.create();
  const requests = ['/api/rooms/placement', '/api/rooms', `/api/rooms/${host.room.code}/command`].map(path => {
    let upload: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({ start(controller) { upload = controller; controller.enqueue(new TextEncoder().encode('{"type":')); } });
    f.cleanup.push(() => { try { upload?.close(); } catch {} });
    return { path, response: f.raw(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${host.token}`, 'X-Room-Generation': String(host.generation) }, body, duplex: 'half',
    }) };
  });
  await delay(100);
  const before = Date.now();
  assert.equal((await f.command(host, { type: 'heartbeat' })).status, 200);
  assert.equal((await f.raw('/healthz')).status, 200);
  assert.ok(Date.now() - before < 1000, 'independent room action completes while upload is stalled');
  for (const request of requests) {
    const response = await request.response;
    assert.equal(response.status, 408, request.path); assert.equal((await response.json() as any).code, 'REQUEST_TIMEOUT');
  }
});

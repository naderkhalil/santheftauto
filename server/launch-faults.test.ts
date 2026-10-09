import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createGameServer } from './app.ts';
import { runtimeConfig } from './runtime-config.ts';
import { COURSE_VERSION, type RoomCommand, type RoomSnapshot } from '../src/multiplayer-protocol.ts';
import { parseRoomStreamEvent, RoomWireDecoder } from '../src/room-wire.ts';

const secret = 'launch-fault-test-worker-secret-1234567890', ops = 'launch-fault-test-operations-token';
type App = Awaited<ReturnType<typeof launch>>;
type Admission = { id: string; token: string; generation: number; room: RoomSnapshot };
async function launch(env: Record<string, string>) {
  const app = createGameServer(runtimeConfig({ PORT: '0', HOST: '127.0.0.1', WORKER_SECRET: secret, OPS_TOKEN: ops, ...env }));
  await new Promise<void>((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  return { ...app, url: 'http://127.0.0.1:' + (app.server.address() as { port: number }).port };
}
const auth = (session: Admission) => ({ Authorization: 'Bearer ' + session.token, 'X-Room-Generation': String(session.generation) });
const post = (app: App, path: string, data: unknown, headers = {}) => fetch(app.url + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data), signal: AbortSignal.timeout(3000),
});
async function create(app: App, key: string): Promise<Admission> {
  const response = await post(app, '/api/rooms', { idempotencyKey: key, profile: { name: 'Fault test host' } });
  assert.equal(response.status, 201); return await response.json();
}
async function join(app: App, host: Admission): Promise<Admission> {
  const response = await post(app, `/api/rooms/${host.room.code}/join`, { idempotencyKey: 'guest-' + host.id, profile: { name: 'Fault test guest' } });
  assert.equal(response.status, 201); return await response.json();
}
async function command(app: App, session: Admission, value: RoomCommand) {
  return await post(app, `/api/rooms/${session.room.code}/command`, value, auth(session));
}
async function ready(app: App, session: Admission) {
  assert.equal((await command(app, session, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION })).status, 200);
  assert.equal((await command(app, session, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION })).status, 200);
}
async function eventually(check: () => boolean | Promise<boolean>, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  assert.fail('Expected the real local server state before the bounded deadline.');
}

/** Relay to the real worker, discarding exactly one already-committed create reply. */
async function dropFirstCreateReply(worker: App) {
  const sockets = new Set<Socket>();
  const state = { dropped: null as Admission | null, armed: true };
  const server = createServer((req, res) => {
    const drop = state.armed && req.method === 'POST' && req.url === '/api/rooms';
    if (drop) state.armed = false;
    const headers = { ...req.headers, host: new URL(worker.url).host };
    if (headers.origin) headers.origin = worker.url;
    const upstream = httpRequest(new URL(req.url ?? '/', worker.url), { method: req.method, headers, agent: false }, response => {
      if (!drop) { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); return; }
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => { state.dropped = JSON.parse(Buffer.concat(chunks).toString()); res.destroy(); });
      response.on('error', () => res.destroy());
    });
    upstream.on('error', () => res.destroy());
    upstream.setTimeout(2000, () => upstream.destroy());
    res.once('close', () => upstream.destroy()); req.pipe(upstream);
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    state, url: 'http://127.0.0.1:' + (server.address() as { port: number }).port,
    async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

async function stream(app: App, session: Admission) {
  const controller = new AbortController();
  const response = await fetch(app.url + `/api/rooms/${session.room.code}/events?wire=v2`, { headers: auth(session), signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader(), text = new TextDecoder(), wire = new RoomWireDecoder();
  const state = { room: null as RoomSnapshot | null, error: null as unknown };
  const reading = (async () => {
    let buffer = '';
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += text.decode(chunk.value, { stream: true }); let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = parseRoomStreamEvent(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
          if (!event) continue;
          if (event.event === 'room-error') throw Error(event.code);
          state.room = wire.apply(event.frame);
        }
      }
    } catch (error) { if (!controller.signal.aborted) state.error = error; }
  })();
  return { state, async close() { controller.abort(); await reading; } };
}

test('a committed create with a dropped reply retries through the real gateway without duplicating its room', { timeout: 10000 }, async () => {
  const a = await launch({ SERVER_ROLE: 'worker', ROOM_WORKER_ID: 'AA', MAX_ROOMS: '4' });
  const b = await launch({ SERVER_ROLE: 'worker', ROOM_WORKER_ID: 'BB', MAX_ROOMS: '1' });
  const fault = await dropFirstCreateReply(a);
  const gateway = await launch({ SERVER_ROLE: 'gateway', ROOM_WORKER_AA: fault.url, ROOM_WORKER_BB: b.url });
  try {
    const placement = await (await post(gateway, '/api/rooms/placement', {})).json();
    assert.equal(placement.workerId, 'AA');
    const failed = await post(gateway, '/api/rooms', { idempotencyKey: placement.idempotencyKey });
    assert.equal(failed.status, 503);
    const error = await failed.json(); assert.equal(error.code, 'ROOM_WORKER_UNAVAILABLE'); assert.equal(error.admitted, null);
    assert.ok(fault.state.dropped); assert.equal(a.service!.rooms.size, 1); assert.equal(b.service!.rooms.size, 0);
    const retry = await create(gateway, placement.idempotencyKey);
    assert.equal(retry.room.code, fault.state.dropped.room.code);
    assert.equal(retry.id, fault.state.dropped.id); assert.equal(retry.token, fault.state.dropped.token); assert.equal(retry.generation, fault.state.dropped.generation);
    assert.equal(retry.room.players.length, 1); assert.equal(a.service!.rooms.size, 1); assert.equal(b.service!.rooms.size, 0);
  } finally { await gateway.close(); await fault.close(); await a.close(); await b.close(); }
});

test('a stopped real owner remains unavailable while fresh placement and other rooms use the surviving worker', { timeout: 10000 }, async () => {
  const a = await launch({ SERVER_ROLE: 'worker', ROOM_WORKER_ID: 'AA', MAX_ROOMS: '4' });
  const b = await launch({ SERVER_ROLE: 'worker', ROOM_WORKER_ID: 'BB', MAX_ROOMS: '1' });
  const gateway = await launch({ SERVER_ROLE: 'gateway', ROOM_WORKER_AA: a.url, ROOM_WORKER_BB: b.url });
  try {
    const placement = await (await post(gateway, '/api/rooms/placement', {})).json(); assert.equal(placement.workerId, 'AA');
    const host = await create(gateway, placement.idempotencyKey); await a.close();
    const interrupted = await command(gateway, host, { type: 'heartbeat' });
    assert.equal(interrupted.status, 503); assert.equal((await interrupted.json()).code, 'ROOM_WORKER_UNAVAILABLE');
    const retry = await post(gateway, '/api/rooms', { idempotencyKey: placement.idempotencyKey });
    assert.equal(retry.status, 503); assert.equal((await retry.json()).admitted, null); assert.equal(b.service!.rooms.size, 0);
    let available: { workerId: string; idempotencyKey: string } | undefined;
    await eventually(async () => { available = await (await post(gateway, '/api/rooms/placement', {})).json(); return available?.workerId === 'BB'; });
    const fresh = await create(gateway, available!.idempotencyKey); assert.match(fresh.room.code, /^BB/);
    assert.equal((await command(gateway, fresh, { type: 'heartbeat' })).status, 200);
    const absent = await post(gateway, '/api/rooms/BBFFFFFF/join', {});
    assert.equal(absent.status, 404); assert.equal((await absent.json()).code, 'ROOM_EXPIRED');
    assert.equal(b.service!.rooms.size, 1); assert.equal(b.service!.rooms.has(host.room.code), false);
  } finally { await gateway.close(); await a.close(); await b.close(); }
});

test('real worker drain preserves the shared race stream and controls while excluding new placement and starts', { timeout: 15000 }, async () => {
  const a = await launch({ SERVER_ROLE: 'worker', ROOM_WORKER_ID: 'AA', MAX_ROOMS: '8' });
  const b = await launch({ SERVER_ROLE: 'worker', ROOM_WORKER_ID: 'BB', MAX_ROOMS: '1' });
  const gateway = await launch({ SERVER_ROLE: 'gateway', ROOM_WORKER_AA: a.url, ROOM_WORKER_BB: b.url });
  let feed: Awaited<ReturnType<typeof stream>> | undefined, socket: WebSocket | undefined;
  try {
    const placement = await (await post(gateway, '/api/rooms/placement', {})).json(); assert.equal(placement.workerId, 'AA');
    const racing = await create(gateway, placement.idempotencyKey), guest = await join(gateway, racing);
    const waiting = await create(gateway, 'AA_waiting-room-before-drain'), waitingGuest = await join(gateway, waiting);
    for (const racer of [racing, guest, waiting, waitingGuest]) await ready(gateway, racer);
    feed = await stream(gateway, racing);
    socket = new WebSocket(gateway.url.replace('http:', 'ws:') + `/api/rooms/${racing.room.code}/input`, { origin: gateway.url, handshakeTimeout: 2000 });
    await once(socket, 'open'); const claimed = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'claim', token: racing.token, generation: racing.generation }));
    assert.equal(JSON.parse((await claimed)[0].toString()).type, 'ready');
    assert.equal((await command(gateway, racing, { type: 'start' })).status, 200);
    await eventually(() => feed!.state.room?.phase === 'countdown');
    const started = feed.state.room!;
    const drained = await post(a, '/ops/drain', {}, { Authorization: 'Bearer ' + ops }); assert.equal(drained.status, 200);
    assert.equal((await fetch(a.url + '/healthz', { signal: AbortSignal.timeout(2000) })).status, 200);
    const refused = await command(gateway, waiting, { type: 'start' });
    assert.equal(refused.status, 503); assert.equal((await refused.json()).code, 'SERVER_DRAINING');
    assert.equal(a.service!.room(waiting.room.code).phase, 'lobby');
    const newRoom = await post(gateway, '/api/rooms', { idempotencyKey: 'AA_new-room-after-drain' });
    assert.equal(newRoom.status, 503); const rejection = await newRoom.json(); assert.equal(rejection.code, 'SERVER_DRAINING'); assert.equal(rejection.admitted, false);
    await eventually(async () => (await (await post(gateway, '/api/rooms/placement', {})).json()).workerId === 'BB');
    assert.equal((await command(gateway, racing, { type: 'heartbeat' })).status, 200);
    assert.equal((await command(gateway, guest, { type: 'heartbeat' })).status, 200);
    await eventually(() => feed!.state.room?.phase === 'racing', 6500);
    const before = feed.state.room!.players.find(player => player.id === racing.id)!.state.progress;
    socket.send(JSON.stringify({ type: 'input', sequence: 1, input: { throttle: 1, brake: 0, steer: 0, drift: false, boost: false } }));
    await eventually(() => (feed!.state.room?.players.find(player => player.id === racing.id)?.state.progress ?? before) > before);
    assert.equal(a.service!.auth(racing.room.code, racing.token).player.sequence, 1);
    assert.equal((await command(gateway, racing, { type: 'input', sequence: 2, input: { throttle: .5, brake: 0, steer: .25, drift: false, boost: false } })).status, 200);
    assert.equal(a.service!.auth(racing.room.code, racing.token).player.input.steer, .25);
    assert.equal(feed.state.error, null); assert.equal(feed.state.room!.roundId, started.roundId); assert.equal(feed.state.room!.startAt, started.startAt);
    assert.equal(feed.state.room!.entrants.length, 2); assert.equal(a.service!.getHealth().activeRaces, 1); assert.equal(a.service!.getHealth().draining, true);
  } finally { socket?.terminate(); await feed?.close(); await gateway.close(); await a.close(); await b.close(); }
});

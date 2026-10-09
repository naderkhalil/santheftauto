import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RoomService } from './rooms.ts';
import { createRoomApi } from './http.ts';
import { RoomWireEncoder, snapshotFrame, tickFrame } from './room-wire.ts';
import { applyRoomWireFrame, DRIVE_STATE_FIELDS, parseRoomStreamEvent, RoomWireDecoder } from '../src/room-wire.ts';
import { COURSE_VERSION, type RoomSnapshot } from '../src/multiplayer-protocol.ts';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { DemoAutopilot } from '../src/autopilot.ts';
import { TRACK_LENGTH, CHECKPOINTS } from '../src/route.ts';

function fixture(count = 2, now = 1000) {
  const service = new RoomService(), host = service.create(DEFAULT_PROFILE, now), code = host.room.code, racers = [host];
  for (let index = 1; index < count; index++) racers.push(service.join(code, DEFAULT_PROFILE, now));
  const snapshot = (time = now) => service.snapshot(service.room(code), time);
  const start = () => {
    for (const racer of racers) {
      service.command(code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, now);
      service.command(code, racer.token, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, now);
    }
    service.command(code, host.token, { type: 'start' }, now); service.tick(now + 5000);
  };
  return { service, host, code, racers, snapshot, start };
}

test('compact ticks reconstruct every physics field exactly without mutating the previous snapshot', () => {
  const f = fixture(); f.start(); const baseline = f.snapshot(6000), saved = structuredClone(baseline), next = structuredClone(baseline);
  next.serverNow = 6055; next.simulationAt = 6050;
  for (const [index, p] of next.entrants.entries()) {
    DRIVE_STATE_FIELDS.forEach((key, i) => { p.state[key] = i + index / 3 + .123456789; });
    p.state.airborne = true; p.state.finished = index === 1;
    p.position = { x: -73.789456123, y: 36.000003333, z: 279.12345678 };
    p.connected = false; p.exploring = index === 0; p.dnf = index === 0; p.dnfReason = index === 0 ? 'disconnected' : null;
    p.reconnectUntil = 36000; p.finishTime = index === 1 ? 34.127 : null; p.rank = index === 1 ? 1 : null;
  }
  next.entrants.reverse();
  next.players = next.players.map(p => structuredClone(next.entrants.find(e => e.id === p.id)!));
  const decoded = applyRoomWireFrame(baseline, JSON.parse(JSON.stringify(tickFrame(next))));
  assert.deepEqual(decoded, next); assert.deepEqual(baseline, saved);
  assert.deepEqual(applyRoomWireFrame(null, next), next);
  assert.throws(() => applyRoomWireFrame(null, tickFrame(next)), /out of sync/);
  assert.throws(() => applyRoomWireFrame(baseline, { ...tickFrame(next), roundId: 'other-round' }), /out of sync/);
  const bad = tickFrame(next); if (bad.type !== 'tick') throw Error('Expected tick');
  bad.racers[1] = bad.racers[0]; assert.throws(() => applyRoomWireFrame(baseline, bad), /out of sync/);
});

test('physics time survives compact ticks and clock-only heartbeats, including older-server fallback', () => {
  const f = fixture(); f.start(); const baseline = f.snapshot(6000);
  f.service.tick(6050); const current = f.snapshot(6070);
  const tick = tickFrame(current);
  let decoded = applyRoomWireFrame(baseline, tick);
  assert.equal(decoded.simulationAt, 6050); assert.equal(decoded.serverNow, 6070);
  decoded = applyRoomWireFrame(decoded, { v: 2, type: 'heartbeat', code: f.code, roundId: decoded.roundId, serverNow: 6090 });
  assert.equal(decoded.simulationAt, 6050); assert.equal(decoded.serverNow, 6090);
  assert.deepEqual(decoded.entrants, current.entrants);
  assert.throws(() => applyRoomWireFrame(decoded, { ...tick, simulationAt: NaN }), /out of sync/);
  if (tick.type !== 'tick') throw Error('Expected tick');
  delete tick.simulationAt;
  assert.equal(applyRoomWireFrame(decoded, tick).simulationAt, undefined);
  const legacy = structuredClone(current); delete legacy.simulationAt;
  assert.deepEqual(applyRoomWireFrame(null, legacy), legacy);
});

test('semantic frames preserve departures, finished results, reconnects and rematches', () => {
  const f = fixture(3), encoder = new RoomWireEncoder(); f.start();
  let decoded = applyRoomWireFrame(null, encoder.prepare(f.snapshot(6000))!.frame);
  f.service.command(f.code, f.racers[2].token, { type: 'leave' }, 6010);
  let frame = encoder.prepare(f.snapshot(6010))!; assert.equal(frame.frame.type, 'snapshot');
  decoded = applyRoomWireFrame(decoded, frame.frame);
  assert.deepEqual(decoded, f.snapshot(6010)); assert.equal(decoded.players.length, 2); assert.equal(decoded.entrants.length, 3);
  assert.equal(decoded.entrants.find(p => p.id === f.racers[2].id)?.dnfReason, 'left-race');
  for (const racer of f.racers.slice(0, 2)) {
    const player = f.service.auth(f.code, racer.token).player;
    player.sim.seek(TRACK_LENGTH - .1, 0); player.sim.state.checkpoint = CHECKPOINTS.length; player.sim.state.speed = 10;
  }
  f.service.tick(6050); frame = encoder.prepare(f.snapshot(6050))!;
  decoded = applyRoomWireFrame(decoded, frame.frame); assert.deepEqual(decoded, f.snapshot(6050));
  assert.deepEqual(decoded.results!.entries.map(e => e.place), [1, 1, null]);
  const results = structuredClone(decoded.results);
  f.service.command(f.code, f.host.token, { type: 'rematch' }, 6100);
  decoded = applyRoomWireFrame(decoded, encoder.prepare(f.snapshot(6100))!.frame);
  assert.equal(decoded.phase, 'lobby'); assert.deepEqual(decoded.lastResults, results);
  f.service.disconnect(f.code, f.racers[1].token, 6200);
  decoded = applyRoomWireFrame(decoded, encoder.prepare(f.snapshot(6200))!.frame);
  assert.equal(decoded.players[1].connected, false);
  f.service.touch(f.code, f.racers[1].token, 6250);
  decoded = applyRoomWireFrame(decoded, encoder.prepare(f.snapshot(6250))!.frame);
  assert.deepEqual(decoded, f.snapshot(6250));
});

test('idle rooms send semantic changes immediately and a small periodic heartbeat', () => {
  const f = fixture(), encoder = new RoomWireEncoder(), first = f.snapshot();
  assert.equal(encoder.prepare(first)!.frame.type, 'snapshot');
  assert.equal(encoder.prepare(f.snapshot(1100)), null);
  const heartbeat = encoder.prepare(f.snapshot(2500))!;
  assert.equal(heartbeat.frame.type, 'heartbeat');
  assert.deepEqual(applyRoomWireFrame(first, heartbeat.frame), f.snapshot(2500));
  f.service.command(f.code, f.host.token, { type: 'profile', profile: { ...DEFAULT_PROFILE, driver: 'jensen' }, revision: 1 }, 2550);
  const changed = encoder.prepare(f.snapshot(2550))!;
  assert.equal(changed.frame.type, 'snapshot');
  assert.equal(applyRoomWireFrame(first, changed.frame).players[0].profile.driver, 'jensen');
});

test('stream decoder isolates authoritative heartbeat and tick baselines from mutable UI drafts', () => {
  const f = fixture(), encoder = new RoomWireEncoder(), decoder = new RoomWireDecoder();
  const displayed = decoder.apply(encoder.prepare(f.snapshot())!.frame);
  displayed.players[0].ready = true;
  displayed.players[0].selectionStatus = 'ready';
  displayed.players[0].profile.driver = 'jensen';
  displayed.players[0].state.speed = 999;
  const idle = encoder.prepare(f.snapshot(2500))!.frame;
  assert.equal(idle.type, 'heartbeat');
  assert.deepEqual(decoder.apply(idle), f.snapshot(2500));
  f.start();
  const racing = decoder.apply(encoder.prepare(f.snapshot(6000))!.frame);
  racing.players[0].profile.driver = 'jensen';
  racing.entrants[0].profile.name = 'Local draft';
  racing.entrants.pop();
  const tick = encoder.prepare(f.snapshot(6050))!.frame;
  assert.equal(tick.type, 'tick');
  assert.deepEqual(decoder.apply(tick), f.snapshot(6050));
});

test('SSE parser distinguishes named errors from event-like nicknames in room data', () => {
  const f = fixture();
  f.service.command(f.code, f.host.token, { type: 'profile', profile: { ...DEFAULT_PROFILE, name: 'event: room-error' }, revision: 1 }, 1010);
  const room = f.snapshot(1010), wire = snapshotFrame(room);
  const event = parseRoomStreamEvent('data: ' + JSON.stringify(wire) + '\n\n');
  assert.deepEqual(event, { event: 'room', frame: wire });
  assert.deepEqual(parseRoomStreamEvent('event:room-error\r\ndata: {"code":"SESSION_TAKEN_OVER",\r\ndata: "error":"Use your active tab."}\r\n\r\n'), {
    event: 'room-error', code: 'SESSION_TAKEN_OVER', error: 'Use your active tab.',
  });
  assert.equal(parseRoomStreamEvent(': event: room-error\n\n'), null);
  assert.equal(parseRoomStreamEvent('event: future-event\ndata: ignored\n\n'), null);
  assert.throws(() => parseRoomStreamEvent('event: room-error\ndata: {"code":1}\n\n'), /out of sync/);
});

test('eight-player compact race snapshots reduce representative payloads by at least 75 percent', () => {
  const f = fixture(8); f.start(); const pilots = f.racers.map(() => new DemoAutopilot());
  let previous = f.snapshot(6000); const encoder = new RoomWireEncoder(); encoder.prepare(previous);
  for (let now = 6050; now <= 66000; now += 50) {
    f.racers.forEach((p, i) => f.service.command(f.code, p.token, { type: 'input', sequence: now, input: pilots[i].input(f.service.auth(f.code, p.token).player.sim.state) }, now));
    f.service.tick(now); const current = f.snapshot(now), prepared = encoder.prepare(current)!;
    previous = applyRoomWireFrame(previous, prepared.frame); assert.deepEqual(previous, current);
    if ([16000, 36000, 66000].includes(now)) {
      const legacy = Buffer.byteLength(JSON.stringify(current)), compact = Buffer.byteLength(JSON.stringify(tickFrame(current)));
      assert.ok(compact < legacy * .25, compact + ' bytes must be below a quarter of ' + legacy);
    }
  }
});

test('HTTP fans out one room serialization per tick and keeps idle streams alive', async () => {
  const f = fixture(2, Date.now()), api = createRoomApi(f.service, { tickIntervalMs: 20, idleHeartbeatMs: 100 });
  const server = createServer((req, res) => void api.handler(req, res)), controllers: AbortController[] = [];
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    for (const racer of f.racers) {
      const controller = new AbortController(); controllers.push(controller);
      const response = await fetch(base + '/api/rooms/' + f.code + '/events?wire=v2', { headers: { Authorization: 'Bearer ' + racer.token, 'X-Room-Generation': String(racer.generation) }, signal: controller.signal });
      const chunk = new TextDecoder().decode((await response.body!.getReader().read()).value);
      assert.match(chunk, /"v":2,"type":"snapshot"/);
    }
    const before = api.getMetrics(); await new Promise(resolve => setTimeout(resolve, 230)); const after = api.getMetrics();
    assert.equal(after.streams, 2); assert.equal(after.wireV2Streams, 2);
    assert.ok(after.ticks - before.ticks >= 4);
    assert.equal(after.snapshotsBuilt - before.snapshotsBuilt, after.ticks - before.ticks);
    assert.equal(after.streamFrames - before.streamFrames, 2 * (after.serializedFrames - before.serializedFrames));
    assert.ok(after.serializedFrames - before.serializedFrames < after.ticks - before.ticks);
    assert.ok(after.streamBytes > before.streamBytes); assert.ok(after.totalTickMs >= after.lastTickMs);
  } finally {
    for (const controller of controllers) controller.abort(); api.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('direct placement preserves worker affinity and marks definite capacity rejections', async () => {
  const service = new RoomService({ workerId: 'A1', maxRooms: 1 }), api = createRoomApi(service);
  const server = createServer((req, res) => void api.handler(req, res));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const placement = () => fetch(base + '/api/rooms/placement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  try {
    const reply = await placement(), result = await reply.json(); assert.equal(reply.status, 200);
    assert.match(result.idempotencyKey, /^A1_[a-f0-9]{48}$/); assert.equal(service.rooms.size, 0);
    service.create(DEFAULT_PROFILE);
    const busy = await placement(); assert.equal(busy.status, 503); assert.equal((await busy.json()).admitted, false);
    service.setDraining(); const drain = await placement(); assert.equal((await drain.json()).code, 'SERVER_DRAINING');
  } finally { api.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

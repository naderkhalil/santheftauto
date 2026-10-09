/** Explicit, bounded public acceptance smoke: one new room, two owned players. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { DemoAutopilot } from '../src/autopilot.ts';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { COURSE_VERSION, type RoomSnapshot } from '../src/multiplayer-protocol.ts';
import { applyRoomWireFrame } from '../src/room-wire.ts';
import { RacerSnapshotBuffer } from '../src/room-interpolation.ts';

// Deliberately separate from the loopback-only load runner; no arbitrary target,
// room count, player count, parallel runs, or user-provided session credentials.
const ORIGIN = 'https://whimsical-sf.nader-khalil.workers.dev';
const OUTPUT = resolve(process.env.SF1_SMOKE_REPORT || 'docs/checkpoints/2026-10-08/launch/cloudflare-public-smoke.json');
type Admission = { id: string; token: string; generation: number; room: RoomSnapshot; transport: string };
type Client = Admission & { label: 'Host' | 'Guest'; socket?: WebSocket; latest: RoomSnapshot; ready: boolean; sequence: number; pilot: DemoAutopilot; delayMs: number; frames: number; bytes: number; inputs: number; acknowledgements: number;
  motion: RacerSnapshotBuffer; receivedAt: number; physicsRound: string | null; physicsAt: number | null;
  motionMetrics: { sampleCount: number; posesChecked: number; invalidPoses: number; physicsFramesChecked: number; peakPhysicsAgeMs: number; maxBufferSize: number } };

const began = performance.now(), startedAt = new Date().toISOString(), clients: Client[] = [];
const requests: { operation: string; status: number; elapsedMs: number }[] = [];
const failures: string[] = [];
const checks: Record<string, boolean> = {};
let phase = 'setup', stopping = false, cleanup = false, failure: string | null = null;
let inputTimer: ReturnType<typeof setInterval> | undefined, heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let finalOrder: unknown[] = [], cleanupSuccess = 0, cleanupAlreadyGone = 0;
const ceiling = setTimeout(() => { stopping = true; }, 170_000);
const interrupted = () => { stopping = true; };
process.on('SIGINT', interrupted); process.on('SIGTERM', interrupted);

async function post(path: string, body: unknown, operation: string, client?: Client, expected = 200) {
  if (stopping && !cleanup) throw Error('SMOKE_DEADLINE_OR_INTERRUPTION');
  const before = performance.now();
  const response = await fetch(ORIGIN + path, {
    method: 'POST', redirect: 'error', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(client ? { Authorization: `Bearer ${client.token}`, 'X-Room-Generation': String(client.generation) } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(cleanup ? 4500 : Math.max(1, Math.min(7000, 170_000 - (performance.now() - began)))),
  });
  requests.push({ operation, status: response.status, elapsedMs: Math.round((performance.now() - before) * 100) / 100 });
  const data = await response.json() as any;
  if (response.status !== expected) throw Object.assign(Error(`${operation}:HTTP_${response.status}`), { status: response.status });
  return data;
}
const command = (client: Client, body: unknown, operation: string, expected = 200) => post(`/api/rooms/${client.room.code}/command`, body, operation, client, expected);
async function admit(path: string, body: unknown, operation: string) {
  try { return await post(path, body, operation, undefined, 201) as Admission; }
  catch (error) {
    const status = (error as {status?:number}).status;
    if (status !== undefined && status < 500) throw error;
    // One lost-response recovery uses the identical admission key, never a new room.
    return await post(path, body, operation + '-same-key-retry', undefined, 201) as Admission;
  }
}
function own(admission: Admission, label: Client['label'], delayMs: number) {
  const client: Client = { ...admission, label, delayMs, latest: admission.room, ready: false, sequence: 0, pilot: new DemoAutopilot(), frames: 0, bytes: 0, inputs: 0, acknowledgements: 0,
    motion: new RacerSnapshotBuffer(), receivedAt: performance.now(), physicsRound: null, physicsAt: null,
    motionMetrics: { sampleCount: 0, posesChecked: 0, invalidPoses: 0, physicsFramesChecked: 0, peakPhysicsAgeMs: 0, maxBufferSize: 0 } };
  clients.push(client); assert.equal(admission.transport, 'duplex-v2', 'Deployed server must negotiate native duplex transport'); return client;
}
async function waitFor(predicate: () => boolean, label: string, timeout = 10_000) {
  const deadline = Math.min(began + 170_000, performance.now() + timeout);
  while (performance.now() < deadline) {
    if (stopping) throw Error('SMOKE_DEADLINE_OR_INTERRUPTION');
    if (failures.length) throw Error(failures[0]);
    if (predicate()) return;
    await delay(25);
  }
  throw Error('TIMEOUT_' + label);
}
async function connect(client: Client) {
  const socket = new WebSocket(ORIGIN.replace('https:', 'wss:') + `/api/rooms/${client.room.code}/socket`, { origin: ORIGIN, handshakeTimeout: 7000, perMessageDeflate: false });
  client.socket = socket;
  let pending = 0, lastAck = performance.now();
  socket.on('open', () => socket.send(JSON.stringify({ type: 'claim', token: client.token, generation: client.generation })));
  socket.on('message', raw => {
    if (cleanup) return;
    try {
      const text = raw.toString(); client.bytes += Buffer.byteLength(text);
      const message = JSON.parse(text);
      if (message.type === 'ready') client.ready = true;
      else if (message.type === 'error') failures.push(`${client.label}:ROOM_ERROR`);
      else if (message.v === 2) {
        const next = applyRoomWireFrame(client.latest, message), receivedAt = performance.now();
        if (next.phase === 'racing') {
          assert.ok(Number.isFinite(next.simulationAt), 'PHYSICS_TIMESTAMP_REQUIRED');
          if (client.physicsRound === next.roundId && client.physicsAt !== null) assert.ok(next.simulationAt! >= client.physicsAt, 'PHYSICS_TIMESTAMP_REGRESSED');
          client.physicsRound = next.roundId; client.physicsAt = next.simulationAt!; client.motionMetrics.physicsFramesChecked++;
        }
        client.latest = next; client.receivedAt = receivedAt; client.frames++;
        client.motion.push(next, receivedAt); client.motionMetrics.maxBufferSize = Math.max(client.motionMetrics.maxBufferSize, client.motion.size);
        if (Number.isSafeInteger(message.deliveryId)) {
          pending++;
          if (message.type === 'snapshot' || pending >= 5 || performance.now() - lastAck >= 500) {
            socket.send(JSON.stringify({ type: 'ack', deliveryId: message.deliveryId }));
            pending = 0; lastAck = performance.now(); client.acknowledgements++;
          }
        }
      }
    } catch { failures.push(`${client.label}:INVALID_ROOM_FRAME`); }
  });
  socket.on('error', () => { if (!cleanup) failures.push(`${client.label}:SOCKET_ERROR`); });
  socket.on('close', code => { if (!cleanup) failures.push(`${client.label}:SOCKET_CLOSED_${code}`); });
  await waitFor(() => client.ready && client.frames > 0, 'NATIVE_DUPLEX_CLAIM');
}

function sampleMotion(client: Client, now: number) {
  const players = client.motion.sample(now), metrics = client.motionMetrics;
  metrics.sampleCount++;
  for (const player of players) {
    metrics.posesChecked++;
    if (![...Object.values(player.position), ...Object.values(player.state).filter(value => typeof value === 'number')].every(Number.isFinite)) {
      metrics.invalidPoses++;
      const failure = `${client.label}:NONFINITE_BUFFERED_POSE`; if (!failures.includes(failure)) failures.push(failure);
    }
  }
  if (client.latest.phase === 'racing') {
    const age = client.latest.serverNow - client.latest.simulationAt! + Math.max(0, now - client.receivedAt);
    metrics.peakPhysicsAgeMs = Math.max(metrics.peakPhysicsAgeMs, Math.max(0, age));
    if (!players.length) { const failure = `${client.label}:MISSING_BUFFERED_POSE`; if (!failures.includes(failure)) failures.push(failure); }
  }
}

try {
  const health = await fetch(ORIGIN + '/healthz', { redirect: 'error', signal: AbortSignal.timeout(7000) });
  assert.equal(health.status, 200); assert.equal((await health.json() as any).platform, 'cloudflare'); checks.httpsCloudflare = true;
  const placement = await post('/api/rooms/placement', {}, 'placement');
  const host = own(await admit('/api/rooms', { idempotencyKey: placement.idempotencyKey, profile: { ...DEFAULT_PROFILE, name: 'Smoke host' } }, 'create'), 'Host', 0);
  const guest = own(await admit(`/api/rooms/${host.room.code}/join`, { idempotencyKey: `smoke_${randomUUID()}`, profile: { ...DEFAULT_PROFILE, name: 'Smoke guest', driver: 'sam', car: 'comet' } }, 'join'), 'Guest', 2000);
  await Promise.all(clients.map(connect)); checks.nativeDuplex = true;
  heartbeatTimer = setInterval(() => { if (!stopping && !cleanup) for (const client of clients) if (client.socket?.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify({ type: 'heartbeat' })); }, 2000);
  await command(guest, { type: 'profile', profile: { ...DEFAULT_PROFILE, name: 'Smoke guest', driver: 'jensen', car: 'tide' }, revision: 1 }, 'live-selection');
  await waitFor(() => host.latest.players.some(player => player.id === guest.id && player.profile.driver === 'jensen' && player.profile.car === 'tide'), 'PEER_SELECTION'); checks.liveSelection = true;
  await command(host, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, 'host-selection');
  await command(host, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, 'host-ready');
  await command(host, { type: 'start' }, 'not-ready-start-rejected', 409);
  await command(guest, { type: 'start' }, 'non-host-start-rejected', 403); checks.hostAndReadinessGates = true;
  await command(guest, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, 'guest-selection');
  await command(guest, { type: 'ready', ready: true, profileRevision: 1, courseVersion: COURSE_VERSION }, 'guest-ready');
  await command(host, { type: 'start' }, 'host-start');
  await waitFor(() => clients.every(client => client.latest.phase === 'countdown'), 'COUNTDOWN');
  assert.equal(host.latest.startAt, guest.latest.startAt); assert.equal(host.latest.entrants.length, 2); checks.sharedCountdown = true;
  phase = 'racing'; console.log('Live smoke: one room, two native duplex racers; shared countdown confirmed.');
  inputTimer = setInterval(() => {
    if (stopping || cleanup) return;
    for (const client of clients) {
      sampleMotion(client, performance.now());
      const room = client.latest, player = room.players.find(value => value.id === client.id);
      if (room.phase !== 'racing' || !player || player.dnf || player.finishTime !== null || room.serverNow - room.startAt < client.delayMs || client.socket?.readyState !== WebSocket.OPEN) continue;
      if (client.socket.bufferedAmount > 64000) { failures.push(`${client.label}:INPUT_BACKPRESSURE`); continue; }
      client.socket.send(JSON.stringify({ type: 'input', sequence: ++client.sequence, input: client.pilot.input(player.state) })); client.inputs++;
    }
  }, 50);
  await waitFor(() => guest.latest.players.some(player => player.id === host.id && player.state.speed > 0) && host.latest.players.some(player => player.id === guest.id && player.state.speed > 0), 'PEER_MOVEMENT'); checks.peerMovement = true;
  await waitFor(() => clients.every(client => client.latest.phase === 'results'), 'COMPLETE_RACE', 145_000);
  assert.deepEqual(host.latest.results, guest.latest.results, 'Both peers must receive identical final results');
  const results = host.latest.results!, entries = results.entries;
  assert.deepEqual(entries.map(entry => entry.place), [1, 2]); assert.ok(entries.every(entry => entry.finishTime !== null && entry.dnfReason === null));
  assert.ok(entries[0].finishTime! < entries[1].finishTime!); assert.equal(entries[0].gap, 0); assert.ok(entries[1].gap! > 0);
  checks.orderedFinishes = true; checks.identicalResults = true;
  assert.ok(clients.every(client => client.motionMetrics.physicsFramesChecked > 0)); checks.physicsTimestamps = true;
  assert.ok(clients.every(client => client.motionMetrics.sampleCount > 0 && client.motionMetrics.posesChecked > 0 && client.motionMetrics.invalidPoses === 0)); checks.finiteBufferedPoses = true;
  assert.ok(clients.every(client => client.motionMetrics.maxBufferSize <= 32)); checks.boundedMotionHistory = true;
  finalOrder = entries.map(entry => ({ racer: entry.id === host.id ? 'Host' : 'Guest', place: entry.place, finishSeconds: entry.finishTime, gapSeconds: entry.gap, tied: entry.tied, dnf: entry.dnfReason, driver: entry.profile.driver, car: entry.profile.car }));
  phase = 'rematch';
  await command(guest, { type: 'rematch' }, 'non-host-rematch-rejected', 403);
  await command(host, { type: 'rematch' }, 'host-rematch');
  await waitFor(() => clients.every(client => client.latest.phase === 'lobby'), 'REMATCH_LOBBY');
  assert.ok(clients.every(client => client.latest.players.length === 2 && client.latest.players.every(player => !player.ready)));
  assert.deepEqual(guest.latest.lastResults, results); checks.hostRematch = true;
} catch (error) {
  failure = error instanceof Error ? error.message : 'SMOKE_FAILED';
} finally {
  cleanup = true; clearTimeout(ceiling); if (inputTimer) clearInterval(inputTimer); if (heartbeatTimer) clearInterval(heartbeatTimer);
  for (const client of [...clients].reverse()) {
    try { await command(client, { type: 'leave' }, 'owned-player-leave'); cleanupSuccess++; }
    catch (error) { if ([401, 404].includes((error as {status?:number}).status ?? 0)) cleanupAlreadyGone++; }
  }
  for (const client of clients) client.socket?.terminate();
  process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted);
  const report = {
    startedAt, finishedAt: new Date().toISOString(), origin: ORIGIN, durationSeconds: Math.round((performance.now() - began) / 10) / 100,
    scope: 'One disposable public room and two owned automated racers over HTTPS/WSS. Functional acceptance smoke; not a load, capacity, billing, browser-rendering, or cross-device test.',
    phaseReached: phase, success: failure === null && failures.length === 0 && cleanupSuccess + cleanupAlreadyGone === clients.length,
    failure, protocolErrors: failures, checks, results: finalOrder, requests,
    clients: clients.map(client => ({ racer: client.label, frames: client.frames, inboundBodyBytes: client.bytes, controlFramesSent: client.inputs, feedAcknowledgementsSent: client.acknowledgements,
      motion: { ...client.motionMetrics, peakPhysicsAgeMs: Math.round(client.motionMetrics.peakPhysicsAgeMs * 100) / 100 } })),
    motionMeasurement: 'Buffered poses sampled on the 50ms control timer, not browser frames or FPS. Physics age is serverNow minus simulationAt plus local time since the latest frame; it excludes unknown one-way network transit. Metrics are bounded aggregates, with no room identities, player credentials, or pose histories.',
    cleanup: { ownedPlayers: clients.length, left: cleanupSuccess, alreadyGone: cleanupAlreadyGone, failed: clients.length - cleanupSuccess - cleanupAlreadyGone },
  };
  await mkdir(dirname(OUTPUT), { recursive: true }); await writeFile(OUTPUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: OUTPUT, ...report }, null, 2));
  if (!report.success) process.exitCode = 1;
}

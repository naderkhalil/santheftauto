/** Controlled loopback-only load runner; no existing room/session is ever accepted. */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { DemoAutopilot } from '../src/autopilot.ts';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { COURSE_VERSION, type RoomCommand, type RoomSnapshot } from '../src/multiplayer-protocol.ts';
import { applyRoomWireFrame } from '../src/room-wire.ts';

type Options = { base: string; rooms: number; players: number; duration: number; wire: 'v1' | 'v2'; inputs: 'websocket' | 'http'; transport: 'auto' | 'duplex' | 'sse'; out: string; secretEnv: string };
type Admission = { id: string; token: string; generation: number; room: RoomSnapshot; transport?: 'duplex-v2' };
type Client = Admission & { code: string; sequence: number; pilot: DemoAutopilot; latest: RoomSnapshot; duplex: boolean; inputPending: boolean; heartbeatPending: boolean; abort: AbortController; stream?: Promise<void>; socket?: WebSocket; socketReady: boolean; lastFrameAt: number; nextHeartbeat: number };
type Bucket = { attempts: number; ok: number; statuses: Record<string, number>; ms: number[] };
type Health = Record<string, unknown> & { metrics?: Record<string, number>; api?: Record<string, number> };
type Phase = 'setup' | 'warmup' | 'measurement' | 'cleanup';

function options(): Options {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`Usage: node --experimental-strip-types tools/load-multiplayer.ts [options]
  --base http://127.0.0.1:4100   Loopback URL only; no remote load targets
  --rooms 2                    Requested rooms (1–64), all created by this run
  --players 8                  Players per room (2–8)
  --duration 20                Measured racing seconds (1–120), after countdown
  --wire v2                    v1 full snapshots or v2 compact frames
  --inputs websocket           websocket fast path or http fallback
  --transport auto             Negotiate duplex-v2, or force duplex / sse
  --out docs/checkpoints/2026-10-08/launch/load-TIMESTAMP.json
  --secret-env LOAD_WORKER_SECRET  Optional env containing health probe secret

The server must already be running. This drives real admission, readiness, feeds,
20 Hz inputs and 2-second HTTP heartbeats. It leaves only its own created players.
HTTP/SSE/WebSocket body bytes exclude headers, TLS, and packet overhead. No browser/GPU load.`);
    process.exit(0);
  }
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--base', '--rooms', '--players', '--duration', '--wire', '--inputs', '--transport', '--out', '--secret-env'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Invalid option ${args[i]}; use --help.`);
    parsed[args[i]] = args[i + 1];
  }
  const base = new URL(parsed['--base'] ?? 'http://127.0.0.1:4100');
  if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('This runner accepts only an explicit loopback origin, without credentials, path, or query.');
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(parsed[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw Error(`${key} must be an integer from ${min} through ${max}.`);
    return value;
  };
  const wire = parsed['--wire'] ?? 'v2';
  if (!['v1', 'v2'].includes(wire)) throw Error('--wire must be v1 or v2.');
  const inputs = parsed['--inputs'] ?? 'websocket';
  if (!['websocket', 'http'].includes(inputs)) throw Error('--inputs must be websocket or http.');
  const transport = parsed['--transport'] ?? 'auto';
  if (!['auto', 'duplex', 'sse'].includes(transport)) throw Error('--transport must be auto, duplex, or sse.');
  if (transport === 'duplex' && (wire !== 'v2' || inputs !== 'websocket')) throw Error('Duplex requires --wire v2 and --inputs websocket.');
  return { base: base.origin, rooms: integer('--rooms', 2, 1, 64), players: integer('--players', 8, 2, 8), duration: integer('--duration', 20, 1, 120), wire: wire as Options['wire'], inputs: inputs as Options['inputs'], transport: transport as Options['transport'], out: resolve(parsed['--out'] ?? `docs/checkpoints/2026-10-08/launch/load-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), secretEnv: parsed['--secret-env'] ?? 'LOAD_WORKER_SECRET' };
}

function distribution(values: number[]) {
  if (!values.length) return { count: 0, p50: null, p95: null, p99: null, max: null, mean: null };
  const ordered = [...values].sort((a, b) => a - b);
  const at = (q: number) => Math.round(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * q) - 1)] * 1000) / 1000;
  return { count: ordered.length, p50: at(.5), p95: at(.95), p99: at(.99), max: ordered.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
}

async function run(config: Options) {
  const runId = randomUUID(), startedAt = new Date().toISOString();
  let phase: Phase = 'setup', stopping = false, elapsed = 0, capacityRejected = 0, skippedInputs = 0, inputScheduleTicks = 0;
  let sseBytes = 0, requestBytes = 0, responseBytes = 0, measurementStart = 0, measurementEnd = 0;
  let socketBytes = 0, socketInputsSent = 0, socketResponseBytes = 0, socketAckBytes = 0, socketAcksSent = 0;
  const clients: Client[] = [], rooms: Client[][] = [], roomCodes = new Set<string>();
  const inFlight = new Set<Promise<unknown>>(), stats = new Map<string, Bucket>();
  const frames: Record<string, number> = {}, errors: { phase: Phase; operation: string; status?: number; code: string }[] = [];
  let errorCount = 0, cleanupAttempts = 0, cleanupSuccess = 0, cleanupAlreadyGone = 0, admissionRetries = 0, placementSupported: boolean | null = null;
  const frameIntervals: number[] = [], snapshotAges: number[] = [], healthSamples: { elapsedSeconds: number; health: Health }[] = [];
  const loop = monitorEventLoopDelay({ resolution: 10 });
  let healthBefore: Health | null = null, healthAfter: Health | null = null, failure: string | null = null;
  const onSignal = () => { stopping = true; };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);

  function noteError(operation: string, code: string, status?: number) {
    if (phase === 'cleanup') return;
    errorCount++;
    if (errors.length < 30) errors.push({ phase, operation, code, ...(status ? { status } : {}) });
  }
  function track<T>(promise: Promise<T>) {
    inFlight.add(promise); void promise.finally(() => inFlight.delete(promise)).catch(() => {}); return promise;
  }
  async function request(path: string, body: unknown, operation: string, client?: Client, timeout = 5000) {
    const dispatchPhase = phase, key = `${dispatchPhase}:${operation}`, before = performance.now(), payload = JSON.stringify(body);
    const bucket = stats.get(key) ?? { attempts: 0, ok: 0, statuses: {}, ms: [] }; stats.set(key, bucket); bucket.attempts++;
    if (dispatchPhase === 'measurement') requestBytes += Buffer.byteLength(payload);
    let status = 'network';
    try {
      const response = await fetch(config.base + path, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(client ? { Authorization: `Bearer ${client.token}`, 'X-Room-Generation': String(client.generation) } : {}) }, body: payload, signal: AbortSignal.timeout(timeout) });
      status = String(response.status);
      const text = await response.text();
      if (dispatchPhase === 'measurement') responseBytes += Buffer.byteLength(text);
      const result = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const code = typeof result.code === 'string' ? result.code : `HTTP_${response.status}`;
        const error = Object.assign(new Error(code), { status: response.status, code });
        if (!(operation === 'placement' && response.status === 404)) noteError(operation, code, response.status);
        throw error;
      }
      bucket.ok++; return result;
    } catch (error) {
      if (status === 'network') noteError(operation, error instanceof Error ? error.name : 'NETWORK_ERROR');
      throw error;
    } finally {
      bucket.statuses[status] = (bucket.statuses[status] ?? 0) + 1;
      bucket.ms.push(performance.now() - before);
    }
  }
  const command = (client: Client, body: RoomCommand, operation = body.type) => request(`/api/rooms/${client.code}/command`, body, operation, client);
  async function admission(path: string, body: unknown, operation: string): Promise<Admission> {
    try { return await request(path, body, operation); }
    catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== undefined && (status < 500 || status === 503)) throw error;
      // A lost response can follow successful admission. Recover the exact same
      // identity once using its existing idempotency key, then clean that token.
      admissionRetries++;
      return await request(path, body, operation);
    }
  }
  async function health(): Promise<Health | null> {
    try {
      const secret = process.env[config.secretEnv];
      const headers = secret ? { 'X-Worker-Secret': secret, Authorization: `Bearer ${secret}` } : {};
      const response = await fetch(config.base + '/api/rooms/health', { headers, redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (!response.ok) return null;
      const summary = await response.json() as Health;
      if (summary.platform !== 'cloudflare' || summary.perRoom !== true) return summary;
      const roomMetrics = await Promise.all([...roomCodes].map(async (code, roomIndex) => {
        const probe = await fetch(`${config.base}/ops/rooms/${code}/metrics`, { headers, redirect: 'error', signal: AbortSignal.timeout(3000) });
        if (!probe.ok) throw Error(`ROOM_METRICS_${probe.status}`);
        return { roomIndex, ...await probe.json() as Record<string, unknown> };
      }));
      const metrics = { ticks: 0, streamFrames: 0, streamBytes: 0 }, input = { acceptedInputs: 0 };
      for (const room of roomMetrics) {
        for (const [target, source] of [['ticks', 'ticks'], ['streamFrames', 'frames'], ['streamBytes', 'bytes']] as const) metrics[target] += Number(room[source] ?? 0);
        input.acceptedInputs += Number(room.acceptedInputs ?? 0);
      }
      return { ...summary, roomMetrics, metrics, input };
    } catch { return null; }
  }
  function receiveFrame(client: Client, message: any) {
    const received = performance.now(), kind = message.v === 2 ? String(message.type) : 'snapshot-v1';
    client.latest = message.v === 2 ? applyRoomWireFrame(client.latest, message) : message;
    if (phase === 'measurement') {
      frames[kind] = (frames[kind] ?? 0) + 1;
      if (client.lastFrameAt) frameIntervals.push(received - client.lastFrameAt);
      snapshotAges.push(Date.now() - client.latest.serverNow);
    }
    client.lastFrameAt = received;
  }
  async function stream(client: Client) {
    try {
      const response = await fetch(`${config.base}/api/rooms/${client.code}/events${config.wire === 'v2' ? '?wire=v2' : ''}`, { headers: { Authorization: `Bearer ${client.token}`, 'X-Room-Generation': String(client.generation) }, signal: client.abort.signal, redirect: 'error' });
      if (!response.ok || !response.body) throw Error(`SSE_HTTP_${response.status}`);
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (!client.abort.signal.aborted) {
        const chunk = await reader.read(); if (chunk.done) break;
        if (phase === 'measurement') sseBytes += chunk.value.byteLength;
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const lines = frame.split('\n'), event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
          const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const message = JSON.parse(data);
          if (event === 'room-error') { if (phase !== 'cleanup') noteError('sse', message.code ?? 'ROOM_ERROR'); continue; }
          receiveFrame(client, message);
        }
        if (buffer.length > 2_000_000) throw Error('SSE_FRAME_TOO_LARGE');
      }
      if (phase !== 'cleanup' && !client.abort.signal.aborted) noteError('sse', 'UNEXPECTED_END');
    } catch (error) {
      if (!client.abort.signal.aborted && phase !== 'cleanup') noteError('sse', error instanceof Error ? error.message : 'STREAM_ERROR');
    }
  }
  async function inputChannel(client: Client) {
    return await new Promise<void>((resolve, reject) => {
      const url = new URL(`/api/rooms/${client.code}/${client.duplex ? 'socket' : 'input'}`, config.base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url, { perMessageDeflate: false, handshakeTimeout: 5000 }); client.socket = socket;
      let settled = false, pendingAcks = 0, lastAckAt = performance.now();
      const timer = setTimeout(() => fail(Error('WS_CLAIM_TIMEOUT')), 7000);
      function fail(error: Error) { if (!settled) { settled = true; clearTimeout(timer); reject(error); } }
      socket.on('open', () => socket.send(JSON.stringify({ type: 'claim', token: client.token, generation: client.generation })));
      socket.on('message', raw => {
        try {
          if (phase === 'measurement') socketResponseBytes += raw instanceof ArrayBuffer ? raw.byteLength : Array.isArray(raw) ? raw.reduce((total, part) => total + part.byteLength, 0) : raw.byteLength;
          const message = JSON.parse(raw.toString());
          if (message.type === 'ready') { client.socketReady = true; if (!settled) { settled = true; clearTimeout(timer); resolve(); } }
          else if (message.type === 'error') { noteError('websocket', message.code ?? 'WS_ERROR'); fail(Error(message.code ?? 'WS_ERROR')); }
          else if (client.duplex && message.v === 2) {
            receiveFrame(client, message);
            if (Number.isSafeInteger(message.deliveryId)) {
              pendingAcks++;
              if (message.type === 'snapshot' || pendingAcks >= 5 || performance.now() - lastAckAt >= 500) {
                const acknowledgement = JSON.stringify({ type: 'ack', deliveryId: message.deliveryId });
                socket.send(acknowledgement); pendingAcks = 0; lastAckAt = performance.now();
                if (phase === 'measurement') { socketAcksSent++; socketAckBytes += Buffer.byteLength(acknowledgement); }
              }
            }
          }
        } catch { noteError('websocket', 'INVALID_SERVER_MESSAGE'); fail(Error('INVALID_SERVER_MESSAGE')); }
      });
      socket.on('error', error => { noteError('websocket', error.message); fail(error); });
      socket.on('close', () => { client.socketReady = false; if (phase !== 'cleanup') noteError('websocket', 'UNEXPECTED_CLOSE'); fail(Error('WS_CLOSED_BEFORE_READY')); });
    });
  }
  function admitted(admission: Admission): Client {
    const duplex = config.transport !== 'sse' && config.wire === 'v2' && config.inputs === 'websocket' && admission.transport === 'duplex-v2';
    const client: Client = { ...admission, code: admission.room.code, sequence: 0, pilot: new DemoAutopilot(), latest: admission.room, duplex, inputPending: false, heartbeatPending: false, abort: new AbortController(), socketReady: false, lastFrameAt: 0, nextHeartbeat: performance.now() + Math.random() * 2000 };
    clients.push(client); return client;
  }
  const heartbeatTimer = setInterval(() => {
    if (phase === 'cleanup') return;
    for (const client of clients) {
      if (client.heartbeatPending || performance.now() < client.nextHeartbeat) continue;
      client.nextHeartbeat = performance.now() + 2000; client.heartbeatPending = true;
      void track(command(client, { type: 'heartbeat' }).catch(() => {}).finally(() => { client.heartbeatPending = false; }));
    }
  }, 50);
  let inputTimer: ReturnType<typeof setInterval> | undefined;
  try {
    console.log(`Local load: ${config.rooms} requested rooms × ${config.players} players; ${config.duration}s measured; ${config.wire}/${config.inputs}; ${config.base}`);
    healthBefore = await health();
    for (let roomIndex = 0; roomIndex < config.rooms && !stopping; roomIndex++) {
      let idempotencyKey = `load_${runId}_${roomIndex}`;
      if (placementSupported !== false) {
        try {
          const placement = await request('/api/rooms/placement', {}, 'placement');
          if (typeof placement.idempotencyKey !== 'string') throw Error('PLACEMENT_KEY_MISSING');
          idempotencyKey = placement.idempotencyKey; placementSupported = true;
        } catch (error) {
          if ((error as { status?: number }).status === 404) placementSupported = false;
          else if ((error as { status?: number }).status === 503) { capacityRejected++; break; }
          else throw error;
        }
      }
      let host: Client;
      try {
        host = admitted(await admission('/api/rooms', { idempotencyKey, profile: { ...DEFAULT_PROFILE, name: `Load ${roomIndex + 1}-1` } }, 'create'));
      } catch (error) { if ((error as { status?: number }).status === 503) { capacityRejected++; break; } throw error; }
      roomCodes.add(host.code); const party = [host]; rooms.push(party);
      for (let player = 1; player < config.players; player++) {
        party.push(admitted(await admission(`/api/rooms/${host.code}/join`, { idempotencyKey: `load_${runId}_${roomIndex}_${player}`, profile: { ...DEFAULT_PROFILE, name: `Load ${roomIndex + 1}-${player + 1}`, driver: ['dario', 'sam', 'elon', 'jensen'][player % 4], car: ['sundrop', 'comet', 'tide'][player % 3] } }, 'join')));
      }
      await Promise.all(party.map(async client => {
        if (config.transport === 'duplex' && !client.duplex) throw Error('DUPLEX_TRANSPORT_UNAVAILABLE');
        if (!client.duplex) client.stream = stream(client);
        if (config.inputs === 'websocket') await inputChannel(client);
        await command(client, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION });
        await command(client, { type: 'ready', ready: true, profileRevision: client.room.players.find(player => player.id === client.id)!.profileRevision, courseVersion: COURSE_VERSION });
      }));
    }
    if (!rooms.length || stopping) throw Error(stopping ? 'INTERRUPTED' : 'NO_CAPACITY');
    phase = 'warmup';
    await Promise.all(rooms.map(party => command(party[0], { type: 'start' })));
    inputTimer = setInterval(() => {
      if (phase !== 'warmup' && phase !== 'measurement') return;
      if (phase === 'measurement') inputScheduleTicks++;
      for (const client of clients) {
        const player = client.latest.players.find(player => player.id === client.id);
        if (client.latest.phase !== 'racing' || !player || player.finishTime !== null || player.dnf) continue;
        if (config.inputs === 'http') {
          if (client.inputPending) { if (phase === 'measurement') skippedInputs++; continue; }
          client.inputPending = true;
          void track(command(client, { type: 'input', sequence: ++client.sequence, input: client.pilot.input(player.state) }).catch(() => {}).finally(() => { client.inputPending = false; }));
        } else {
          if (!client.socketReady || client.socket?.readyState !== WebSocket.OPEN || client.socket.bufferedAmount > 64_000) { if (phase === 'measurement') skippedInputs++; continue; }
          const payload = JSON.stringify({ type: 'input', sequence: ++client.sequence, input: client.pilot.input(player.state) });
          client.socket.send(payload, error => { if (error) noteError('websocket-send', error.message); });
          if (phase === 'measurement') { socketInputsSent++; socketBytes += Buffer.byteLength(payload); }
        }
      }
    }, 50);
    const warmupDeadline = performance.now() + 20_000;
    while (!clients.every(client => client.latest.phase === 'racing')) {
      if (stopping || performance.now() >= warmupDeadline) throw Error(stopping ? 'INTERRUPTED' : 'RACE_WARMUP_TIMEOUT');
      await delay(50);
    }
    healthBefore = await health(); phase = 'measurement'; measurementStart = performance.now(); loop.enable();
    console.log(`Racing: ${rooms.length} rooms, ${clients.length} clients. Measurement started.`);
    let nextProgress = 10;
    while (!stopping && performance.now() - measurementStart < config.duration * 1000) {
      await delay(Math.min(1000, Math.max(1, config.duration * 1000 - (performance.now() - measurementStart))));
      elapsed = (performance.now() - measurementStart) / 1000;
      if (elapsed >= nextProgress) {
        const sample = await health(); if (sample) healthSamples.push({ elapsedSeconds: elapsed, health: sample });
        console.log(`${Math.round(elapsed)}s: inputs ${(config.inputs === 'websocket' ? socketInputsSent : stats.get('measurement:input')?.ok ?? 0).toLocaleString()}, feeds ${((sseBytes + socketResponseBytes) / 1e6).toFixed(1)} MB, errors ${errorCount}`); nextProgress += 10;
      }
    }
    measurementEnd = performance.now(); phase = 'cleanup'; loop.disable(); healthAfter = await health();
  } catch (error) {
    failure = error instanceof Error ? error.message : 'RUN_FAILED';
    if (measurementStart && !measurementEnd) measurementEnd = performance.now();
    console.error(`Load run stopped: ${failure}`);
  } finally {
    phase = 'cleanup'; clearInterval(heartbeatTimer); if (inputTimer) clearInterval(inputTimer); loop.disable();
    await Promise.allSettled([...inFlight]);
    // Only tokens created by this run are used. Guest leaves precede host leaves.
    for (const party of [...rooms].reverse()) {
      for (const client of [...party].reverse()) {
        cleanupAttempts++;
        try { await command(client, { type: 'leave' }); cleanupSuccess++; }
        catch (error) { if ([401, 404].includes((error as { status?: number }).status ?? 0)) cleanupAlreadyGone++; }
      }
    }
    for (const client of clients) { client.abort.abort(); client.socket?.terminate(); }
    await Promise.allSettled(clients.map(client => client.stream));
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
  }
  const seconds = Math.max(0, (measurementEnd - measurementStart) / 1000);
  const metricBefore = healthBefore?.api ?? healthBefore?.metrics, metricAfter = healthAfter?.api ?? healthAfter?.metrics;
  const metricDelta: Record<string, number> = {};
  if (metricBefore && metricAfter) for (const key of ['ticks', 'totalTickMs', 'streamFrames', 'streamBytes', 'snapshotsBuilt', 'serializedFrames']) if (Number.isFinite(metricBefore[key]) && Number.isFinite(metricAfter[key])) metricDelta[key] = metricAfter[key] - metricBefore[key];
  const inputMetrics = (value: Health | null): Record<string, number> | undefined => (value?.input ?? value?.inputMetrics ?? value?.inputChannel ?? (value?.metrics as Record<string, unknown> | undefined)?.input ?? (value?.metrics as Record<string, unknown> | undefined)?.inputChannel) as Record<string, number> | undefined;
  const inputBefore = inputMetrics(healthBefore), inputAfter = inputMetrics(healthAfter);
  const acceptedDelta = inputBefore && inputAfter && Number.isFinite(inputBefore.acceptedInputs) && Number.isFinite(inputAfter.acceptedInputs) ? inputAfter.acceptedInputs - inputBefore.acceptedInputs : null;
  const counterReset = Object.values(metricDelta).some(value => value < 0) || acceptedDelta !== null && acceptedDelta < 0;
  const acceptedInputs = counterReset ? null : acceptedDelta;
  const measuredInputs = config.inputs === 'http' ? stats.get('measurement:input')?.ok ?? 0 : acceptedInputs;
  const requests = Object.fromEntries([...stats].map(([key, bucket]) => [key, { attempts: bucket.attempts, ok: bucket.ok, statuses: bucket.statuses, latencyMs: distribution(bucket.ms) }]));
  const report = {
    schemaVersion: 2, runId, startedAt, finishedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    scope: 'Loopback HTTP/WebSocket/SSE transport and simulation; excludes browsers, rendering, assets, TLS and internet latency.',
    config: { base: config.base, requestedRooms: config.rooms, playersPerRoom: config.players, measuredSecondsRequested: config.duration, wire: config.wire, inputTransport: config.inputs, feedTransport: config.transport, inputHz: 20, heartbeatSeconds: 2 },
    actual: { rooms: rooms.length, clients: clients.length, duplexClients: clients.filter(client => client.duplex).length, sseClients: clients.filter(client => !client.duplex).length, measuredSeconds: seconds, capacityRejected, admissionRetries, placementSupported, interrupted: stopping, failure },
    requests, errors: { count: errorCount, examples: errors },
    throughput: { sseBodyBytes: sseBytes, sseBodyBytesPerSecond: seconds ? sseBytes / seconds : null, sseBodyBytesPerClientSecond: seconds && clients.length ? sseBytes / seconds / clients.length : null, websocketResponseBodyBytes: socketResponseBytes, websocketResponseBodyBytesPerSecond: seconds ? socketResponseBytes / seconds : null, feedBodyBytesPerSecond: seconds ? (sseBytes + socketResponseBytes) / seconds : null, httpRequestBodyBytes: requestBytes, httpRequestBodyBytesPerSecond: seconds ? requestBytes / seconds : null, httpResponseBodyBytes: responseBytes, httpResponseBodyBytesPerSecond: seconds ? responseBytes / seconds : null, websocketBodyBytes: socketBytes, websocketBodyBytesPerSecond: seconds ? socketBytes / seconds : null, websocketInputFramesSent: socketInputsSent, websocketAcknowledgementBytes: socketAckBytes, websocketAcknowledgementsSent: socketAcksSent, serverAcceptedWebsocketInputs: acceptedInputs, deliveredInputsPerClientSecond: seconds && clients.length && measuredInputs !== null ? measuredInputs / seconds / clients.length : null, inputScheduleTicks, skippedInputs },
    streams: { frames, arrivalIntervalMs: distribution(frameIntervals), localClockSnapshotAgeMs: distribution(snapshotAges), latestPhases: clients.reduce((counts, client) => { counts[client.latest.phase] = (counts[client.latest.phase] ?? 0) + 1; return counts; }, {} as Record<string, number>) },
    server: { healthBefore, healthAfter, healthSamples, metricDelta, counterReset, meanTickMs: !counterReset && metricDelta.ticks && Number.isFinite(metricDelta.totalTickMs) ? metricDelta.totalTickMs / metricDelta.ticks : null, inputLatencyMs: config.inputs === 'websocket' ? null : distribution(stats.get('measurement:input')?.ms ?? []), note: 'WebSocket input has no per-message acknowledgement: no input latency is fabricated. Outbound feed acknowledgements enforce queue limits, not input latency. HTTP heartbeat RTT remains measured. Cloudflare metrics aggregate only this run’s known room actors; there is no global room census. Counters reset on actor eviction, so negative deltas invalidate the measurement. Server tick timings are null when the runtime exposes only counts.' },
    loadGenerator: { eventLoopDelayMs: { p50: loop.percentile(50) / 1e6, p95: loop.percentile(95) / 1e6, p99: loop.percentile(99) / 1e6, max: loop.max / 1e6 }, note: 'This is the load-generator process, not the server event loop. Both compete for the local machine CPU; results are not remote throughput claims.' },
    cleanup: { ownedRooms: roomCodes.size, attempts: cleanupAttempts, success: cleanupSuccess, alreadyGone: cleanupAlreadyGone, failed: cleanupAttempts - cleanupSuccess - cleanupAlreadyGone },
  };
  await mkdir(dirname(config.out), { recursive: true }); await writeFile(config.out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: config.out, actual: report.actual, commandHeartbeatLatencyMs: distribution(stats.get('measurement:heartbeat')?.ms ?? []), inputLatencyMs: report.server.inputLatencyMs, feedMBPerSecond: seconds ? (sseBytes + socketResponseBytes) / seconds / 1e6 : null, inputHzPerClient: report.throughput.deliveredInputsPerClientSecond, errors: errorCount, cleanup: report.cleanup }, null, 2));
  if (failure || stopping || counterReset || cleanupAttempts !== cleanupSuccess + cleanupAlreadyGone || errorCount > capacityRejected) process.exitCode = 1;
}

try { await run(options()); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }

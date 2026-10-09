import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { RoomService, RoomError } from './rooms.ts';
import type { RoomCommand } from '../src/multiplayer-protocol.ts';
import { RoomWireEncoder, snapshotFrame, sseData } from './room-wire.ts';

export type RoomApiOptions = { tickIntervalMs?: number; idleHeartbeatMs?: number; clientAddress?: (req: IncomingMessage) => string };
export type RoomApiMetrics = {
  uptimeMs: number; rooms: number; streams: number; wireV2Streams: number;
  ticks: number; lastTickMs: number; maxTickMs: number; totalTickMs: number;
  lastTickLagMs: number; maxTickLagMs: number; streamFrames: number;
  streamBytes: number; snapshotsBuilt: number; serializedFrames: number;
};

/** Same-origin room API. Private claims travel in headers, never invite URLs. */
export function createRoomApi(service = new RoomService(), options: RoomApiOptions = {}) {
  const streams = new Set<{ code: string; token: string; generation: number; response: ServerResponse; compact: boolean }>();
  const encoders = new Map<string, RoomWireEncoder>();
  const startedAt = performance.now(), tickIntervalMs = Math.max(10, Math.min(1000, options.tickIntervalMs ?? 50));
  const idleHeartbeatMs = Math.max(100, Math.min(1500, options.idleHeartbeatMs ?? 1500));
  let previousTickAt = startedAt;
  const totals = { ticks: 0, lastTickMs: 0, maxTickMs: 0, totalTickMs: 0, lastTickLagMs: 0, maxTickLagMs: 0, streamFrames: 0, streamBytes: 0, snapshotsBuilt: 0, serializedFrames: 0 };
  const write = (response: ServerResponse, data: string, bytes = Buffer.byteLength(data)) => {
    response.write(data); totals.streamFrames++; totals.streamBytes += bytes;
  };
  const snapshot = (room: ReturnType<RoomService['room']>, now: number) => { totals.snapshotsBuilt++; return service.snapshot(room, now); };
  const buckets = new Map<string, { count: number; until: number }>();
  const limit = (key: string, maximum: number, now: number) => {
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) { bucket = { count: 0, until: now + 60_000 }; buckets.set(key, bucket); }
    if (++bucket.count > maximum) throw new RoomError('Too many requests. Please wait a moment.', 429, 'RATE_LIMITED');
  };
  const interval = setInterval(() => {
    const tickStarted = performance.now(), now = Date.now();
    totals.lastTickLagMs = Math.max(0, tickStarted - previousTickAt - tickIntervalMs);
    totals.maxTickLagMs = Math.max(totals.maxTickLagMs, totals.lastTickLagMs); previousTickAt = tickStarted;
    service.tick(now);
    const recipients = new Map<string, Array<typeof streams extends Set<infer T> ? T : never>>();
    for (const client of streams) {
      try {
        // Stream writes prove only that the server is alive. Clients heartbeat separately.
        service.auth(client.code, client.token, client.generation);
        if (client.response.writableLength > 256000) { client.response.destroy(); streams.delete(client); continue; }
        const group = recipients.get(client.code) ?? []; group.push(client); recipients.set(client.code, group);
      } catch (error) {
        if (error instanceof RoomError) write(client.response, 'event: room-error\ndata: ' + JSON.stringify({ error: error.message, code: error.code }) + '\n\n');
        client.response.end(); streams.delete(client);
      }
    }
    for (const [code, clients] of recipients) {
      const encoder = encoders.get(code) ?? new RoomWireEncoder(); encoders.set(code, encoder);
      const prepared = encoder.prepare(snapshot(service.room(code), now), idleHeartbeatMs);
      if (!prepared) continue;
      const payloads = new Map<boolean, { data: string; bytes: number }>();
      for (const client of clients) {
        let payload = payloads.get(client.compact);
        if (!payload) {
          const data = client.compact ? prepared.compact() : prepared.legacy();
          payload = { data, bytes: Buffer.byteLength(data) }; payloads.set(client.compact, payload); totals.serializedFrames++;
        }
        write(client.response, payload.data, payload.bytes);
      }
    }
    for (const code of encoders.keys()) if (!recipients.has(code)) encoders.delete(code);
    for (const [key, bucket] of buckets) if (bucket.until < now) buckets.delete(key);
    totals.ticks++; totals.lastTickMs = performance.now() - tickStarted;
    totals.totalTickMs += totals.lastTickMs; totals.maxTickMs = Math.max(totals.maxTickMs, totals.lastTickMs);
  }, tickIntervalMs);
  interval.unref();
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) });
    res.end(JSON.stringify(data));
  };
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const path = (req.url ?? '').split('?')[0];
      if (!path.startsWith('/api/rooms')) return false;
      if (req.headers.origin) {
        let origin: URL; try { origin = new URL(req.headers.origin); } catch { throw new RoomError('Invalid request origin.', 403); }
        if (origin.host !== req.headers.host) throw new RoomError('Use the room link on this game’s own website.', 403, 'FOREIGN_ORIGIN');
      }
      const peer = options.clientAddress?.(req) ?? req.socket.remoteAddress ?? 'unknown', now = Date.now();
      const match = path.match(/^\/api\/rooms\/([A-F0-9]{8})\/(join|events|command|claim)$/);
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      let generation: number | undefined;
      if (path === '/api/rooms' || path === '/api/rooms/placement' || match?.[2] === 'join') {
        // Admission is infrequent. Gameplay limits are per authenticated identity,
        // so a reverse proxy or a shared Wi-Fi address does not pool all input traffic.
        limit(peer + ':admission', 600, now);
      } else if (match) {
        try {
          service.auth(match[1], token);
          if (match[2] !== 'claim') {
            const header = req.headers['x-room-generation'];
            generation = typeof header === 'string' && /^\d+$/.test(header) ? Number(header) : undefined;
            if (!Number.isSafeInteger(generation) || generation! < 1) throw new RoomError('Restore your room session to reconnect.', 401, 'SESSION_CLAIM_REQUIRED');
            service.auth(match[1], token, generation);
          }
        } catch (error) { limit(peer + ':invalid-auth', 120, now); throw error; }
        limit(token + (match[2] === 'claim' ? ':claim' : ':play'), match[2] === 'claim' ? 30 : 2400, now);
      } else limit(peer + ':unknown', 120, now);
      if (match?.[2] === 'events' && req.method === 'GET') {
        service.touch(match[1], token, now, generation);
        for (const old of streams) if (old.code === match[1] && old.token === token) { old.response.end(); streams.delete(old); }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        const compact = new URL(req.url!, 'http://localhost').searchParams.get('wire') === 'v2';
        const initial = snapshot(service.room(match[1]), now);
        write(res, sseData(compact ? snapshotFrame(initial) : initial)); totals.serializedFrames++;
        const client = { code: match[1], token, generation: generation!, response: res, compact };
        streams.add(client);
        res.on('close', () => {
          streams.delete(client);
          if (![...streams].some(c => c.code === client.code && c.token === token && c.generation === client.generation)) service.disconnect(client.code, token, Date.now(), client.generation);
        });
        return true;
      }
      if (req.method !== 'POST') throw new RoomError('Room endpoint not found.', 404);
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new RoomError('Expected JSON.', 415);
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) throw new RoomError('Request too large.', 413); }
      let data;
      try { data = JSON.parse(body || '{}'); } catch { throw new RoomError('Invalid JSON.'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RoomError('Invalid request.');
      if (data.idempotencyKey !== undefined && (typeof data.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(data.idempotencyKey))) throw new RoomError('Invalid retry key.');
      if ((path === '/api/rooms' || match?.[2] === 'join') && data.profile !== undefined && (!data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile))) throw new RoomError('Invalid driver profile.');
      // Use receipt time after body parsing, not a timestamp from before a slow upload.
      const acceptedAt = Date.now();
      if (path === '/api/rooms/placement') {
        const health = service.getHealth();
        if (!health.accepting) {
          const error = new RoomError(health.draining ? 'This race server is updating. Please try again shortly.' : 'Multiplayer is busy. Please try again shortly, or enjoy a single-player race.', 503, health.draining ? 'SERVER_DRAINING' : 'SERVICE_BUSY');
          error.admitted = false; throw error;
        }
        json(res, 200, { workerId: service.workerId, idempotencyKey: (service.workerId ? service.workerId + '_' : '') + randomBytes(24).toString('hex') });
      }
      else if (path === '/api/rooms') json(res, 201, service.create(data.profile ?? {}, acceptedAt, data.idempotencyKey));
      else if (match?.[2] === 'join') json(res, 201, service.join(match[1], data.profile ?? {}, acceptedAt, data.idempotencyKey));
      else if (match?.[2] === 'claim') json(res, 200, service.claim(match[1], token, acceptedAt));
      else if (match?.[2] === 'command') { service.command(match[1], token, data as RoomCommand, acceptedAt, generation); json(res, 200, { ok: true, serverNow: Date.now() }); }
      else throw new RoomError('Room endpoint not found.', 404);
      return true;
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof RoomError ? error.status : 500, { error: error instanceof RoomError ? error.message : 'The room service had a problem. Try again.', code: error instanceof RoomError ? error.code : 'SERVICE_ERROR', admitted: error instanceof RoomError ? error.admitted : undefined });
      else res.end();
      return true;
    }
  };
  return {
    handler, service,
    getMetrics(): RoomApiMetrics { return { ...totals, uptimeMs: performance.now() - startedAt, rooms: service.rooms.size, streams: streams.size, wireV2Streams: [...streams].filter(client => client.compact).length }; },
    close() { clearInterval(interval); for (const client of streams) client.response.end(); streams.clear(); encoders.clear(); },
  };
}

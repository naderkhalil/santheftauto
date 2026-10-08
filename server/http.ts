import type { IncomingMessage, ServerResponse } from 'node:http';
import { RoomService, RoomError } from './rooms.ts';
import type { RoomCommand } from '../src/multiplayer-protocol.ts';

/** Same-origin room API. Private claims travel in headers, never invite URLs. */
export function createRoomApi(service = new RoomService()) {
  const streams = new Set<{ code: string; token: string; generation: number; response: ServerResponse }>();
  const buckets = new Map<string, { count: number; until: number }>();
  const limit = (key: string, maximum: number, now: number) => {
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) { bucket = { count: 0, until: now + 60_000 }; buckets.set(key, bucket); }
    if (++bucket.count > maximum) throw new RoomError('Too many requests. Please wait a moment.', 429, 'RATE_LIMITED');
  };
  const interval = setInterval(() => {
    service.tick();
    for (const client of streams) {
      try {
        // Stream writes prove only that the server is alive. Clients heartbeat separately.
        const { room } = service.auth(client.code, client.token, client.generation);
        if (client.response.writableLength > 256000) { client.response.destroy(); streams.delete(client); continue; }
        client.response.write('data: ' + JSON.stringify(service.snapshot(room)) + '\n\n');
      } catch (error) {
        if (error instanceof RoomError) client.response.write('event: room-error\ndata: ' + JSON.stringify({ error: error.message, code: error.code }) + '\n\n');
        client.response.end(); streams.delete(client);
      }
    }
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.until < now) buckets.delete(key);
  }, 50);
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
      const peer = req.socket.remoteAddress ?? 'unknown', now = Date.now();
      const match = path.match(/^\/api\/rooms\/([A-F0-9]{8})\/(join|events|command|claim)$/);
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      let generation: number | undefined;
      if (path === '/api/rooms' || match?.[2] === 'join') {
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
        res.write('data: ' + JSON.stringify(service.snapshot(service.room(match[1]), now)) + '\n\n');
        const client = { code: match[1], token, generation: generation!, response: res };
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
      if (path === '/api/rooms') json(res, 201, service.create(data.profile ?? {}, acceptedAt, data.idempotencyKey));
      else if (match?.[2] === 'join') json(res, 201, service.join(match[1], data.profile ?? {}, acceptedAt, data.idempotencyKey));
      else if (match?.[2] === 'claim') json(res, 200, service.claim(match[1], token, acceptedAt));
      else if (match?.[2] === 'command') { service.command(match[1], token, data as RoomCommand, acceptedAt, generation); json(res, 200, { ok: true, serverNow: Date.now() }); }
      else throw new RoomError('Room endpoint not found.', 404);
      return true;
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof RoomError ? error.status : 500, { error: error instanceof RoomError ? error.message : 'The room service had a problem. Try again.', code: error instanceof RoomError ? error.code : 'SERVICE_ERROR' });
      else res.end();
      return true;
    }
  };
  return { handler, service, close() { clearInterval(interval); for (const client of streams) client.response.end(); streams.clear(); } };
}

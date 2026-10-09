import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage, type ServerResponse, type ClientRequest, type OutgoingHttpHeaders } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import type { Duplex } from 'node:stream';

export type RoomWorker = { id: string; url: string };
export type WorkerHealth = { workerId: string; accepting: boolean; activeRooms: number; capacity: number; availableSlots: number; activePlayers: number; reason?: string };
export type GatewayOptions = {
  workers: readonly RoomWorker[];
  workerSecret: string;
  publicOrigin?: string;
  probeTimeoutMs?: number;
  requestTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  healthCacheMs?: number;
  clientAddress?: (req: IncomingMessage) => string;
};
type Worker = { id: string; url: URL };
type Probe = { workerId: string; healthy: boolean; accepting: boolean; availableSlots: number; health?: WorkerHealth };
class GatewayError extends Error {
  readonly status:number; readonly code:string;
  constructor(message: string, status: number, code: string) { super(message); this.status=status; this.code=code; }
}

/** Fixed prefix ownership survives gateway replicas and changes in pool size.
 * Placement keys must be persisted by the client before its first create POST.
 * Once dispatched, a create is never retried on a different worker here.
 */
export function createRoomGateway(options: GatewayOptions) {
  if (!options.workerSecret) throw new Error('A worker secret is required for the room gateway.');
  const workers = new Map<string, Worker>();
  for (const entry of options.workers) {
    const id = entry.id.toUpperCase(), url = new URL(entry.url);
    if (!/^[A-F0-9]{2}$/.test(id) || workers.has(id)) throw new Error('Room workers require unique two-character hex IDs.');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Worker URLs must be HTTP(S) origins.');
    workers.set(id, { id, url });
  }
  if (!workers.size) throw new Error('At least one room worker is required.');
  const publicOrigin = options.publicOrigin ? new URL(options.publicOrigin).origin : null;
  const probeTimeout = options.probeTimeoutMs ?? 1500, requestTimeout = options.requestTimeoutMs ?? 6000;
  const idleTimeout = options.streamIdleTimeoutMs ?? 15000, cacheDuration = options.healthCacheMs ?? 1000;
  const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 4096, maxFreeSockets: 64 });
  const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 4096, maxFreeSockets: 64 });
  const requests = new Set<ClientRequest>(), tunnels = new Set<Duplex>();
  let closed = false, cachedAt = 0, cached: Probe[] = [], probing: Promise<Probe[]> | null = null;

  function originAllowed(req: IncomingMessage) {
    const host = req.headers.host;
    if (!host) throw new GatewayError('A request host is required.', 400, 'INVALID_HOST');
    let requestOrigin: URL;
    try { requestOrigin = new URL('http://' + host); } catch { throw new GatewayError('Invalid request host.', 400, 'INVALID_HOST'); }
    if (publicOrigin && requestOrigin.host !== new URL(publicOrigin).host) throw new GatewayError('Use the game’s public website.', 403, 'FOREIGN_ORIGIN');
    if (req.headers.origin) {
      let supplied: URL;
      try { supplied = new URL(req.headers.origin); } catch { throw new GatewayError('Invalid request origin.', 403, 'FOREIGN_ORIGIN'); }
      if (publicOrigin ? supplied.origin !== publicOrigin : supplied.host !== requestOrigin.host) throw new GatewayError('Use the room link on this game’s own website.', 403, 'FOREIGN_ORIGIN');
    }
  }
  function authenticatedProbe(req: IncomingMessage) {
    const supplied = req.headers['x-worker-secret'];
    return typeof supplied === 'string' && Buffer.byteLength(supplied) === Buffer.byteLength(options.workerSecret) && timingSafeEqual(Buffer.from(supplied), Buffer.from(options.workerSecret));
  }
  function json(res: ServerResponse, status: number, value: unknown) {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(status === 503 ? { 'Retry-After': '2' } : {}) });
    res.end(JSON.stringify(value));
  }
  async function body(req: IncomingMessage) {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new GatewayError('Expected JSON.', 415, 'INVALID_REQUEST');
    return await new Promise<{ data: Record<string, unknown>; bytes: Buffer }>((resolve, reject) => {
      const chunks: Buffer[] = []; let size = 0;
      const cleanup = () => { clearTimeout(timer); req.off('data', onData); req.off('end', onEnd); req.off('error', fail); req.off('aborted', onAbort); };
      const fail = (error: Error) => { cleanup(); reject(error); req.resume(); };
      const onAbort = () => fail(new GatewayError('Request interrupted.', 400, 'REQUEST_INTERRUPTED'));
      const onData = (chunk: Buffer) => { size += chunk.length; if (size > 4096) fail(new GatewayError('Request too large.', 413, 'REQUEST_TOO_LARGE')); else chunks.push(chunk); };
      const onEnd = () => {
        cleanup(); const bytes = Buffer.concat(chunks); let data: unknown;
        try { data = JSON.parse(bytes.toString('utf8') || '{}'); } catch { reject(new GatewayError('Invalid JSON.', 400, 'INVALID_REQUEST')); return; }
        if (!data || typeof data !== 'object' || Array.isArray(data)) { reject(new GatewayError('Invalid request.', 400, 'INVALID_REQUEST')); return; }
        resolve({ data: data as Record<string, unknown>, bytes });
      };
      const timer = setTimeout(() => fail(new GatewayError('The request took too long.', 408, 'REQUEST_TIMEOUT')), requestTimeout);
      req.on('data', onData); req.on('end', onEnd); req.on('error', fail); req.on('aborted', onAbort);
    });
  }
  function upstreamHeaders(req: IncomingMessage, worker: Worker, bytes?: Buffer, upgrade = false): OutgoingHttpHeaders {
    // Do not forward client-supplied Host, Origin, Forwarded, X-Forwarded-*,
    // X-Worker-Secret, or X-Room-Client-IP as trusted upstream metadata.
    const headers: OutgoingHttpHeaders = { Host: worker.url.host, 'X-Worker-Secret': options.workerSecret, 'X-Room-Client-IP': options.clientAddress?.(req) ?? req.socket.remoteAddress ?? 'unknown' };
    for (const name of ['authorization', 'x-room-generation', 'content-type', 'accept']) if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    if (req.headers.origin) headers.Origin = worker.url.origin;
    if (bytes) headers['Content-Length'] = bytes.length;
    if (upgrade) {
      headers.Connection = 'Upgrade'; headers.Upgrade = 'websocket';
      for (const name of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions']) if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    }
    return headers;
  }
  function targetUrl(worker: Worker, req: IncomingMessage) {
    const incoming = new URL(req.url ?? '/', 'http://gateway.invalid'), target = new URL(worker.url);
    target.pathname = incoming.pathname; target.search = incoming.search; return target;
  }
  function requestFor(worker: Worker) { return worker.url.protocol === 'https:' ? httpsRequest : httpRequest; }
  function agentFor(worker: Worker) { return worker.url.protocol === 'https:' ? httpsAgent : httpAgent; }
  async function probe(worker: Worker): Promise<Probe> {
    try {
      const response = await fetch(new URL('/api/rooms/health', worker.url), { headers: { 'X-Worker-Secret': options.workerSecret }, signal: AbortSignal.timeout(probeTimeout), redirect: 'error' });
      if (!response.ok) throw Error('Worker not healthy');
      const info = await response.json() as WorkerHealth;
      if (info.workerId !== worker.id || typeof info.accepting !== 'boolean' || ![info.activeRooms, info.capacity, info.availableSlots, info.activePlayers].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Worker configuration mismatch');
      return { workerId: worker.id, healthy: true, accepting: info.accepting, availableSlots: info.availableSlots, health: info };
    } catch { return { workerId: worker.id, healthy: false, accepting: false, availableSlots: 0 }; }
  }
  async function health() {
    if (cached.length && Date.now() - cachedAt < cacheDuration) return cached;
    if (!probing) probing = Promise.all([...workers.values()].map(probe)).then(results => { cached = results; cachedAt = Date.now(); return results; }).finally(() => { probing = null; });
    return probing;
  }
  function owner(prefix: string) {
    const worker = workers.get(prefix);
    if (!worker) throw new GatewayError('This room’s server is temporarily unavailable. Keep your invite and try again.', 503, 'ROOM_OWNER_UNAVAILABLE');
    return worker;
  }
  function proxy(req: IncomingMessage, res: ServerResponse, worker: Worker, bytes?: Buffer) {
    const streaming = /\/events(?:\?|$)/.test(req.url ?? '');
    const upstream = requestFor(worker)(targetUrl(worker, req), { method: req.method, headers: upstreamHeaders(req, worker, bytes), agent: agentFor(worker) });
    requests.add(upstream);
    const stop = () => upstream.destroy(); res.once('close', stop);
    upstream.setTimeout(requestTimeout, () => upstream.destroy(new Error('Worker response timed out')));
    upstream.once('response', response => {
      upstream.setTimeout(streaming ? idleTimeout : requestTimeout);
      const headers: OutgoingHttpHeaders = { 'Cache-Control': streaming ? 'no-cache, no-transform' : 'no-store' };
      for (const name of ['content-type', 'retry-after']) if (response.headers[name] !== undefined) headers[name] = response.headers[name];
      if (streaming) headers['X-Accel-Buffering'] = 'no';
      res.writeHead(response.statusCode ?? 502, headers);
      if (streaming) res.flushHeaders();
      response.on('error', () => res.destroy()); response.pipe(res);
    });
    upstream.once('error', () => {
      if (res.headersSent) res.destroy();
      else json(res, 503, { error: 'The room server is temporarily unavailable. Retry this same request to reconnect.', code: 'ROOM_WORKER_UNAVAILABLE', admitted: null });
    });
    upstream.once('close', () => { requests.delete(upstream); res.off('close', stop); });
    upstream.end(bytes);
  }
  async function handler(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith('/api/rooms')) return false;
    try {
      if (closed) throw new GatewayError('The room gateway is restarting. Try again shortly.', 503, 'GATEWAY_CLOSED');
      originAllowed(req);
      if (path === '/api/rooms/health' && req.method === 'GET') {
        if (!authenticatedProbe(req)) throw new GatewayError('Worker authentication required.', 403, 'FORBIDDEN');
        const probes = await health();
        json(res, probes.some(p => p.healthy) ? 200 : 503, { status: probes.some(p => p.healthy) ? 'ok' : 'unavailable', workers: probes }); return true;
      }
      if (path === '/api/rooms/placement' && req.method === 'POST') {
        const { data } = await body(req);
        const exclude = data.excludeWorkers ?? [];
        if (!Array.isArray(exclude) || exclude.length > 256 || exclude.some(id => typeof id !== 'string' || !/^[A-F0-9]{2}$/.test(id))) throw new GatewayError('Invalid worker exclusions.', 400, 'INVALID_REQUEST');
        const available = (await health()).filter(p => p.healthy && p.accepting && p.availableSlots > 0 && !exclude.includes(p.workerId));
        if (!available.length) { json(res, 503, { error: 'All race rooms are busy or restarting. Try again shortly.', code: 'ROOM_CAPACITY', admitted: false }); return true; }
        const best = Math.max(...available.map(p => p.availableSlots)), candidates = available.filter(p => p.availableSlots === best);
        const workerId = candidates[randomInt(candidates.length)].workerId;
        json(res, 200, { workerId, idempotencyKey: `${workerId}_${randomBytes(18).toString('hex')}` }); return true;
      }
      if (path === '/api/rooms' && req.method === 'POST') {
        const { data, bytes } = await body(req), key = data.idempotencyKey;
        if (typeof key !== 'string' || !/^[A-F0-9]{2}_[A-Za-z0-9_-]{8,124}$/.test(key)) throw new GatewayError('Choose an available room server before creating a room.', 409, 'AFFINITY_REQUIRED');
        proxy(req, res, owner(key.slice(0, 2)), bytes); return true;
      }
      const match = path.match(/^\/api\/rooms\/([A-F0-9]{8})\/(join|events|command|claim)$/);
      if (!match || (match[2] === 'events' ? req.method !== 'GET' : req.method !== 'POST')) throw new GatewayError('Room endpoint not found.', 404, 'NOT_FOUND');
      const worker = owner(match[1].slice(0, 2));
      const bytes = req.method === 'POST' ? (await body(req)).bytes : undefined;
      proxy(req, res, worker, bytes); return true;
    } catch (error) {
      json(res, error instanceof GatewayError ? error.status : 500, { error: error instanceof GatewayError ? error.message : 'The room gateway had a problem. Try again.', code: error instanceof GatewayError ? error.code : 'GATEWAY_ERROR' }); return true;
    }
  }
  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    let upstream: ClientRequest | undefined, linked = false;
    const fail = (status = 503) => { if (!socket.destroyed) { if (!linked) socket.end(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Service Unavailable'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); else socket.destroy(); } upstream?.destroy(); };
    try {
      if (closed) { fail(); return; }
      originAllowed(req);
      const match = (req.url ?? '').split('?')[0].match(/^\/api\/rooms\/([A-F0-9]{8})\/input$/);
      if (!match || req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket') { fail(400); return; }
      const worker = owner(match[1].slice(0, 2));
      upstream = requestFor(worker)(targetUrl(worker, req), { method: 'GET', headers: upstreamHeaders(req, worker, undefined, true), agent: agentFor(worker) });
      requests.add(upstream);
      const pending = upstream;
      const timeout = setTimeout(() => fail(), requestTimeout);
      socket.once('error', () => pending.destroy()); socket.once('close', () => pending.destroy());
      pending.once('upgrade', (response, target, initial) => {
        clearTimeout(timeout); requests.delete(pending); linked = true;
        let headers = 'HTTP/1.1 101 Switching Protocols\r\n';
        for (const name of ['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-protocol', 'sec-websocket-extensions']) if (response.headers[name]) headers += `${name}: ${response.headers[name]}\r\n`;
        socket.write(headers + '\r\n');
        tunnels.add(socket); tunnels.add(target);
        const cleanup = () => { tunnels.delete(socket); tunnels.delete(target); socket.destroy(); target.destroy(); };
        socket.once('close', cleanup); target.once('close', cleanup); socket.once('error', cleanup); target.once('error', cleanup);
        if (initial.length) socket.write(initial);
        if (head.length) target.write(head);
        socket.pipe(target); target.pipe(socket);
      });
      pending.once('response', response => { clearTimeout(timeout); response.resume(); fail(response.statusCode ?? 503); });
      pending.once('error', () => { clearTimeout(timeout); fail(); });
      pending.once('close', () => { clearTimeout(timeout); requests.delete(pending); });
      pending.end();
    } catch (error) { fail(error instanceof GatewayError ? error.status : 503); }
  }
  function close() { closed = true; for (const request of requests) request.destroy(); for (const socket of tunnels) socket.destroy(); requests.clear(); tunnels.clear(); httpAgent.destroy(); httpsAgent.destroy(); }
  return { handler, handleUpgrade, health, close };
}

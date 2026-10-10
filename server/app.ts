import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Socket } from 'node:net';
import { isIP } from 'node:net';
import { RoomService } from './rooms.ts';
import { createRoomApi } from './http.ts';
import { attachInputChannel } from './input-channel.ts';
import { createRoomGateway } from './gateway.ts';
import { runtimeConfig, clientAddress, secretMatches } from './runtime-config.ts';
import { serveStatic } from './static-files.ts';
import { createLeaderboardApi } from './leaderboard-http.ts';

export function createGameServer(config = runtimeConfig()) {
  const started = performance.now(), sockets = new Set<Socket>();
  let draining = false, closing: Promise<void> | null = null;
  let p99Ms = 0, maxMs = 0, overloaded = false, badSamples = 0, goodSamples = 0;
  const service = config.role === 'gateway' ? null : new RoomService({ workerId: config.workerId, maxRooms: config.maxRooms, maxPlayers: config.maxPlayers });
  const address = (req: IncomingMessage) => {
    if (config.role === 'worker' && secretMatches(req.headers['x-worker-secret'], config.workerSecret)) {
      const provided = req.headers['x-room-client-ip'];
      if (typeof provided === 'string' && isIP(provided)) return provided;
    }
    return clientAddress(req, config.role === 'worker' ? 0 : config.trustProxyHops);
  };
  const api = service ? createRoomApi(service, { clientAddress: address }) : null;
  const leaderboard = config.role === 'single' ? createLeaderboardApi({ rooms: service!, clientAddress: address }) : null;
  const gateway = config.role === 'gateway' ? createRoomGateway({ workers: config.workers, workerSecret: config.workerSecret, publicOrigin: config.publicOrigin, clientAddress: address }) : null;
  function json(res: ServerResponse, status: number, body: unknown) {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body));
  }
  function operationsAllowed(req: IncomingMessage) {
    const authorization = req.headers.authorization ?? '';
    if (authorization.startsWith('Bearer ') && secretMatches(authorization.slice(7), config.opsToken)) return true;
    return secretMatches(req.headers['x-worker-secret'], config.workerSecret);
  }
  function loopback(req: IncomingMessage) {
    const peer = req.socket.remoteAddress;
    return peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  }
  const server = createServer(async (req, res) => {
    try {
      const path = (req.url ?? '').split('?')[0];
      if (path === '/healthz' && req.method === 'GET') { json(res, 200, { status: 'ok', role: config.role, draining }); return; }
      if (path === '/ops/metrics' || path === '/ops/drain') {
        if (!operationsAllowed(req)) { json(res, 403, { error: 'Operations authentication required.', code: 'FORBIDDEN' }); return; }
        if (path === '/ops/metrics' && req.method === 'GET') { json(res, 200, metrics()); return; }
        if (path === '/ops/drain' && req.method === 'POST') { drain(); json(res, 200, { draining: true }); return; }
        json(res, 405, { error: 'Method not allowed.' }); return;
      }
      if (config.role === 'worker' && !secretMatches(req.headers['x-worker-secret'], config.workerSecret)) { json(res, 403, { error: 'Worker authentication required.', code: 'FORBIDDEN' }); return; }
      if (path === '/readyz' && req.method === 'GET') {
        const healthy = gateway ? (await gateway.health()).some(worker => worker.healthy) : true;
        json(res, !draining && healthy ? 200 : 503, { ready: !draining && healthy, draining }); return;
      }
      if (path === '/api/rooms/health' && req.method === 'GET') {
        const permitted = config.role === 'worker' || operationsAllowed(req) || (config.role === 'single' && !config.opsToken && loopback(req));
        if (!permitted) { json(res, 403, { error: 'Operations authentication required.', code: 'FORBIDDEN' }); return; }
        if (gateway) {
          const workers = await gateway.health();
          json(res, workers.some(worker => worker.healthy) ? 200 : 503, { status: workers.some(worker => worker.healthy) ? 'ok' : 'unavailable', workers, ...metrics() });
        } else json(res, 200, { ...service!.getHealth(), api: api!.getMetrics(), input: input!.getMetrics(), eventLoop: metrics().eventLoop });
        return;
      }
      if (gateway) {
        if (draining && path === '/api/rooms/placement') { json(res, 503, { error: 'This gateway is restarting. Please try again shortly.', code: 'SERVER_DRAINING', admitted: false }); return; }
        if (await gateway.handler(req, res)) return;
      } else {
        if (leaderboard && await leaderboard.handler(req, res)) return;
        if (api && await api.handler(req, res)) return;
      }
      if (config.role === 'worker') { json(res, 404, { error: 'Not found.' }); return; }
      await serveStatic(req, res);
    } catch (error) {
      console.error(JSON.stringify({ event: 'room_request_error', role: config.role, kind: error instanceof Error ? error.name : 'UnknownError' }));
      if (res.headersSent) res.destroy(); else json(res, 500, { error: 'The game server had a problem. Please try again.', code: 'SERVICE_ERROR' });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  const input = service ? attachInputChannel(server, service, { clientAddress: address, workerSecret: config.role === 'worker' ? config.workerSecret : undefined }) : null;
  if (gateway) server.on('upgrade', gateway.handleUpgrade);
  else server.on('upgrade', (req, socket) => {
    if (!/^\/api\/rooms\/[A-F0-9]{8}\/input(?:\?|$)/.test(req.url ?? '')) {
      const denied=config.role==='worker'&&!secretMatches(req.headers['x-worker-secret'],config.workerSecret);
      socket.end(`HTTP/1.1 ${denied?'403 Forbidden':'404 Not Found'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    }
  });
  const eventLoop = monitorEventLoopDelay({ resolution: 20 }); eventLoop.enable();
  const sampling = setInterval(() => {
    const value = eventLoop.percentile(99) / 1e6;
    p99Ms = Number.isFinite(value) ? value : 0; maxMs = Math.max(maxMs, eventLoop.max / 1e6); eventLoop.reset();
    if (p99Ms > config.maxEventLoopDelayMs) { badSamples++; goodSamples = 0; } else { goodSamples++; badSamples = 0; }
    if (!overloaded && badSamples >= 3) { overloaded = true; service?.setOverloaded(true); }
    else if (overloaded && goodSamples >= 5) { overloaded = false; service?.setOverloaded(false); }
  }, 1000); sampling.unref();
  function metrics() {
    const memory = process.memoryUsage();
    return { role: config.role, version: config.version, uptimeMs: Math.round(performance.now() - started), draining,
      eventLoop: { p99Ms: Math.round(p99Ms * 100) / 100, maxMs: Math.round(maxMs * 100) / 100, overloaded },
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed }, health: service?.getHealth() ?? null,
      api: api?.getMetrics() ?? null, input: input?.getMetrics() ?? null };
  }
  const logging = setInterval(() => console.log(JSON.stringify({ event: 'room_metrics', ...metrics() })), 30000); logging.unref();
  function drain() { draining = true; service?.setDraining(true); }
  function close() {
    if (closing) return closing;
    drain(); clearInterval(sampling); clearInterval(logging); eventLoop.disable();
    api?.close(); input?.close(); gateway?.close();
    closing = new Promise<void>(resolve => {
      server.close(() => resolve());
      for (const socket of sockets) socket.destroy(); sockets.clear();
    });
    return closing;
  }
  return { server, service, api, input, gateway, metrics, drain, close };
}

import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { RoomError, RoomService } from './rooms.ts';
import type { DriveInput } from '../src/driving.ts';

export type InputChannelOptions = {
  clientAddress?: (req: IncomingMessage) => string;
  workerSecret?: string;
  inputRatePerSecond?: number;
  authTimeoutMs?: number;
  pingIntervalMs?: number;
  maxPendingAuthentications?: number;
  maxUpgradesPerMinute?: number;
};
export type InputChannelMetrics = { connections: number; acceptedInputs: number; receivedBytes: number; authFailures: number; rateLimited: number };
type Controller = { socket: WebSocket; code: string; token: string; generation: number; alive: boolean };
const NEUTRAL: DriveInput = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false };

/** Input-only socket. Lifecycle, clock samples and room state keep their HTTP/SSE contracts. */
export function attachInputChannel(server: Server, service: RoomService, options: InputChannelOptions = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const controllers = new Map<string, Controller>();
  const sockets = new Set<WebSocket>();
  const inputBudgets = new Map<string, { tokens: number; at: number }>();
  const authBudgets = new Map<string, { count: number; until: number }>();
  const claimBudgets = new Map<string, { count: number; until: number }>();
  const pendingLimit = Math.max(1, Math.min(1024, options.maxPendingAuthentications ?? 128));
  const upgradeLimit = Math.max(1, Math.min(10_000, options.maxUpgradesPerMinute ?? 600));
  let pendingAuthentications = 0;
  const rate = Math.max(1, Math.min(120, options.inputRatePerSecond ?? 30)), burst = Math.ceil(rate * 1.5);
  const totals = { acceptedInputs: 0, receivedBytes: 0, authFailures: 0, rateLimited: 0 };
  const sendError = (socket: WebSocket, error: unknown) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const known = error instanceof RoomError;
    socket.send(JSON.stringify({ type: 'error', code: known ? error.code : 'INVALID_MESSAGE', error: known ? error.message : 'Invalid control message.' }));
    socket.close(1008, known ? error.code.slice(0, 100) : 'INVALID_MESSAGE');
  };
  const neutralize = (controller: Controller) => {
    if (controllers.get(controller.token) !== controller) return;
    controllers.delete(controller.token);
    try {
      const { player } = service.auth(controller.code, controller.token, controller.generation);
      player.input = { ...NEUTRAL }; player.inputAt = 0;
    } catch { /* A retired connection cannot affect the current controller. */ }
  };
  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0], match = path.match(/^\/api\/rooms\/([A-F0-9]{8})\/input$/);
    if (!match) return;
    const reject = (status: number) => { socket.end('HTTP/1.1 ' + status + ' Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); };
    if (pendingAuthentications >= pendingLimit || sockets.size >= service.playerCapacity * 2 + pendingLimit) { totals.rateLimited++; reject(503); return; }
    if (options.workerSecret) {
      const provided = req.headers['x-worker-secret'];
      if (typeof provided !== 'string') { reject(403); return; }
      const actual = Buffer.from(provided), expected = Buffer.from(options.workerSecret);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { reject(403); return; }
    }
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { reject(403); return; }
    } catch { reject(403); return; }
    const now = Date.now(), address = options.clientAddress?.(req) ?? req.socket.remoteAddress ?? 'unknown';
    let budget = authBudgets.get(address);
    if (!budget || budget.until <= now) { budget = { count: 0, until: now + 60_000 }; authBudgets.set(address, budget); }
    if (++budget.count > upgradeLimit) { totals.rateLimited++; reject(429); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      sockets.add(ws); pendingAuthentications++;
      let controller: Controller | null = null;
      const authTimer = setTimeout(() => { if (!controller) { totals.authFailures++; sendError(ws, new RoomError('Control authentication timed out.', 401, 'AUTH_TIMEOUT')); } }, options.authTimeoutMs ?? 5000);
      authTimer.unref();
      ws.on('pong', () => { if (controller) controller.alive = true; });
      ws.on('message', (raw, binary) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        totals.receivedBytes += raw.length ?? raw.byteLength ?? 0;
        try {
          if (binary) throw new RoomError('Controls must use JSON text.', 400, 'INVALID_MESSAGE');
          const message = JSON.parse(raw.toString());
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new RoomError('Invalid control message.', 400, 'INVALID_MESSAGE');
          if (!controller) {
            if (message.type !== 'claim' || typeof message.token !== 'string' || message.token.length > 128 || !Number.isSafeInteger(message.generation) || message.generation < 1) throw new RoomError('Authenticate this control connection first.', 401, 'SESSION_CLAIM_REQUIRED');
            service.auth(match[1], message.token, message.generation);
            const at = Date.now(); let budget = claimBudgets.get(message.token);
            if (!budget || budget.until <= at) { budget = { count: 0, until: at + 60_000 }; claimBudgets.set(message.token, budget); }
            if (++budget.count > 30) { totals.rateLimited++; throw new RoomError('Too many control reconnects. Please wait a moment.', 429, 'RATE_LIMITED'); }
            controller = { socket: ws, code: match[1], token: message.token, generation: message.generation, alive: true };
            pendingAuthentications--;
            const previous = controllers.get(controller.token);
            controllers.set(controller.token, controller);
            if (previous) { sendError(previous.socket, new RoomError('Controls moved to a newer connection.', 409, 'INPUT_CHANNEL_REPLACED')); }
            clearTimeout(authTimer); ws.send(JSON.stringify({ type: 'ready', serverNow: Date.now() })); return;
          }
          const { player } = service.auth(controller.code, controller.token, controller.generation);
          if (controllers.get(controller.token) !== controller) throw new RoomError('Controls moved to a newer connection.', 409, 'INPUT_CHANNEL_REPLACED');
          if (message.type !== 'input') throw new RoomError('This channel accepts driving controls only.', 400, 'INVALID_MESSAGE');
          const timestamp = Date.now(), old = inputBudgets.get(controller.token) ?? { tokens: burst, at: timestamp };
          old.tokens = Math.min(burst, old.tokens + (timestamp - old.at) * rate / 1000); old.at = timestamp;
          inputBudgets.set(controller.token, old);
          if (old.tokens < 1) { totals.rateLimited++; throw new RoomError('Controls arrived too quickly.', 429, 'RATE_LIMITED'); }
          old.tokens--;
          const previousSequence = player.sequence;
          service.command(controller.code, controller.token, { type: 'input', sequence: message.sequence, input: message.input }, timestamp, controller.generation);
          if (player.sequence !== previousSequence) totals.acceptedInputs++;
        } catch (error) { if (!controller) totals.authFailures++; sendError(ws, error); }
      });
      ws.on('error', () => ws.terminate());
      ws.on('close', () => { clearTimeout(authTimer); sockets.delete(ws); if (controller) neutralize(controller); else pendingAuthentications--; });
    });
  };
  server.on('upgrade', upgrade);
  const pingTimer = setInterval(() => {
    for (const controller of controllers.values()) {
      try { service.auth(controller.code, controller.token, controller.generation); }
      catch (error) { sendError(controller.socket, error); continue; }
      if (!controller.alive) { controller.socket.terminate(); continue; }
      controller.alive = false; controller.socket.ping();
    }
    const now = Date.now();
    for (const [key, budget] of authBudgets) if (budget.until <= now) authBudgets.delete(key);
    for (const [key, budget] of claimBudgets) if (budget.until <= now) claimBudgets.delete(key);
    for (const [key, budget] of inputBudgets) if (now - budget.at > 60_000) inputBudgets.delete(key);
  }, options.pingIntervalMs ?? 30_000);
  pingTimer.unref();
  return {
    getMetrics(): InputChannelMetrics { return { ...totals, connections: controllers.size }; },
    close() { clearInterval(pingTimer); server.off('upgrade', upgrade); for (const controller of controllers.values()) neutralize(controller); for (const socket of sockets) socket.terminate(); sockets.clear(); wss.close(); },
  };
}

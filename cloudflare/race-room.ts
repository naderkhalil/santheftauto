import { RoomError, RoomService } from '../server/rooms.ts';
import { RoomWireEncoder, roomSemanticKey, snapshotFrame, sseData } from '../server/room-wire.ts';
import type { RoomCommand } from '../src/multiplayer-protocol.ts';

const STORAGE_KEY = 'room:v1';
const MAX_MESSAGE_BYTES = 4096, MAX_PENDING = 8, MAX_SOCKETS = 24, MAX_BUFFER_BYTES = 256_000;
const encoder = new TextEncoder();
const neutral = () => ({ throttle: 0, brake: 0, steer: 0, drift: false, boost: false });
type Bucket = { count: number; until: number };
type InputBudget = { tokens: number; at: number };
type Attachment = {
  version: 1; id: string; code: string; kind: 'duplex' | 'input'; address: string;
  claimed: boolean; active: boolean; authDeadline: number; token?: string; generation?: number;
  lastSeen?: number; sequence?: number;
  sent?: number; acknowledged?: number; pending?: [number, number][]; ackBudget?: InputBudget;
};
type SavedRoom = {
  version: 1; code: string; everCreated: boolean; core: unknown;
  budgets: [string, Bucket][]; inputs: [string, InputBudget][];
};
type SseClient = {
  id: string; token: string; generation: number; compact: boolean;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(status === 429 ? { 'Retry-After': '60' } : {}),
  } });
}
function failure(error: unknown) {
  const known = error instanceof RoomError;
  return { status: known ? error.status : 503, body: {
    error: known ? error.message : 'The room is reconnecting. Please retry the same request.',
    code: known ? error.code : 'ROOM_WORKER_UNAVAILABLE', admitted: known ? error.admitted : null,
  } };
}
function logUnexpectedFailure(operation: 'tick' | 'fetch', error: unknown) {
  // Only fixed/allowlisted values: runtime messages and stacks can contain credentials.
  const safeNames = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError'];
  const errorName = error instanceof Error && safeNames.includes(error.name) ? error.name : 'UnknownError';
  console.error(JSON.stringify({ event: 'room_unexpected_failure', operation, errorName,
    code: 'ROOM_WORKER_UNAVAILABLE', message: 'Unexpected room operation failure.' }));
}
function attachment(socket: WebSocket): Attachment | null {
  try {
    const value = socket.deserializeAttachment() as Attachment | null;
    return value?.version === 1 && typeof value.id === 'string' && /^[A-F0-9]{8}$/.test(value.code) ? value : null;
  } catch { return null; }
}
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) throw new RoomError('Expected JSON.', 415);
  if (Number(request.headers.get('Content-Length')) > MAX_MESSAGE_BYTES) throw new RoomError('Request too large.', 413);
  const reader = request.body?.getReader();
  let length = 0; const chunks: Uint8Array[] = [];
  if (reader) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
      reject(new RoomError('The request took too long.', 408, 'REQUEST_TIMEOUT')); void reader.cancel().catch(() => {});
    }, 5000); });
    try { for (;;) {
      const chunk = await Promise.race([reader.read(), timeout]); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_MESSAGE_BYTES) { await reader.cancel(); throw new RoomError('Request too large.', 413); }
      chunks.push(chunk.value);
    } } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes) || '{}'); } catch { throw new RoomError('Invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RoomError('Invalid request.');
  return value as Record<string, unknown>;
}

/** One native Durable Object owns one invite, including its simulation and claims. */
export class RaceRoom {
  private ctx: DurableObjectState;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private code = '';
  private service: RoomService | null = null;
  private everCreated = false;
  private budgets = new Map<string, Bucket>();
  private inputs = new Map<string, InputBudget>();
  private controllers = new Map<string, WebSocket>();
  private streams = new Map<string, SseClient>();
  private wire = new RoomWireEncoder();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private lastPersistAt = 0;
  private persistedSemantic = '';
  private alarmAt: number | null = null;
  private counts = { ticks: 0, acceptedInputs: 0, rejected: 0, frames: 0, bytes: 0 };

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<SavedRoom>(STORAGE_KEY);
      if (saved) {
        if (saved.version !== 1 || !/^[A-F0-9]{8}$/.test(saved.code)) throw Error('Unsupported persisted room.');
        this.initialize(saved.code); this.everCreated = saved.everCreated;
        if ((saved.core as { rooms?: unknown[] }).rooms?.length) this.alarmAt = await ctx.storage.getAlarm();
        this.budgets = new Map(saved.budgets ?? []); this.inputs = new Map(saved.inputs ?? []);
        const now = Date.now();
        const liveSessions = ctx.getWebSockets().flatMap(socket => {
          const claim = attachment(socket);
          return socket.readyState === 1 && claim?.active && claim.claimed && claim.kind === 'duplex' && claim.token && claim.generation && now - (claim.lastSeen ?? 0) < 8000 ? [{ token: claim.token, generation: claim.generation }] : [];
        });
        this.service!.restoreState(saved.core, now, liveSessions);
        for (const socket of ctx.getWebSockets()) {
          const claim = attachment(socket);
          if (!claim?.active || !claim.claimed || !claim.token || !claim.generation || socket.readyState !== 1) continue;
          try {
            const { player } = this.service!.auth(this.code, claim.token, claim.generation);
            player.sequence = Math.max(player.sequence, claim.sequence ?? -1);
            this.controllers.set(claim.token, socket);
          } catch (error) { this.socketError(socket, error); }
        }
        this.service!.tick(now);
        // A retired invite is already a tombstone; random later reads need no writes.
        if ((saved.core as { rooms?: unknown[] }).rooms?.length) await this.persist();
      }
      await this.schedule();
    });
  }

  private initialize(code: string) {
    if (this.code && this.code !== code) throw new RoomError('Room routing mismatch.', 400, 'ROOM_CODE_MISMATCH');
    if (!this.service) { this.code = code; this.service = new RoomService({ fixedRoomCode: code, maxRooms: 1, maxPlayers: 8 }); }
  }
  private exclusive<T>(run: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(async () => { await this.ready; return await run(); });
    this.queue = next.catch(() => {}); return next;
  }
  private room() { return this.service?.rooms.get(this.code); }
  private active() { const room = this.room(); return room?.phase === 'countdown' || room?.phase === 'racing'; }
  private semantic() { const room = this.room(); return room ? roomSemanticKey(this.service!.snapshot(room)) : ''; }
  private prune(now = Date.now()) {
    for (const [key, value] of this.budgets) if (value.until <= now) this.budgets.delete(key);
    for (const [key, value] of this.inputs) if (now - value.at > 60_000) this.inputs.delete(key);
  }
  private limit(key: string, maximum: number) {
    const now = Date.now(); this.prune(now);
    let value = this.budgets.get(key);
    if (!value) {
      if (this.budgets.size >= 256) throw new RoomError('The room is busy. Try again shortly.', 429, 'RATE_LIMITED');
      value = { count: 0, until: now + 60_000 }; this.budgets.set(key, value);
    }
    if (++value.count > maximum) throw new RoomError('Too many requests. Please wait a moment.', 429, 'RATE_LIMITED');
  }
  private inputBudget(token: string) {
    const now = Date.now(), budget = this.inputs.get(token) ?? { tokens: 45, at: now };
    budget.tokens = Math.min(45, budget.tokens + Math.max(0, now - budget.at) * .03); budget.at = now;
    this.inputs.set(token, budget);
    if (budget.tokens < 1) throw new RoomError('Controls arrived too quickly.', 429, 'RATE_LIMITED');
    budget.tokens--;
  }
  private async persist() {
    if (!this.service) return;
    this.prune();
    const core = this.service.exportState();
    // An empty actor keeps only its non-reusable invite tombstone, not retired credentials.
    if (!core.rooms.length) { core.admissions = []; core.revoked = []; }
    const state: SavedRoom = { version: 1, code: this.code, everCreated: this.everCreated, core, budgets: this.room() ? [...this.budgets] : [], inputs: this.room() ? [...this.inputs] : [] };
    await this.ctx.storage.put(STORAGE_KEY, state);
    this.lastPersistAt = Date.now(); this.persistedSemantic = this.semantic();
  }
  private async schedule() {
    const running = !!this.room() && (this.active() || this.streams.size > 0);
    if (running && !this.timer) this.timer = setInterval(() => {
      if (this.ticking) return;
      this.ticking = true;
      void this.exclusive(() => this.tick()).catch(error => {
        logUnexpectedFailure('tick', error); this.closeForRestart();
      }).finally(() => { this.ticking = false; });
    }, 50);
    else if (!running && this.timer) { clearInterval(this.timer); this.timer = null; }
    const now = Date.now();
    let next = this.room() ? now + (this.active() ? 1000 : 30_000) : Infinity;
    for (const socket of this.ctx.getWebSockets()) {
      const claim = attachment(socket);
      if (socket.readyState === 1 && claim?.active && !claim.claimed) next = Math.min(next, claim.authDeadline);
    }
    if (Number.isFinite(next)) {
      // Keep an already earlier watchdog. Avoid a durable write on every 50ms tick.
      if (this.alarmAt === null || this.alarmAt <= now || next < this.alarmAt - 100) {
        this.alarmAt = Math.max(now + 1, next); await this.ctx.storage.setAlarm(this.alarmAt);
      }
    } else if (this.alarmAt !== null) { this.alarmAt = null; await this.ctx.storage.deleteAlarm(); }
  }
  private async tick() {
    const now = Date.now(); this.service?.tick(now); this.counts.ticks++;
    for (const socket of this.ctx.getWebSockets()) {
      const claim = attachment(socket);
      if (claim?.active && !claim.claimed && now >= claim.authDeadline) this.socketError(socket, new RoomError('Control authentication timed out.', 401, 'AUTH_TIMEOUT'));
    }
    if (this.semantic() !== this.persistedSemantic || this.active() && now - this.lastPersistAt >= 1000) await this.persist();
    this.broadcast(now); await this.schedule();
  }
  async alarm() {
    return await this.exclusive(async () => { this.alarmAt = null; await this.tick(); });
  }

  async fetch(request: Request): Promise<Response> {
    // Reading a slow upload must never hold the room's simulation/action queue.
    const requestedPath = new URL(request.url).pathname;
    let data: Record<string, unknown> = {};
    if (request.method === 'POST' && (requestedPath === '/api/rooms' || /^\/api\/rooms\/[A-F0-9]{8}\/(join|claim|command)$/.test(requestedPath))) {
      try { data = await readJson(request); }
      catch (error) {
        if (!(error instanceof RoomError)) logUnexpectedFailure('fetch', error);
        const result = failure(error); return json(result.status, result.body);
      }
    }
    return await this.exclusive(async () => {
      try {
        const code = request.headers.get('X-Room-Code') ?? '';
        if (!/^[A-F0-9]{8}$/.test(code)) throw new RoomError('Internal room routing is required.', 403, 'FORBIDDEN');
        this.initialize(code);
        const path = new URL(request.url).pathname;
        const match = path.match(/^\/api\/rooms\/([A-F0-9]{8})\/(join|claim|command|events|input|socket)$/);
        if (match && match[1] !== code) throw new RoomError('Room routing mismatch.', 400, 'ROOM_CODE_MISMATCH');
        const address = (request.headers.get('X-Room-Client-IP') ?? 'unknown').slice(0, 64);
        if (path === '/ops/metrics' && request.method === 'GET') return json(200, this.metrics());
        if (path === '/ops/drain' && request.method === 'POST') { this.service!.setDraining(); await this.persist(); await this.schedule(); return json(200, { draining: true }); }
        if (match && ['input', 'socket'].includes(match[2])) return await this.upgrade(request, match[2] === 'socket' ? 'duplex' : 'input', address);
        const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
        if (match?.[2] === 'events' && request.method === 'GET') {
          const generation = this.authorize(request, token, address);
          this.service!.touch(code, token, Date.now(), generation); this.touchSocket(token, generation);
          await this.persist(); return await this.openStream(token, generation, new URL(request.url).searchParams.get('wire') === 'v2');
        }
        if (request.method !== 'POST' || !(path === '/api/rooms' || match && ['join', 'claim', 'command'].includes(match[2]))) throw new RoomError('Room endpoint not found.', 404, 'NOT_FOUND');
        const now = Date.now();
        let result: unknown;
        if (path === '/api/rooms' || match?.[2] === 'join') {
          this.limit('admit:' + address, 60);
          if (data.idempotencyKey !== undefined && (typeof data.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(data.idempotencyKey))) throw new RoomError('Invalid retry key.');
          if (data.profile !== undefined && (!data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile))) throw new RoomError('Invalid driver profile.');
          if (path === '/api/rooms') {
            if (typeof data.idempotencyKey !== 'string' || !data.idempotencyKey.startsWith(code + '_')) throw new RoomError('Use the assigned room placement.', 409, 'AFFINITY_REQUIRED');
            if (this.everCreated && !this.room()) throw new RoomError('This room is no longer available.', 404, 'ROOM_EXPIRED');
            const draining = this.service!.getHealth().draining;
            if (request.headers.get('X-Room-New-Rooms') === 'disabled') this.service!.setDraining();
            try { result = this.service!.create(data.profile ?? {}, now, data.idempotencyKey); this.everCreated = true; }
            finally { this.service!.setDraining(draining); }
          } else result = this.service!.join(code, data.profile ?? {}, now, data.idempotencyKey as string | undefined);
        } else if (match?.[2] === 'claim') {
          try { this.service!.auth(code, token); } catch (error) { this.limit('invalid:' + address, 30); throw error; }
          this.limit('claim:' + token, 30); result = this.service!.claim(code, token, now);
        } else {
          const generation = this.authorize(request, token, address);
          this.applyCommand(token, generation, data as RoomCommand); result = { ok: true, serverNow: Date.now() };
        }
        const isInput = match?.[2] === 'command' && data.type === 'input';
        if (!isInput || !this.active() || Date.now() - this.lastPersistAt >= 1000) await this.persist();
        if (!isInput) this.broadcast(Date.now());
        await this.schedule();
        return json(path === '/api/rooms' || match?.[2] === 'join' ? 201 : 200, match?.[2] === 'command' ? result : { ...(result as object), transport: 'duplex-v2' });
      } catch (error) {
        this.counts.rejected++;
        if (!(error instanceof RoomError)) logUnexpectedFailure('fetch', error);
        const result = failure(error); return json(result.status, result.body);
      }
    });
  }
  private authorize(request: Request, token: string, address: string) {
    try {
      const raw = request.headers.get('X-Room-Generation'), generation = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isSafeInteger(generation) || generation < 1) throw new RoomError('Restore your room session to reconnect.', 401, 'SESSION_CLAIM_REQUIRED');
      this.service!.auth(this.code, token, generation); this.limit('play:' + token, 2400); return generation;
    } catch (error) { this.limit('invalid:' + address, 30); throw error; }
  }
  private applyCommand(token: string, generation: number, command: RoomCommand) {
    if (command.type === 'input') this.inputBudget(token);
    const before = this.service!.auth(this.code, token, generation).player.sequence;
    this.service!.command(this.code, token, command, Date.now(), generation);
    if (command.type === 'input' && this.service!.auth(this.code, token, generation).player.sequence !== before) this.counts.acceptedInputs++;
    this.touchSocket(token, generation);
  }
  private touchSocket(token: string, generation: number) {
    const socket = this.controllers.get(token), claim = socket && attachment(socket);
    if (!socket || !claim?.active || claim.generation !== generation) return;
    claim.lastSeen = Date.now();
    try { claim.sequence = this.service!.auth(this.code, token, generation).player.sequence; } catch { /* A leave command revokes its claim. */ }
    socket.serializeAttachment(claim);
  }

  private async upgrade(request: Request, kind: Attachment['kind'], address: string) {
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new RoomError('A WebSocket upgrade is required.', 426);
    this.service!.room(this.code); this.limit('upgrade:' + address, 60);
    const sockets = this.ctx.getWebSockets().filter(socket => socket.readyState !== 3);
    if (sockets.length >= MAX_SOCKETS || sockets.filter(socket => socket.readyState === 1 && !attachment(socket)?.claimed).length >= MAX_PENDING) throw new RoomError('Too many pending room connections.', 503, 'SERVICE_BUSY');
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    const claim: Attachment = { version: 1, id: crypto.randomUUID(), code: this.code, kind, address, claimed: false, active: true, authDeadline: Date.now() + 5000 };
    this.ctx.acceptWebSocket(server, [kind]); server.serializeAttachment(claim);
    await this.persist(); await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    await this.exclusive(async () => {
      const claim = attachment(socket);
      if (!claim?.active || socket.readyState !== 1) return;
      try {
        if (typeof raw !== 'string') throw new RoomError('Controls must use JSON text.', 400, 'INVALID_MESSAGE');
        if (encoder.encode(raw).byteLength > MAX_MESSAGE_BYTES) throw new RoomError('Control message too large.', 413, 'MESSAGE_TOO_LARGE');
        let message;
        try { message = JSON.parse(raw); } catch { throw new RoomError('Invalid control message.', 400, 'INVALID_MESSAGE'); }
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new RoomError('Invalid control message.', 400, 'INVALID_MESSAGE');
        if (!claim.claimed) {
          if (Date.now() >= claim.authDeadline) throw new RoomError('Control authentication timed out.', 401, 'AUTH_TIMEOUT');
          if (message.type !== 'claim' || typeof message.token !== 'string' || message.token.length > 128 || !Number.isSafeInteger(message.generation) || message.generation < 1) throw new RoomError('Authenticate this connection first.', 401, 'SESSION_CLAIM_REQUIRED');
          this.service!.auth(this.code, message.token, message.generation); this.limit('ws-claim:' + message.token, 30);
          const old = this.controllers.get(message.token);
          claim.claimed = true; claim.token = message.token; claim.generation = message.generation; claim.lastSeen = Date.now();
          claim.sequence = this.service!.auth(this.code, message.token, message.generation).player.sequence;
          socket.serializeAttachment(claim); this.controllers.set(message.token, socket);
          if (claim.kind === 'duplex') this.service!.touch(this.code, message.token, Date.now(), message.generation);
          if (old && old !== socket) this.socketError(old, new RoomError('Controls moved to a newer connection.', 409, 'INPUT_CHANNEL_REPLACED'));
          await this.persist();
          this.send(socket, { type: 'ready', serverNow: Date.now() });
          if (claim.kind === 'duplex') this.send(socket, snapshotFrame(this.service!.snapshot(this.service!.room(this.code))));
          this.broadcast(Date.now()); await this.schedule(); return;
        }
        this.service!.auth(this.code, claim.token!, claim.generation);
        if (this.controllers.get(claim.token!) !== socket) throw new RoomError('Controls moved to a newer connection.', 409, 'INPUT_CHANNEL_REPLACED');
        if (message.type === 'ack' && claim.kind === 'duplex') {
          if (!Number.isSafeInteger(message.deliveryId) || message.deliveryId < 0 || message.deliveryId > (claim.sent ?? 0)) throw new RoomError('Invalid room acknowledgement.', 400, 'INVALID_MESSAGE');
          const now = Date.now(), budget = claim.ackBudget ?? { tokens: 90, at: now };
          budget.tokens = Math.min(90, budget.tokens + Math.max(0, now - budget.at) * .06); budget.at = now;
          if (budget.tokens < 1) throw new RoomError('Acknowledgements arrived too quickly.', 429, 'RATE_LIMITED');
          budget.tokens--; claim.ackBudget = budget;
          claim.acknowledged = Math.max(claim.acknowledged ?? 0, message.deliveryId);
          claim.pending = (claim.pending ?? []).filter(([id]) => id > claim.acknowledged!);
          // A validated acknowledgement is client activity, even if browser timers
          // have delayed its separate HTTP heartbeat in a background tab.
          this.service!.touch(this.code, claim.token!, now, claim.generation);
          claim.lastSeen = now;
          socket.serializeAttachment(claim); return;
        }
        if (message.type !== 'input' && message.type !== 'heartbeat') throw new RoomError('Use HTTP for room actions.', 400, 'INVALID_MESSAGE');
        this.applyCommand(claim.token!, claim.generation!, message as RoomCommand);
        if (message.type !== 'input' || !this.active() || Date.now() - this.lastPersistAt >= 1000) await this.persist();
        if (message.type === 'heartbeat') this.broadcast(Date.now());
        await this.schedule();
      } catch (error) {
        this.counts.rejected++;
        if (!claim.claimed) { try { this.limit('invalid:' + claim.address, 30); } catch (limited) { error = limited; } }
        this.socketError(socket, error); await this.persist(); await this.schedule();
      }
    });
  }
  async webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean) { await this.exclusive(() => this.socketClosed(socket)); }
  async webSocketError(socket: WebSocket, _error: unknown) { await this.exclusive(() => this.socketClosed(socket)); }
  private async socketClosed(socket: WebSocket) {
    const claim = attachment(socket);
    if (!claim?.active) return;
    claim.active = false; socket.serializeAttachment(claim);
    this.detachSocket(socket, claim);
    try { socket.close(1000, 'Connection closed'); } catch { /* Already closed. */ }
    await this.persist(); this.broadcast(Date.now()); await this.schedule();
  }
  private detachSocket(socket: WebSocket, claim: Attachment) {
    if (!claim.claimed || !claim.token || !claim.generation || this.controllers.get(claim.token) !== socket) return;
    this.controllers.delete(claim.token);
    try { const { player } = this.service!.auth(this.code, claim.token, claim.generation); player.input = neutral(); player.inputAt = 0; } catch { /* Retired sessions cannot affect a newer claim. */ }
    if (claim.kind === 'duplex') this.disconnectIfUnobserved(claim.token, claim.generation);
  }
  private disconnectIfUnobserved(token: string, generation: number) {
    const current = this.controllers.get(token), claim = current && attachment(current);
    if (claim?.active && claim.kind === 'duplex' && claim.generation === generation) return;
    if ([...this.streams.values()].some(stream => stream.token === token && stream.generation === generation)) return;
    this.service?.disconnect(this.code, token, Date.now(), generation);
  }
  private socketError(socket: WebSocket, error: unknown) {
    const claim = attachment(socket);
    if (!claim?.active) return;
    this.send(socket, { type: 'error', ...failure(error).body });
    claim.active = false; socket.serializeAttachment(claim); this.detachSocket(socket, claim);
    try { socket.close(1008, failure(error).body.code.slice(0, 100)); } catch { /* Connection already ended. */ }
  }
  private send(socket: WebSocket, value: unknown) {
    if (socket.readyState !== 1) return;
    // Native sockets do not currently expose this counter; use it where supported.
    const buffered = (socket as WebSocket & { bufferedAmount?: number }).bufferedAmount;
    if (buffered !== undefined && buffered > MAX_BUFFER_BYTES) { try { socket.close(1013, 'Slow connection'); } catch {} return; }
    const claim = attachment(socket);
    const roomFrame = !!value && typeof value === 'object' && 'v' in value && value.v === 2;
    let data: string;
    if (roomFrame && claim?.claimed && claim.kind === 'duplex') {
      const deliveryId = (claim.sent ?? 0) + 1;
      data = JSON.stringify({ ...(value as object), deliveryId });
      const bytes = encoder.encode(data).byteLength, pending = claim.pending ?? [];
      if (!Number.isSafeInteger(deliveryId) || pending.length >= 40 || pending.reduce((total, row) => total + row[1], 0) + bytes > MAX_BUFFER_BYTES) {
        // No untracked error send here: a full outbound queue must only close.
        try { socket.close(1013, 'Slow connection'); } catch {} return;
      }
      claim.sent = deliveryId; claim.pending = [...pending, [deliveryId, bytes]];
      socket.serializeAttachment(claim);
    } else data = JSON.stringify(value);
    try { socket.send(data); this.counts.frames++; this.counts.bytes += encoder.encode(data).byteLength; } catch { try { socket.close(1011, 'Connection failed'); } catch {} }
  }

  private async openStream(token: string, generation: number, compact: boolean) {
    for (const old of this.streams.values()) if (old.token === token) this.endStream(old);
    const id = crypto.randomUUID();
    const body = new ReadableStream<Uint8Array>({
      start: controller => {
        const client = { id, token, generation, compact, controller }; this.streams.set(id, client);
        const snapshot = this.service!.snapshot(this.service!.room(this.code)); this.writeStream(client, sseData(compact ? snapshotFrame(snapshot) : snapshot));
      },
      cancel: () => { void this.exclusive(async () => {
        if (!this.streams.delete(id)) return;
        this.disconnectIfUnobserved(token, generation); await this.persist(); this.broadcast(Date.now()); await this.schedule();
      }); },
    }, { highWaterMark: MAX_BUFFER_BYTES, size: value => value.byteLength });
    await this.schedule();
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
  }
  private writeStream(client: SseClient, data: string) {
    if ((client.controller.desiredSize ?? 0) <= 0) { this.endStream(client); this.disconnectIfUnobserved(client.token, client.generation); return; }
    const bytes = encoder.encode(data);
    try { client.controller.enqueue(bytes); this.counts.frames++; this.counts.bytes += bytes.byteLength; }
    catch { this.endStream(client); this.disconnectIfUnobserved(client.token, client.generation); }
  }
  private endStream(client: SseClient) { this.streams.delete(client.id); try { client.controller.close(); } catch {} }
  private broadcast(now: number) {
    for (const socket of this.ctx.getWebSockets()) {
      const claim = attachment(socket);
      if (!claim?.active || !claim.claimed) continue;
      try { this.service!.auth(this.code, claim.token!, claim.generation); } catch (error) { this.socketError(socket, error); }
    }
    for (const client of this.streams.values()) {
      try { this.service!.auth(this.code, client.token, client.generation); }
      catch (error) { this.writeStream(client, 'event: room-error\ndata: ' + JSON.stringify(failure(error).body) + '\n\n'); this.endStream(client); }
    }
    const room = this.room(); if (!room) return;
    const prepared = this.wire.prepare(this.service!.snapshot(room, now)); if (!prepared) return;
    for (const socket of this.ctx.getWebSockets()) {
      const claim = attachment(socket);
      if (claim?.active && claim.claimed && claim.kind === 'duplex') this.send(socket, prepared.frame);
    }
    for (const client of this.streams.values()) this.writeStream(client, client.compact ? prepared.compact() : prepared.legacy());
  }
  private closeForRestart() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const socket of this.ctx.getWebSockets()) try { socket.close(1012, 'Room reconnecting'); } catch {}
    for (const client of this.streams.values()) this.endStream(client);
  }
  private metrics() {
    return { role: 'durable-room', health: this.service!.getHealth(), streams: this.streams.size,
      sockets: this.ctx.getWebSockets().filter(socket => socket.readyState === 1).length, ...this.counts };
  }
}

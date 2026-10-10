import { RaceRoom } from './race-room';
import { Leaderboard } from './leaderboard';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';

export { RaceRoom, Leaderboard };

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  ADMISSION_LIMITER: RateLimit;
  API_LIMITER: RateLimit;
  LEADERBOARD?: DurableObjectNamespace;
  LEADERBOARD_READ_LIMITER?: RateLimit;
  LEADERBOARD_START_LIMITER?: RateLimit;
  LEADERBOARD_SUBMIT_LIMITER?: RateLimit;
  PUBLIC_ORIGIN?: string;
  OPS_TOKEN?: string;
  NEW_ROOMS_ENABLED?: string;
}

const CODE = /^[A-F0-9]{8}$/;
const PLACEMENT = /^([A-F0-9]{8})_[a-f0-9]{48}$/;
const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, '0')).join('');
const json = (status: number, data: unknown) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
});
const busy = () => json(503, { error: 'Multiplayer is busy. Please try again shortly, or enjoy a single-player race.', code: 'SERVICE_BUSY', admitted: false });

async function authorized(request: Request, secret?: string) {
  if (!secret || secret.length < 32) return false;
  const expected = new TextEncoder().encode('Bearer ' + secret);
  const actual = new TextEncoder().encode(request.headers.get('Authorization') ?? '');
  // Fixed-length digests avoid leaking how much of an operations credential matched.
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', expected), crypto.subtle.digest('SHA-256', actual)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('CONTENT_TYPE');
  const reader = request.body?.getReader();
  let length = 0, text = '';
  const decoder = new TextDecoder();
  if (reader) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
      reject(new Error('BODY_TIMEOUT')); void reader.cancel().catch(() => {});
    }, 5000); });
    try { for (;;) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      text += decoder.decode(value, { stream: true });
    } } finally { if (timer !== undefined) clearTimeout(timer); }
    text += decoder.decode();
  }
  const value: unknown = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');
  return value as Record<string, unknown>;
}

/** The public edge is stateless: the invitation itself selects a single room actor. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/') && !path.startsWith('/ops/') && !['/healthz', '/readyz'].includes(path)) return env.ASSETS.fetch(request);
    try {
      let publicOrigin = url.origin;
      if (env.PUBLIC_ORIGIN) {
        const configured = new URL(env.PUBLIC_ORIGIN);
        if (!['http:', 'https:'].includes(configured.protocol) || configured.pathname !== '/' || configured.search || configured.hash) throw new Error('CONFIGURATION');
        publicOrigin = configured.origin;
        if (url.origin !== publicOrigin) return json(403, { error: 'Use this game’s public website.', code: 'FOREIGN_ORIGIN' });
      }
      const origin = request.headers.get('Origin');
      if (origin && origin !== publicOrigin) return json(403, { error: 'Use the room link on this game’s own website.', code: 'FOREIGN_ORIGIN' });
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json(403, { error: 'Use the game website to join a room.', code: 'FOREIGN_ORIGIN' });
      if (['/healthz', '/readyz'].includes(path)) return request.method === 'GET'
        ? json(200, { status: 'ok', platform: 'cloudflare', acceptingNewRooms: env.NEW_ROOMS_ENABLED !== 'false' })
        : json(405, { error: 'Method not allowed.', code: 'INVALID_ACTION' });

      if (path.startsWith('/api/leaderboard')) {
        const read = path === '/api/leaderboard', start = path === '/api/leaderboard/solo/start', finish = path === '/api/leaderboard/solo/finish';
        if (!read && !start && !finish) return json(404, { error: 'Leaderboard endpoint not found.', code: 'INVALID_ACTION' });
        if (request.method !== (read ? 'GET' : 'POST')) return json(405, { error: 'Method not allowed.', code: 'INVALID_ACTION' });
        if (!env.LEADERBOARD) return json(503, { error: 'The leaderboard is unavailable.', code: 'LEADERBOARD_UNAVAILABLE' });
        const address = request.headers.get('CF-Connecting-IP') ?? 'local';
        const limiter = (read ? env.LEADERBOARD_READ_LIMITER : start ? env.LEADERBOARD_START_LIMITER : env.LEADERBOARD_SUBMIT_LIMITER) ?? env.ADMISSION_LIMITER;
        if (!(await limiter.limit({ key: `leaderboard:${read ? 'read' : start ? 'start' : 'finish'}:${address}` })).success) return json(429, { error: 'Too many leaderboard requests. Please wait a moment.', code: 'RATE_LIMITED' });
        if (!read && Number(request.headers.get('Content-Length')) > 2 * 1024 * 1024) return json(413, { error: 'Request too large.', code: 'INVALID_ACTION' });
        const headers = new Headers({ 'X-Leaderboard-Client-IP': address });
        const contentType = request.headers.get('Content-Type'); if (contentType) headers.set('Content-Type', contentType);
        return env.LEADERBOARD.get(env.LEADERBOARD.idFromName(COURSE_VERSION)).fetch(new Request(url, { method: request.method, headers, body: request.body, redirect: 'manual' }));
      }

      let code: string | undefined, forwardedPath = path;
      const operation = path.match(/^\/ops\/rooms\/([A-F0-9]{8})\/(metrics|drain)$/);
      if (path.startsWith('/ops/') || path === '/api/rooms/health') {
        if (!await authorized(request, env.OPS_TOKEN)) return json(403, { error: 'Operations authentication required.', code: 'FORBIDDEN' });
        if (path === '/api/rooms/health' && request.method === 'GET') return json(200, { status: 'ok', platform: 'cloudflare', perRoom: true, acceptingNewRooms: env.NEW_ROOMS_ENABLED !== 'false' });
        if (!operation || request.method !== (operation[2] === 'metrics' ? 'GET' : 'POST')) return json(404, { error: 'Operations endpoint not found.', code: 'INVALID_ACTION' });
        code = operation[1]; forwardedPath = '/ops/' + operation[2];
      } else {
        const match = path.match(/^\/api\/rooms\/([A-F0-9]{8})\/(join|claim|command|events|input|socket|leaderboard)$/);
        const isPlacement = path === '/api/rooms/placement', isCreate = path === '/api/rooms';
        if (!isPlacement && !isCreate && !match) return json(404, { error: 'Room endpoint not found.', code: 'INVALID_ACTION' });
        const expectedMethod = match && ['events', 'input', 'socket'].includes(match[2]) ? 'GET' : 'POST';
        if (request.method !== expectedMethod) return json(405, { error: 'Method not allowed.', code: 'INVALID_ACTION' });
        // Cloudflare supplies this header at the public edge; forwarded client headers never select identity.
        const address = request.headers.get('CF-Connecting-IP') ?? 'local';
        if (match?.[2] === 'leaderboard' && !((await (env.LEADERBOARD_SUBMIT_LIMITER ?? env.ADMISSION_LIMITER).limit({ key: `leaderboard:multiplayer:${address}` })).success)) return json(429, { error: 'Too many leaderboard requests. Please wait a moment.', code: 'RATE_LIMITED' });
        const admission = isPlacement || isCreate || match?.[2] === 'join';
        const connection = match && ['events', 'input', 'socket', 'claim'].includes(match[2]);
        const limiter = admission || connection ? env.ADMISSION_LIMITER : env.API_LIMITER;
        const key = `${admission ? 'admit' : connection ? 'connect' : 'api'}:${address}`;
        if (!(await limiter.limit({ key })).success) return json(429, { error: 'Too many requests. Please wait a moment.', code: 'RATE_LIMITED', ...(admission ? { admitted: false } : {}) });
        if (isPlacement) {
          await body(request);
          if (env.NEW_ROOMS_ENABLED === 'false') return busy();
          return json(200, { workerId: null, idempotencyKey: `${randomHex(4).toUpperCase()}_${randomHex(24)}` });
        }
        if (isCreate) {
          const data = await body(request);
          const placement = typeof data.idempotencyKey === 'string' && data.idempotencyKey.match(PLACEMENT);
          if (!placement) return json(409, { error: 'Refresh your room placement and try again.', code: 'AFFINITY_REQUIRED', admitted: false });
          code = placement[1];
          request = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(data) });
          // The actor distinguishes an already-admitted retry from a fresh creation.
        } else code = match![1];
      }

      if (!code || !CODE.test(code)) return json(400, { error: 'Invalid room code.', code: 'INVALID_ACTION' });
      const headers = new Headers(request.headers);
      for (const key of [...headers.keys()]) if (/^(x-room-|x-worker-|x-forwarded-|forwarded$)/i.test(key)) headers.delete(key);
      // Restore only the client-owned generation header, then set trusted routing fields.
      const generation = request.headers.get('X-Room-Generation');
      if (generation) headers.set('X-Room-Generation', generation);
      headers.set('X-Room-Code', code);
      headers.set('X-Room-Client-IP', request.headers.get('CF-Connecting-IP') ?? 'local');
      headers.set('X-Room-New-Rooms', env.NEW_ROOMS_ENABLED === 'false' ? 'disabled' : 'enabled');
      headers.delete('CF-Connecting-IP');
      if (operation) headers.delete('Authorization');
      url.pathname = forwardedPath;
      const actor = env.ROOMS.get(env.ROOMS.idFromName(code));
      return await actor.fetch(new Request(url, { method: request.method, headers, body: request.body, redirect: 'manual' }));
    } catch (error) {
      const kind = error instanceof Error ? error.message : '';
      if (kind === 'BODY_TIMEOUT') return json(408, { error: 'The request took too long. Please try again.', code: 'REQUEST_TIMEOUT', admitted: false });
      if (kind === 'BODY_TOO_LARGE') return json(413, { error: 'Request too large.', code: 'INVALID_ACTION' });
      if (kind === 'CONTENT_TYPE') return json(415, { error: 'Expected JSON.', code: 'INVALID_ACTION' });
      if (error instanceof SyntaxError || kind === 'INVALID_JSON') return json(400, { error: 'Invalid JSON request.', code: 'INVALID_ACTION' });
      // Never tell a client that an ambiguous creation failure was not admitted.
      return json(503, { error: 'The room service is reconnecting. Please try again.', code: 'ROOM_WORKER_UNAVAILABLE' });
    }
  },
} satisfies ExportedHandler<Env>;

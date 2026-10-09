import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

export function secretMatches(actual: unknown, expected: string) {
  if (typeof actual !== 'string' || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Count only proxy hops explicitly controlled by our deployment. Never take an
// arbitrary leftmost X-Forwarded-For value supplied by an internet client.
export function clientAddress(req: IncomingMessage, trustedHops = 0) {
  const peer = req.socket.remoteAddress ?? 'unknown';
  if (!trustedHops) return peer;
  const header = req.headers['x-forwarded-for'];
  if (typeof header !== 'string' || header.length > 2048) return peer;
  const chain = [...header.split(',').map(value => value.trim()), peer];
  const value = chain[Math.max(0, chain.length - 1 - trustedHops)];
  return isIP(value) ? value : peer;
}

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid numeric server configuration (${min}–${max}).`);
  return parsed;
}

export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const role = env.SERVER_ROLE ?? 'single';
  if (!['single', 'gateway', 'worker'].includes(role)) throw new Error('SERVER_ROLE must be single, gateway, or worker.');
  const workerSecret = env.WORKER_SECRET ?? '';
  if (role !== 'single' && workerSecret.length < 32) throw new Error('Gateway and workers require the same WORKER_SECRET (at least 32 characters).');
  const workers = Object.entries(env).filter(([key, value]) => /^ROOM_WORKER_[A-F0-9]{2}$/.test(key) && value).map(([key, value]) => ({
    id: key.slice(-2), url: value!.includes('://') ? value! : `http://${value}`,
  }));
  if (role === 'gateway' && !workers.length) throw new Error('Gateway requires ROOM_WORKER_XX host:port settings.');
  if (role === 'worker' && !/^[A-F0-9]{2}$/.test(env.ROOM_WORKER_ID ?? '')) throw new Error('Worker requires a two-character hexadecimal ROOM_WORKER_ID.');
  return {
    role: role as 'single' | 'gateway' | 'worker', workers, workerSecret,
    workerId: role === 'worker' ? env.ROOM_WORKER_ID : undefined,
    publicOrigin: env.PUBLIC_ORIGIN || undefined,
    opsToken: env.OPS_TOKEN || workerSecret,
    port: integer(env.PORT, 3000, 0, 65535), host: env.HOST || '0.0.0.0',
    maxRooms: integer(env.MAX_ROOMS, 32, 1, 10000), maxPlayers: integer(env.MAX_PLAYERS, 256, 2, 80000),
    trustProxyHops: integer(env.TRUST_PROXY_HOPS, 0, 0, 8),
    drainTimeoutMs: integer(env.DRAIN_TIMEOUT_MS, 280000, 1000, 600000),
    maxEventLoopDelayMs: integer(env.MAX_EVENT_LOOP_DELAY_MS, 100, 20, 1000),
    version: (env.RENDER_GIT_COMMIT || env.RELEASE_VERSION || 'local').slice(0, 12),
  };
}

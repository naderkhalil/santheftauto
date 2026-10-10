import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LeaderboardService, LeaderboardError, MAX_LEADERBOARD_BODY, leaderboardMode, type LeaderboardStore, type StoredLeaderboardEntry, type StoredSoloTicket, type LeaderboardBudget } from './leaderboard.ts';
import type { LeaderboardMode } from '../src/leaderboard-protocol.ts';
import { RoomError, type RoomService } from './rooms.ts';
import { verifiedMultiplayerResult } from './leaderboard-result.ts';

type Saved = { version: 1; entries: StoredLeaderboardEntry[]; tickets: StoredSoloTicket[]; budgets: [string, LeaderboardBudget][] };
const order = (a: StoredLeaderboardEntry, b: StoredLeaderboardEntry) => a.timeMs - b.timeMs || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
/** Local single-process persistence. Cloudflare production uses its SQLite Durable Object. */
export class FileLeaderboardStore implements LeaderboardStore {
  private file: string;
  private data: Saved;
  private depth = 0;
  constructor(file = resolve(process.env.LEADERBOARD_DATA_FILE || '.leaderboard-data.json')) {
    this.file = file;
    this.data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Saved : { version: 1, entries: [], tickets: [], budgets: [] };
    if (this.data.version !== 1 || !Array.isArray(this.data.entries) || !Array.isArray(this.data.tickets) || !Array.isArray(this.data.budgets)) throw new Error('Invalid leaderboard data file.');
  }
  private save() {
    if (this.depth) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 }); renameSync(temporary, this.file);
  }
  transaction<T>(work: () => T): T {
    if (this.depth) return work();
    const before = structuredClone(this.data); this.depth++;
    try { const value = work(); this.depth--; this.save(); return value; }
    catch (error) { this.depth = 0; this.data = before; throw error; }
  }
  ticket(id: string) { const value = this.data.tickets.find(ticket => ticket.runId === id); return value ? { ...value } : null; }
  saveTicket(value: StoredSoloTicket) { this.data.tickets = this.data.tickets.filter(ticket => ticket.runId !== value.runId); this.data.tickets.push({ ...value }); this.save(); }
  prune(now: number) { this.data.tickets = this.data.tickets.filter(ticket => ticket.expiresAt > now); this.data.budgets = this.data.budgets.filter(([, value]) => value.until > now); }
  ticketCount() { return this.data.tickets.length; }
  budget(key: string) { return this.data.budgets.find(([id]) => id === key)?.[1] ?? null; }
  saveBudget(key: string, value: LeaderboardBudget) { this.data.budgets = this.data.budgets.filter(([id]) => id !== key); this.data.budgets.push([key, { ...value }]); this.save(); }
  entry(id: string) { return this.data.entries.find(entry => entry.id === id) ?? null; }
  insert(value: StoredLeaderboardEntry) { if (!this.entry(value.id)) this.data.entries.push({ ...value }); this.save(); }
  top(mode: LeaderboardMode, limit: number) { return this.data.entries.filter(entry => entry.mode === mode).sort(order).slice(0, limit); }
  count(mode: LeaderboardMode) { return this.data.entries.filter(entry => entry.mode === mode).length; }
  faster(mode: LeaderboardMode, timeMs: number) { return this.data.entries.filter(entry => entry.mode === mode && entry.timeMs < timeMs).length; }
  nearest(mode: LeaderboardMode, timeMs: number, exclude: string) {
    return this.data.entries.filter(entry => entry.mode === mode && entry.id !== exclude).sort((a, b) => Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs) || order(a, b))[0] ?? null;
  }
}
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) { reject(new LeaderboardError('Expected JSON.', 415)); req.resume(); return; }
    let bytes = 0; const chunks: Buffer[] = [];
    const finish = (error?: Error) => {
      clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', onError); req.off('aborted', aborted);
      if (error) { req.resume(); reject(error); }
    };
    const data = (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_LEADERBOARD_BODY) finish(new LeaderboardError('Request too large.', 413)); else chunks.push(chunk); };
    const end = () => {
      finish();
      try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); resolveBody(value as Record<string, unknown>); }
      catch { reject(new LeaderboardError('Invalid JSON.')); }
    };
    const onError = () => finish(new LeaderboardError('The request was interrupted.', 400));
    const aborted = () => finish(new LeaderboardError('The request was interrupted.', 400));
    const timer = setTimeout(() => finish(new LeaderboardError('The request took too long.', 408)), 5000);
    req.on('data', data); req.once('end', end); req.once('error', onError); req.once('aborted', aborted);
  });
}
export function createLeaderboardApi(options: { rooms?: RoomService; file?: string; clientAddress?: (req: IncomingMessage) => string; service?: LeaderboardService } = {}) {
  const service = options.service ?? new LeaderboardService(new FileLeaderboardStore(options.file));
  const json = (res: ServerResponse, status: number, data: unknown) => {
    if (res.destroyed || res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) }); res.end(JSON.stringify(data));
  };
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost'), path = url.pathname;
    const multiplayer = path.match(/^\/api\/rooms\/([A-F0-9]{8})\/leaderboard$/);
    if (!path.startsWith('/api/leaderboard') && !multiplayer) return false;
    try {
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new LeaderboardError('Use this game’s own website.', 403, 'FOREIGN_ORIGIN');
      if (req.headers.origin) {
        let origin: URL; try { origin = new URL(req.headers.origin); } catch { throw new LeaderboardError('Invalid request origin.', 403, 'FOREIGN_ORIGIN'); }
        if (origin.host !== req.headers.host) throw new LeaderboardError('Use this game’s own website.', 403, 'FOREIGN_ORIGIN');
      }
      const peer = options.clientAddress?.(req) ?? req.socket.remoteAddress ?? 'local';
      if (path === '/api/leaderboard' && req.method === 'GET') {
        service.limit('read:' + peer, 120);
        json(res, 200, service.board(leaderboardMode(url.searchParams.get('mode') ?? 'solo'), url.searchParams.get('entryId'), Number(url.searchParams.get('timeMs'))));
      } else if (path === '/api/leaderboard/solo/start' && req.method === 'POST') {
        const data = await readJson(req); json(res, 201, await service.start(data.courseVersion, peer));
      } else if (path === '/api/leaderboard/solo/finish' && req.method === 'POST') {
        json(res, 200, await service.finish(await readJson(req), peer));
      } else if (multiplayer && req.method === 'POST' && options.rooms) {
        service.limit('multiplayer:' + peer, 10);
        const header = req.headers['x-room-generation'], generation = typeof header === 'string' && /^\d+$/.test(header) ? Number(header) : NaN;
        if (!Number.isSafeInteger(generation) || generation < 1) throw new LeaderboardError('Restore your room session to post this result.', 401, 'SESSION_CLAIM_REQUIRED');
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        const data = await readJson(req);
        json(res, 200, service.recordMultiplayer(verifiedMultiplayerResult(options.rooms, multiplayer[1], token, generation, data.name, data.roundId)));
      } else json(res, 404, { error: 'Leaderboard endpoint not found.', code: 'INVALID_ACTION' });
    } catch (error) {
      if (error instanceof LeaderboardError || error instanceof RoomError) json(res, error.status, { error: error.message, code: error.code });
      else json(res, 503, { error: 'The leaderboard is unavailable. Please retry your submission.', code: 'LEADERBOARD_UNAVAILABLE' });
    }
    return true;
  };
  return { service, handler };
}

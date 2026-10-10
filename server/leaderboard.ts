import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';
import { DRIVERS } from '../src/racer-profile.ts';
import { normalizeLeaderboardName, type LeaderboardBoard, type LeaderboardEntry, type LeaderboardMode, type SoloRunTicket } from '../src/leaderboard-protocol.ts';
import { verifySoloReplay } from './verify-race.ts';

export type StoredLeaderboardEntry = Omit<LeaderboardEntry, 'rank'> & { courseVersion: string };
export type VerifiedMultiplayerResult = Omit<StoredLeaderboardEntry, 'mode'>;
export type StoredSoloTicket = { runId: string; tokenHash: string; createdAt: number; expiresAt: number; attempts: number; entryId: string | null };
export type LeaderboardBudget = { count: number; until: number };
export interface LeaderboardStore {
  transaction<T>(work: () => T): T;
  ticket(id: string): StoredSoloTicket | null;
  saveTicket(ticket: StoredSoloTicket): void;
  prune(now: number): void;
  ticketCount(): number;
  budget(key: string): LeaderboardBudget | null;
  saveBudget(key: string, value: LeaderboardBudget): void;
  entry(id: string): StoredLeaderboardEntry | null;
  insert(entry: StoredLeaderboardEntry): void;
  top(mode: LeaderboardMode, limit: number): StoredLeaderboardEntry[];
  count(mode: LeaderboardMode): number;
  faster(mode: LeaderboardMode, timeMs: number): number;
  nearest(mode: LeaderboardMode, timeMs: number, exclude: string): StoredLeaderboardEntry | null;
}
export class LeaderboardError extends Error {
  status: number; code: string;
  constructor(message: string, status = 400, code = 'INVALID_LEADERBOARD_REQUEST') { super(message); this.status = status; this.code = code; }
}
const fail = (message: string, status = 400, code?: string): never => { throw new LeaderboardError(message, status, code); };
export function leaderboardMode(value: unknown): LeaderboardMode {
  return value === 'solo' || value === 'multiplayer' ? value : fail('Choose a solo or multiplayer leaderboard.');
}
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(value);
const driverName = (value: unknown) => DRIVERS.some(driver => driver.id === value) ? value as string : fail('Choose a valid driver.');
const publicEntry = (entry: StoredLeaderboardEntry, rank: number): LeaderboardEntry => ({ id: entry.id, name: entry.name, driver: entry.driver, mode: entry.mode, timeMs: entry.timeMs, createdAt: entry.createdAt, rank });

/** Only verified runs enter this store. Submitted times are never accepted by solo finish. */
export class LeaderboardService {
  store: LeaderboardStore;
  private now: () => number;
  private verify: typeof verifySoloReplay;
  constructor(store: LeaderboardStore, options: { now?: () => number; verify?: typeof verifySoloReplay } = {}) {
    this.store = store; this.now = options.now ?? Date.now; this.verify = options.verify ?? verifySoloReplay;
  }
  limit(key: string, maximum: number, duration = 60_000) {
    const now = this.now();
    this.store.transaction(() => {
      this.store.prune(now);
      const old = this.store.budget(key), next = old && old.until > now ? { ...old, count: old.count + 1 } : { count: 1, until: now + duration };
      if (next.count > maximum) fail('Too many leaderboard requests. Please try again shortly.', 429, 'RATE_LIMITED');
      this.store.saveBudget(key, next);
    });
  }
  async start(courseVersion: unknown, peer: string): Promise<SoloRunTicket> {
    if (courseVersion !== COURSE_VERSION) fail('Reload the game to race the current course.', 409, 'COURSE_MISMATCH');
    this.limit('start:' + peer, 10); this.limit('hour:' + peer, 120, 3_600_000);
    const token = randomToken(), tokenHash = await hash(token), now = this.now();
    const ticket: StoredSoloTicket = { runId: crypto.randomUUID(), tokenHash, createdAt: now, expiresAt: now + 3_600_000, attempts: 0, entryId: null };
    this.store.transaction(() => {
      this.store.prune(now);
      if (this.store.ticketCount() >= 10_000) fail('The leaderboard is busy. Please try again shortly.', 503, 'LEADERBOARD_BUSY');
      this.store.saveTicket(ticket);
    });
    return { runId: ticket.runId, token, expiresAt: ticket.expiresAt };
  }
  async finish(data: Record<string, unknown>, peer: string): Promise<LeaderboardBoard> {
    this.limit('finish:' + peer, 10);
    if (!validId(data.runId) || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) fail('This race ticket is invalid. Start a new race.', 401, 'INVALID_TICKET');
    const tokenHash = await hash(data.token as string), ticket = this.store.ticket(data.runId as string), now = this.now();
    if (!ticket || ticket.tokenHash !== tokenHash) fail('This race ticket is invalid. Start a new race.', 401, 'INVALID_TICKET');
    if (ticket!.expiresAt <= now) fail('This race ticket expired. Start a new race.', 410, 'TICKET_EXPIRED');
    if (ticket!.entryId) return this.board('solo', ticket!.entryId);
    const name = normalizeLeaderboardName(data.name);
    if (!name) fail('Enter a name of 2–24 characters to post your time.', 400, 'NAME_REQUIRED');
    const driver = driverName(data.driver);
    if (ticket!.attempts >= 5) fail('This race could not be verified. Start a new race.', 429, 'TICKET_EXHAUSTED');
    ticket!.attempts++; this.store.saveTicket(ticket!);
    let timeMs: number;
    try { timeMs = this.verify(data.frames).timeMs; } catch { return fail('The race replay could not be verified.', 400, 'INVALID_REPLAY'); }
    if (!Number.isSafeInteger(timeMs) || timeMs <= 0 || timeMs > 600_000 || now - ticket!.createdAt + 2000 < timeMs) fail('The race replay could not be verified.', 400, 'INVALID_REPLAY');
    this.store.transaction(() => {
      this.store.insert({ id: ticket!.runId, name: name!, driver, mode: 'solo', timeMs, createdAt: now, courseVersion: COURSE_VERSION });
      ticket!.entryId = ticket!.runId; this.store.saveTicket(ticket!);
    });
    return this.board('solo', ticket!.runId);
  }
  recordMultiplayer(result: VerifiedMultiplayerResult): LeaderboardBoard {
    const name = normalizeLeaderboardName(result.name);
    if (!name) fail('Enter a name of 2–24 characters to post your time.', 400, 'NAME_REQUIRED');
    if (!validId(result.id) || result.courseVersion !== COURSE_VERSION || !Number.isSafeInteger(result.timeMs) || result.timeMs <= 0 || result.timeMs > 600_000 || !Number.isSafeInteger(result.createdAt) || result.createdAt < 0) fail('The multiplayer result is invalid.');
    const entry = { ...result, name: name!, driver: driverName(result.driver), mode: 'multiplayer' as const };
    this.store.transaction(() => {
      const existing = this.store.entry(entry.id);
      if (existing && (existing.mode !== entry.mode || existing.timeMs !== entry.timeMs)) fail('The multiplayer result does not match its previous submission.', 409);
      this.store.insert(entry);
    });
    return this.board('multiplayer', entry.id);
  }
  board(mode: LeaderboardMode, entryId?: string | null, suppliedTime?: number): LeaderboardBoard {
    const entries = this.store.top(mode, 20).map(entry => publicEntry(entry, 1 + this.store.faster(mode, entry.timeMs)));
    const stored = entryId && validId(entryId) ? this.store.entry(entryId) : null;
    const own = stored?.mode === mode ? publicEntry(stored, 1 + this.store.faster(mode, stored.timeMs)) : null;
    const timeMs = own?.timeMs ?? suppliedTime;
    const nearest = typeof timeMs === 'number' && Number.isFinite(timeMs) && timeMs > 0 && timeMs <= 600_000 ? this.store.nearest(mode, timeMs, own?.id ?? '') : null;
    return { courseVersion: COURSE_VERSION, mode, total: this.store.count(mode), entries, own,
      comparison: nearest ? publicEntry(nearest, 1 + this.store.faster(mode, nearest.timeMs)) : null };
  }
}

export const MAX_LEADERBOARD_BODY = 2 * 1024 * 1024;
export async function readLeaderboardJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) fail('Expected JSON.', 415);
  if (Number(request.headers.get('Content-Length')) > MAX_LEADERBOARD_BODY) fail('Request too large.', 413);
  const reader = request.body?.getReader();
  let bytes = 0, text = ''; const decoder = new TextDecoder();
  if (reader) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new LeaderboardError('The request took too long.', 408)); void reader.cancel().catch(() => {}); }, 5000); });
    try { for (;;) {
      const part = await Promise.race([reader.read(), timeout]); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_LEADERBOARD_BODY) { void reader.cancel().catch(() => {}); fail('Request too large.', 413); }
      text += decoder.decode(part.value, { stream: true });
    } } finally { if (timer !== undefined) clearTimeout(timer); }
    text += decoder.decode();
  }
  let value: unknown; try { value = JSON.parse(text || '{}'); } catch { return fail('Invalid JSON.'); }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail('Invalid JSON.');
}

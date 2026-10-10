import { LeaderboardService, LeaderboardError, leaderboardMode, readLeaderboardJson, type LeaderboardStore, type StoredLeaderboardEntry, type StoredSoloTicket, type LeaderboardBudget, type VerifiedMultiplayerResult } from '../server/leaderboard.ts';
import type { LeaderboardMode } from '../src/leaderboard-protocol.ts';

/** SQLite keeps every accepted run and survives actor eviction and Worker releases. */
class SqlLeaderboardStore implements LeaderboardStore {
  private storage: DurableObjectStorage;
  private sql: SqlStorage;
  constructor(storage: DurableObjectStorage) {
    this.storage = storage; this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS leaderboard_entries (id TEXT PRIMARY KEY, name TEXT NOT NULL, driver TEXT NOT NULL, mode TEXT NOT NULL, timeMs INTEGER NOT NULL, createdAt INTEGER NOT NULL, courseVersion TEXT NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS leaderboard_times ON leaderboard_entries(mode, timeMs, createdAt, id)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS leaderboard_tickets (runId TEXT PRIMARY KEY, tokenHash TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, attempts INTEGER NOT NULL, entryId TEXT)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS leaderboard_expiry ON leaderboard_tickets(expiresAt)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS leaderboard_budgets (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS leaderboard_budget_expiry ON leaderboard_budgets(until)`);
  }
  transaction<T>(work: () => T): T { return this.storage.transactionSync(work); }
  ticket(id: string) { return (this.sql.exec('SELECT * FROM leaderboard_tickets WHERE runId = ?', id).toArray()[0] ?? null) as StoredSoloTicket | null; }
  saveTicket(t: StoredSoloTicket) { this.sql.exec('INSERT OR REPLACE INTO leaderboard_tickets VALUES (?, ?, ?, ?, ?, ?)', t.runId, t.tokenHash, t.createdAt, t.expiresAt, t.attempts, t.entryId); }
  prune(now: number) {
    this.sql.exec('DELETE FROM leaderboard_tickets WHERE expiresAt <= ?', now);
    this.sql.exec('DELETE FROM leaderboard_budgets WHERE until <= ?', now);
  }
  ticketCount() { return Number(this.sql.exec('SELECT COUNT(*) AS total FROM leaderboard_tickets').one().total); }
  budget(key: string) { return (this.sql.exec('SELECT count, until FROM leaderboard_budgets WHERE key = ?', key).toArray()[0] ?? null) as LeaderboardBudget | null; }
  saveBudget(key: string, value: LeaderboardBudget) { this.sql.exec('INSERT OR REPLACE INTO leaderboard_budgets VALUES (?, ?, ?)', key, value.count, value.until); }
  entry(id: string) { return (this.sql.exec('SELECT * FROM leaderboard_entries WHERE id = ?', id).toArray()[0] ?? null) as StoredLeaderboardEntry | null; }
  insert(e: StoredLeaderboardEntry) { this.sql.exec('INSERT OR IGNORE INTO leaderboard_entries VALUES (?, ?, ?, ?, ?, ?, ?)', e.id, e.name, e.driver, e.mode, e.timeMs, e.createdAt, e.courseVersion); }
  top(mode: LeaderboardMode, limit: number) { return this.sql.exec('SELECT * FROM leaderboard_entries WHERE mode = ? ORDER BY timeMs, createdAt, id LIMIT ?', mode, limit).toArray() as StoredLeaderboardEntry[]; }
  count(mode: LeaderboardMode) { return Number(this.sql.exec('SELECT COUNT(*) AS total FROM leaderboard_entries WHERE mode = ?', mode).one().total); }
  faster(mode: LeaderboardMode, timeMs: number) { return Number(this.sql.exec('SELECT COUNT(*) AS total FROM leaderboard_entries WHERE mode = ? AND timeMs < ?', mode, timeMs).one().total); }
  nearest(mode: LeaderboardMode, timeMs: number, exclude: string) {
    const lower = this.sql.exec('SELECT * FROM leaderboard_entries WHERE mode = ? AND timeMs <= ? AND id != ? ORDER BY timeMs DESC, createdAt, id LIMIT 1', mode, timeMs, exclude).toArray()[0] as StoredLeaderboardEntry | undefined;
    const upper = this.sql.exec('SELECT * FROM leaderboard_entries WHERE mode = ? AND timeMs >= ? AND id != ? ORDER BY timeMs, createdAt, id LIMIT 1', mode, timeMs, exclude).toArray()[0] as StoredLeaderboardEntry | undefined;
    return !lower ? upper ?? null : !upper || timeMs - lower.timeMs <= upper.timeMs - timeMs ? lower : upper;
  }
}
const json = (status: number, data: unknown) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) } });

export class Leaderboard {
  private service: LeaderboardService;
  constructor(ctx: DurableObjectState) { this.service = new LeaderboardService(new SqlLeaderboardStore(ctx.storage)); }
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url), path = url.pathname, peer = request.headers.get('X-Leaderboard-Client-IP') ?? 'internal';
      if (path === '/api/leaderboard' && request.method === 'GET') {
        this.service.limit('read:' + peer, 120);
        return json(200, this.service.board(leaderboardMode(url.searchParams.get('mode') ?? 'solo'), url.searchParams.get('entryId'), Number(url.searchParams.get('timeMs'))));
      }
      if (path === '/api/leaderboard/solo/start' && request.method === 'POST') {
        const data = await readLeaderboardJson(request);
        return json(201, await this.service.start(data.courseVersion, peer));
      }
      if (path === '/api/leaderboard/solo/finish' && request.method === 'POST') return json(200, await this.service.finish(await readLeaderboardJson(request), peer));
      // Only a Room actor can call this binding. The public edge has an exact route allowlist.
      if (path === '/internal/multiplayer' && request.method === 'POST') return json(200, this.service.recordMultiplayer(await readLeaderboardJson(request) as VerifiedMultiplayerResult));
      return json(404, { error: 'Leaderboard endpoint not found.', code: 'INVALID_ACTION' });
    } catch (error) {
      return error instanceof LeaderboardError ? json(error.status, { error: error.message, code: error.code })
        : json(503, { error: 'The leaderboard is unavailable. Please retry your submission.', code: 'LEADERBOARD_UNAVAILABLE' });
    }
  }
}

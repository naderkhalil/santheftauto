import { COURSE_VERSION } from './multiplayer-protocol.ts';
import { MAX_REPLAY_FRAMES, MAX_REPLAY_SECONDS, normalizeLeaderboardName, type LeaderboardBoard, type LeaderboardMode, type ReplayFrame, type SoloRunTicket } from './leaderboard-protocol.ts';
import type { DriveInput } from './driving.ts';

export async function leaderboardRequest<T>(path: string, data?: unknown, headers?: HeadersInit): Promise<T> {
  const response = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'The leaderboard is unavailable. Please try again.');
  if (!payload) throw new Error('The leaderboard is unavailable. Please try again.');
  return payload as T;
}

export function loadLeaderboard(mode: LeaderboardMode, timeMs?: number, entryId?: string): Promise<LeaderboardBoard> {
  const query = new URLSearchParams({ mode });
  if (timeMs !== undefined) query.set('timeMs', String(timeMs));
  if (entryId) query.set('entryId', entryId);
  return leaderboardRequest('/api/leaderboard?' + query);
}

export type PostLeaderboardTime = (name: string) => Promise<LeaderboardBoard>;
type TicketResult = { ticket: SoloRunTicket } | { error: Error };
type Recording = { frames: ReplayFrame[]; elapsed: number; eligible: boolean; ticket: Promise<TicketResult> };

/** Each run owns its ticket promise, so a slow response cannot attach to a restarted race. */
export class SoloLeaderboardRecorder {
  private run: Recording | null = null;
  private request: typeof leaderboardRequest;
  constructor(request: typeof leaderboardRequest = leaderboardRequest) { this.request = request; }

  start(): void {
    this.run = {
      frames: [], elapsed: 0, eligible: true,
      ticket: this.request<SoloRunTicket>('/api/leaderboard/solo/start', { courseVersion: COURSE_VERSION })
        .then(ticket => ({ ticket }), error => ({ error: error instanceof Error ? error : new Error('Could not register this run. Start another race to try again.') })),
    };
  }

  cancel(): void { this.run = null; }

  record(dt: number, input: DriveInput): void {
    const run = this.run;
    if (!run?.eligible || !Number.isFinite(dt) || dt <= 0) return;
    run.elapsed += dt;
    this.append([dt, input.throttle, input.brake, input.steer, (input.drift ? 1 : 0) | (input.boost ? 2 : 0)]);
  }

  recover(): void { this.append([0, 0, 0, 0, 4]); }

  private append(frame: ReplayFrame): void {
    const run = this.run;
    if (!run?.eligible) return;
    if (run.frames.length >= MAX_REPLAY_FRAMES || run.elapsed > MAX_REPLAY_SECONDS) {
      run.eligible = false; run.frames = []; return;
    }
    run.frames.push(frame);
  }

  finish(driver: string): PostLeaderboardTime {
    const run = this.run;
    this.run = null;
    return async (value: string) => {
      const name = normalizeLeaderboardName(value);
      if (!name) throw new Error('Choose your own name: 2–24 characters, and not “Racer”.');
      if (!run?.eligible) throw new Error('This run is too long for the leaderboard. Finish a new race within 10 minutes.');
      const result = await run.ticket;
      if ('error' in result) throw new Error('This run could not connect to the leaderboard at the start. Race again to post a time.');
      return this.request<LeaderboardBoard>('/api/leaderboard/solo/finish', { runId: result.ticket.runId, token: result.ticket.token, name, driver, frames: run.frames });
    };
  }
}

export function leaderboardTime(timeMs: number): string {
  const ms = Math.max(0, Math.round(timeMs));
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function comparisonText(timeMs: number, comparison: { name: string; timeMs: number }): string {
  const gap = timeMs - comparison.timeMs;
  return gap === 0 ? `Tied with ${comparison.name}` : `${(Math.abs(gap) / 1000).toFixed(3)}s ${gap < 0 ? 'ahead of' : 'behind'} ${comparison.name}`;
}

export type LeaderboardMode = 'solo' | 'multiplayer';
export type LeaderboardEntry = {
  id: string;
  name: string;
  driver: string;
  mode: LeaderboardMode;
  timeMs: number;
  rank: number;
  createdAt: number;
};
export type LeaderboardBoard = {
  courseVersion: string;
  mode: LeaderboardMode;
  total: number;
  entries: LeaderboardEntry[];
  own: LeaderboardEntry | null;
  comparison: LeaderboardEntry | null;
};
export type SoloRunTicket = { runId: string; token: string; expiresAt: number };
/** Flags: 1 = drift, 2 = boost. [0, 0, 0, 0, 4] records a road recovery. */
export type ReplayFrame = [dt: number, throttle: number, brake: number, steer: number, flags: number];
export const MAX_REPLAY_FRAMES = 60_000;
export const MAX_REPLAY_SECONDS = 600;

export function normalizeLeaderboardName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[<>\p{Cc}\p{Cf}]/gu, '').trim();
  return name.length >= 2 && name.length <= 24 && !/^racer(?: \d+)?$/i.test(name) ? name : null;
}

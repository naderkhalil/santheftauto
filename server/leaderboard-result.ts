import { RoomError, type RoomService } from './rooms.ts';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';
import { normalizeLeaderboardName } from '../src/leaderboard-protocol.ts';

/** The session selects the racer; request bodies never supply times or player IDs. */
export function verifiedMultiplayerResult(service: RoomService, code: string, token: string, generation: number, rawName: unknown, requestedRoundId?: unknown) {
  if (!Number.isSafeInteger(generation) || generation < 1) throw new RoomError('Restore your room session to post your time.', 401, 'SESSION_CLAIM_REQUIRED');
  const { room, player } = service.auth(code, token, generation);
  const name = normalizeLeaderboardName(rawName);
  if (!name) throw new RoomError('Enter your name to join the leaderboard. “Racer” is not a name.', 400, 'NAME_REQUIRED');
  const roundId = requestedRoundId ?? room.roundId;
  if (typeof roundId !== 'string') throw new RoomError('Finish a race before posting a time.', 409, 'RACE_NOT_FINISHED');
  const result = [room.results, room.lastResults].find(result => result?.roundId === roundId);
  const entry = result?.entries.find(entry => entry.id === player.id);
  const entrant = room.roundId === roundId ? room.entrants.get(player.id) : undefined;
  const finishTime = entry ? entry.finishTime : entrant?.player.finishTime;
  const dnf = entry ? entry.dnfReason !== null : entrant?.player.dnf;
  if (finishTime == null || dnf || !Number.isFinite(finishTime) || finishTime <= 0) throw new RoomError('Only completed races can join the leaderboard.', 409, 'RACE_NOT_FINISHED');
  return {
    id: `${roundId}:${player.id}`, name, driver: (entry?.profile ?? entrant!.profile).driver,
    timeMs: Math.round(finishTime * 1000), createdAt: result?.completedAt ?? Math.round(room.startAt + finishTime * 1000),
    courseVersion: result?.courseVersion ?? COURSE_VERSION,
  };
}

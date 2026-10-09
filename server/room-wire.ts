import type { RacerSnapshot, RoomSnapshot } from '../src/multiplayer-protocol.ts';
import { DRIVE_STATE_FIELDS, type PackedRacer, type RoomWireFrame } from '../src/room-wire.ts';

export const sseData = (value: unknown) => 'data: ' + JSON.stringify(value) + '\n\n';
export const snapshotFrame = (room: RoomSnapshot): RoomWireFrame => ({ v: 2, type: 'snapshot', room });
function packRacer(player: RacerSnapshot): PackedRacer {
  const flags = Number(player.connected) | Number(player.exploring) << 1 | Number(player.dnf) << 2 | Number(player.state.airborne) << 3 | Number(player.state.finished) << 4;
  return [player.id, DRIVE_STATE_FIELDS.map(key => player.state[key]), [player.position.x, player.position.y, player.position.z], player.finishTime, player.rank, flags, player.reconnectUntil, player.dnfReason];
}
export function tickFrame(room: RoomSnapshot): RoomWireFrame {
  return { v: 2, type: 'tick', code: room.code, roundId: room.roundId, serverNow: room.serverNow,
    ...(room.simulationAt !== undefined ? { simulationAt: room.simulationAt } : {}), racers: room.entrants.map(packRacer) };
}
function metadata(player: RacerSnapshot) {
  return [player.id, player.profile, player.profileRevision, player.readyRevision, player.ready, player.connected, player.reconnectUntil, player.selectionStatus, player.loadedCourseVersion];
}
/** Dynamic state/ranks do not invalidate race metadata; entrant identity order is stable. */
export function roomSemanticKey(room: RoomSnapshot): string {
  return JSON.stringify([room.code, room.host, room.phase, room.round, room.roundId, room.courseVersion, room.startAt, room.deadline, room.players.map(metadata), [...room.entrants].sort((a, b) => a.id.localeCompare(b.id)).map(metadata), room.results, room.lastResults]);
}

/** One encoder per room; callers share each returned serialization across recipients. */
export class RoomWireEncoder {
  private semanticKey = '';
  private lastIdleAt = -Infinity;
  prepare(room: RoomSnapshot, idleHeartbeatMs = 1500) {
    const key = roomSemanticKey(room), changed = key !== this.semanticKey;
    this.semanticKey = key;
    const active = room.phase === 'racing';
    if (!changed && !active && room.serverNow - this.lastIdleAt < idleHeartbeatMs) return null;
    this.lastIdleAt = room.serverNow;
    const frame: RoomWireFrame = changed ? snapshotFrame(room) : active ? tickFrame(room) : { v: 2, type: 'heartbeat', code: room.code, roundId: room.roundId, serverNow: room.serverNow };
    let legacy: string | undefined, compact: string | undefined;
    return {
      frame,
      legacy: () => legacy ??= sseData(room),
      compact: () => compact ??= sseData(frame),
    };
  }
}

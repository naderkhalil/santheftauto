import type { DriveState } from './driving.ts';
import type { DnfReason, RacerSnapshot, RoomSnapshot } from './multiplayer-protocol.ts';

type NumericStateKey = { [K in keyof DriveState]: DriveState[K] extends number ? K : never }[keyof DriveState];
/** Wire v2 field order is immutable. Add a new protocol version to change it. */
export const DRIVE_STATE_FIELDS = [
  'progress', 'lateral', 'speed', 'heading', 'surfacePitch', 'surfaceRoll', 'elapsed',
  'boost', 'surge', 'driftAngle', 'y', 'verticalVelocity', 'glide', 'altitude',
  'airTime', 'totalAirTime', 'launches', 'checkpoint', 'collisions', 'distanceDrifted',
] as const satisfies readonly NumericStateKey[];
// Fail compilation if physics adds a field without updating this codec.
const completeState: Exclude<NumericStateKey, typeof DRIVE_STATE_FIELDS[number]> extends never ? true : never = true;
void completeState;

/** id, numeric physics fields, xyz, finish time, rank, flags, reconnect deadline, DNF reason. */
export type PackedRacer = [string, number[], [number, number, number], number | null, number | null, number, number | null, DnfReason | null];
export type RoomWireFrame =
  | { v: 2; type: 'snapshot'; room: RoomSnapshot }
  | { v: 2; type: 'tick'; code: string; roundId: string | null; serverNow: number; simulationAt?: number; racers: PackedRacer[] }
  | { v: 2; type: 'heartbeat'; code: string; roundId: string | null; serverNow: number };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const optionalNumber = (value: unknown) => value === null || finite(value);
const invalid = (): never => { throw Error('Room stream is out of sync. Reconnecting for a fresh snapshot.'); };

function unpackRacer(previous: RacerSnapshot, row: PackedRacer): RacerSnapshot {
  if (!Array.isArray(row) || row.length !== 8 || row[0] !== previous.id || !Array.isArray(row[1]) || row[1].length !== DRIVE_STATE_FIELDS.length || !row[1].every(finite) || !Array.isArray(row[2]) || row[2].length !== 3 || !row[2].every(finite) || !optionalNumber(row[3]) || !optionalNumber(row[4]) || !Number.isInteger(row[5]) || row[5] < 0 || row[5] > 31 || !optionalNumber(row[6]) || ![null, 'time-limit', 'disconnected', 'left-race'].includes(row[7])) invalid();
  const state = { ...previous.state };
  DRIVE_STATE_FIELDS.forEach((key, index) => { state[key] = row[1][index]; });
  const flags = row[5]; state.airborne = !!(flags & 8); state.finished = !!(flags & 16);
  return { ...previous, state, position: { x: row[2][0], y: row[2][1], z: row[2][2] }, finishTime: row[3], rank: row[4], connected: !!(flags & 1), exploring: !!(flags & 2), dnf: !!(flags & 4), reconnectUntil: row[6], dnfReason: row[7] };
}

/** Reconstruct the unchanged application protocol without mutating the previous frame. */
export function applyRoomWireFrame(previous: RoomSnapshot | null, input: unknown): RoomSnapshot {
  if (!input || typeof input !== 'object') return invalid();
  const frame = input as RoomWireFrame;
  if (frame.v !== 2) {
    // Older servers remain compatible during a rolling frontend deployment.
    const legacy = input as RoomSnapshot;
    if (typeof legacy.code === 'string' && finite(legacy.serverNow) && (legacy.simulationAt === undefined || finite(legacy.simulationAt)) && Array.isArray(legacy.players) && Array.isArray(legacy.entrants)) return legacy;
    return invalid();
  }
  if (frame.type === 'snapshot') {
    if (!frame.room || typeof frame.room.code !== 'string' || !finite(frame.room.serverNow) || (frame.room.simulationAt !== undefined && !finite(frame.room.simulationAt)) || !Array.isArray(frame.room.players) || !Array.isArray(frame.room.entrants)) return invalid();
    return frame.room;
  }
  if (!previous || frame.code !== previous.code || frame.roundId !== previous.roundId || !finite(frame.serverNow)) return invalid();
  if (frame.type === 'heartbeat') return { ...previous, serverNow: frame.serverNow };
  if (frame.type !== 'tick' || previous.phase !== 'racing' || (frame.simulationAt !== undefined && !finite(frame.simulationAt)) || !Array.isArray(frame.racers) || frame.racers.length !== previous.entrants.length) return invalid();
  const originals = new Map(previous.entrants.map(player => [player.id, player]));
  const rows = new Map<string, PackedRacer>();
  const entrants = frame.racers.map(row => {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || rows.has(row[0])) return invalid();
    const player = originals.get(row[0]); if (!player) return invalid();
    rows.set(row[0], row); return unpackRacer(player, row);
  });
  const players = previous.players.map(player => { const row = rows.get(player.id); return row ? unpackRacer(player, row) : player; });
  const room = { ...previous, serverNow: frame.serverNow, players, entrants };
  if (frame.simulationAt === undefined) delete room.simulationAt;
  else room.simulationAt = frame.simulationAt;
  return room;
}

export type RoomStreamEvent =
  | { event: 'room'; frame: unknown }
  | { event: 'room-error'; code: string; error: string };

/** Interpret SSE fields, never event-like text inside a player's JSON data. */
export function parseRoomStreamEvent(frame: string): RoomStreamEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value || 'message';
    else if (field === 'data') data.push(value);
  }
  if (!data.length || !['message', 'room-error'].includes(event)) return null;
  const message = JSON.parse(data.join('\n'));
  if (event !== 'room-error') return { event: 'room', frame: message };
  if (!message || typeof message !== 'object' || typeof message.code !== 'string' || typeof message.error !== 'string') return invalid();
  return { event: 'room-error', code: message.code, error: message.error };
}

/** One per stream. UI drafts cannot mutate the baseline for subsequent deltas. */
export class RoomWireDecoder {
  private room: RoomSnapshot | null = null;
  apply(frame: unknown): RoomSnapshot {
    this.room = applyRoomWireFrame(this.room, frame);
    return structuredClone(this.room);
  }
}

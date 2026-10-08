import { randomBytes } from 'node:crypto';
import { DrivingSimulation, type DriveInput } from '../src/driving.ts';
import { routeProgressAt, START_PROGRESS } from '../src/route.ts';
import { normalizeProfile, type RacerProfile } from '../src/racer-profile.ts';
import {
  COURSE_VERSION, RECONNECT_GRACE_MS, ROOM_CAPACITY,
  type DnfReason, type RacerSnapshot, type RoomCommand, type RoomPhase,
  type RoomSnapshot, type RoundResult, type SelectionStatus,
} from '../src/multiplayer-protocol.ts';

const NEUTRAL: DriveInput = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false };
const ROOM_LIFETIME_MS = 2 * 3_600_000;
const obstacles = [
  { progress: routeProgressAt(-75, 139), lateral: -3.4, width: 2.25, length: 7.2, kind: 'cablecar' as const },
  ...[[175, 385, 4.6], [350, 700, -4.7], [590, 450, 4.6]].map(([x, z, lateral]) => ({ progress: routeProgressAt(x, z), lateral, width: 1.85, length: 4.2, kind: 'car' as const })),
];
type Player = {
  id: string; token: string; generation: number; profile: RacerProfile;
  profileRevision: number; readyRevision: number | null; ready: boolean;
  selectionStatus: SelectionStatus; loadedCourseVersion: string | null; loadingAt: number | null;
  connected: boolean; lastSeen: number; disconnectedAt: number | null;
  inputAt: number; input: DriveInput; sequence: number; recoverAt: number;
  sim: DrivingSimulation; finishTime: number | null; dnf: boolean; dnfReason: DnfReason | null;
};
type Entrant = { player: Player; profile: RacerProfile; profileRevision: number; order: number };
type Room = {
  code: string; host: string; phase: RoomPhase; round: number; roundId: string | null;
  startAt: number; deadline: number; lastTick: number; created: number;
  players: Map<string, Player>; entrants: Map<string, Entrant>;
  results: RoundResult | null; lastResults: RoundResult | null;
};
type Admission = { code: string; id: string; token: string; generation: number; created: number };
const preciseTime = (seconds: number) => Math.round(seconds * 1000) / 1000;

export class RoomError extends Error {
  status: number; code: string;
  constructor(message: string, status = 400, code = 'INVALID_ACTION') { super(message); this.status = status; this.code = code; }
}

export class RoomService {
  rooms = new Map<string, Room>();
  private admissions = new Map<string, Admission>();
  private revoked = new Map<string, { code: string; message: string; expires: number }>();

  private retry(key: string | undefined, now: number) {
    const saved = key && this.admissions.get(key);
    if (!saved) return null;
    const { room, player } = this.auth(saved.code, saved.token);
    // A retry returns the original claim; it cannot take over a newer controller.
    return { id: player.id, token: player.token, generation: saved.generation, room: this.snapshot(room, now) };
  }
  private remember(key: string | undefined, result: { id: string; token: string; generation: number; room: RoomSnapshot }, now: number) {
    if (key) this.admissions.set(key, { code: result.room.code, id: result.id, token: result.token, generation: result.generation, created: now });
    return result;
  }
  create(profile: Partial<RacerProfile>, now = Date.now(), idempotencyKey?: string) {
    const key = idempotencyKey && 'create:' + idempotencyKey;
    const retry = this.retry(key, now); if (retry) return retry;
    if (this.rooms.size >= 200) throw new RoomError('All rooms are busy. Try again shortly.', 503, 'SERVICE_BUSY');
    let code: string;
    do { code = randomBytes(4).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const room: Room = { code, host: '', phase: 'lobby', round: 0, roundId: null, startAt: 0, deadline: 0, lastTick: now, created: now, players: new Map(), entrants: new Map(), results: null, lastResults: null };
    this.rooms.set(code, room);
    return this.remember(key, this.join(code, profile, now), now);
  }
  room(code: string) {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('This room is no longer available.', 404, 'ROOM_EXPIRED');
    return room;
  }
  join(code: string, profile: Partial<RacerProfile>, now = Date.now(), idempotencyKey?: string) {
    const key = idempotencyKey && 'join:' + code + ':' + idempotencyKey;
    const retry = this.retry(key, now); if (retry) return retry;
    const room = this.room(code);
    this.expirePlayers(room, now);
    if (room.phase !== 'lobby') throw new RoomError(room.phase === 'results' ? 'The group is finishing up. Join when the host opens the next race.' : 'This race has started. Join when the host opens the next race.', 409, room.phase === 'results' ? 'ROOM_RESULTS' : 'RACE_STARTED');
    if (room.players.size >= ROOM_CAPACITY) throw new RoomError('This room has 8 players.', 409, 'ROOM_FULL');
    const id = randomBytes(8).toString('hex'), token = randomBytes(24).toString('hex');
    const normalized = normalizeProfile(profile);
    if (normalized.name === 'Racer') normalized.name = 'Racer ' + (room.players.size + 1);
    const player: Player = {
      id, token, generation: 1, profile: normalized, profileRevision: 0, readyRevision: null,
      ready: false, selectionStatus: 'driver', loadedCourseVersion: null, loadingAt: null,
      connected: true, lastSeen: now, disconnectedAt: null, inputAt: 0,
      input: { ...NEUTRAL }, sequence: -1, recoverAt: 0,
      sim: new DrivingSimulation(obstacles, { exploration: true }), finishTime: null, dnf: false, dnfReason: null,
    };
    room.players.set(id, player); if (!room.host) room.host = id;
    this.transferHost(room);
    return this.remember(key, { id, token, generation: player.generation, room: this.snapshot(room, now) }, now);
  }
  auth(code: string, token: string, generation?: number) {
    const room = this.room(code), player = [...room.players.values()].find(p => p.token === token);
    if (!player) {
      const revoked = this.revoked.get(token);
      throw new RoomError(revoked?.message ?? 'Your room session has expired. Join again.', 401, revoked?.code ?? 'SESSION_EXPIRED');
    }
    if (generation !== undefined && generation !== player.generation) throw new RoomError('This racer is active in another tab.', 409, 'SESSION_TAKEN_OVER');
    return { room, player };
  }
  claim(code: string, token: string, now = Date.now()) {
    const room = this.room(code); this.expirePlayers(room, now);
    const { player } = this.auth(code, token);
    player.generation++; player.sequence = -1; player.input = { ...NEUTRAL };
    if (room.phase === 'lobby') this.unready(player);
    this.touch(code, token, now, player.generation);
    return { id: player.id, generation: player.generation, room: this.snapshot(room, now), serverNow: now };
  }
  touch(code: string, token: string, now = Date.now(), generation?: number) {
    const room = this.room(code); this.expirePlayers(room, now);
    const { player } = this.auth(code, token, generation);
    player.lastSeen = now; player.connected = true; player.disconnectedAt = null;
    this.transferHost(room);
  }
  private unready(player: Player) {
    player.ready = false; player.readyRevision = null;
    if (player.selectionStatus === 'ready') player.selectionStatus = 'car';
  }
  disconnect(code: string, token: string, now = Date.now(), generation?: number) {
    try {
      const { room, player } = this.auth(code, token, generation);
      if (player.connected) player.disconnectedAt = now;
      player.connected = false; player.input = { ...NEUTRAL };
      if (room.phase === 'lobby') this.unready(player);
      this.transferHost(room);
    } catch { /* A retired stream must not disconnect a newer controller. */ }
  }
  private transferHost(room: Room) {
    if (!room.players.get(room.host)?.connected) room.host = [...room.players.values()].find(p => p.connected)?.id ?? room.host;
  }
  private dnf(player: Player, reason: DnfReason) {
    if (player.finishTime !== null || player.dnf) return;
    player.dnf = true; player.dnfReason = reason; player.input = { ...NEUTRAL };
  }
  private removePlayer(room: Room, player: Player, now: number, removed = false) {
    room.players.delete(player.id); player.connected = false; player.input = { ...NEUTRAL };
    this.revoked.set(player.token, { code: removed ? 'REMOVED_FROM_ROOM' : 'SESSION_EXPIRED', message: removed ? 'The host removed you from this room.' : 'Your room session has expired. Join again.', expires: now + ROOM_LIFETIME_MS });
    this.transferHost(room);
  }
  private expirePlayers(room: Room, now: number) {
    for (const p of room.players.values()) {
      if (p.selectionStatus === 'loading' && p.loadingAt !== null && now - p.loadingAt >= 30_000) {
        p.selectionStatus = 'load-failed'; p.loadingAt = null; this.unready(p);
      }
      if (p.connected && now - p.lastSeen > 8000) this.disconnect(room.code, p.token, p.lastSeen, p.generation);
      if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= RECONNECT_GRACE_MS) {
        if (room.entrants.has(p.id)) this.dnf(p, 'disconnected');
        this.removePlayer(room, p, now);
      }
    }
    this.transferHost(room);
  }
  command(code: string, token: string, command: RoomCommand, now = Date.now(), generation?: number) {
    const room = this.room(code); this.expirePlayers(room, now);
    const { player } = this.auth(code, token, generation);
    this.touch(code, token, now, generation);
    if (command.type === 'heartbeat') return;
    if (command.type === 'leave') {
      if (room.entrants.has(player.id)) this.dnf(player, 'left-race');
      this.removePlayer(room, player, now); this.completeRound(room, now);
      if (!room.players.size) this.rooms.delete(code);
      return;
    }
    if (command.type === 'input') {
      if (!Number.isSafeInteger(command.sequence) || command.sequence <= player.sequence) return;
      const i = command.input;
      if (!i || ![i.throttle, i.brake, i.steer].every(Number.isFinite)) throw new RoomError('Invalid driving input.');
      player.sequence = command.sequence; player.inputAt = now;
      player.input = { throttle: Math.max(0, Math.min(1, i.throttle)), brake: Math.max(0, Math.min(1, i.brake)), steer: Math.max(-1, Math.min(1, i.steer)), boost: i.boost === true, drift: i.drift === true };
      return;
    }
    if (command.type === 'profile' || command.type === 'selection' || command.type === 'ready') {
      if (room.phase !== 'lobby') throw new RoomError('Driver choices are locked for this race.', 409, 'RACE_STARTED');
      if (command.type === 'profile') {
        if (!Number.isSafeInteger(command.revision) || command.revision <= player.profileRevision) throw new RoomError('Your selection changed. Confirm the latest choices.', 409, 'PROFILE_CHANGED');
        if (!command.profile || typeof command.profile !== 'object') throw new RoomError('Invalid driver profile.');
        player.profile = normalizeProfile(command.profile); player.profileRevision = command.revision; this.unready(player);
      } else if (command.type === 'selection') {
        if (!['driver', 'car', 'loading', 'load-failed'].includes(command.status)) throw new RoomError('Invalid selection status.');
        this.unready(player);
        if (command.courseVersion !== undefined) player.loadedCourseVersion = command.courseVersion === COURSE_VERSION ? COURSE_VERSION : null;
        if (command.status === 'loading' || command.status === 'load-failed') { this.unready(player); player.loadedCourseVersion = null; }
        player.loadingAt = command.status === 'loading' ? now : null;
        player.selectionStatus = command.status;
      } else if (command.ready) {
        if (command.profileRevision !== player.profileRevision) throw new RoomError('Your selection changed. Confirm the latest choices.', 409, 'PROFILE_CHANGED');
        if (command.courseVersion !== COURSE_VERSION || player.loadedCourseVersion !== COURSE_VERSION) throw new RoomError('The course is still loading. Ready up when it finishes.', 409, 'COURSE_MISMATCH');
        player.ready = true; player.readyRevision = player.profileRevision; player.selectionStatus = 'ready';
      } else this.unready(player);
      return;
    }
    if (command.type === 'remove') {
      if (room.host !== player.id) throw new RoomError('Only the host can remove a player.', 403);
      if (room.phase !== 'lobby') throw new RoomError('Players can only be removed before the race.', 409);
      if (command.playerId === player.id) throw new RoomError('Use Leave room to leave your own room.');
      const target = room.players.get(command.playerId);
      if (!target) throw new RoomError('This player has already left.', 404);
      this.removePlayer(room, target, now, true); return;
    }
    if (command.type === 'start') {
      if (room.host !== player.id) throw new RoomError('Only the host can start the race.', 403);
      if (room.phase !== 'lobby' || room.players.size < 2 || [...room.players.values()].some(p => !p.ready || !p.connected || p.readyRevision !== p.profileRevision || p.loadedCourseVersion !== COURSE_VERSION)) throw new RoomError('At least two connected racers must be ready, with the course loaded.', 409, 'START_BLOCKED');
      room.phase = 'countdown'; room.startAt = now + 5000; room.lastTick = room.startAt; room.deadline = room.startAt + 300000; room.round++;
      room.roundId = room.code + ':' + room.round; room.results = null; room.entrants.clear();
      [...room.players.values()].forEach((p, index) => {
        p.sim.reset(); p.sim.seek(START_PROGRESS - Math.floor(index / 3) * 5, [-3, 0, 3][index % 3]);
        p.finishTime = null; p.dnf = false; p.dnfReason = null; p.input = { ...NEUTRAL };
        room.entrants.set(p.id, { player: p, profile: { ...p.profile }, profileRevision: p.profileRevision, order: index });
      });
    } else if (command.type === 'recover') {
      if (room.phase === 'racing' && !player.dnf && player.finishTime === null && now - player.recoverAt >= 1000) { player.sim.recover(); player.recoverAt = now; }
    } else if (command.type === 'rematch') {
      if (room.host !== player.id) throw new RoomError('Only the host can open the next race.', 403);
      if (room.phase !== 'results') throw new RoomError('Wait for the race to finish.', 409);
      room.phase = 'lobby'; room.results = null; room.entrants.clear();
      for (const p of room.players.values()) { this.unready(p); p.finishTime = null; p.dnf = false; p.dnfReason = null; }
    } else throw new RoomError('Unknown room action.');
  }
  private orderedEntrants(room: Room) {
    return [...room.entrants.values()].sort((a, b) => {
      const x = a.player, y = b.player;
      if (x.finishTime !== null || y.finishTime !== null) return (x.finishTime ?? Infinity) - (y.finishTime ?? Infinity) || a.order - b.order;
      return Number(x.dnf) - Number(y.dnf) || y.sim.state.checkpoint - x.sim.state.checkpoint || y.sim.state.progress - x.sim.state.progress || a.order - b.order;
    });
  }
  private completeRound(room: Room, now: number) {
    if ((room.phase !== 'racing' && room.phase !== 'countdown') || !room.entrants.size || [...room.entrants.values()].some(({ player }) => player.finishTime === null && !player.dnf)) return;
    const entrants = this.orderedEntrants(room), winnerTime = entrants.find(e => e.player.finishTime !== null)?.player.finishTime ?? null;
    let lastTime: number | null = null, lastPlace = 0;
    const entries = entrants.map(({ player: p, profile }, index) => {
      const place = p.finishTime === null ? null : p.finishTime === lastTime ? lastPlace : index + 1;
      if (p.finishTime !== null) { lastTime = p.finishTime; lastPlace = place!; }
      return { id: p.id, profile: { ...profile }, place, finishTime: p.finishTime, gap: p.finishTime !== null && winnerTime !== null ? preciseTime(p.finishTime - winnerTime) : null, tied: p.finishTime !== null && entrants.filter(e => e.player.finishTime === p.finishTime).length > 1, dnfReason: p.dnfReason, checkpoint: p.sim.state.checkpoint, progress: p.sim.state.progress };
    });
    room.phase = 'results';
    room.results = { roundId: room.roundId!, round: room.round, courseVersion: COURSE_VERSION, completedAt: now, entries };
    room.lastResults = structuredClone(room.results);
  }
  tick(now = Date.now()) {
    for (const room of this.rooms.values()) {
      this.expirePlayers(room, now);
      if (now - room.created > ROOM_LIFETIME_MS) { this.rooms.delete(room.code); continue; }
      if (room.phase === 'countdown' && now >= room.startAt) room.phase = 'racing';
      if (room.phase === 'racing') {
        const end = Math.min(now, room.deadline), segmentStart = Math.max(room.lastTick, end - 250, room.startAt);
        const dt = Math.max(0, (end - segmentStart) / 1000); room.lastTick = now;
        for (const { player: p } of room.entrants.values()) {
          if (p.finishTime !== null || p.dnf) continue;
          // Simulation elapsed stops at the finish crossing inside its fixed step.
          // Preserve that sub-step time instead of replacing it with the snapshot time.
          p.sim.state.elapsed = (segmentStart - room.startAt) / 1000;
          p.sim.update(dt, p.connected && now - p.inputAt < 500 ? p.input : NEUTRAL);
          if (p.sim.state.finished) {
            p.finishTime = preciseTime(p.sim.state.elapsed); p.sim.state.elapsed = p.finishTime;
            room.deadline = Math.min(room.deadline, room.startAt + p.finishTime * 1000 + 60000);
          } else {
            p.sim.state.elapsed = Math.max(0, (end - room.startAt) / 1000);
            if (now >= room.deadline) this.dnf(p, 'time-limit');
          }
        }
      }
      this.completeRound(room, now);
      if (!room.players.size) this.rooms.delete(room.code);
    }
    for (const [key, value] of this.admissions) if (now - value.created > ROOM_LIFETIME_MS) this.admissions.delete(key);
    for (const [token, value] of this.revoked) if (value.expires < now) this.revoked.delete(token);
  }
  private playerSnapshot(p: Player, rank: number | null, profile = p.profile, revision = p.profileRevision): RacerSnapshot {
    return { id: p.id, profile: { ...profile }, profileRevision: revision, readyRevision: p.readyRevision, ready: p.ready, connected: p.connected, reconnectUntil: !p.connected && p.disconnectedAt !== null ? p.disconnectedAt + RECONNECT_GRACE_MS : null, selectionStatus: p.selectionStatus, loadedCourseVersion: p.loadedCourseVersion, state: { ...p.sim.state }, position: p.sim.position, exploring: p.sim.exploring, finishTime: p.finishTime, dnf: p.dnf, dnfReason: p.dnfReason, rank };
  }
  snapshot(room: Room, now = Date.now()): RoomSnapshot {
    const ordered = this.orderedEntrants(room), ranks = new Map<string, number | null>();
    let previousTime: number | null = null, previousRank = 0;
    const entrants = ordered.map((e, index) => {
      const p = e.player;
      const rank = p.dnf ? null : p.finishTime !== null && p.finishTime === previousTime ? previousRank : index + 1;
      if (p.finishTime !== null) { previousTime = p.finishTime; previousRank = rank!; }
      ranks.set(p.id, rank); return this.playerSnapshot(p, rank, e.profile, e.profileRevision);
    });
    return { code: room.code, host: room.host, phase: room.phase, round: room.round, roundId: room.roundId, courseVersion: COURSE_VERSION, startAt: room.startAt, deadline: room.deadline, serverNow: now, players: [...room.players.values()].map(p => this.playerSnapshot(p, ranks.get(p.id) ?? null)), entrants, results: room.results ? structuredClone(room.results) : null, lastResults: room.lastResults ? structuredClone(room.lastResults) : null };
  }
}

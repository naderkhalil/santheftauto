import { DrivingSimulation, type DriveInput, type DrivingCheckpoint } from '../src/driving.ts';
import { CHECKPOINTS, TRACK_LENGTH, routeProgressAt, START_PROGRESS } from '../src/route.ts';
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
const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
type SavedPlayer = Omit<Player, 'sim'> & { sim: DrivingCheckpoint };
type SavedRoom = Omit<Room, 'players' | 'entrants'> & {
  players: SavedPlayer[]; memberIds: string[];
  entrants: { playerId: string; profile: RacerProfile; profileRevision: number; order: number }[];
};
export type RoomServiceState = {
  version: 1; courseVersion: string; savedAt: number; draining: boolean;
  rooms: SavedRoom[]; admissions: [string, Admission][];
  revoked: [string, { code: string; message: string; expires: number }][];
};
export type LiveRoomSession = { token: string; generation: number };

function invalidState(): never { throw new Error('Invalid room checkpoint.'); }
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalidState();
}
function array(value: unknown, maximum: number): unknown[] {
  return Array.isArray(value) && value.length <= maximum ? value : invalidState();
}
function text(value: unknown, maximum = 512): string { return typeof value === 'string' && value.length <= maximum ? value : invalidState(); }
function finite(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : invalidState();
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const result = finite(value, minimum, maximum); return Number.isSafeInteger(result) ? result : invalidState();
}
function boolean(value: unknown): boolean { return typeof value === 'boolean' ? value : invalidState(); }
function optionalNumber(value: unknown): number | null { return value === null ? null : finite(value); }
function choice<T extends string>(value: unknown, options: readonly T[]): T { return options.includes(value as T) ? value as T : invalidState(); }
function hex(value: unknown, length: number): string {
  const result = text(value, length); return new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(result) ? result : invalidState();
}
function profile(value: unknown): RacerProfile {
  const source = record(value);
  return normalizeProfile({ name: text(source.name, 128), driver: text(source.driver, 64), car: text(source.car, 64), sponsor: text(source.sponsor, 64) } as RacerProfile);
}
function dnfReason(value: unknown): DnfReason | null { return value === null ? null : choice<DnfReason>(value, ['time-limit', 'disconnected', 'left-race']); }
function result(value: unknown): RoundResult | null {
  if (value === null) return null;
  const source = record(value), roundId = text(source.roundId, 64);
  if (!roundId || source.courseVersion !== COURSE_VERSION) invalidState();
  const entries = array(source.entries, ROOM_CAPACITY).map(value => {
    const entry = record(value);
    return { id: hex(entry.id, 16), profile: profile(entry.profile), place: entry.place === null ? null : integer(entry.place, 1, ROOM_CAPACITY),
      finishTime: optionalNumber(entry.finishTime), gap: optionalNumber(entry.gap), tied: boolean(entry.tied), dnfReason: dnfReason(entry.dnfReason),
      checkpoint: integer(entry.checkpoint, 0, CHECKPOINTS.length), progress: finite(entry.progress, 0, TRACK_LENGTH) };
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) invalidState();
  return { roundId, round: integer(source.round, 1), courseVersion: COURSE_VERSION, completedAt: finite(source.completedAt), entries };
}

export class RoomError extends Error {
  status: number; code: string;
  admitted?: boolean;
  constructor(message: string, status = 400, code = 'INVALID_ACTION') { super(message); this.status = status; this.code = code; }
}

export class RoomService {
  rooms = new Map<string, Room>();
  private admissions = new Map<string, Admission>();
  private revoked = new Map<string, { code: string; message: string; expires: number }>();
  private draining = false;
  private overloaded = false;
  readonly workerId: string | null;
  readonly fixedRoomCode: string | null;
  readonly capacity: number;
  readonly playerCapacity: number;

  constructor(options: { workerId?: string; fixedRoomCode?: string; maxRooms?: number; maxPlayers?: number } = {}) {
    if (options.workerId !== undefined && !/^[A-F0-9]{2}$/.test(options.workerId)) throw new Error('Worker ID must be two uppercase hex characters.');
    if (options.fixedRoomCode !== undefined && (!/^[A-F0-9]{8}$/.test(options.fixedRoomCode) || (options.workerId && !options.fixedRoomCode.startsWith(options.workerId)))) throw new Error('Fixed room code must be eight uppercase hex characters matching its worker.');
    this.workerId = options.workerId ?? null;
    this.fixedRoomCode = options.fixedRoomCode ?? null;
    this.capacity = options.maxRooms ?? (this.fixedRoomCode ? 1 : 32);
    this.playerCapacity = options.maxPlayers ?? this.capacity * ROOM_CAPACITY;
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || !Number.isSafeInteger(this.playerCapacity) || this.playerCapacity < 2) throw new Error('Room and player capacities must be positive integers.');
  }
  setDraining(value = true) { this.draining = value; }
  setOverloaded(value: boolean) { this.overloaded = value; }
  /** Contains private session credentials. Store server-side, never send to clients. */
  exportState(now = Date.now()): RoomServiceState {
    finite(now);
    return {
      version: 1, courseVersion: COURSE_VERSION, savedAt: now, draining: this.draining,
      rooms: [...this.rooms.values()].map(room => {
        const allPlayers = new Map(room.players);
        for (const entrant of room.entrants.values()) allPlayers.set(entrant.player.id, entrant.player);
        return { ...room, players: [...allPlayers.values()].map(player => ({ ...player, profile: { ...player.profile }, input: { ...player.input }, sim: player.sim.exportState() })),
          memberIds: [...room.players.keys()], entrants: [...room.entrants.values()].map(entrant => ({ playerId: entrant.player.id, profile: { ...entrant.profile }, profileRevision: entrant.profileRevision, order: entrant.order })),
          results: structuredClone(room.results), lastResults: structuredClone(room.lastResults) };
      }),
      admissions: [...this.admissions].map(([key, value]) => [key, { ...value }]),
      revoked: [...this.revoked].map(([key, value]) => [key, { ...value }]),
    };
  }
  /**
   * Resume the last persisted physics checkpoint, preserving wall-clock race deadlines.
   * No offline simulation runs. Controls are neutral, and only retained live duplex
   * sessions preserve readiness. Other clients use their original reconnect grace.
   */
  restoreState(value: unknown, now = Date.now(), liveSessions: readonly LiveRoomSession[] = []): void {
    finite(now);
    const source = record(value);
    if (source.version !== 1 || source.courseVersion !== COURSE_VERSION) invalidState();
    const savedAt = finite(source.savedAt), draining = boolean(source.draining);
    const live = new Map(liveSessions.map(session => [hex(session.token, 48), integer(session.generation, 1)]));
    const rooms = new Map<string, Room>(), tokens = new Set<string>();
    for (const value of array(source.rooms, this.fixedRoomCode ? 1 : 10000)) {
      const saved = record(value), code = hex(saved.code, 8);
      if (code !== code.toUpperCase() || (this.fixedRoomCode && code !== this.fixedRoomCode) || (this.workerId && !code.startsWith(this.workerId)) || rooms.has(code)) invalidState();
      const allPlayers = new Map<string, Player>();
      for (const value of array(saved.players, ROOM_CAPACITY * 2)) {
        const p = record(value), id = hex(p.id, 16), token = hex(p.token, 48);
        if (allPlayers.has(id) || tokens.has(token)) invalidState();
        tokens.add(token);
        const sim = new DrivingSimulation(obstacles, { exploration: true }); sim.restoreState(p.sim);
        const input = record(p.input);
        finite(input.throttle, 0, 1); finite(input.brake, 0, 1); finite(input.steer, -1, 1); boolean(input.drift); boolean(input.boost);
        const loadedCourseVersion = p.loadedCourseVersion === null ? null : text(p.loadedCourseVersion, 128);
        const player: Player = { id, token, generation: integer(p.generation, 1), profile: profile(p.profile),
          profileRevision: integer(p.profileRevision), readyRevision: p.readyRevision === null ? null : integer(p.readyRevision), ready: boolean(p.ready),
          selectionStatus: choice(p.selectionStatus, ['driver', 'car', 'loading', 'load-failed', 'ready']), loadedCourseVersion, loadingAt: optionalNumber(p.loadingAt),
          connected: boolean(p.connected), lastSeen: finite(p.lastSeen), disconnectedAt: optionalNumber(p.disconnectedAt),
          inputAt: 0, input: { ...NEUTRAL }, sequence: integer(p.sequence, -1), recoverAt: finite(p.recoverAt),
          sim, finishTime: optionalNumber(p.finishTime), dnf: boolean(p.dnf), dnfReason: dnfReason(p.dnfReason) };
        if (player.ready && (player.readyRevision !== player.profileRevision || player.selectionStatus !== 'ready' || player.loadedCourseVersion !== COURSE_VERSION)) invalidState();
        if ((player.dnf && player.dnfReason === null) || (!player.dnf && player.dnfReason !== null) || (player.dnf && player.finishTime !== null)) invalidState();
        allPlayers.set(id, player);
      }
      const members = array(saved.memberIds, ROOM_CAPACITY).map(value => hex(value, 16));
      if (new Set(members).size !== members.length || members.some(id => !allPlayers.has(id))) invalidState();
      const entrants = new Map<string, Entrant>(), orders = new Set<number>();
      for (const value of array(saved.entrants, ROOM_CAPACITY)) {
        const e = record(value), id = hex(e.playerId, 16), player = allPlayers.get(id), order = integer(e.order, 0, ROOM_CAPACITY - 1);
        if (!player || entrants.has(id) || orders.has(order)) invalidState();
        entrants.set(id, { player: player!, profile: profile(e.profile), profileRevision: integer(e.profileRevision), order }); orders.add(order);
      }
      if ([...allPlayers.keys()].some(id => !members.includes(id) && !entrants.has(id))) invalidState();
      const room: Room = { code, host: hex(saved.host, 16), phase: choice(saved.phase, ['lobby', 'countdown', 'racing', 'results']),
        round: integer(saved.round), roundId: saved.roundId === null ? null : text(saved.roundId, 64),
        startAt: finite(saved.startAt), deadline: finite(saved.deadline), lastTick: finite(saved.lastTick), created: finite(saved.created),
        players: new Map(members.map(id => [id, allPlayers.get(id)!])), entrants, results: result(saved.results), lastResults: result(saved.lastResults) };
      if (room.phase !== 'lobby' && (!room.roundId || room.round < 1 || !room.entrants.size || room.deadline < room.startAt || room.deadline > room.startAt + 300000)) invalidState();
      if ((room.phase === 'results') !== (room.results !== null)) invalidState();
      if (room.results && (room.results.round !== room.round || room.results.roundId !== room.roundId)) invalidState();
      for (const player of allPlayers.values()) {
        if (room.players.has(player.id) && live.get(player.token) === player.generation) {
          player.connected = true; player.lastSeen = now; player.disconnectedAt = null;
        } else {
          if (player.connected || player.disconnectedAt === null) player.disconnectedAt = Math.min(now, savedAt, player.lastSeen);
          player.connected = false;
          if (room.phase === 'lobby') this.unready(player);
        }
      }
      // The next ordinary tick applies elapsed/deadline logic with zero catch-up.
      room.lastTick = room.phase === 'countdown' || room.phase === 'racing' ? Math.max(room.startAt, Math.min(now, room.deadline)) : now;
      rooms.set(code, room);
    }
    const admissions = new Map<string, Admission>();
    for (const value of array(source.admissions, 160000)) {
      const pair = array(value, 2); if (pair.length !== 2) invalidState();
      const key = text(pair[0], 256), admission = record(pair[1]);
      if (!/^(create:|join:)/.test(key) || admissions.has(key)) invalidState();
      admissions.set(key, { code: hex(admission.code, 8), id: hex(admission.id, 16), token: hex(admission.token, 48), generation: integer(admission.generation, 1), created: finite(admission.created) });
    }
    const revoked = new Map<string, { code: string; message: string; expires: number }>();
    for (const value of array(source.revoked, 160000)) {
      const pair = array(value, 2); if (pair.length !== 2) invalidState();
      const token = hex(pair[0], 48), entry = record(pair[1]); if (revoked.has(token)) invalidState();
      revoked.set(token, { code: choice(entry.code, ['REMOVED_FROM_ROOM', 'SESSION_EXPIRED']), message: text(entry.message), expires: finite(entry.expires) });
    }
    // Commit only after the entire checkpoint passes validation.
    this.rooms = rooms; this.admissions = admissions; this.revoked = revoked; this.draining = draining; this.overloaded = false;
    for (const room of this.rooms.values()) {
      if (now - room.created > ROOM_LIFETIME_MS) { this.rooms.delete(room.code); continue; }
      this.expirePlayers(room, now);
      if (!room.players.size) this.rooms.delete(room.code);
    }
    for (const [key, admission] of this.admissions) if (now - admission.created > ROOM_LIFETIME_MS) this.admissions.delete(key);
    for (const [token, entry] of this.revoked) if (entry.expires < now) this.revoked.delete(token);
  }
  getHealth() {
    let activePlayers = 0, activeRaces = 0;
    for (const room of this.rooms.values()) {
      activePlayers += room.players.size;
      if (room.phase === 'racing' || room.phase === 'countdown') activeRaces++;
    }
    const availableSlots = Math.max(0, Math.min(this.capacity - this.rooms.size, this.playerCapacity - activePlayers));
    return { workerId: this.workerId, accepting: !this.draining && !this.overloaded && availableSlots > 0, activeRooms: this.rooms.size, activePlayers, activeRaces, capacity: this.capacity, playerCapacity: this.playerCapacity, availableSlots, draining: this.draining, overloaded: this.overloaded };
  }
  private rejectAdmission(code: string, message: string): never {
    const error = new RoomError(message, 503, code); error.admitted = false; throw error;
  }
  private checkAdmission(newRoom: boolean) {
    const health = this.getHealth();
    if (this.draining) this.rejectAdmission('SERVER_DRAINING', 'This race server is updating. Please create a new room in a moment.');
    if (this.overloaded) this.rejectAdmission('SERVICE_BUSY', 'Multiplayer is busy. Please try again shortly, or enjoy a single-player race.');
    if ((newRoom && health.availableSlots < 1) || health.activePlayers >= this.playerCapacity) this.rejectAdmission('ROOM_CAPACITY', 'All race slots are busy. Please try again shortly, or enjoy a single-player race.');
  }

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
    if (this.fixedRoomCode && this.rooms.has(this.fixedRoomCode)) {
      const error = new RoomError('This room already exists.', 409, 'ROOM_EXISTS'); error.admitted = false; throw error;
    }
    this.checkAdmission(true);
    let code: string;
    do { code = this.fixedRoomCode ?? (this.workerId ?? '') + randomHex(this.workerId ? 3 : 4).toUpperCase(); } while (this.rooms.has(code));
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
    this.checkAdmission(false);
    const room = this.room(code);
    this.expirePlayers(room, now);
    if (room.phase !== 'lobby') throw new RoomError(room.phase === 'results' ? 'The group is finishing up. Join when the host opens the next race.' : 'This race has started. Join when the host opens the next race.', 409, room.phase === 'results' ? 'ROOM_RESULTS' : 'RACE_STARTED');
    if (room.players.size >= ROOM_CAPACITY) throw new RoomError('This room has 8 players.', 409, 'ROOM_FULL');
    const id = randomHex(8), token = randomHex(24);
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
      if (this.draining) throw new RoomError('This race server is updating. Please leave and create a new room.', 503, 'SERVER_DRAINING');
      if (room.phase !== 'lobby' || room.players.size < 2 || [...room.players.values()].some(p => !p.ready || !p.connected || p.readyRevision !== p.profileRevision || p.loadedCourseVersion !== COURSE_VERSION)) throw new RoomError('At least two connected racers must be ready, with the course loaded.', 409, 'START_BLOCKED');
      room.phase = 'countdown'; room.startAt = now + 5000; room.lastTick = room.startAt; room.deadline = room.startAt + 300000; room.round++;
      // Round IDs can be used in analytics without revealing private invitations.
      room.roundId = crypto.randomUUID(); room.results = null; room.entrants.clear();
      [...room.players.values()].forEach((p, index) => {
        p.sim.reset(); p.sim.seek(START_PROGRESS - Math.floor(index / 3) * 5, [-3, 0, 3][index % 3]);
        p.finishTime = null; p.dnf = false; p.dnfReason = null; p.input = { ...NEUTRAL };
        room.entrants.set(p.id, { player: p, profile: { ...p.profile }, profileRevision: p.profileRevision, order: index });
      });
    } else if (command.type === 'recover') {
      if (room.phase === 'racing' && !player.dnf && player.finishTime === null && now - player.recoverAt >= 1000) {
        // Complete movement before the recovery so its new pose has a fresh
        // physics timestamp and the next tick cannot replay pre-recovery time.
        this.tick(now);
        const current = this.auth(code, token, generation);
        if (current.room.phase === 'racing' && !current.player.dnf && current.player.finishTime === null) {
          current.player.sim.recover(); current.player.recoverAt = now;
        }
      }
    } else if (command.type === 'rematch') {
      if (room.host !== player.id) throw new RoomError('Only the host can open the next race.', 403);
      if (this.draining) throw new RoomError('This race server is updating. Please leave and create a new room.', 503, 'SERVER_DRAINING');
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
    return { code: room.code, host: room.host, phase: room.phase, round: room.round, roundId: room.roundId, courseVersion: COURSE_VERSION, startAt: room.startAt, deadline: room.deadline, serverNow: now,
      ...((room.phase === 'racing' || room.phase === 'results') ? { simulationAt: Math.min(room.lastTick, room.deadline) } : {}),
      players: [...room.players.values()].map(p => this.playerSnapshot(p, ranks.get(p.id) ?? null)), entrants, results: room.results ? structuredClone(room.results) : null, lastResults: room.lastResults ? structuredClone(room.lastResults) : null };
  }
}

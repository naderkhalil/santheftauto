import type { RacerProfile } from './racer-profile.ts';
import type { RoomSnapshot } from './multiplayer-protocol.ts';

export type GameEvent = 'game_started' | 'game_finished' | 'game_dnf';
type Capture = (event: GameEvent, properties: Record<string, unknown>) => void;
type EventStorage = Pick<Storage, 'getItem' | 'setItem'>;
type Participant = { player_id: string; player_name: string };
type Game = { id: string; mode: 'solo' | 'multiplayer'; playerId: string; participants: Participant[] };
type Options = { storage?: EventStorage | null; createId?: () => string };

const STORAGE_KEY = 'sf-game-analytics-events-v1';
const MAX_EVENTS = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function browserStorage(): EventStorage | null {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function createGameId(): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    globalThis.crypto?.getRandomValues(bytes);
  } catch { /* IDs still work when crypto is unavailable or restricted. */ }
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Each browser reports its own racer, using the authoritative lineup for friends. */
export class GameAnalytics {
  private readonly capture: Capture;
  private readonly storage: EventStorage | null;
  private readonly createId: () => string;
  private readonly events = new Set<string>();
  private solo: Game | null = null;

  constructor(capture: Capture, options: Options = {}) {
    this.capture = capture;
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.createId = options.createId ?? createGameId;
    try {
      const saved: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '[]');
      if (Array.isArray(saved)) for (const key of saved.slice(-MAX_EVENTS)) {
        if (typeof key === 'string' && key.length <= 256) this.events.add(key);
      }
    } catch { /* Storage is optional; in-memory deduplication still works. */ }
  }

  startSolo(profile: RacerProfile): void {
    const id = this.createId();
    this.solo = { id, mode: 'solo', playerId: id, participants: [{ player_id: id, player_name: profile.name }] };
    this.emit('game_started', this.solo);
  }

  finishSolo(finishSeconds: number): void {
    if (!this.solo || !Number.isFinite(finishSeconds) || finishSeconds < 0) return;
    this.emit('game_finished', this.solo, { finish_seconds: finishSeconds });
  }

  clearSolo(): void { this.solo = null; }

  observeMultiplayer(room: RoomSnapshot, playerId: string): void {
    // Old servers embed the private invitation code in roundId. Skip those rounds.
    if (!room.roundId || !UUID.test(room.roundId)) return;
    const own = room.entrants.find(entrant => entrant.id === playerId);
    if (!own) return;
    const participants = room.entrants.map(entrant => ({ player_id: entrant.id, player_name: entrant.profile.name }))
      .sort((left, right) => left.player_id < right.player_id ? -1 : left.player_id > right.player_id ? 1 : 0);
    const game: Game = { id: room.roundId, mode: 'multiplayer', playerId, participants };
    const terminal = own.dnf || own.finishTime !== null;
    if ((room.phase === 'countdown' || room.phase === 'racing') && !terminal) this.emit('game_started', game);
    if (room.phase !== 'racing' && room.phase !== 'results') return;
    if (own.dnf) this.emit('game_dnf', game, { dnf_reason: own.dnfReason });
    else if (own.finishTime !== null && Number.isFinite(own.finishTime) && own.finishTime >= 0) {
      this.emit('game_finished', game, { finish_seconds: own.finishTime });
    }
  }

  private emit(event: GameEvent, game: Game, extra: Record<string, unknown> = {}): void {
    const key = `${event}:${game.id}:${game.playerId}`;
    if (this.events.has(key)) return;
    const own = game.participants.find(participant => participant.player_id === game.playerId);
    if (!own) return;
    const properties = {
      game_id: game.id,
      mode: game.mode,
      course: 'city-loop',
      player_id: game.playerId,
      player_name: own.player_name,
      player_count: game.participants.length,
      friends_count: game.participants.length - 1,
      participant_names: game.participants.map(participant => participant.player_name),
      friend_names: game.participants.filter(participant => participant.player_id !== game.playerId).map(participant => participant.player_name),
      participants: game.participants.map(participant => ({ ...participant })),
      ...extra,
    };
    try { this.capture(event, properties); } catch { return; }
    this.events.add(key);
    while (this.events.size > MAX_EVENTS) this.events.delete(this.events.values().next().value!);
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.events])); } catch { /* Never prevent play. */ }
  }
}

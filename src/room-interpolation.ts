import type { RacerSnapshot, RoomSnapshot } from './multiplayer-protocol.ts';

type Frame = { at: number; receivedAt: number; players: Map<string, RacerSnapshot> };
type Options = { delayMs?: number; maxFrames?: number; resetAfterMs?: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const copy = (player: RacerSnapshot): RacerSnapshot => ({ ...player, profile: { ...player.profile }, state: { ...player.state }, position: { ...player.position } });
const renderFields = ['progress', 'lateral', 'speed', 'surfacePitch', 'surfaceRoll', 'driftAngle', 'y', 'verticalVelocity', 'glide', 'altitude'] as const;

function teleported(previous: RacerSnapshot, next: RacerSnapshot, elapsedMs: number) {
  const distance = Math.hypot(next.position.x - previous.position.x, next.position.y - previous.position.y, next.position.z - previous.position.z);
  const expected = Math.max(Math.abs(previous.state.speed), Math.abs(next.state.speed)) * Math.max(0, elapsedMs) / 1000;
  return distance > Math.max(12, expected * 2 + 3)
    || distance > 3 && Math.abs(next.state.speed) < .1 && next.state.progress < previous.state.progress - 6;
}

/** A bounded render timeline. It never predicts physics or changes race outcomes. */
export class RacerSnapshotBuffer {
  private frames: Frame[] = [];
  private latest = new Map<string, RacerSnapshot>();
  private cuts = new Map<string, number>();
  private scope = '';
  private playbackAt: number | null = null;
  private sampledAt: number | null = null;
  private delayMs: number;
  private maxFrames: number;
  private resetAfterMs: number;

  constructor(options: Options = {}) {
    this.delayMs = clamp(options.delayMs ?? 100, 0, 250);
    this.maxFrames = Math.max(2, Math.min(128, Math.floor(options.maxFrames ?? 32)));
    this.resetAfterMs = Math.max(500, options.resetAfterMs ?? 1000);
  }

  get size() { return this.frames.length; }

  reset() {
    this.frames = []; this.latest.clear(); this.cuts.clear(); this.scope = '';
    this.playbackAt = this.sampledAt = null;
  }

  push(room: RoomSnapshot, receivedAt: number): void {
    const at = room.simulationAt ?? room.serverNow;
    if (!Number.isFinite(at) || !Number.isFinite(receivedAt)) return;
    const scope = `${room.code}:${room.roundId ?? room.round}`;
    if (scope !== this.scope || !room.entrants.length) { this.reset(); this.scope = scope; }
    if (!room.entrants.length) return;
    let previous = this.frames.at(-1);
    if (previous && at < previous.at) return;
    const players = new Map(room.entrants.map(player => [player.id, copy(player)]));
    this.latest = players;
    if (previous && at > previous.at && (receivedAt - previous.receivedAt > this.resetAfterMs || at - previous.at > this.resetAfterMs)) {
      this.frames = []; this.cuts.clear(); this.playbackAt = this.sampledAt = null; previous = undefined;
    }
    if (previous) for (const [id, player] of players) {
      const before = previous.players.get(id);
      if (before && teleported(before, player, at - previous.at)) this.cuts.set(id, at);
    }
    if (previous?.at === at) {
      // Heartbeats/metadata must not move the physics clock or fill the buffer.
      // A same-step recovery still replaces its pose and can create a cut.
      previous.players = players;
      return;
    }
    this.frames.push({ at, receivedAt, players });
    if (this.frames.length > this.maxFrames) this.frames.splice(0, this.frames.length - this.maxFrames);
    for (const [id, cut] of this.cuts) if (!players.has(id) || cut < this.frames[0].at) this.cuts.delete(id);
  }

  sample(now: number): RacerSnapshot[] {
    const first = this.frames[0], last = this.frames.at(-1);
    if (!first || !last || !Number.isFinite(now)) return [];
    // The lowest recent transit time rejects jitter without coupling playback to
    // HTTP clock estimates. Slew by at most 10% so a better packet cannot jump it.
    const offset = Math.min(...this.frames.map(frame => frame.receivedAt - frame.at));
    const target = now - offset - this.delayMs;
    const elapsed = this.sampledAt === null ? 0 : Math.max(0, now - this.sampledAt);
    if (this.playbackAt === null) this.playbackAt = target;
    else if (elapsed > this.resetAfterMs || target - this.playbackAt > this.resetAfterMs) this.playbackAt = Math.max(this.playbackAt, target);
    else {
      const normal = this.playbackAt + elapsed;
      this.playbackAt = Math.max(this.playbackAt, normal + clamp(target - normal, -elapsed * .1, elapsed * .1));
    }
    this.playbackAt = clamp(this.playbackAt, first.at, last.at);
    this.sampledAt = now;
    return [...this.latest.values()].map(latest => this.samplePlayer(latest, this.playbackAt!));
  }

  private samplePlayer(latest: RacerSnapshot, at: number): RacerSnapshot {
    // Results and counters always come from the newest authoritative update.
    if (latest.finishTime !== null || latest.dnf) return copy(latest);
    at = Math.max(at, this.cuts.get(latest.id) ?? -Infinity);
    let before: Frame | undefined, after: Frame | undefined;
    for (const frame of this.frames) {
      if (!frame.players.has(latest.id)) continue;
      if (frame.at <= at) before = frame;
      if (frame.at >= at) { after = frame; break; }
    }
    before ??= after; after ??= before;
    if (!before || !after) return copy(latest);
    const a = before.players.get(latest.id)!, b = after.players.get(latest.id)!;
    const alpha = before.at === after.at ? 0 : clamp((at - before.at) / (after.at - before.at), 0, 1);
    const result = copy(latest), mix = (a: number, b: number) => a + (b - a) * alpha;
    for (const key of renderFields) result.state[key] = mix(a.state[key], b.state[key]);
    result.state.heading = a.state.heading + Math.atan2(Math.sin(b.state.heading - a.state.heading), Math.cos(b.state.heading - a.state.heading)) * alpha;
    result.position = { x: mix(a.position.x, b.position.x), y: mix(a.position.y, b.position.y), z: mix(a.position.z, b.position.z) };
    // Both representations share one interpolated height at road/plaza handoffs.
    result.state.y = result.position.y;
    return result;
  }
}

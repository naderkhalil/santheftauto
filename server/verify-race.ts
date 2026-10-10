import { DrivingSimulation } from '../src/driving.ts';
import { MAX_REPLAY_FRAMES, MAX_REPLAY_SECONDS } from '../src/leaderboard-protocol.ts';
import type { ReplayFrame } from '../src/leaderboard-protocol.ts';
import { CITY_LOOP_OBSTACLES, RaceCollectibles } from '../src/race-replay.ts';
import { CHECKPOINTS } from '../src/route.ts';

const invalid = (): never => { throw new Error('The race replay could not be verified.'); };

/** Reconstruct the run from controls; no submitted time, pose, or checkpoint is trusted. */
export function verifySoloReplay(frames: unknown): { timeMs: number } {
  if (!Array.isArray(frames) || !frames.length || frames.length > MAX_REPLAY_FRAMES) return invalid();
  let duration = 0, recoveries = 0;
  // Validate the complete workload before spending any time on physics.
  for (const frame of frames) {
    if (!Array.isArray(frame) || frame.length !== 5 || !frame.every(value => typeof value === 'number' && Number.isFinite(value))) return invalid();
    const [dt, throttle, brake, steer, flags] = frame;
    if (flags === 4) {
      if (dt !== 0 || throttle !== 0 || brake !== 0 || steer !== 0 || ++recoveries > 600) return invalid();
    } else {
      if (dt <= 0 || dt > .25 || throttle < 0 || throttle > 1 || brake < 0 || brake > 1 || steer < -1 || steer > 1 || !Number.isInteger(flags) || flags < 0 || flags > 3) return invalid();
      duration += dt;
      if (duration > MAX_REPLAY_SECONDS + 1e-7) return invalid();
    }
  }
  const sim = new DrivingSimulation(CITY_LOOP_OBSTACLES, { exploration: true });
  const collectibles = new RaceCollectibles();
  for (const [dt, throttle, brake, steer, flags] of frames as ReplayFrame[]) {
    if (sim.state.finished) return invalid();
    if (flags === 4) sim.recover();
    else {
      sim.update(dt, { throttle, brake, steer, drift: !!(flags & 1), boost: !!(flags & 2) });
      collectibles.update(sim);
      sim.drainPropImpacts();
    }
  }
  if (!sim.state.finished || sim.state.checkpoint !== CHECKPOINTS.length || !Number.isFinite(sim.state.elapsed) || sim.state.elapsed <= 0) return invalid();
  return { timeMs: Math.round(sim.state.elapsed * 1000) };
}

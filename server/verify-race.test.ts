import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingSimulation } from '../src/driving.ts';
import { DemoAutopilot } from '../src/autopilot.ts';
import { MAX_REPLAY_FRAMES } from '../src/leaderboard-protocol.ts';
import type { ReplayFrame } from '../src/leaderboard-protocol.ts';
import { CITY_LOOP_OBSTACLES, RaceCollectibles } from '../src/race-replay.ts';
import { verifySoloReplay } from './verify-race.ts';

function completeRun(recover = false) {
  const sim = new DrivingSimulation(CITY_LOOP_OBSTACLES, { exploration: true });
  const pilot = new DemoAutopilot(CITY_LOOP_OBSTACLES), collectibles = new RaceCollectibles();
  const frames: ReplayFrame[] = [];
  let rings = 0;
  for (let i = 0; i < 180 * 60 && !sim.state.finished; i++) {
    if (recover && i === 90) { sim.recover(); frames.push([0, 0, 0, 0, 4]); }
    // Preserve nonuniform render frame boundaries, including fractional final steps.
    const dt = [1 / 60, .019, .014, .023][i % 4];
    const input = pilot.input(sim.state);
    input.boost = Math.abs(input.steer) < .05 && input.throttle > .85 && sim.state.boost > .15;
    frames.push([dt, input.throttle, input.brake, input.steer, Number(input.drift) + 2 * Number(input.boost)]);
    sim.update(dt, input);
    rings += collectibles.update(sim).rings;
    sim.drainPropImpacts();
  }
  assert.equal(sim.state.finished, true);
  return { frames, timeMs: Math.round(sim.state.elapsed * 1000), rings };
}

test('a complete recorded run verifies with exact time and all nine collectible bonuses', () => {
  const run = completeRun();
  assert.equal(run.rings, 9);
  assert.deepEqual(verifySoloReplay(JSON.parse(JSON.stringify(run.frames))), { timeMs: run.timeMs });
  // An edited claimed pace does not preserve the physical finish.
  assert.throws(() => verifySoloReplay(run.frames.map(([dt, ...input]) => [dt / 2, ...input])));
  assert.throws(() => verifySoloReplay([...run.frames, [1 / 60, 0, 0, 0, 0]]));
});

test('recorded road recovery replays without trusting a submitted position', () => {
  const run = completeRun(true);
  assert.deepEqual(verifySoloReplay(run.frames), { timeMs: run.timeMs });
});

test('invalid, oversized, unfinished, and out-of-range inputs are rejected', () => {
  for (const frames of [
    null, {}, [], { timeMs: 1, finished: true },
    [[1 / 60, 0, 0, 0, 0]],
    [[.251, 1, 0, 0, 0]], [[-.1, 1, 0, 0, 0]], [[0, 1, 0, 0, 0]],
    [[NaN, 1, 0, 0, 0]], [[.1, Infinity, 0, 0, 0]], [[.1, '1', 0, 0, 0]],
    [[.1, 1.1, 0, 0, 0]], [[.1, 1, -.1, 0, 0]], [[.1, 1, 0, -1.1, 0]],
    [[.1, 1, 0, 0, 8]], [[.1, 1, 0, 0, .5]], [[.1, 1, 0, 0, 0, 1]],
    [[0, 1, 0, 0, 4]], [[.1, 0, 0, 0, 4]], [[0, 0, 0, 0, 5]],
    Array.from({ length: 601 }, () => [0, 0, 0, 0, 4]),
    Array.from({ length: 2401 }, () => [.25, 1, 0, 0, 0]),
    Array.from({ length: MAX_REPLAY_FRAMES + 1 }, () => [.001, 1, 0, 0, 0]),
  ]) assert.throws(() => verifySoloReplay(frames));
});

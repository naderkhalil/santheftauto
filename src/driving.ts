import { CHECKPOINTS, ROAD_HALF_WIDTH, START_PROGRESS, TRACK_LENGTH, routeSlope, sampleRoute } from './route.ts';
import type { Obstacle } from './route.ts';

export type DriveInput = { throttle: number; brake: number; steer: number; drift: boolean; boost: boolean };
export type DriveState = {
  progress: number;
  lateral: number;
  speed: number;
  elapsed: number;
  boost: number;
  driftAngle: number;
  y: number;
  verticalVelocity: number;
  airborne: boolean;
  finished: boolean;
  checkpoint: number;
  collisions: number;
  distanceDrifted: number;
};
export type RaceEvent = 'checkpoint' | 'finish' | 'crash' | 'land';

const STEP = 1 / 120;
const CAR_HALF_WIDTH = .95;
const CAR_HALF_LENGTH = 2.1;
const EDGE = ROAD_HALF_WIDTH - CAR_HALF_WIDTH;
const GRAVITY = 14;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const inputNumber = (value: number, min: number, max: number) => Number.isFinite(value) ? clamp(value, min, max) : 0;

function initialState(): DriveState {
  return {
    progress: START_PROGRESS, lateral: 0, speed: 0, elapsed: 0, boost: 1,
    driftAngle: 0, y: sampleRoute(START_PROGRESS).y, verticalVelocity: 0,
    airborne: false, finished: false, checkpoint: 0, collisions: 0, distanceDrifted: 0,
  };
}

/** Swept car-center segment against an obstacle expanded by the car dimensions. */
function intersectsObstacle(fromProgress: number, fromLateral: number, toProgress: number, toLateral: number, obstacle: Obstacle) {
  let near = 0;
  let far = 1;
  const axes = [
    [fromProgress, toProgress - fromProgress, obstacle.progress, obstacle.length / 2 + CAR_HALF_LENGTH],
    [fromLateral, toLateral - fromLateral, obstacle.lateral, obstacle.width / 2 + CAR_HALF_WIDTH],
  ];
  for (const [start, delta, center, extent] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(start - center) > extent) return false;
    } else {
      const a = (center - extent - start) / delta;
      const b = (center + extent - start) / delta;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
}

/** Forward-only arcade handling. All distances are metres and speeds are metres/second. */
export class DrivingSimulation {
  state: DriveState = initialState();
  private obstacles: Obstacle[];
  private lateralVelocity = 0;
  private edgeCooldown = 0;
  private jumpCooldown = 0;
  private airborneTime = 0;
  private boostLocked = false;
  private lastBoosting = false;
  private hitObstacles = new Set<number>();

  /** Whether boost was actually applied during the latest physics step. */
  get boosting(): boolean { return this.lastBoosting; }

  constructor(obstacles: Obstacle[] = []) {
    this.obstacles = obstacles.filter(obstacle =>
      Number.isFinite(obstacle.progress) && Number.isFinite(obstacle.lateral) &&
      Number.isFinite(obstacle.width) && Number.isFinite(obstacle.length) && obstacle.width > 0 && obstacle.length > 0,
    ).map(obstacle => ({ ...obstacle }));
  }

  reset() {
    this.state = initialState();
    this.lateralVelocity = 0;
    this.edgeCooldown = 0;
    this.jumpCooldown = 0;
    this.airborneTime = 0;
    this.boostLocked = false;
    this.lastBoosting = false;
    this.hitObstacles.clear();
  }

  update(dt: number, input: DriveInput): RaceEvent[] {
    const events: RaceEvent[] = [];
    if (!Number.isFinite(dt) || dt <= 0 || this.state.finished) return events;
    const controls = {
      throttle: inputNumber(input.throttle, 0, 1),
      brake: inputNumber(input.brake, 0, 1),
      steer: inputNumber(input.steer, -1, 1),
      drift: Boolean(input.drift),
      boost: Boolean(input.boost),
    };
    // A bounded catch-up protects against accidental multi-hour deltas. Normal
    // frame deltas subdivide identically at 30, 60 and 120 Hz.
    let remaining = Math.min(dt, 60);
    while (remaining > 1e-9 && !this.state.finished) {
      const step = Math.min(remaining, STEP);
      this.step(step, controls, events);
      remaining -= step;
    }
    return events;
  }

  private step(dt: number, input: DriveInput, events: RaceEvent[]) {
    const s = this.state;
    const oldProgress = s.progress;
    const oldLateral = s.lateral;
    this.edgeCooldown = Math.max(0, this.edgeCooldown - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (!input.boost) this.boostLocked = false;
    const boosting = input.boost && !this.boostLocked && s.boost > 0 && input.throttle > 0 && input.brake < .2;
    this.lastBoosting = boosting;
    if (boosting) {
      s.boost = Math.max(0, s.boost - dt * .25);
      if (s.boost <= 1e-9) { s.boost = 0; this.boostLocked = true; }
    } else {
      s.boost = Math.min(1, s.boost + dt * .1);
    }

    const terminalSpeed = boosting ? 58 : 44;
    const engine = (boosting ? 28 : 19) * input.throttle;
    const rollingResistance = s.speed > 0 ? .6 + .015 * s.speed : 0;
    const drag = .003 * s.speed * s.speed;
    const driftDrag = input.drift ? 3.8 + .045 * s.speed : 0;
    const downhill = s.speed > .5 ? -routeSlope(s.progress) * 4 : 0;
    s.speed += (engine - rollingResistance - drag - input.brake * 34 - driftDrag + downhill) * dt;
    if (s.speed > terminalSpeed) s.speed = Math.max(terminalSpeed, s.speed - 24 * dt);
    s.speed = clamp(s.speed, 0, 60);

    const routeBend = (sampleRoute(s.progress + 2).x - 2 * sampleRoute(s.progress).x + sampleRoute(s.progress - 2).x) / 4;
    const targetLateralVelocity = input.steer * s.speed * .19 * (input.drift ? 1.38 : 1) - routeBend * s.speed * s.speed * .22;
    const grip = s.airborne ? 1.1 : input.drift ? 3.3 : 9;
    this.lateralVelocity += (targetLateralVelocity - this.lateralVelocity) * (1 - Math.exp(-grip * dt));
    this.lateralVelocity = clamp(this.lateralVelocity, -16, 16);
    if (s.speed < .1 && !s.airborne) this.lateralVelocity = 0;
    s.lateral += this.lateralVelocity * dt;
    // Lateral sliding costs a small amount of forward progress.
    const forwardSpeed = s.speed * (1 - Math.min(.12, Math.abs(this.lateralVelocity) * .006));
    s.progress += forwardSpeed * dt;

    if (Math.abs(s.lateral) > EDGE) {
      const side = Math.sign(s.lateral);
      s.lateral = side * EDGE;
      if (this.edgeCooldown === 0 && s.speed > 8 && this.lateralVelocity * side > 1) {
        s.speed *= .68;
        s.collisions++;
        events.push('crash');
        this.edgeCooldown = .8;
      }
      this.lateralVelocity = -side * Math.abs(this.lateralVelocity) * .22;
    }

    for (let i = 0; i < this.obstacles.length; i++) {
      const obstacle = this.obstacles[i];
      if (this.hitObstacles.has(i) || obstacle.progress + obstacle.length / 2 + CAR_HALF_LENGTH < oldProgress) continue;
      if (!intersectsObstacle(oldProgress, oldLateral, s.progress, s.lateral, obstacle)) continue;
      // A car airborne above the roof can clear it; small crest hops still collide.
      const clearance = obstacle.kind === 'cablecar' ? 3.8 : obstacle.kind === 'car' ? 1.6 : 1.2;
      if (s.y - sampleRoute(s.progress).y > clearance) continue;
      this.hitObstacles.add(i);
      const side = Math.abs(s.lateral - obstacle.lateral) > .05 ? Math.sign(s.lateral - obstacle.lateral) : obstacle.lateral >= 0 ? -1 : 1;
      s.lateral = clamp(obstacle.lateral + side * (obstacle.width / 2 + CAR_HALF_WIDTH + .25), -EDGE, EDGE);
      this.lateralVelocity = side * 3;
      s.speed *= .4;
      s.collisions++;
      events.push('crash');
    }

    const slipAngle = Math.atan2(this.lateralVelocity, Math.max(7, s.speed)) * (input.drift ? 1.7 : .9);
    s.driftAngle += (slipAngle - s.driftAngle) * (1 - Math.exp(-8 * dt));
    if (input.drift && s.speed > 10 && Math.abs(this.lateralVelocity) > 1.4 && !s.airborne) s.distanceDrifted += s.speed * dt;

    const ground = sampleRoute(s.progress).y;
    const verticalCurvature = (routeSlope(s.progress + 1) - routeSlope(s.progress - 1)) / 2;
    if (!s.airborne && this.jumpCooldown === 0 && s.speed > 31 && verticalCurvature * s.speed * s.speed < -GRAVITY * 1.05) {
      s.airborne = true;
      s.verticalVelocity = routeSlope(oldProgress) * s.speed + 1.25;
      this.airborneTime = 0;
      this.jumpCooldown = 1.2;
    }
    if (s.airborne) {
      this.airborneTime += dt;
      s.y += s.verticalVelocity * dt - GRAVITY * dt * dt / 2;
      s.verticalVelocity -= GRAVITY * dt;
      if (s.y <= ground) {
        s.y = ground;
        s.airborne = false;
        s.verticalVelocity = routeSlope(s.progress) * s.speed;
        if (this.airborneTime > .14) events.push('land');
      }
    } else {
      s.y = ground;
      s.verticalVelocity = routeSlope(s.progress) * s.speed;
    }

    const actualStep = s.progress >= TRACK_LENGTH && s.progress > oldProgress ? dt * clamp((TRACK_LENGTH - oldProgress) / (s.progress - oldProgress), 0, 1) : dt;
    s.elapsed += actualStep;
    while (s.checkpoint < CHECKPOINTS.length && s.progress >= CHECKPOINTS[s.checkpoint]) {
      s.checkpoint++;
      events.push('checkpoint');
    }
    if (s.progress >= TRACK_LENGTH) {
      s.progress = TRACK_LENGTH;
      s.y = Math.max(s.y, sampleRoute(TRACK_LENGTH).y);
      s.finished = true;
      s.speed = 0;
      this.lastBoosting = false;
      events.push('finish');
    }
  }
}

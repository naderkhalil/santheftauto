import * as defaultRoute from './route.ts';
import type { LaunchZone, Obstacle } from './route.ts';
import { PLAYGROUND_BOUNDS, PLAYGROUND_COLLIDERS, playgroundHeight } from './playground.ts';

export type BoostZone = { progress: number; end: number; label: string; speed: number; duration: number; halfWidth: number };

/** Geometry and gates are injected together so each race owns its full course. */
export type DrivingRoute = Pick<typeof defaultRoute,
  'glideSlope' | 'routeCurvature' | 'routePoint' | 'routeProgressAt' | 'routeSlope' | 'routeYaw' | 'sampleGlidePath' | 'sampleRoute'> & {
  readonly CHECKPOINTS: readonly number[];
  readonly LAUNCH_ZONES: readonly LaunchZone[];
  readonly ROAD_HALF_WIDTH: number;
  readonly START_PROGRESS: number;
  readonly TRACK_LENGTH: number;
  readonly checkpointLabels?: readonly string[];
  readonly BOOST_ZONES?: readonly BoostZone[];
  roadHalfWidth?(progress: number): number;
};

export type DriveInput = { throttle: number; brake: number; steer: number; drift: boolean; boost: boolean };
export type DriveState = {
  progress: number;
  lateral: number;
  speed: number;
  /** Travel direction in semantic world coordinates; on ground, steering turns it. */
  heading: number;
  /** Ground attitude sampled beneath the wheels, in radians. */
  surfacePitch: number;
  surfaceRoll: number;
  elapsed: number;
  boost: number;
  /** Seconds remaining in a collected road accelerator; separate from Shift fuel. */
  surge: number;
  driftAngle: number;
  y: number;
  verticalVelocity: number;
  airborne: boolean;
  /** Wheel deployment: 0 = road, 1 = hover. */
  glide: number;
  altitude: number;
  airTime: number;
  totalAirTime: number;
  launches: number;
  finished: boolean;
  checkpoint: number;
  collisions: number;
  distanceDrifted: number;
};
export type RaceEvent = 'checkpoint' | 'finish' | 'crash' | 'launch' | 'land' | 'boost-pad';
export type PropImpact = { id: string; x: number; y: number; z: number; vx: number; vz: number; speed: number };

const STEP = 1 / 120;
const CAR_HALF_WIDTH = .95;
const CAR_HALF_LENGTH = 2.1;
const MIN_LAUNCH_SPEED = 24;
/** Speed-sensitive steering: tight at low speed, wider when approaching too fast. */
export function steeringCurvature(speed: number, drift = false): number {
  return Math.min(.105, 2.15 / Math.max(speed, 1)) * (drift ? 1.25 : 1);
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const inputNumber = (value: number, min: number, max: number) => Number.isFinite(value) ? clamp(value, min, max) : 0;

function initialState(route: DrivingRoute): DriveState {
  return {
    progress: route.START_PROGRESS, lateral: 0, speed: 0, heading: route.routeYaw(route.START_PROGRESS), surfacePitch: 0, surfaceRoll: 0, elapsed: 0, boost: 1, surge: 0,
    driftAngle: 0, y: route.sampleRoute(route.START_PROGRESS).y, verticalVelocity: 0,
    airborne: false, glide: 0, altitude: 0, airTime: 0, totalAirTime: 0, launches: 0, finished: false, checkpoint: 0, collisions: 0, distanceDrifted: 0,
  };
}

/** Ordered physical gates keep plaza shortcuts from silently completing a lap. */
export const SQUARE_RACE_GATES = [
  { x: 75, z: 10, progress: defaultRoute.routeProgressAt(75, 10), label: 'Stockton Street · head south' },
  { x: 0, z: -65, progress: defaultRoute.routeProgressAt(0, -65), label: 'Geary Street · head west' },
  { x: -75, z: 0, progress: defaultRoute.routeProgressAt(-75, 0), label: 'Powell Street · head north' },
] as const;

type SolidBox = { id: string; propId?: string; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
const DISTRICT_WALLS: readonly SolidBox[] = [
  { id: 'district-west', minX: PLAYGROUND_BOUNDS.minX - 1000, maxX: PLAYGROUND_BOUNDS.minX, minZ: -10000, maxZ: 10000, minY: -10000, maxY: 10000 },
  { id: 'district-east', minX: PLAYGROUND_BOUNDS.maxX, maxX: PLAYGROUND_BOUNDS.maxX + 1000, minZ: -10000, maxZ: 10000, minY: -10000, maxY: 10000 },
  { id: 'district-south', minX: -10000, maxX: 10000, minZ: PLAYGROUND_BOUNDS.minZ - 1000, maxZ: PLAYGROUND_BOUNDS.minZ, minY: -10000, maxY: 10000 },
  { id: 'district-north', minX: -10000, maxX: 10000, minZ: PLAYGROUND_BOUNDS.maxZ, maxZ: PLAYGROUND_BOUNDS.maxZ + 1000, minY: -10000, maxY: 10000 },
];

/** Slab intersection supplies the first contact and its outward normal. */
function sweepBox(x: number, z: number, dx: number, dz: number, box: SolidBox, extentX: number, extentZ: number) {
  let near = -Infinity, far = Infinity, nx = 0, nz = 0;
  const axes = [
    { start: x, delta: dx, min: box.minX - extentX, max: box.maxX + extentX, x: 1, z: 0 },
    { start: z, delta: dz, min: box.minZ - extentZ, max: box.maxZ + extentZ, x: 0, z: 1 },
  ];
  for (const axis of axes) {
    if (Math.abs(axis.delta) < 1e-10) {
      if (axis.start <= axis.min || axis.start >= axis.max) return;
      continue;
    }
    const a = (axis.min - axis.start) / axis.delta, b = (axis.max - axis.start) / axis.delta;
    const entry = Math.min(a, b);
    if (entry > near) { near = entry; nx = axis.x * -Math.sign(axis.delta); nz = axis.z * -Math.sign(axis.delta); }
    far = Math.min(far, Math.max(a, b));
    if (near > far) return;
  }
  if (far < 0 || near > 1) return;
  if (near < 0) {
    // Rotating a long car beside a wall may put its conservative footprint a
    // few centimetres inside. Allow motion away, otherwise push out gently.
    const exits = [
      { distance: x - (box.minX - extentX), nx: -1, nz: 0 },
      { distance: box.maxX + extentX - x, nx: 1, nz: 0 },
      { distance: z - (box.minZ - extentZ), nx: 0, nz: -1 },
      { distance: box.maxZ + extentZ - z, nx: 0, nz: 1 },
    ].sort((a, b) => a.distance - b.distance);
    const exit = exits[0];
    if (dx * exit.nx + dz * exit.nz > 0) return;
    return { time: 0, nx: exit.nx, nz: exit.nz, penetration: Math.max(0, exit.distance) };
  }
  return { time: Math.max(0, near), nx, nz, penetration: 0 };
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

/** Manual arcade handling. Route coordinates locate the road, not steer the car. */
export class DrivingSimulation {
  state: DriveState;
  private readonly route: DrivingRoute;
  private readonly customRoute: boolean;
  private get edge(): number {
    const road = this.route.roadHalfWidth?.(this.state.progress) ?? this.route.ROAD_HALF_WIDTH;
    const launch = this.activeLaunch;
    const blend = launch ? clamp((launch.end - this.state.progress) / 24, 0, 1) : 0;
    const landing = launch ? this.route.roadHalfWidth?.(launch.end + 6) ?? road : road;
    const width = launch?.halfWidth === undefined ? road : landing + (launch.halfWidth - landing) * blend;
    return Math.max(0, width - CAR_HALF_WIDTH);
  }
  private obstacles: Obstacle[];
  private lateralVelocity = 0;
  private steering = 0;
  private wallBlocked = false;
  private edgeCooldown = 0;
  private activeLaunch: LaunchZone | undefined;
  private liftBias = 0;
  private launchedZones = new Set<number>();
  private collectedBoosts = new Set<number>();
  private surgeSpeed = 0;
  private boostLocked = false;
  private lastBoosting = false;
  private hitObstacles = new Set<number>();
  private explorationEnabled: boolean;
  private explorationActive = false;
  private worldX: number;
  private worldZ: number;
  private squareGate = 0;
  private safeProgress: number;
  private playgroundObstacles: SolidBox[] = [];
  private plazaHop = false;
  private knockedProps = new Set<string>();
  private propImpacts: PropImpact[] = [];
  private scrapeNormals = new Set<string>();

  /** Whether boost was actually applied during the latest physics step. */
  get boosting(): boolean { return this.lastBoosting; }
  /** Consume each lightweight prop's first impact once; recovery retains damage. */
  drainPropImpacts(): PropImpact[] { return this.propImpacts.splice(0); }
  get exploring(): boolean { return this.explorationActive; }
  get position(): { x: number; y: number; z: number } {
    return this.explorationActive ? { x: this.worldX, y: this.state.y, z: this.worldZ } : { ...this.route.routePoint(this.state.progress, this.state.lateral), y: this.state.y };
  }
  get groundHeight(): number { return this.explorationActive ? this.explorationSupportHeight() : this.route.sampleRoute(this.state.progress).y; }
  get nextRaceGate(): { x: number; z: number; progress: number; label: string } | undefined {
    if (this.explorationEnabled && this.squareGate < SQUARE_RACE_GATES.length) return SQUARE_RACE_GATES[this.squareGate];
    const progress = this.route.CHECKPOINTS[this.state.checkpoint];
    if (progress === undefined) return;
    return { ...this.route.sampleRoute(progress), progress, label: this.route.checkpointLabels?.[this.state.checkpoint] ?? (this.customRoute ? `Checkpoint ${this.state.checkpoint + 1}` : ['Powell Street · climb the hill', 'Grant Avenue · Chinatown', 'The Embarcadero · waterfront', 'Market Street · finish'][this.state.checkpoint]) };
  }

  constructor(obstacles: Obstacle[] = [], options: { exploration?: boolean; route?: DrivingRoute } = {}) {
    this.route = options.route ?? defaultRoute;
    this.customRoute = options.route !== undefined;
    this.state = initialState(this.route);
    const start = this.route.sampleRoute(this.route.START_PROGRESS);
    this.worldX = start.x; this.worldZ = start.z;
    this.safeProgress = this.route.START_PROGRESS;
    this.explorationEnabled = !this.customRoute && Boolean(options.exploration);
    this.explorationActive = this.explorationEnabled;
    this.obstacles = obstacles.filter(obstacle =>
      Number.isFinite(obstacle.progress) && Number.isFinite(obstacle.lateral) &&
      Number.isFinite(obstacle.width) && Number.isFinite(obstacle.length) && obstacle.width > 0 && obstacle.length > 0,
    ).map(obstacle => ({ ...obstacle }));
    this.playgroundObstacles = this.obstacles.map((obstacle, i) => {
      const p = this.route.routePoint(obstacle.progress, obstacle.lateral), yaw = this.route.routeYaw(obstacle.progress);
      const hx = Math.abs(Math.sin(yaw)) * obstacle.length / 2 + Math.abs(Math.cos(yaw)) * obstacle.width / 2;
      const hz = Math.abs(Math.cos(yaw)) * obstacle.length / 2 + Math.abs(Math.sin(yaw)) * obstacle.width / 2;
      return { id: `parked-${i}`, minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz, minY: p.y, maxY: p.y + (obstacle.kind === 'cablecar' ? 3.8 : obstacle.kind === 'car' ? 1.6 : 1.2) };
    });
  }

  reset() {
    this.state = initialState(this.route);
    this.lateralVelocity = 0;
    this.steering = 0;
    this.wallBlocked = false;
    this.edgeCooldown = 0;
    this.activeLaunch = undefined;
    this.liftBias = 0;
    this.launchedZones.clear();
    this.collectedBoosts.clear();this.surgeSpeed = 0;
    this.boostLocked = false;
    this.lastBoosting = false;
    this.hitObstacles.clear();
    this.explorationActive = this.explorationEnabled;
    const start = this.route.sampleRoute(this.route.START_PROGRESS);
    this.worldX = start.x; this.worldZ = start.z;
    this.squareGate = 0;
    this.safeProgress = this.route.START_PROGRESS;
    this.plazaHop = false;
    this.knockedProps.clear(); this.propImpacts.length = 0; this.scrapeNormals.clear();
  }

  /** Start the public-square playground without a race countdown. */
  explore() {
    this.reset();
    if (this.customRoute) return;
    this.explorationEnabled = true;
    this.explorationActive = true;
    this.worldX = 0; this.worldZ = -44;
    this.state.heading = 0;
    this.state.y = playgroundHeight(this.worldX, this.worldZ);
    this.projectExplorationPosition();
  }

  /** Recover to the last earned street gate; race time and statistics survive. */
  recover() {
    const finished = this.state.finished;
    this.seek(this.safeProgress);
    this.state.finished = finished;
  }

  /** Reposition for a retry without erasing race time, earned gates, or statistics. */
  seek(progress: number, lateral = 0) {
    const s = this.state;
    this.activeLaunch = undefined;
    s.progress = clamp(Number.isFinite(progress) ? progress : this.route.START_PROGRESS, 0, this.route.TRACK_LENGTH);
    s.lateral = clamp(Number.isFinite(lateral) ? lateral : 0, -this.edge, this.edge);
    const p = this.route.routePoint(s.progress, s.lateral);
    s.speed = 0; s.surge = 0; this.surgeSpeed = 0; s.heading = this.route.routeYaw(s.progress);
    s.finished = false;
    s.y = p.y; s.surfacePitch = Math.atan(this.route.routeSlope(s.progress)); s.surfaceRoll = 0;
    s.airborne = false; s.glide = 0; s.altitude = 0; s.airTime = 0; s.verticalVelocity = 0; s.driftAngle = 0;
    this.worldX = p.x; this.worldZ = p.z;
    this.explorationActive = this.explorationEnabled && p.z < 184 && p.x < 100;
    this.lateralVelocity = 0; this.steering = 0; this.wallBlocked = false;
    this.activeLaunch = undefined; this.liftBias = 0; this.lastBoosting = false;
    this.plazaHop = false;
    this.scrapeNormals.clear();
    for (const index of this.launchedZones) if (this.route.LAUNCH_ZONES[index].progress >= s.progress) this.launchedZones.delete(index);
    for (const index of this.collectedBoosts) if (this.route.BOOST_ZONES![index].end >= s.progress) this.collectedBoosts.delete(index);
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

  private projectExplorationPosition() {
    const s = this.state;
    s.progress = this.route.routeProgressAt(this.worldX, this.worldZ);
    const center = this.route.sampleRoute(s.progress), yaw = this.route.routeYaw(s.progress);
    s.lateral = (this.worldX - center.x) * Math.cos(yaw) - (this.worldZ - center.z) * Math.sin(yaw);
  }

  private explorationSupportHeight() {
    let height = playgroundHeight(this.worldX, this.worldZ);
    // A low solid can support a car arriving from above. Its top cannot be
    // entered through the side, and it never raises the car from below.
    const boxes: readonly SolidBox[] = [...PLAYGROUND_COLLIDERS, ...this.playgroundObstacles];
    for (const box of boxes) {
      if (box.propId) continue;
      if (this.state.y < box.maxY - .08 || box.maxY <= height) continue;
      if (this.worldX >= box.minX && this.worldX <= box.maxX && this.worldZ >= box.minZ && this.worldZ <= box.maxZ) height = box.maxY;
    }
    return height;
  }

  private collectPropContacts(x: number, z: number, dx: number, dz: number, seconds: number, extentX: number, extentZ: number) {
    if (seconds < 1e-8 || Math.hypot(dx, dz) < 1e-8) return;
    const boxes: readonly SolidBox[] = PLAYGROUND_COLLIDERS;
    for (const box of boxes) {
      if (!box.propId || this.knockedProps.has(box.propId)) continue;
      if (this.state.y + 1.65 < box.minY || this.state.y >= box.maxY - .08) continue;
      const hit = sweepBox(x, z, dx, dz, box, extentX, extentZ);
      if (!hit) continue;
      const vx = dx / seconds, vz = dz / seconds;
      this.knockedProps.add(box.propId);
      this.propImpacts.push({ id: box.propId, x: x + dx * hit.time, y: this.state.y + .4, z: z + dz * hit.time, vx, vz, speed: Math.hypot(vx, vz) });
    }
  }

  private crossedGate(fromX: number, fromZ: number, toX: number, toZ: number, progress: number): boolean {
    const p = this.route.sampleRoute(progress), yaw = this.route.routeYaw(progress), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const a = (fromX - p.x) * fx + (fromZ - p.z) * fz;
    const b = (toX - p.x) * fx + (toZ - p.z) * fz;
    if (a > 0 || b <= 0 || b - a < 1e-8) return false;
    const t = -a / (b - a), x = fromX + (toX - fromX) * t, z = fromZ + (toZ - fromZ) * t;
    return Math.abs((x - p.x) * fz - (z - p.z) * fx) <= this.route.ROAD_HALF_WIDTH + 1;
  }

  private scoreWorldGates(fromX: number, fromZ: number, toX: number, toZ: number, events: RaceEvent[]) {
    const s = this.state;
    const square = SQUARE_RACE_GATES[this.squareGate];
    if (square) {
      if (this.crossedGate(fromX, fromZ, toX, toZ, square.progress)) {
        this.squareGate++;
        // Recover before the next gate so a missed crossing always remains attainable.
        this.safeProgress = square.progress + 3;
      }
      return;
    }
    const progress = this.route.CHECKPOINTS[s.checkpoint];
    if (progress !== undefined && this.crossedGate(fromX, fromZ, toX, toZ, progress)) {
      s.checkpoint++;
      this.safeProgress = Math.min(progress + 3, this.route.TRACK_LENGTH - 8);
      events.push('checkpoint');
    }
  }

  private stepExploration(dt: number, input: DriveInput, events: RaceEvent[]) {
    const s = this.state, oldX = this.worldX, oldZ = this.worldZ, oldY = s.y;
    this.edgeCooldown = Math.max(0, this.edgeCooldown - dt);
    if (!input.boost) this.boostLocked = false;
    const boosting = input.boost && !this.boostLocked && s.boost > 0 && input.throttle > 0 && input.brake < .2 && s.speed >= 0;
    this.lastBoosting = boosting;
    if (boosting) {
      s.boost = Math.max(0, s.boost - dt * .25);
      if (s.boost <= 1e-9) { s.boost = 0; this.boostLocked = true; }
    } else s.boost = Math.min(1, s.boost + dt * .1);

    const speed = Math.abs(s.speed), direction = Math.sign(s.speed);
    const pedal = direction < 0 ? input.brake : input.throttle;
    const resistance = speed > 0 ? .6 + .015 * speed + .003 * speed * speed + (1 - pedal) * (2.2 + .1 * speed) + (input.drift ? 3.8 + .045 * speed : 0) : 0;
    const drive = s.speed < -.05 ? -input.brake * 10 + input.throttle * 34
      : s.speed > .05 ? input.throttle * (boosting ? 28 : 19) - input.brake * 34
      : input.throttle * (boosting ? 28 : 19) - input.brake * 10;
    let nextSpeed = s.speed + (drive - direction * resistance) * dt;
    // Brake to rest before changing gear; neither pedal released can creep.
    if (direction && Math.sign(nextSpeed) !== direction) nextSpeed = 0;
    s.speed = clamp(nextSpeed, -10, boosting ? 58 : 44);
    this.steering += (input.steer - this.steering) * (1 - Math.exp(-10 * dt));
    const crawl = this.wallBlocked ? (input.throttle - input.brake) * 7 : 0;
    const yawSpeed = Math.abs(s.speed) > Math.abs(crawl) ? s.speed : crawl;
    s.heading += yawSpeed * this.steering * steeringCurvature(Math.abs(yawSpeed), input.drift) * dt;
    const dx = Math.sin(s.heading) * s.speed * dt, dz = Math.cos(s.heading) * s.speed * dt;
    const ex = Math.abs(Math.sin(s.heading)) * CAR_HALF_LENGTH + Math.abs(Math.cos(s.heading)) * CAR_HALF_WIDTH;
    const ez = Math.abs(Math.cos(s.heading)) * CAR_HALF_LENGTH + Math.abs(Math.sin(s.heading)) * CAR_HALF_WIDTH;
    let moveX = dx, moveZ = dz, moveSeconds = dt, collided = false, initialRetention = 1, maxNormalRatio = 0;
    const contacts = new Set<string>();
    const paths: { x: number; z: number; dx: number; dz: number; seconds: number }[] = [];
    const boxes: readonly SolidBox[] = [...PLAYGROUND_COLLIDERS, ...this.playgroundObstacles, ...DISTRICT_WALLS];
    for (let pass = 0; pass < 3 && Math.hypot(moveX, moveZ) > 1e-8; pass++) {
      let contact: ReturnType<typeof sweepBox>;
      for (const box of boxes) {
        if (box.propId) continue;
        if (s.y + 1.65 < box.minY || s.y >= box.maxY - .08) continue;
        const candidate = sweepBox(this.worldX, this.worldZ, moveX, moveZ, box, ex, ez);
        if (candidate && (!contact || candidate.time < contact.time)) contact = candidate;
      }
      if (!contact) {
        paths.push({ x: this.worldX, z: this.worldZ, dx: moveX, dz: moveZ, seconds: moveSeconds });
        this.worldX += moveX; this.worldZ += moveZ; break;
      }
      collided = true;
      const normalKey = `${contact.nx},${contact.nz}`;
      contacts.add(normalKey);
      const normalRatio = Math.max(0, -(dx * contact.nx + dz * contact.nz) / Math.max(Math.hypot(dx, dz), 1e-8));
      const tangentRatio = Math.sqrt(Math.max(0, 1 - normalRatio * normalRatio));
      maxNormalRatio = Math.max(maxNormalRatio, normalRatio);
      // Shed the normal component once at first contact, rather than reducing
      // speed once per rendered frame. Sustained scrapes retain momentum.
      if (!this.scrapeNormals.has(normalKey)) initialRetention = Math.min(initialRetention, tangentRatio);
      if (tangentRatio < .12) initialRetention = 0;
      const t = Math.max(0, contact.time - .001);
      paths.push({ x: this.worldX, z: this.worldZ, dx: moveX * t, dz: moveZ * t, seconds: moveSeconds * t });
      this.worldX += moveX * t + contact.nx * (contact.penetration + .002);
      this.worldZ += moveZ * t + contact.nz * (contact.penetration + .002);
      moveX *= 1 - t; moveZ *= 1 - t;
      moveSeconds *= 1 - t;
      const into = moveX * contact.nx + moveZ * contact.nz;
      if (into < 0) { moveX -= into * contact.nx; moveZ -= into * contact.nz; }
    }
    const boundedX = clamp(this.worldX, PLAYGROUND_BOUNDS.minX + ex, PLAYGROUND_BOUNDS.maxX - ex);
    const boundedZ = clamp(this.worldZ, PLAYGROUND_BOUNDS.minZ + ez, PLAYGROUND_BOUNDS.maxZ - ez);
    collided ||= boundedX !== this.worldX || boundedZ !== this.worldZ;
    this.worldX = boundedX; this.worldZ = boundedZ;
    const ground = this.explorationSupportHeight();
    // Tall exposed terrace edges are solid. Stair/ramp envelopes stay well
    // below this per-step limit even at top speed.
    if (ground - oldY > .55) {
      this.worldX = oldX; this.worldZ = oldZ; collided = true;
      initialRetention = 0; maxNormalRatio = 1; paths.length = 0;
    }
    if (collided) {
      if (this.edgeCooldown === 0 && Math.abs(s.speed) * maxNormalRatio > 5 && initialRetention < 1) {
        s.collisions++; events.push('crash'); this.edgeCooldown = .7;
      }
      const retainedSpeed = Math.abs(s.speed) * initialRetention;
      const scrapeDrag = (.35 + retainedSpeed * .10 * maxNormalRatio) * dt;
      s.speed = Math.sign(s.speed) * Math.max(0, retainedSpeed - scrapeDrag);
    }
    this.wallBlocked = collided;
    this.scrapeNormals = contacts;
    // Only accepted portions of the sweep may disturb a prop. An object
    // behind a solid wall cannot be hit by the attempted, blocked movement.
    for (const path of paths) this.collectPropContacts(path.x, path.z, path.dx, path.dz, path.seconds, ex, ez);
    this.projectExplorationPosition();
    const support = this.explorationSupportHeight();
    if (!this.plazaHop && oldY - support > .42) {
      this.plazaHop = true;
      s.airTime = 0;
      // Carry a modest amount of the slope's existing vertical momentum;
      // ordinary curbs and the softened stairs do not trigger a launch.
      s.verticalVelocity = clamp(s.verticalVelocity, -4, 5);
    }
    if (this.plazaHop) {
      s.verticalVelocity = Math.max(-22, s.verticalVelocity - 22 * dt);
      s.y = Math.max(support, oldY + s.verticalVelocity * dt);
      s.airTime += dt; s.totalAirTime += dt;
      if (s.y <= support + 1e-7) {
        s.y = support; s.verticalVelocity = 0; s.airTime = 0; this.plazaHop = false;
      }
    } else {
      s.y = support;
      s.verticalVelocity = (s.y - oldY) / dt;
    }
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const slope = (playgroundHeight(this.worldX + fx * 1.2, this.worldZ + fz * 1.2) - playgroundHeight(this.worldX - fx * 1.2, this.worldZ - fz * 1.2)) / 2.4;
    const crossSlope = (playgroundHeight(this.worldX + fz * .8, this.worldZ - fx * .8) - playgroundHeight(this.worldX - fz * .8, this.worldZ + fx * .8)) / 1.6;
    s.surfacePitch += (clamp(Math.atan(slope), -.55, .55) - s.surfacePitch) * (1 - Math.exp(-14 * dt));
    s.surfaceRoll += (clamp(Math.atan(crossSlope), -.35, .35) - s.surfaceRoll) * (1 - Math.exp(-14 * dt));
    s.driftAngle += (this.steering * clamp(Math.abs(s.speed) / 30, 0, 1) * (input.drift ? .28 : .025) - s.driftAngle) * (1 - Math.exp(-8 * dt));
    if (input.drift && Math.abs(s.speed) > 10 && Math.abs(this.steering) > .15) s.distanceDrifted += Math.abs(s.speed) * dt;
    s.airborne = this.plazaHop; s.glide = 0; s.altitude = Math.max(0, s.y - support);
    s.elapsed += dt;
    this.scoreWorldGates(oldX, oldZ, this.worldX, this.worldZ, events);

    // Hand back just before the authored Powell crest, retaining all three
    // established flights. Other street exits remain the visible district edge.
    if (this.worldZ >= 184 && Math.abs(this.worldX + 75) < this.edge && dz > 0 && s.speed >= 0 && Math.cos(s.heading) > .4) {
      this.explorationActive = false;
      s.y = this.route.sampleRoute(s.progress).y;
      this.lateralVelocity = s.speed * Math.sin(s.heading - this.route.routeYaw(s.progress));
      this.wallBlocked = false;
    }
  }

  private step(dt: number, input: DriveInput, events: RaceEvent[]) {
    if (this.explorationActive) { this.stepExploration(dt, input, events); return; }
    const s = this.state;
    const oldProgress = s.progress;
    const oldLateral = s.lateral;
    const oldPosition = this.route.routePoint(oldProgress, oldLateral);
    const wasScraping = this.wallBlocked;
    this.edgeCooldown = Math.max(0, this.edgeCooldown - dt);
    if (!input.boost) this.boostLocked = false;
    const boosting = input.boost && !this.boostLocked && s.boost > 0 && input.throttle > 0 && input.brake < .2;
    this.lastBoosting = boosting;
    if (boosting) {
      s.boost = Math.max(0, s.boost - dt * .25);
      if (s.boost <= 1e-9) { s.boost = 0; this.boostLocked = true; }
    } else {
      s.boost = Math.min(1, s.boost + dt * .1);
    }

    if (input.brake > .2) s.surge = 0;
    s.surge = Math.max(0, s.surge - dt);
    const surging = s.surge > 0;
    this.lastBoosting = boosting || surging;
    const terminalSpeed = surging ? this.surgeSpeed : boosting ? 58 : 44;
    const previousSpeed = s.speed;
    const engine = (surging ? 50 : boosting ? 28 : 19) * input.throttle;
    const rollingResistance = s.speed > 0 ? .6 + .015 * s.speed : 0;
    const drag = .003 * s.speed * s.speed;
    // Engine braking is noticeable when the pedal is released. On a flat road
    // a short burst of throttle coasts to a stop instead of touring the city.
    const coastDrag = s.airborne ? 0 : (1 - input.throttle) * (2.2 + .10 * s.speed);
    const driftDrag = input.drift && !s.airborne ? 3.8 + .045 * s.speed : 0;
    const downhill = s.speed > .5 && !s.airborne ? -this.route.routeSlope(s.progress) * 4 : 0;
    s.speed += (engine - rollingResistance - drag - coastDrag - input.brake * 34 - driftDrag + downhill) * dt;
    if (s.speed > terminalSpeed) s.speed = surging
      ? Math.min(s.speed, Math.max(terminalSpeed, previousSpeed - 24 * dt))
      : Math.max(terminalSpeed, s.speed - 24 * dt);
    // Lift keeps forward motion even if the driver releases the accelerator in flight.
    s.speed = clamp(s.speed, s.airborne ? 18 : 0, Math.max(60, this.surgeSpeed));

    this.steering += (input.steer - this.steering) * (1 - Math.exp(-10 * dt));
    let forwardSpeed: number;
    if (s.airborne) {
      // Preserve the established hover controls on the straight flight corridors.
      // Heading follows the actual lateral glide; flight cannot stop in mid-air.
      const targetLateralVelocity = input.steer * s.speed * .17;
      this.lateralVelocity += (targetLateralVelocity - this.lateralVelocity) * (1 - Math.exp(-4.2 * dt));
      this.lateralVelocity = clamp(this.lateralVelocity, -s.speed * .5, s.speed * .5);
      forwardSpeed = Math.sqrt(Math.max(0, s.speed * s.speed - this.lateralVelocity * this.lateralVelocity));
      s.heading = this.route.routeYaw(s.progress) + Math.atan2(this.lateralVelocity, forwardSpeed);
      this.wallBlocked = false;
    } else {
      // At a blocked curb, gas plus steering can turn the nose away at a crawl.
      // The curb never supplies a new heading or pushes progress around a bend.
      const yawSpeed = this.wallBlocked ? Math.max(s.speed, input.throttle * (1 - input.brake) * 8) : s.speed;
      s.heading += yawSpeed * this.steering * steeringCurvature(yawSpeed, input.drift) * dt;
      const relative = s.heading - this.route.routeYaw(s.progress);
      if (Math.abs(s.lateral) < this.edge - .02 || Math.sin(relative) * Math.sign(s.lateral) <= 0) this.wallBlocked = false;
      this.lateralVelocity = s.speed * Math.sin(relative);
      // Frenet coordinates convert the driver's world velocity into road
      // progress. The offset-radius term keeps an unsteered car travelling
      // straight in world space as the road curves underneath it.
      forwardSpeed = s.speed * Math.cos(relative) / (1 - this.route.routeCurvature(s.progress) * s.lateral);
    }
    s.lateral += this.lateralVelocity * dt;
    s.progress = Math.max(0, s.progress + forwardSpeed * dt);

    // Pads are physical strips: the swept wheel corridor must cross the color.
    // Crossing elsewhere in the street cannot collect a boost, nor can flight.
    if (!s.airborne && s.progress > oldProgress && input.brake < .2) {
      this.route.BOOST_ZONES?.forEach((zone, index) => {
        if (this.collectedBoosts.has(index)) return;
        if (!intersectsObstacle(oldProgress, oldLateral, s.progress, s.lateral, {
          progress: (zone.progress + zone.end) / 2, lateral: 0,
          width: zone.halfWidth * 2, length: zone.end - zone.progress, kind: 'barrier',
        })) return;
        this.collectedBoosts.add(index);this.surgeSpeed = zone.speed;s.surge = zone.duration;
        s.speed = Math.max(s.speed, zone.speed * .85);this.lastBoosting = true;
        events.push('boost-pad');
      });
    }

    if (Math.abs(s.lateral) > this.edge) {
      const side = Math.sign(s.lateral);
      s.lateral = side * this.edge;
      if (!s.airborne && this.edgeCooldown === 0 && !wasScraping && this.lateralVelocity * side > 5) {
        s.collisions++;
        events.push('crash');
        this.edgeCooldown = .8;
      }
      if (!s.airborne && this.lateralVelocity * side > 0) {
        const normalRatio = clamp(Math.abs(this.lateralVelocity) / Math.max(s.speed, 1e-8), 0, 1);
        const tangentRatio = Math.sqrt(Math.max(0, 1 - normalRatio * normalRatio));
        if (tangentRatio < .12) s.speed = 0;
        else {
          if (!wasScraping) s.speed *= tangentRatio;
          s.speed = Math.max(0, s.speed - (.35 + s.speed * .10 * normalRatio) * dt);
        }
        this.wallBlocked = true;
      }
      this.lateralVelocity = 0;
    }

    for (let i = 0; i < this.obstacles.length; i++) {
      const obstacle = this.obstacles[i];
      if (this.hitObstacles.has(i) || obstacle.progress + obstacle.length / 2 + CAR_HALF_LENGTH < oldProgress) continue;
      if (!intersectsObstacle(oldProgress, oldLateral, s.progress, s.lateral, obstacle)) continue;
      // A car airborne above the roof can clear it; small crest hops still collide.
      const clearance = obstacle.kind === 'cablecar' ? 3.8 : obstacle.kind === 'car' ? 1.6 : 1.2;
      if (s.y - this.route.sampleRoute(s.progress).y > clearance) continue;
      this.hitObstacles.add(i);
      const side = Math.abs(s.lateral - obstacle.lateral) > .05 ? Math.sign(s.lateral - obstacle.lateral) : obstacle.lateral >= 0 ? -1 : 1;
      s.lateral = clamp(obstacle.lateral + side * (obstacle.width / 2 + CAR_HALF_WIDTH + .25), -this.edge, this.edge);
      this.lateralVelocity = side * 3;
      s.speed *= .4;
      s.collisions++;
      events.push('crash');
    }

    const slipAngle = s.airborne ? Math.atan2(this.lateralVelocity, Math.max(7, s.speed))
      : this.steering * clamp(s.speed / 30, 0, 1) * (input.drift ? .28 : .025);
    s.driftAngle += (slipAngle - s.driftAngle) * (1 - Math.exp(-8 * dt));
    if (input.drift && s.speed > 10 && Math.abs(this.lateralVelocity) > 1.4 && !s.airborne) s.distanceDrifted += s.speed * dt;

    // Measured custom streets have cross-slopes: the car rests on the surface
    // beneath its actual lane position, not the height of the centreline.
    const ground = this.customRoute
      ? this.route.routePoint(s.progress, s.lateral).y
      : this.route.sampleRoute(s.progress).y;
    if (!s.airborne && input.brake < .4) {
      const index = this.route.LAUNCH_ZONES.findIndex((zone, i) => !this.launchedZones.has(i) && s.speed >= (zone.minSpeed ?? MIN_LAUNCH_SPEED) && Math.abs(s.lateral) <= (zone.halfWidth ?? this.route.ROAD_HALF_WIDTH) && oldProgress <= zone.progress && s.progress >= zone.progress);
      if (index !== -1) {
        this.activeLaunch = this.route.LAUNCH_ZONES[index];
        this.liftBias = 0;
        this.launchedZones.add(index);
        s.airborne = true;
        s.airTime = 0;
        s.launches++;
        events.push('launch');
      }
    }
    if (s.airborne && this.activeLaunch) {
      const zone = this.activeLaunch;
      s.airTime += dt;
      s.totalAirTime += dt;
      const u = clamp((s.progress - zone.progress) / (zone.end - zone.progress), 0, 1);
      const envelope = Math.sin(Math.PI * u) ** 2;
      const targetLift = (boosting ? 7 : 0) - input.brake * 11;
      const oldLift = this.liftBias;
      this.liftBias += (targetLift - this.liftBias) * (1 - Math.exp(-3 * dt));
      s.y = Math.max(ground, this.route.sampleGlidePath(s.progress, zone) + this.liftBias * envelope);
      const baseSlope = this.route.glideSlope(s.progress, zone);
      const liftSlope = this.liftBias * Math.PI * Math.sin(2 * Math.PI * u) / (zone.end - zone.progress);
      s.verticalVelocity = (baseSlope + liftSlope) * forwardSpeed + (this.liftBias - oldLift) / dt * envelope;
      // Lift control fades with zero slope at both ends, preserving smooth landings.
      // Let the tires leave the surface before the hover hardware unfolds.
      // Clearance and elapsed time make the release read as momentum over a hill,
      // while the landing envelope still restores the tires before touchdown.
      const clearance=clamp((s.y-ground-.12)/2.8,0,1);
      const release=clamp((s.airTime-.08)/.55,0,1);
      const remaining = clamp((zone.end - s.progress) / 32, 0, 1);
      const targetGlide = clearance*clearance*(3-2*clearance)
        * release*release*(3-2*release) * remaining*remaining*(3-2*remaining);
      s.glide += (targetGlide - s.glide) * (1 - Math.exp(-9 * dt));
      if (s.progress >= zone.end) {
        s.y = ground;
        s.airborne = false;
        s.glide = 0;
        s.airTime = 0;
        s.verticalVelocity = this.route.routeSlope(s.progress) * forwardSpeed;
        s.boost = Math.min(1, s.boost + .12);
        this.activeLaunch = undefined;
        events.push('land');
      }
    } else {
      s.y = ground;
      s.glide = 0;
      s.verticalVelocity = this.route.routeSlope(s.progress) * forwardSpeed;
    }
    s.altitude = Math.max(0, s.y - ground);
    s.surfacePitch = Math.atan(this.route.routeSlope(s.progress));
    s.surfaceRoll = 0;

    const actualStep = s.progress >= this.route.TRACK_LENGTH && s.progress > oldProgress ? dt * clamp((this.route.TRACK_LENGTH - oldProgress) / (s.progress - oldProgress), 0, 1) : dt;
    s.elapsed += actualStep;
    if (this.explorationEnabled) {
      const position = this.route.routePoint(s.progress, s.lateral);
      this.scoreWorldGates(oldPosition.x, oldPosition.z, position.x, position.z, events);
      if (!s.airborne && position.z < 182 && Math.abs(position.x + 75) < this.route.ROAD_HALF_WIDTH && s.progress < this.route.LAUNCH_ZONES[0].progress) {
        this.worldX = position.x; this.worldZ = position.z;
        this.explorationActive = true;
        s.y = playgroundHeight(position.x, position.z);
      }
    } else {
      while (s.checkpoint < this.route.CHECKPOINTS.length && s.progress >= this.route.CHECKPOINTS[s.checkpoint]) {
        if (this.customRoute) this.safeProgress = Math.max(this.route.START_PROGRESS, Math.min(this.route.CHECKPOINTS[s.checkpoint] + 3, this.route.TRACK_LENGTH - 8));
        s.checkpoint++;
        events.push('checkpoint');
      }
    }
    if (s.progress >= this.route.TRACK_LENGTH) {
      s.progress = this.route.TRACK_LENGTH;
      if (this.customRoute) {
        const finishGround = this.route.routePoint(s.progress, s.lateral).y;
        s.y = s.airborne ? Math.max(s.y, finishGround) : finishGround;
        s.altitude = Math.max(0, s.y - finishGround);
      } else {
        s.y = Math.max(s.y, this.route.sampleRoute(this.route.TRACK_LENGTH).y);
      }
      s.speed = 0;
      this.lastBoosting = false;
      if (!this.explorationEnabled || s.checkpoint >= this.route.CHECKPOINTS.length) {
        s.finished = true;
        events.push('finish');
      }
    }
  }
}

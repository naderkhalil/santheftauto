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
export type RaceEvent = 'checkpoint' | 'finish' | 'missed-gate' | 'crash' | 'launch' | 'land' | 'boost-pad';
export type PropImpact = { id: string; x: number; y: number; z: number; vx: number; vz: number; speed: number };
type CollisionRecovery = { age: number; nx: number; nz: number; recoil: number; heading: number; exitHeading: number };
/** Dynamic physics only; restore with the same route and obstacle configuration. */
export type DrivingCheckpoint = {
  version: 1; state: DriveState; lateralVelocity: number; steering: number;
  wallBlocked: boolean; edgeCooldown: number; activeLaunch: number | null; liftBias: number;
  launchedZones: number[]; collectedBoosts: number[]; surgeSpeed: number;
  boostLocked: boolean; lastBoosting: boolean; hitObstacles: number[];
  explorationEnabled: boolean; untimed: boolean; explorationActive: boolean;
  worldX: number; worldZ: number; safeProgress: number; plazaHop: boolean;
  knockedProps: string[]; propImpacts: PropImpact[]; scrapeNormals: string[];
  /** Optional when reading checkpoints written before collision recovery. */
  collisionRecovery?: CollisionRecovery | null;
};

const STEP = 1 / 120;
const CAR_HALF_WIDTH = .95;
const CAR_HALF_LENGTH = 2.1;
const MIN_LAUNCH_SPEED = 24;
const COLLISION_RECOVERY_SECONDS = 1.25;
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
    // few centimetres inside. Resolve that overlap even while moving away.
    const exits = [
      { distance: x - (box.minX - extentX), nx: -1, nz: 0 },
      { distance: box.maxX + extentX - x, nx: 1, nz: 0 },
      { distance: z - (box.minZ - extentZ), nx: 0, nz: -1 },
      { distance: box.maxZ + extentZ - z, nx: 0, nz: 1 },
    ].sort((a, b) => a.distance - b.distance);
    const exit = exits[0];
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
    const relative = this.state.heading - this.route.routeYaw(this.state.progress);
    const halfWidth = !this.customRoute && !this.state.airborne && !this.explorationActive
      ? Math.max(CAR_HALF_WIDTH, Math.abs(Math.cos(relative)) * CAR_HALF_WIDTH + Math.abs(Math.sin(relative)) * CAR_HALF_LENGTH)
      : CAR_HALF_WIDTH;
    return Math.max(0, width - halfWidth);
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
  private untimed = false;
  private explorationActive = false;
  private worldX: number;
  private worldZ: number;
  private networkPosition: { x: number; z: number } | null = null;
  private safeProgress: number;
  private playgroundObstacles: SolidBox[] = [];
  private plazaHop = false;
  private knockedProps = new Set<string>();
  private propImpacts: PropImpact[] = [];
  private scrapeNormals = new Set<string>();
  private collisionRecovery: CollisionRecovery | null = null;

  /** Whether boost was actually applied during the latest physics step. */
  get boosting(): boolean { return this.lastBoosting; }
  /** Consume each lightweight prop's first impact once; recovery retains damage. */
  drainPropImpacts(): PropImpact[] { return this.propImpacts.splice(0); }
  get exploring(): boolean { return this.explorationActive; }
  get position(): { x: number; y: number; z: number } {
    if (this.networkPosition) return { ...this.networkPosition, y: this.state.y };
    return this.explorationActive ? { x: this.worldX, y: this.state.y, z: this.worldZ } : { ...this.route.routePoint(this.state.progress, this.state.lateral), y: this.state.y };
  }
  get groundHeight(): number { return this.explorationActive ? this.explorationSupportHeight() : this.route.sampleRoute(this.state.progress).y; }
  get nextRaceGate(): { x: number; z: number; progress: number; label: string } | undefined {
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
    this.networkPosition = null;
    this.state = initialState(this.route);
    this.untimed = false;
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
    this.safeProgress = this.route.START_PROGRESS;
    this.plazaHop = false;
    this.knockedProps.clear(); this.propImpacts.length = 0; this.scrapeNormals.clear();
    this.collisionRecovery = null;
  }

  exportState(): DrivingCheckpoint {
    return {
      version: 1, state: { ...this.state }, lateralVelocity: this.lateralVelocity, steering: this.steering,
      wallBlocked: this.wallBlocked, edgeCooldown: this.edgeCooldown,
      activeLaunch: this.activeLaunch ? this.route.LAUNCH_ZONES.indexOf(this.activeLaunch) : null,
      liftBias: this.liftBias, launchedZones: [...this.launchedZones], collectedBoosts: [...this.collectedBoosts],
      surgeSpeed: this.surgeSpeed, boostLocked: this.boostLocked, lastBoosting: this.lastBoosting,
      hitObstacles: [...this.hitObstacles], explorationEnabled: this.explorationEnabled,
      untimed: this.untimed, explorationActive: this.explorationActive,
      worldX: this.worldX, worldZ: this.worldZ, safeProgress: this.safeProgress, plazaHop: this.plazaHop,
      knockedProps: [...this.knockedProps], propImpacts: this.propImpacts.map(impact => ({ ...impact })),
      scrapeNormals: [...this.scrapeNormals],
      collisionRecovery: this.collisionRecovery ? { ...this.collisionRecovery } : null,
    };
  }

  /** Validate completely before replacing state; never simulate time spent offline. */
  restoreState(value: unknown): void {
    const fail = (): never => { throw new Error('Invalid driving checkpoint.'); };
    const record = (input: unknown): Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : fail();
    const number = (input: unknown) => typeof input === 'number' && Number.isFinite(input) && Math.abs(input) <= 1e9 ? input : fail();
    const boolean = (input: unknown) => typeof input === 'boolean' ? input : fail();
    const strings = (input: unknown) => {
      if (!Array.isArray(input) || input.length > 10000 || input.some(item => typeof item !== 'string' || item.length > 128) || new Set(input).size !== input.length) return fail();
      return input as string[];
    };
    const indexes = (input: unknown, length: number) => {
      if (!Array.isArray(input) || input.length > length || input.some(item => !Number.isSafeInteger(item) || item < 0 || item >= length) || new Set(input).size !== input.length) return fail();
      return input as number[];
    };
    const source = record(value), rawState = record(source.state);
    if (source.version !== 1) fail();
    const state = Object.fromEntries(Object.entries(initialState(this.route)).map(([key, initial]) => [key,
      typeof initial === 'boolean' ? boolean(rawState[key]) : number(rawState[key])])) as DriveState;
    if (state.progress < 0 || state.progress > this.route.TRACK_LENGTH || state.elapsed < 0 || !Number.isSafeInteger(state.checkpoint) || state.checkpoint < 0 || state.checkpoint > this.route.CHECKPOINTS.length) fail();
    for (const count of [state.launches, state.collisions]) if (!Number.isSafeInteger(count) || count < 0) fail();
    const activeLaunch = source.activeLaunch === null ? null : indexes([source.activeLaunch], this.route.LAUNCH_ZONES.length)[0];
    if (!Array.isArray(source.propImpacts) || source.propImpacts.length > 10000) fail();
    const propImpacts = (source.propImpacts as unknown[]).map(value => {
      const impact = record(value);
      if (typeof impact.id !== 'string' || impact.id.length > 128) fail();
      return { id: impact.id as string, x: number(impact.x), y: number(impact.y), z: number(impact.z), vx: number(impact.vx), vz: number(impact.vz), speed: number(impact.speed) };
    });
    let collisionRecovery: CollisionRecovery | null = null;
    if (source.collisionRecovery != null) {
      const recovery = record(source.collisionRecovery);
      collisionRecovery = { age: number(recovery.age), nx: number(recovery.nx), nz: number(recovery.nz), recoil: number(recovery.recoil), heading: number(recovery.heading), exitHeading: number(recovery.exitHeading) };
      if (collisionRecovery.age < 0 || collisionRecovery.age > COLLISION_RECOVERY_SECONDS || collisionRecovery.recoil < 0 || collisionRecovery.recoil > 8
        || Math.abs(Math.hypot(collisionRecovery.nx, collisionRecovery.nz) - 1) > 1e-6) fail();
    }
    const parsed: DrivingCheckpoint = {
      version: 1, state, lateralVelocity: number(source.lateralVelocity), steering: number(source.steering),
      wallBlocked: boolean(source.wallBlocked), edgeCooldown: number(source.edgeCooldown), activeLaunch,
      liftBias: number(source.liftBias), launchedZones: indexes(source.launchedZones, this.route.LAUNCH_ZONES.length),
      collectedBoosts: indexes(source.collectedBoosts, this.route.BOOST_ZONES?.length ?? 0),
      surgeSpeed: number(source.surgeSpeed), boostLocked: boolean(source.boostLocked), lastBoosting: boolean(source.lastBoosting),
      hitObstacles: indexes(source.hitObstacles, this.obstacles.length), explorationEnabled: boolean(source.explorationEnabled),
      untimed: boolean(source.untimed), explorationActive: boolean(source.explorationActive),
      worldX: number(source.worldX), worldZ: number(source.worldZ), safeProgress: number(source.safeProgress), plazaHop: boolean(source.plazaHop),
      knockedProps: strings(source.knockedProps), propImpacts, scrapeNormals: strings(source.scrapeNormals),
      collisionRecovery,
    };
    if (parsed.safeProgress < 0 || parsed.safeProgress > this.route.TRACK_LENGTH || (this.customRoute && parsed.explorationEnabled)) fail();
    this.networkPosition = null;
    this.state = parsed.state; this.lateralVelocity = parsed.lateralVelocity; this.steering = parsed.steering;
    this.wallBlocked = parsed.wallBlocked; this.edgeCooldown = parsed.edgeCooldown;
    this.activeLaunch = parsed.activeLaunch === null ? undefined : this.route.LAUNCH_ZONES[parsed.activeLaunch];
    this.liftBias = parsed.liftBias; this.launchedZones = new Set(parsed.launchedZones); this.collectedBoosts = new Set(parsed.collectedBoosts);
    this.surgeSpeed = parsed.surgeSpeed; this.boostLocked = parsed.boostLocked; this.lastBoosting = parsed.lastBoosting;
    this.hitObstacles = new Set(parsed.hitObstacles); this.explorationEnabled = parsed.explorationEnabled;
    this.untimed = parsed.untimed; this.explorationActive = parsed.explorationActive;
    this.worldX = parsed.worldX; this.worldZ = parsed.worldZ; this.safeProgress = parsed.safeProgress; this.plazaHop = parsed.plazaHop;
    this.knockedProps = new Set(parsed.knockedProps); this.propImpacts = parsed.propImpacts; this.scrapeNormals = new Set(parsed.scrapeNormals);
    this.collisionRecovery = parsed.collisionRecovery ?? null;
  }

  /** Start the public-square playground without a race countdown. */
  explore(untimed = false) {
    this.reset();
    if (this.customRoute) return;
    this.untimed = untimed;
    this.explorationEnabled = true;
    this.explorationActive = true;
    this.worldX = 0; this.worldZ = -44;
    this.state.heading = 0;
    this.state.y = playgroundHeight(this.worldX, this.worldZ);
    this.projectExplorationPosition();
  }

  /** Nearby road recovery never awards gates or erases race statistics. */
  recover() {
    const finished = this.state.finished;
    if (finished) return;
    if (this.customRoute) { this.seek(this.safeProgress); return; }
    const gate = this.untimed ? undefined : this.nextRaceGate?.progress;
    let target = Math.max(this.route.START_PROGRESS, this.state.progress - 4);
    if (gate !== undefined) target = Math.min(target, gate - 8);
    // Recover before takeoff rather than dropping a grounded car into a flight.
    const flight = this.route.LAUNCH_ZONES.find(z => target >= z.progress && target < z.end);
    if (flight) target = flight.progress - 8;
    for (let back = 0; back <= 80; back += 2) {
      const progress = Math.max(this.route.START_PROGRESS, target - back);
      for (const lateral of [0, -3.2, 3.2]) {
        const p = this.route.routePoint(progress, lateral), yaw = this.route.routeYaw(progress);
        const ex = Math.abs(Math.sin(yaw)) * CAR_HALF_LENGTH + Math.abs(Math.cos(yaw)) * CAR_HALF_WIDTH + .4;
        const ez = Math.abs(Math.cos(yaw)) * CAR_HALF_LENGTH + Math.abs(Math.sin(yaw)) * CAR_HALF_WIDTH + .4;
        const blocked = [...PLAYGROUND_COLLIDERS, ...this.playgroundObstacles].some(box => !box.propId
          && p.y < box.maxY && p.y + 1.65 > box.minY
          && p.x + ex > box.minX && p.x - ex < box.maxX && p.z + ez > box.minZ && p.z - ez < box.maxZ);
        if (!blocked) { this.seek(progress, lateral); return; }
      }
    }
    this.seek(this.safeProgress);
  }

  /** Render an authoritative multiplayer state; this client does not score it. */
  applyNetworkState(state: DriveState, position: {x:number;z:number}, exploring: boolean) {
    Object.assign(this.state, state);
    this.worldX = position.x; this.worldZ = position.z;
    // Network playback interpolates in world space, including corners and the
    // plaza/road boundary. Re-projecting its pose from route progress discards
    // that interpolation and makes the car and camera jump at packet cadence.
    this.networkPosition = { x: position.x, z: position.z };
    this.explorationActive = exploring;
  }

  /** Reposition for a retry without erasing race time, earned gates, or statistics. */
  seek(progress: number, lateral = 0) {
    this.networkPosition = null;
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
    this.hitObstacles.clear();
    this.collisionRecovery = null;
    for (const index of this.launchedZones) if (this.route.LAUNCH_ZONES[index].progress >= s.progress) this.launchedZones.delete(index);
    for (const index of this.collectedBoosts) if (this.route.BOOST_ZONES![index].end >= s.progress) this.collectedBoosts.delete(index);
  }

  update(dt: number, input: DriveInput): RaceEvent[] {
    this.networkPosition = null;
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
    if (a > 1e-7 || b < -1e-7 || b - a < 1e-8) return false;
    const t = clamp(-a / (b - a), 0, 1), x = fromX + (toX - fromX) * t, z = fromZ + (toZ - fromZ) * t;
    return Math.abs((x - p.x) * fz - (z - p.z) * fx) <= this.route.ROAD_HALF_WIDTH + 1;
  }

  private scoreWorldGates(fromX: number, fromZ: number, toX: number, toZ: number, events: RaceEvent[]) {
    const s = this.state;
    const progress = this.route.CHECKPOINTS[s.checkpoint];
    if (progress !== undefined && this.crossedGate(fromX, fromZ, toX, toZ, progress)) {
      s.checkpoint++;
      this.safeProgress = Math.min(progress + 3, this.route.TRACK_LENGTH - 8);
      events.push('checkpoint');
    }
  }

  /** A short swept recoil, never a teleport or a reverse-gear camera change. */
  private beginCollisionRecovery(nx: number, nz: number, input: DriveInput, passObstacle = false): boolean {
    const s = this.state;
    if (this.collisionRecovery || s.airborne || s.speed <= 2) return false;
    const tangentX = -nz, tangentZ = nx, yaw = this.route.routeYaw(s.progress);
    // Respect a deliberate turn; otherwise follow the open wall toward the
    // route. A square-on parked-car hit chooses the side nearer lane centre.
    let preference = Math.abs(input.steer) > .15
      ? input.steer * (Math.cos(s.heading) * tangentX - Math.sin(s.heading) * tangentZ)
      : Math.sin(yaw) * tangentX + Math.cos(yaw) * tangentZ;
    if (Math.abs(preference) < .15) {
      const center = this.route.routePoint(s.progress, 0), position = this.position;
      preference = (center.x - position.x) * tangentX + (center.z - position.z) * tangentZ;
    }
    const side = preference < 0 ? -1 : 1;
    const heading = Math.atan2(tangentX * side + nx * .15, tangentZ * side + nz * .15);
    const routeHeading = yaw + (Math.cos(s.heading - yaw) < 0 ? Math.PI : 0);
    this.collisionRecovery = { age: 0, nx, nz, recoil: clamp(s.speed * .25, 3.5, 8),
      heading, exitHeading: passObstacle ? routeHeading : Math.atan2(tangentX * side, tangentZ * side) };
    s.speed = Math.min(6, s.speed * .14);
    s.surge = 0; this.lastBoosting = false;
    this.edgeCooldown = Math.max(this.edgeCooldown, COLLISION_RECOVERY_SECONDS + .2);
    return true;
  }

  private advanceCollisionRecovery(dt: number, input: DriveInput) {
    const recovery = this.collisionRecovery;
    if (!recovery || this.state.airborne) {
      if (this.state.airborne) this.collisionRecovery = null;
      return { input, vx: 0, vz: 0 };
    }
    recovery.age = Math.min(COLLISION_RECOVERY_SECONDS, recovery.age + dt);
    const settle = clamp((recovery.age - .65) / .5, 0, 1);
    const exitTurn = Math.atan2(Math.sin(recovery.exitHeading - recovery.heading), Math.cos(recovery.exitHeading - recovery.heading));
    const target = recovery.heading + exitTurn * settle;
    const turn = Math.atan2(Math.sin(target - this.state.heading), Math.cos(target - this.state.heading));
    // Braking or steering deliberately takes priority over the courtesy turn.
    this.state.heading += clamp(turn, -3.2 * dt, 3.2 * dt) * (input.brake > .2 ? 0 : 1 - Math.abs(input.steer));
    const recoil = recovery.recoil * Math.exp(-8 * recovery.age);
    const pedal = clamp((recovery.age - .22) / .35, 0, 1);
    if (recovery.age >= COLLISION_RECOVERY_SECONDS) this.collisionRecovery = null;
    return { input: { ...input, throttle: input.throttle * pedal, boost: false }, vx: recovery.nx * recoil, vz: recovery.nz * recoil };
  }

  private stepExploration(dt: number, input: DriveInput, events: RaceEvent[]) {
    const s = this.state, oldX = this.worldX, oldZ = this.worldZ, oldY = s.y;
    if (!input.boost) this.boostLocked = false;
    const recovery = this.advanceCollisionRecovery(dt, input); input = recovery.input;
    this.edgeCooldown = Math.max(0, this.edgeCooldown - dt);
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
    const dx = (Math.sin(s.heading) * s.speed + recovery.vx) * dt, dz = (Math.cos(s.heading) * s.speed + recovery.vz) * dt;
    const ex = Math.abs(Math.sin(s.heading)) * CAR_HALF_LENGTH + Math.abs(Math.cos(s.heading)) * CAR_HALF_WIDTH;
    const ez = Math.abs(Math.cos(s.heading)) * CAR_HALF_LENGTH + Math.abs(Math.sin(s.heading)) * CAR_HALF_WIDTH;
    let moveX = dx, moveZ = dz, moveSeconds = dt, collided = false, initialRetention = 1, maxNormalRatio = 0;
    let impactNormal: { nx: number; nz: number; passObstacle: boolean } | undefined;
    const contacts = new Set<string>();
    const paths: { x: number; z: number; dx: number; dz: number; seconds: number }[] = [];
    const boxes: readonly SolidBox[] = [...PLAYGROUND_COLLIDERS, ...this.playgroundObstacles, ...DISTRICT_WALLS];
    for (let pass = 0; pass < 3 && Math.hypot(moveX, moveZ) > 1e-8; pass++) {
      let contact: ReturnType<typeof sweepBox>, passObstacle = false;
      for (const box of boxes) {
        if (box.propId) continue;
        if (s.y + 1.65 < box.minY || s.y >= box.maxY - .08) continue;
        const candidate = sweepBox(this.worldX, this.worldZ, moveX, moveZ, box, ex, ez);
        if (candidate && (!contact || candidate.time < contact.time)) { contact = candidate; passObstacle = box.id.startsWith('parked-'); }
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
      if (normalRatio > maxNormalRatio) { maxNormalRatio = normalRatio; impactNormal = { ...contact, passObstacle }; }
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
      const recovered = impactNormal && maxNormalRatio > .72 && !this.scrapeNormals.has(`${impactNormal.nx},${impactNormal.nz}`)
        && this.beginCollisionRecovery(impactNormal.nx, impactNormal.nz, input, impactNormal.passObstacle);
      const retainedSpeed = Math.abs(s.speed) * (recovered || this.collisionRecovery ? 1 : initialRetention);
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
    if (!input.boost) this.boostLocked = false;
    const recovery = this.advanceCollisionRecovery(dt, input); input = recovery.input;
    const oldProgress = s.progress;
    const oldLateral = s.lateral;
    const oldPosition = this.route.routePoint(oldProgress, oldLateral);
    const wasScraping = this.wallBlocked;
    this.edgeCooldown = Math.max(0, this.edgeCooldown - dt);
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
    if (!this.customRoute && !s.airborne) {
      const speed = Math.abs(s.speed), direction = Math.sign(s.speed);
      const pedal = direction < 0 ? input.brake : input.throttle;
      const resistance = speed > 0 ? .6 + .015 * speed + .003 * speed * speed
        + (1 - pedal) * (2.2 + .1 * speed) + (input.drift ? 3.8 + .045 * speed : 0) : 0;
      const drive = s.speed < -.05 ? -input.brake * 10 + input.throttle * 34
        : s.speed > .05 ? input.throttle * (boosting ? 28 : 19) - input.brake * 34
        : input.throttle * (boosting ? 28 : 19) - input.brake * 10;
      const downhill = speed > .5 ? -this.route.routeSlope(s.progress) * Math.cos(s.heading-this.route.routeYaw(s.progress)) * 4 : 0;
      let nextSpeed = s.speed + (drive - direction * resistance + downhill) * dt;
      if (direction && Math.sign(nextSpeed) !== direction) nextSpeed = 0;
      s.speed = clamp(nextSpeed, -10, Math.max(terminalSpeed, s.speed - 24 * dt));
    } else {
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
    }

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
      // At a blocked curb, gas plus steering can still turn the nose at a crawl;
      // the brief impact assist above yields to the driver's steering.
      const yawSpeed = this.wallBlocked ? (Math.abs(s.speed) > 8 ? s.speed : (input.throttle - input.brake) * 8) : s.speed;
      s.heading += yawSpeed * this.steering * steeringCurvature(Math.abs(yawSpeed), input.drift) * dt;
      const relative = s.heading - this.route.routeYaw(s.progress);
      if (Math.abs(s.lateral) < this.edge - .02 || s.speed * Math.sin(relative) * Math.sign(s.lateral) <= 0) this.wallBlocked = false;
      this.lateralVelocity = s.speed * Math.sin(relative);
      // Frenet coordinates convert the driver's world velocity into road
      // progress. The offset-radius term keeps an unsteered car travelling
      // straight in world space as the road curves underneath it.
      forwardSpeed = s.speed * Math.cos(relative) / (1 - this.route.routeCurvature(s.progress) * s.lateral);
    }
    const roadYaw = this.route.routeYaw(oldProgress);
    this.lateralVelocity += recovery.vx * Math.cos(roadYaw) - recovery.vz * Math.sin(roadYaw);
    forwardSpeed += (recovery.vx * Math.sin(roadYaw) + recovery.vz * Math.cos(roadYaw)) / (1 - this.route.routeCurvature(oldProgress) * oldLateral);
    s.lateral += this.lateralVelocity * dt;
    s.progress = Math.max(0, s.progress + forwardSpeed * dt);

    // Pads are physical strips: the swept wheel corridor must cross the color.
    // Crossing elsewhere in the street cannot collect a boost, nor can flight.
    if (!s.airborne && !this.collisionRecovery && s.progress > oldProgress && input.brake < .2) {
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
        const normalRatio = clamp(Math.abs(this.lateralVelocity) / Math.max(Math.abs(s.speed), 1e-8), 0, 1);
        const tangentRatio = Math.sqrt(Math.max(0, 1 - normalRatio * normalRatio));
        const recovered = normalRatio > .72 && !wasScraping && this.beginCollisionRecovery(-side * Math.cos(roadYaw), side * Math.sin(roadYaw), input);
        // Inward movement stays blocked, without applying the impact penalty
        // again on every physics step during the rebound.
        if (!recovered && !this.collisionRecovery) {
          if (tangentRatio < .12) s.speed = 0;
          else {
            if (!wasScraping) s.speed *= tangentRatio;
            s.speed = Math.sign(s.speed) * Math.max(0, Math.abs(s.speed) - (.35 + Math.abs(s.speed) * .10 * normalRatio) * dt);
          }
        }
        this.wallBlocked = true;
      }
      this.lateralVelocity = 0;
    }

    for (let i = 0; i < this.obstacles.length; i++) {
      const obstacle = this.obstacles[i];
      // Contact immunity lasts only until the car leaves this obstacle.
      const separated = Math.abs(oldProgress - obstacle.progress) > obstacle.length / 2 + CAR_HALF_LENGTH + .5
        || Math.abs(oldLateral - obstacle.lateral) > obstacle.width / 2 + CAR_HALF_WIDTH + .5;
      if (separated) this.hitObstacles.delete(i);
      if (this.customRoute && this.hitObstacles.has(i)) continue;
      if (this.customRoute && !intersectsObstacle(oldProgress, oldLateral, s.progress, s.lateral, obstacle)) continue;
      // A car airborne above the roof can clear it; small crest hops still collide.
      const clearance = obstacle.kind === 'cablecar' ? 3.8 : obstacle.kind === 'car' ? 1.6 : 1.2;
      if (s.y - this.route.sampleRoute(s.progress).y > clearance) continue;
      if (!this.customRoute) {
        const relative = s.heading - this.route.routeYaw(oldProgress);
        const halfX = Math.abs(Math.cos(relative)) * CAR_HALF_WIDTH + Math.abs(Math.sin(relative)) * CAR_HALF_LENGTH;
        const halfZ = Math.abs(Math.sin(relative)) * CAR_HALF_WIDTH + Math.abs(Math.cos(relative)) * CAR_HALF_LENGTH;
        const dx = s.lateral - oldLateral, dz = s.progress - oldProgress;
        const contact = sweepBox(oldLateral, oldProgress, dx, dz, {
          id: `road-${i}`, minX: obstacle.lateral-obstacle.width/2, maxX: obstacle.lateral+obstacle.width/2,
          minZ: obstacle.progress-obstacle.length/2, maxZ: obstacle.progress+obstacle.length/2, minY: 0, maxY: 10,
        }, halfX, halfZ);
        if (!contact) continue;
        const t = Math.max(0, contact.time-.001);
        const normalRatio = clamp(-(dx*contact.nx+dz*contact.nz)/Math.max(Math.hypot(dx,dz),1e-8),0,1);
        s.lateral = oldLateral+dx*t+contact.nx*(contact.penetration+.002);
        s.progress = Math.max(0,oldProgress+dz*t+contact.nz*(contact.penetration+.002));
        // Keep the tangential part of the remaining movement along the bumper.
        const into = dx*contact.nx+dz*contact.nz;
        s.lateral += (dx-Math.min(0,into)*contact.nx)*(1-t);
        s.progress = Math.max(0,s.progress+(dz-Math.min(0,into)*contact.nz)*(1-t));
        if (!this.hitObstacles.has(i) && this.edgeCooldown === 0 && Math.abs(s.speed)*normalRatio>5) { s.collisions++; events.push('crash'); this.edgeCooldown = .7; }
        const retention = Math.sqrt(Math.max(0,1-normalRatio*normalRatio));
        const recovered = normalRatio > .72 && !this.hitObstacles.has(i) && this.beginCollisionRecovery(
          contact.nx * Math.cos(roadYaw) + contact.nz * Math.sin(roadYaw),
          -contact.nx * Math.sin(roadYaw) + contact.nz * Math.cos(roadYaw), input, true);
        if (!recovered && !this.collisionRecovery) {
          if (retention<.12) s.speed=0;
          else if (!this.hitObstacles.has(i)) s.speed*=retention;
        }
        this.hitObstacles.add(i);this.wallBlocked=true;
        continue;
      }
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
      if (this.untimed || !this.explorationEnabled || s.checkpoint >= this.route.CHECKPOINTS.length) {
        s.finished = true;
        events.push('finish');
      } else {
        // The route ends here, so clamping position and speed without finishing
        // traps the driver at the Ferry Building forever. Restore the last
        // earned gate, preserving the clock and ordered checkpoint requirement.
        this.recover();
        events.push('missed-gate');
      }
    }
  }
}

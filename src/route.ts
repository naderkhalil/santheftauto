/** Route distances are horizontal metres; world x points east and z points north. */
export const ROAD_HALF_WIDTH = 7.4;
export const START_PROGRESS = 12;
export const ROUTE_POLYLINE: readonly (readonly [number, number])[] = [
  [-75, 65], [75, 65], [75, -65], [-75, -65], [-75, 300],
  [175, 300], [175, 700], [590, 700], [590, 250], [670, 250],
];
const CORNER_RADIUS = 18;
type Point2 = { x: number; z: number };
type Line = { kind: 'line'; start: number; length: number; a: Point2; tangent: Point2 };
type Arc = { kind: 'arc'; start: number; length: number; center: Point2; angle: number; turn: number; radius: number };
type Segment = Line | Arc;
const segments: Segment[] = [];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const smooth = (t: number) => t * t * (3 - 2 * t);
const point = ([x, z]: readonly number[]): Point2 => ({ x, z });
const direction = (a: Point2, b: Point2) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};
let length = 0;
function line(a: Point2, b: Point2) {
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  if (span < 1e-8) return;
  segments.push({ kind: 'line', start: length, length: span, a, tangent: direction(a, b) });
  length += span;
}
let previous = point(ROUTE_POLYLINE[0]);
for (let i = 1; i < ROUTE_POLYLINE.length - 1; i++) {
  const a = point(ROUTE_POLYLINE[i - 1]), b = point(ROUTE_POLYLINE[i]), c = point(ROUTE_POLYLINE[i + 1]);
  const incoming = direction(a, b), outgoing = direction(b, c);
  const turnAngle = Math.acos(clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1));
  const trim = CORNER_RADIUS * Math.tan(turnAngle / 2);
  const entry = { x: b.x - incoming.x * trim, z: b.z - incoming.z * trim };
  const exit = { x: b.x + outgoing.x * trim, z: b.z + outgoing.z * trim };
  line(previous, entry);
  const turn = Math.sign(incoming.x * outgoing.z - incoming.z * outgoing.x);
  const center = { x: entry.x - incoming.z * turn * CORNER_RADIUS, z: entry.z + incoming.x * turn * CORNER_RADIUS };
  const arcLength = CORNER_RADIUS * turnAngle;
  segments.push({ kind: 'arc', start: length, length: arcLength, center, angle: Math.atan2(entry.z - center.z, entry.x - center.x), turn, radius: CORNER_RADIUS });
  length += arcLength;
  previous = exit;
}
line(previous, point(ROUTE_POLYLINE[ROUTE_POLYLINE.length - 1]));
export const TRACK_LENGTH = length;

function planAt(distance: number) {
  const s = clamp(distance, 0, TRACK_LENGTH);
  const segment = segments.find(segment => s <= segment.start + segment.length + 1e-8) ?? segments[segments.length - 1];
  const along = clamp(s - segment.start, 0, segment.length);
  let x: number, z: number, tangent: Point2, curvature: number;
  if (segment.kind === 'line') {
    tangent = segment.tangent; curvature = 0;
    x = segment.a.x + tangent.x * along; z = segment.a.z + tangent.z * along;
  } else {
    const a = segment.angle + segment.turn * along / segment.radius;
    x = segment.center.x + Math.cos(a) * segment.radius;
    z = segment.center.z + Math.sin(a) * segment.radius;
    tangent = { x: -Math.sin(a) * segment.turn, z: Math.cos(a) * segment.turn };
    curvature = -segment.turn / segment.radius;
  }
  // Camera look-ahead and the finish apron continue along the terminal streets.
  const extension = distance - s;
  return { x: x + tangent.x * extension, z: z + tangent.z * extension, tangent, curvature };
}

function profileHeight(value: number, knots: readonly (readonly [number, number])[]) {
  if (value <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1], b = knots[i];
    if (value <= b[0]) return a[1] + (b[1] - a[1]) * smooth((value - a[0]) / (b[0] - a[0]));
  }
  return knots[knots.length - 1][1];
}
const powellHeights = [[100, 22], [200, 55], [275, 45]] as const;
const grantHeights = [[330, 45], [490, 85], [610, 56]] as const;
const washingtonHeights = [[175, 56], [245, 78], [540, 5]] as const;
const downtownHeights = [[100, 22], [282, 45]] as const;
const waterfrontHeights = [[250, 2], [400, 5]] as const;
const blend = (a: number, b: number, value: number, from: number, to: number) => a + (b - a) * smooth(clamp((value - from) / (to - from), 0, 1));

function terrainField(x: number, z: number): number {
  const powell = profileHeight(z, powellHeights);
  const grant = profileHeight(z, z < 300 ? downtownHeights : grantHeights);
  const waterfront = profileHeight(z, waterfrontHeights);
  // District grades blend across the intervening blocks. Each driven street
  // stays inside its unblended plateau, so both lanes keep the authored grade
  // without vertical walls in side streets or the continuous city terrain.
  const inland = blend(powell, grant, x, 40, 150);
  const eastSide = blend(inland, waterfront, x, 230, 560);
  return blend(eastSide, profileHeight(x, washingtonHeights), z, 610, 682);
}

/** Footprints reserved for the authored square, ordered minX, maxX, minZ, maxZ.
 * These include cornices/returns, not the racing street or its sidewalks.
 * Keep in step with the north-square and square-frontages Blender sources.
 */
const squareParcels: readonly (readonly [number, number, number, number])[] = [
  [-60, 60, -50, 50],                         // public square
  [-161, -92, -50, 50],                       // Westin
  [-67, 63, 79, 132],                         // Post frontage and Apple garden
  [31, 63, 132, 185], [-67, -28, 132, 183],   // Hyatt and Beacon Grand
  [-131, -87, 80, 111], [-113, -87, 110, 136], [-184, -129, 80, 136],
  [-28.5, 30, 132, 183],
  [88, 162, 80, 132], [88, 162, 138, 177],    // 278 Post and Campton Place
  [-129, -87, -183, -82], [-186, -128, -183, -82],
  [-61, 61, -183, -82], [93, 162, -133, -82], // Macy's and Neiman Marcus
  [93, 162, 5, 49], [93, 162, -49, -5],      // Stockton, leaving Maiden Lane open
];

/** Used by background buildings and non-racing cross streets only. */
export function intersectsSquareParcel(x: number, z: number, width: number, depth: number): boolean {
  return squareParcels.some(([minX, maxX, minZ, maxZ]) =>
    x + width / 2 > minX && x - width / 2 < maxX &&
    z + depth / 2 > minZ && z - depth / 2 < maxZ);
}

function squareTerrain(x: number, z: number, field: number): number {
  // The clear Apple interior and its public garden need a real level lot;
  // the old Powell hill field rose straight through their floors. Carry that
  // block datum behind the Post frontage, then ease back into the wider city.
  const dx = Math.max(-143 - x, 0, x - 131);
  const dz = Math.max(79 - z, 0, z - 185);
  const lotWeight = 1 - smooth(clamp(Math.hypot(dx, dz) / 64, 0, 1));
  // Preserve the full uphill Powell sidewalk. The opaque hotel foundations
  // meet the rising hillside; a broad transition avoids a trench beside it.
  const awayFromPowell = smooth(clamp((Math.abs(x + 75) - 12.7) / 43, 0, 1));
  return field + (22 - field) * lotWeight * awayFromPowell;
}

/** Shared grade for street meshes and buildings, including the flat square. */
export function groundHeight(x: number, z: number): number {
  const field = squareTerrain(x, z, terrainField(x, z)), nearest = planAt(routeProgressAt(x, z));
  const distance = Math.hypot(x - nearest.x, z - nearest.z);
  // A street cuts a level cross-section through the surrounding hill. Match
  // the entire sidewalk width, then ease back into the broader terrain.
  // Fade before the 18 m corner centres, where two street projections can be
  // equally close. That keeps the surrounding hill continuous there too.
  if (distance >= 17.5) return field;
  return blend(terrainField(nearest.x, nearest.z), field, distance, 12.7, 17.5);
}

export function sampleRoute(distance: number) {
  const p = planAt(distance);
  return { x: p.x, y: terrainField(p.x, p.z), z: p.z };
}
/** Horizontal offset follows the route normal, rather than a fixed world axis. */
export function routePoint(distance: number, lateral = 0) {
  const p = planAt(distance);
  return { x: p.x + p.tangent.z * lateral, y: terrainField(p.x, p.z), z: p.z - p.tangent.x * lateral };
}
export function routeYaw(distance: number) {
  const p = planAt(distance); return Math.atan2(p.tangent.x, p.tangent.z);
}
export function routeSlope(distance: number) {
  const epsilon = .02;
  return (sampleRoute(distance + epsilon).y - sampleRoute(distance - epsilon).y) / (2 * epsilon);
}
export function routeCurvature(distance: number) { return planAt(distance).curvature; }
export function routeFrame(distance: number) {
  const p = planAt(distance);
  return {
    position: sampleRoute(distance), tangent: p.tangent, normal: { x: p.tangent.z, z: -p.tangent.x },
    yaw: Math.atan2(p.tangent.x, p.tangent.z), slope: routeSlope(distance), curvature: p.curvature,
  };
}

/** Nearest route distance is for authoring scenery/stops, never for race progress. */
export function routeProgressAt(x: number, z: number): number {
  let best = 0, bestDistance = Infinity;
  for (const segment of segments) {
    let local: number;
    if (segment.kind === 'line') {
      local = clamp((x - segment.a.x) * segment.tangent.x + (z - segment.a.z) * segment.tangent.z, 0, segment.length);
    } else {
      let angle = Math.atan2(z - segment.center.z, x - segment.center.x) - segment.angle;
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      local = clamp(angle * segment.turn * segment.radius, 0, segment.length);
    }
    const s = segment.start + local, p = planAt(s), d = Math.hypot(p.x - x, p.z - z);
    if (d < bestDistance) { bestDistance = d; best = s; }
  }
  return best;
}
export const ROUTE_STOPS = {
  start: START_PROGRESS,
  stockton: routeProgressAt(75, 30),
  geary: routeProgressAt(35, -65),
  powell: routeProgressAt(-75, 120),
  bush: routeProgressAt(-25, 300),
  grant: routeProgressAt(175, 330),
  washington: routeProgressAt(205, 700),
  embarcadero: routeProgressAt(590, 660),
  market: routeProgressAt(620, 250),
  finish: TRACK_LENGTH,
};
export const CHECKPOINTS = [ROUTE_STOPS.powell, ROUTE_STOPS.grant, ROUTE_STOPS.embarcadero, TRACK_LENGTH];
export const DISTRICTS = [
  { name: 'UNION SQUARE', street: 'POST STREET', at: 0 },
  { name: 'UNION SQUARE', street: 'STOCKTON STREET', at: routeProgressAt(75, 47) },
  { name: 'UNION SQUARE', street: 'GEARY STREET', at: routeProgressAt(57, -65) },
  { name: 'POWELL STREET', street: 'CLIMB TOWARD BUSH', at: routeProgressAt(-75, -47) },
  { name: 'BUSH STREET', street: 'NEXT STOP · DRAGON GATE', at: routeProgressAt(-57, 300) },
  { name: 'CHINATOWN', street: 'GRANT AVENUE', at: routeProgressAt(175, 318) },
  { name: 'WASHINGTON STREET', street: 'DOWN TO THE BAY', at: routeProgressAt(193, 700) },
  { name: 'THE EMBARCADERO', street: 'SAN FRANCISCO WATERFRONT', at: routeProgressAt(590, 682) },
  { name: 'MARKET STREET', street: 'THE FERRY BUILDING', at: routeProgressAt(608, 250) },
];
export type LaunchZone = { progress: number; end: number; label: string };
export const LAUNCH_ZONES: readonly LaunchZone[] = [
  { progress: routeProgressAt(-75, 188), end: routeProgressAt(-75, 275), label: 'POWELL HILL LIFT-OFF' },
  { progress: routeProgressAt(175, 476), end: routeProgressAt(175, 610), label: 'GRANT AVENUE SKYWAY' },
  { progress: routeProgressAt(235, 700), end: routeProgressAt(540, 700), label: 'WASHINGTON BAY GLIDE' },
];
const glideArch = (zone: LaunchZone) => Math.min(28, (zone.end - zone.progress) * .13);

/** Hermite flight carries the road tangent at both release and touchdown. */
export function sampleGlidePath(distance: number, zone: LaunchZone): number {
  const span = zone.end - zone.progress, u = clamp((distance - zone.progress) / span, 0, 1);
  const takeoff = sampleRoute(zone.progress).y, landing = sampleRoute(zone.end).y;
  return takeoff + (landing - takeoff) * smooth(u)
    + routeSlope(zone.progress) * span * u * (1 - u) ** 2
    + routeSlope(zone.end) * span * u * u * (u - 1)
    + Math.sin(Math.PI * u) ** 2 * glideArch(zone);
}
export function glideSlope(distance: number, zone: LaunchZone): number {
  const span = zone.end - zone.progress, u = clamp((distance - zone.progress) / span, 0, 1);
  const drop = sampleRoute(zone.end).y - sampleRoute(zone.progress).y;
  return drop * 6 * u * (1 - u) / span
    + routeSlope(zone.progress) * (1 - 4 * u + 3 * u * u)
    + routeSlope(zone.end) * (3 * u * u - 2 * u)
    + glideArch(zone) * Math.PI * Math.sin(2 * Math.PI * u) / span;
}
export function districtAt(distance: number) { return [...DISTRICTS].reverse().find(d => distance >= d.at) ?? DISTRICTS[0]; }
export type Obstacle = { progress: number; lateral: number; width: number; length: number; kind: 'car' | 'cablecar' | 'barrier' };

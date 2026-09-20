export const TRACK_LENGTH = 1320;
export const ROAD_HALF_WIDTH = 7.4;
export const START_PROGRESS = 12;
export const CHECKPOINTS = [320, 650, 990, TRACK_LENGTH];
export const DISTRICTS = [
  { name: 'NOB HILL', street: 'CALIFORNIA STREET', at: 0 },
  { name: 'POWELL SKYWAY', street: 'BUSH STREET', at: 290 },
  { name: 'UNION SQUARE', street: 'POST STREET', at: 650 },
  { name: 'DOWNTOWN DAYDREAM', street: 'GEARY STREET', at: 990 },
  { name: 'MARKET STREET', street: 'THE FINISH LINE', at: 1240 },
];

/** A compressed, impossible version of Powell: three hilltops and a quiet plaza. */
const profile = [
  [0, 105, 0], [65, 110, 0], [150, 138, -5], [365, 27, -8],
  [410, 29, -8], [535, 94, 7], [740, 22, -2], [900, 22, -4],
  [1010, 90, 6], [1230, 5, 3], [1400, 2, 0],
];
export type LaunchZone = { progress: number; end: number; label: string };
export const LAUNCH_ZONES: readonly LaunchZone[] = [
  { progress: 150, end: 365, label: 'NOB HILL LIFT-OFF' },
  { progress: 535, end: 740, label: 'POWELL SKYWAY' },
  { progress: 1010, end: 1230, label: 'DOWNTOWN DAYDREAM' },
];

export function sampleRoute(distance: number) {
  const s = Math.max(0, Math.min(1399.99, distance));
  let i = 0;
  while (i < profile.length - 2 && s > profile[i + 1][0]) i++;
  const a = profile[i], b = profile[i + 1];
  const u = (s - a[0]) / (b[0] - a[0]);
  const smooth = u * u * (3 - 2 * u);
  return { x: a[2] + (b[2] - a[2]) * smooth, y: a[1] + (b[1] - a[1]) * smooth, z: distance };
}

/**
 * Arcade lift follows an authored corridor so every crest has a readable landing.
 * A Hermite takeoff tangent rises out of the hill; the arch and its derivative
 * return to zero at the valley. Ground and flight therefore meet without a snap.
 * This is also the placement contract for aerial hoops and camera previews.
 */
export function sampleGlidePath(distance: number, zone: LaunchZone): number {
  const span = zone.end - zone.progress;
  const u = Math.max(0, Math.min(1, (distance - zone.progress) / span));
  const takeoff = sampleRoute(zone.progress).y;
  const landing = sampleRoute(zone.end).y;
  const smooth = u * u * (3 - 2 * u);
  const launchTangent = .5 * span * u * (1 - u) ** 2;
  const arch = Math.sin(Math.PI * u) ** 2 * 28;
  return takeoff + (landing - takeoff) * smooth + launchTangent + arch;
}
export function routeSlope(distance: number) { return (sampleRoute(distance + 1).y - sampleRoute(distance - 1).y) / 2; }
export function routeYaw(distance: number) { return Math.atan2(sampleRoute(distance + 1).x - sampleRoute(distance - 1).x, 2); }
export function districtAt(distance: number) { return [...DISTRICTS].reverse().find(d => distance >= d.at) ?? DISTRICTS[0]; }
export type Obstacle = { progress: number; lateral: number; width: number; length: number; kind: 'car' | 'cablecar' | 'barrier' };

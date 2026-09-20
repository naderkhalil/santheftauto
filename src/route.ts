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
  { progress: 138, end: 365, label: 'NOB HILL LIFT-OFF' },
  { progress: 523, end: 740, label: 'POWELL SKYWAY' },
  { progress: 998, end: 1230, label: 'DOWNTOWN DAYDREAM' },
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
 * Release on the rounded shoulder, carrying the exact uphill road tangent.
 * The road falls away as that upward momentum eases into a glide; there is no
 * extra launch impulse. Both height and velocity match the road at each end.
 * This is also the placement contract for aerial hoops and camera previews.
 */
export function sampleGlidePath(distance: number, zone: LaunchZone): number {
  const span = zone.end - zone.progress;
  const u = Math.max(0, Math.min(1, (distance - zone.progress) / span));
  const takeoff = sampleRoute(zone.progress).y;
  const landing = sampleRoute(zone.end).y;
  const smooth = u * u * (3 - 2 * u);
  const launchTangent = routeSlope(zone.progress) * span * u * (1 - u) ** 2;
  const arch = Math.sin(Math.PI * u) ** 2 * 28;
  return takeoff + (landing - takeoff) * smooth + launchTangent + arch;
}
/** Analytic tangent of the actual road mesh, including a level tangent at crests. */
export function routeSlope(distance: number) {
  if(distance<=0||distance>=1399.99)return 0;
  let i=0;while(i<profile.length-2&&distance>profile[i+1][0])i++;
  const a=profile[i],b=profile[i+1],span=b[0]-a[0],u=(distance-a[0])/span;
  return (b[1]-a[1])*6*u*(1-u)/span;
}

/** One-sided endpoints avoid halving takeoff velocity through clamped sampling. */
export function glideSlope(distance:number,zone:LaunchZone):number {
  const span=zone.end-zone.progress,u=Math.max(0,Math.min(1,(distance-zone.progress)/span));
  const drop=sampleRoute(zone.end).y-sampleRoute(zone.progress).y;
  return drop*6*u*(1-u)/span + routeSlope(zone.progress)*(1-4*u+3*u*u)
    + 28*Math.PI*Math.sin(2*Math.PI*u)/span;
}
export function routeYaw(distance: number) { return Math.atan2(sampleRoute(distance + 1).x - sampleRoute(distance - 1).x, 2); }
export function districtAt(distance: number) { return [...DISTRICTS].reverse().find(d => distance >= d.at) ?? DISTRICTS[0]; }
export type Obstacle = { progress: number; lateral: number; width: number; length: number; kind: 'car' | 'cablecar' | 'barrier' };

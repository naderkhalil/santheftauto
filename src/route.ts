export const TRACK_LENGTH = 1320;
export const ROAD_HALF_WIDTH = 7.4;
export const START_PROGRESS = 12;
export const CHECKPOINTS = [320, 650, 990, TRACK_LENGTH];
export const DISTRICTS = [
  { name: 'NOB HILL', street: 'CALIFORNIA STREET', at: 0 },
  { name: 'POWELL DESCENT', street: 'BUSH STREET', at: 290 },
  { name: 'UNION SQUARE', street: 'POST STREET', at: 650 },
  { name: 'DOWNTOWN', street: 'GEARY STREET', at: 990 },
  { name: 'MARKET STREET', street: 'THE FINISH LINE', at: 1240 },
];
const profile = [
  [0, 110, 0], [95, 108, 0], [270, 78, -7], [335, 76, -9],
  [500, 47, 7], [565, 45, 10], [705, 23, 0], [820, 22, -4],
  [900, 20, -3], [1080, 7, 7], [1180, 4, 4], [1400, 2, 0],
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
export function routeSlope(distance: number) { return (sampleRoute(distance + 1).y - sampleRoute(distance - 1).y) / 2; }
export function routeYaw(distance: number) { return Math.atan2(sampleRoute(distance + 1).x - sampleRoute(distance - 1).x, 2); }
export function districtAt(distance: number) { return [...DISTRICTS].reverse().find(d => distance >= d.at) ?? DISTRICTS[0]; }
export type Obstacle = { progress: number; lateral: number; width: number; length: number; kind: 'car' | 'cablecar' | 'barrier' };

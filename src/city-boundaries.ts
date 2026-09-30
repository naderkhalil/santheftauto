import { PLAYGROUND_BOUNDS } from './playground.ts';
import { ROAD_HALF_WIDTH, routeProgressAt } from './route.ts';

const b = PLAYGROUND_BOUNDS;
/** Same district perimeter as collision, with the Powell handoff left open. */
export const CITY_BOUNDARY_SEGMENTS = [
  [b.minX, b.minZ, b.minX, b.maxZ],
  [b.maxX, b.minZ, b.maxX, b.maxZ],
  [b.minX, b.minZ, b.maxX, b.minZ],
  [b.minX, b.maxZ, -75 - ROAD_HALF_WIDTH, b.maxZ],
  [-75 + ROAD_HALF_WIDTH, b.maxZ, b.maxX, b.maxZ],
] as const;
export const CITY_CORRIDOR_START = routeProgressAt(-75, 184);

import type { CourseRoute } from './course-route.ts';
import type { Obstacle } from './route.ts';

/** Blender street-life prototypes occupy 1.88 × 4.6 metres at their widest.
 * Opposite-facing parked cars still present the same physical footprint. */
const CAR_WIDTH = 1.88;
const CAR_LENGTH = 4.6;

/** Project real parked-car placements into every visit to their street. The
 * repeated Hayes leg needs two separate collision stations for the same car. */
export function parkedCarObstacles(
  route: CourseRoute,
  placements: readonly { x: number; z: number; yaw: number }[],
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const seen = new Set<string>();
  const hints = [0, ...route.anchorProgress, route.TRACK_LENGTH];
  for (const car of placements) {
    if (![car.x, car.z, car.yaw].every(Number.isFinite)) continue;
    const stations: number[] = [];
    for (const hint of hints) {
      const progress = route.routeProgressAt(car.x, car.z, hint);
      if (stations.some(station => Math.abs(station - progress) < .05)) continue;
      stations.push(progress);
      const center = route.sampleRoute(progress), yaw = route.routeYaw(progress);
      const dx = car.x - center.x, dz = car.z - center.z;
      const lateral = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const alignment = Math.abs(Math.cos(car.yaw - yaw));
      // A nearby crossing street or parallel block must not become an invisible
      // collision wall on the race. Parked cars belong to straight road edges.
      if (Math.abs(lateral) > route.ROAD_HALF_WIDTH + .25 || Math.abs(along) > .6
        || alignment < .97 || Math.abs(route.routeCurvature(progress)) > .01) continue;
      const key = `${Math.round(progress * 20)}:${Math.round(lateral * 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sideways = Math.abs(Math.sin(car.yaw - yaw));
      obstacles.push({
        progress, lateral, kind: 'car',
        width: CAR_WIDTH * alignment + CAR_LENGTH * sideways,
        length: CAR_LENGTH * alignment + CAR_WIDTH * sideways,
      });
    }
  }
  return obstacles.sort((a, b) => a.progress - b.progress || a.lateral - b.lateral);
}

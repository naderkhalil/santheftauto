import { PLAYGROUND_COLLIDERS, playgroundHeight } from './playground.ts';
import { ROAD_HALF_WIDTH, groundHeight, routePoint, routeProgressAt, routeYaw } from './route.ts';

type Point = { x: number; y: number; z: number };

/** Shorten the chase arm before smoothing can carry it through a street wall.
 * Inside the square use physical solids; outside it keep the arm over the
 * playable street, clear of buildings and the backs of corner facades.
 */
export function clearCityCamera(origin: Point, eye: Point, exploring: boolean): Point {
  let reach = 1;
  for (const solid of PLAYGROUND_COLLIDERS) {
    if (solid.propId || solid.maxY < origin.y + .35) continue;
    let near = 0, far = 1;
    for (const [start, end, min, max] of [
      [origin.x, eye.x, solid.minX - .3, solid.maxX + .3],
      [origin.y, eye.y, solid.minY - .3, solid.maxY + .3],
      [origin.z, eye.z, solid.minZ - .3, solid.maxZ + .3],
    ]) {
      const delta = end - start;
      if (Math.abs(delta) < 1e-8) { if (start < min || start > max) { far = -1; break; } }
      else { const a = (min - start) / delta, b = (max - start) / delta; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
      if (near > far) break;
    }
    if (near <= far && far >= 0 && near <= 1) reach = Math.min(reach, Math.max(0, near - .04));
  }
  const point = (t: number): Point => ({ x: origin.x + (eye.x - origin.x) * t, y: origin.y + (eye.y - origin.y) * t, z: origin.z + (eye.z - origin.z) * t });
  for (let i = 1; i <= 24; i++) {
    const t = reach * i / 24, p = point(t);
    const ground = exploring ? playgroundHeight(p.x, p.z) : groundHeight(p.x, p.z);
    const s = routeProgressAt(p.x, p.z), center = routePoint(s), yaw = routeYaw(s);
    const lateral = (p.x - center.x) * Math.cos(yaw) - (p.z - center.z) * Math.sin(yaw);
    if (p.y < ground + .35 || (!exploring && Math.abs(lateral) > ROAD_HALF_WIDTH - .3)) {
      reach = reach * (i - 1) / 24; break;
    }
  }
  return point(reach);
}

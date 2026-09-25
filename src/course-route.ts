import type { CourseDefinition, CoursePoint, CourseRange } from './courses.ts';
import type { DrivingRoute } from './driving.ts';
import type { LaunchZone } from './route.ts';

type Point2 = { x: number; z: number };
type Segment =
  | { kind: 'line'; start: number; length: number; a: Point2; tangent: Point2 }
  | { kind: 'arc'; start: number; length: number; center: Point2; angle: number; turn: number; radius: number };
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const direction = (a: Point2, b: Point2) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length, length };
};

export type CourseRoute = DrivingRoute & {
  /** Ordered stations at the rounded version of each authored waypoint. */
  anchorProgress: readonly number[];
  groundHeight(x: number, z: number): number;
  /** A hint disambiguates repeat visits to the same intersection for authoring. */
  routeProgressAt(x: number, z: number, nearProgress?: number): number;
};

/** Exact circular fillets preserve route metres, tangent continuity, and manual
 * steering. Per-corner trims cannot consume a shared short street twice. */
export function createCourseRoute(course: CourseDefinition): CourseRoute {
  const points: CoursePoint[] = [];
  for (const point of course.points) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`${course.name}: route coordinates must be finite`);
    const previous = points.at(-1);
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < .001) {
      if (Math.abs(point.y - previous.y) > .001) throw new Error(`${course.name}: vertical route segment is not driveable`);
      continue;
    }
    points.push(point);
  }
  if (points.length < 2) throw new Error(`${course.name}: a course needs two distinct points`);

  const segments: Segment[] = [];
  const anchorProgress: number[] = [0];
  let length = 0;
  let minimumRadius = Infinity;
  const addLine = (a: Point2, b: Point2) => {
    const tangent = direction(a, b);
    if (tangent.length < 1e-8) return;
    segments.push({ kind: 'line', start: length, length: tangent.length, a, tangent });
    length += tangent.length;
  };
  let previous: Point2 = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const incoming = direction(a, b), outgoing = direction(b, c);
    const angle = Math.acos(clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1));
    if (angle < 1e-5) { addLine(previous, b); anchorProgress.push(length); previous = b; continue; }
    if (Math.PI - angle < .01) throw new Error(`${course.name}: replace the U-turn at ${b.label} with a loop`);
    const trim = Math.min((course.cornerRadius??30) * Math.tan(angle / 2), incoming.length * .44, outgoing.length * .44);
    const radius = trim / Math.tan(angle / 2);
    minimumRadius = Math.min(minimumRadius, radius);
    const entry = { x: b.x - incoming.x * trim, z: b.z - incoming.z * trim };
    const exit = { x: b.x + outgoing.x * trim, z: b.z + outgoing.z * trim };
    addLine(previous, entry);
    const turn = Math.sign(incoming.x * outgoing.z - incoming.z * outgoing.x);
    const center = { x: entry.x - incoming.z * turn * radius, z: entry.z + incoming.x * turn * radius };
    const span = radius * angle;
    anchorProgress.push(length + span / 2);
    segments.push({ kind: 'arc', start: length, length: span, center, angle: Math.atan2(entry.z - center.z, entry.x - center.x), turn, radius });
    length += span;
    previous = exit;
  }
  addLine(previous, points[points.length - 1]);
  anchorProgress.push(length);
  const TRACK_LENGTH = length;
  // Narrow only a pathological future authored course; all shipped courses
  // retain the normal 14.8 m carriageway and a positive inner lane radius.
  const ROAD_HALF_WIDTH = Math.min(course.roadHalfWidth??7.4, minimumRadius * (course.roadHalfWidth ? .58 : .45));
  const START_PROGRESS = Math.min(12, TRACK_LENGTH * .02);
  const resolveRange = <T extends CourseRange>(range: T) => {
    const progress = anchorProgress[range.from] + (range.startOffset ?? 0);
    const end = anchorProgress[range.to] + (range.endOffset ?? 0);
    if (!Number.isFinite(progress) || !Number.isFinite(end) || progress < 0 || end <= progress || end > TRACK_LENGTH)
      throw new Error(`${course.name}: invalid course feature range`);
    return { ...range, progress, end };
  };
  const LAUNCH_ZONES = (course.launches ?? []).map(resolveRange);
  const BOOST_ZONES = (course.boosts ?? []).map(resolveRange);
  const widths = (course.widths ?? []).map(resolveRange);
  const roadHalfWidth = (progress: number) => {
    const range = widths.find(r => progress >= r.progress && progress <= r.end);
    if (!range) return ROAD_HALF_WIDTH;
    // Ease each surface change over six metres so a lane never snaps inward.
    const blend = smooth(clamp(Math.min(progress - range.progress, range.end - progress) / 6, 0, 1));
    return ROAD_HALF_WIDTH + (range.halfWidth - ROAD_HALF_WIDTH) * blend;
  };

  const planAt = (distance: number) => {
    const progress = clamp(distance, 0, TRACK_LENGTH);
    const segment = segments.find(segment => progress <= segment.start + segment.length + 1e-8) ?? segments[segments.length - 1];
    const along = clamp(progress - segment.start, 0, segment.length);
    let x: number, z: number, tangent: Point2, curvature: number;
    if (segment.kind === 'line') {
      tangent = segment.tangent; curvature = 0;
      x = segment.a.x + tangent.x * along; z = segment.a.z + tangent.z * along;
    } else {
      const angle = segment.angle + segment.turn * along / segment.radius;
      x = segment.center.x + Math.cos(angle) * segment.radius;
      z = segment.center.z + Math.sin(angle) * segment.radius;
      tangent = { x: -Math.sin(angle) * segment.turn, z: Math.cos(angle) * segment.turn };
      curvature = -segment.turn / segment.radius;
    }
    const extension = distance - progress;
    return { x: x + tangent.x * extension, z: z + tangent.z * extension, tangent, curvature };
  };

  const heightAt = (distance: number) => {
    if(course.terrainHeight){const p=planAt(distance);return course.terrainHeight(p.x,p.z);}
    const s = clamp(distance, 0, TRACK_LENGTH);
    for (let i = 1; i < anchorProgress.length; i++) {
      if (s <= anchorProgress[i]) {
        const t = (s - anchorProgress[i - 1]) / (anchorProgress[i] - anchorProgress[i - 1]);
        return points[i - 1].y + (points[i].y - points[i - 1].y) * smooth(t);
      }
    }
    return points[points.length - 1].y;
  };
  const sampleRoute = (distance: number) => {
    const p = planAt(distance); return { x: p.x, y: heightAt(distance), z: p.z };
  };
  const routePoint = (distance: number, lateral = 0) => {
    const p = planAt(distance);
    const x = p.x + p.tangent.z * lateral, z = p.z - p.tangent.x * lateral;
    return { x, y: course.terrainHeight?.(x, z) ?? heightAt(distance), z };
  };
  const routeYaw = (distance: number) => {
    const p = planAt(distance); return Math.atan2(p.tangent.x, p.tangent.z);
  };
  const routeSlope = (distance: number) => (heightAt(distance + .02) - heightAt(distance - .02)) / .04;
  const routeCurvature = (distance: number) => planAt(distance).curvature;

  const routeProgressAt = (x: number, z: number, nearProgress?: number) => {
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
      const s = segment.start + local, p = planAt(s), distance = Math.hypot(p.x - x, p.z - z);
      if (distance < bestDistance - 1e-6 || (Math.abs(distance - bestDistance) <= 1e-6 && nearProgress !== undefined && Math.abs(s - nearProgress) < Math.abs(best - nearProgress))) {
        bestDistance = distance; best = s;
      }
    }
    return best;
  };

  const sampleGlidePath = (distance: number, zone: LaunchZone) => {
    const span = Math.max(.001, zone.end - zone.progress), u = clamp((distance - zone.progress) / span, 0, 1);
    return heightAt(zone.progress) + (heightAt(zone.end) - heightAt(zone.progress)) * smooth(u)
      + routeSlope(zone.progress) * span * u * (1 - u) ** 2
      + routeSlope(zone.end) * span * u * u * (u - 1)
      + Math.sin(Math.PI * u) ** 2 * (zone.height ?? Math.min(28, span * .13));
  };
  const glideSlope = (distance: number, zone: LaunchZone) => (sampleGlidePath(distance + .02, zone) - sampleGlidePath(distance - .02, zone)) / .04;

  return {
    TRACK_LENGTH, ROAD_HALF_WIDTH, START_PROGRESS,
    CHECKPOINTS: anchorProgress.slice(1), checkpointLabels: points.slice(1).map(point => point.label),
    LAUNCH_ZONES, BOOST_ZONES, roadHalfWidth, sampleRoute, routePoint, routeYaw, routeSlope, routeCurvature,
    routeProgressAt, sampleGlidePath, glideSlope, anchorProgress,
    groundHeight: (x, z) => course.terrainHeight?.(x, z) ?? heightAt(routeProgressAt(x, z)),
  };
}

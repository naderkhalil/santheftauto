import type { DrivingSimulation } from './driving.ts';
import { playgroundHeight } from './playground.ts';
import { LAUNCH_ZONES, routeFrame, routePoint, routeProgressAt, sampleGlidePath } from './route.ts';
import type { Obstacle } from './route.ts';

/** Shared with the playable City Loop and the authoritative room simulation. */
export const CITY_LOOP_OBSTACLES: Obstacle[] = [
  { progress: routeProgressAt(-75, 139), lateral: -3.4, width: 2.25, length: 7.2, kind: 'cablecar' },
  ...[[175, 385, 4.6], [350, 700, -4.7], [590, 450, 4.6]].map(([x, z, lateral]) => ({
    progress: routeProgressAt(x, z), lateral, width: 1.85, length: 4.2, kind: 'car' as const,
  })),
];

export const PLAYGROUND_POSTCARDS = [
  { x: 0, z: -24 }, { x: 24, z: 7 }, { x: -18, z: 16 }, { x: 0, z: 31 }, { x: 53, z: -36 },
] as const;
export const SKY_RINGS = LAUNCH_ZONES.flatMap((zone, zoneIndex) => [.24, .48, .73].map((fraction, index) => {
  const progress = zone.progress + (zone.end - zone.progress) * fraction;
  const position = routePoint(progress, index === 1 ? (zoneIndex % 2 ? 2 : -2) : 0);
  return { zone: zoneIndex, progress, x: position.x, y: sampleGlidePath(progress, zone) + 1.25, z: position.z };
}));
const postcardHeights = PLAYGROUND_POSTCARDS.map(point => playgroundHeight(point.x, point.z));

/** Deterministic bonuses, independent of rendering and shared with replay verification. */
export class RaceCollectibles {
  private postcards = new Set<number>();
  private rings = new Set<number>();
  private previous: { progress: number; x: number; y: number; z: number } | null = null;

  reset(): void { this.postcards.clear(); this.rings.clear(); this.previous = null; }

  update(sim: Pick<DrivingSimulation, 'state' | 'position' | 'exploring'>): { rings: number; postcards: number } {
    const position = sim.position, progress = sim.state.progress;
    // The rendered car used by the original ring test sits 3 cm above the simulation.
    const car = { progress, x: position.x, y: sim.state.y + .03, z: position.z };
    let rings = 0, postcards = 0;
    if (!sim.state.finished) {
      if (sim.exploring) PLAYGROUND_POSTCARDS.forEach((point, index) => {
        if (!this.postcards.has(index) && Math.hypot(position.x - point.x, position.z - point.z) < 3 && Math.abs(position.y - postcardHeights[index]) < 3) {
          this.postcards.add(index); postcards++;
        }
      });
      SKY_RINGS.forEach((ring, index) => {
        if (this.rings.has(index)) return;
        const previous = this.previous;
        const crossed = previous && previous.progress <= ring.progress && progress >= ring.progress && progress - previous.progress < 40;
        const near = Math.abs(progress - ring.progress) < 2;
        if (!crossed && !near) return;
        const t = crossed ? Math.max(0, Math.min(1, (ring.progress - previous.progress) / (progress - previous.progress || 1))) : 1;
        const x = previous ? previous.x + (car.x - previous.x) * t : car.x;
        const y = previous ? previous.y + (car.y - previous.y) * t : car.y;
        const z = previous ? previous.z + (car.z - previous.z) * t : car.z;
        const normal = routeFrame(ring.progress).normal;
        if (Math.hypot((x - ring.x) * normal.x + (z - ring.z) * normal.z, y + 1 - ring.y) < 5.4) {
          this.rings.add(index); rings++;
        }
      });
      if (postcards) sim.state.boost = Math.min(1, sim.state.boost + .2);
      if (rings) sim.state.boost = Math.min(1, sim.state.boost + .14 * rings);
    }
    this.previous = car;
    return { rings, postcards };
  }
}

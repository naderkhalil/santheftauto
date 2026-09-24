import { PLAZA_LEVELS } from './plaza-layout.ts';

/** Shared, authored prop placement in semantic metres: X east, Y up, Z north.
 * Rendering and collision import these same entries. Prop IDs remain stable
 * across material batches and across the smaller collision shapes of a span.
 */
type Point = Readonly<{ x: number; y: number; z: number }>;
export type PlazaRailSegment = Readonly<{
  id: string; kind: 'rail'; railId: string; section: number;
  /** Endpoints are the original handrail post bases, before adding rail height. */
  a: Point; b: Point; heading: number; postAtA: true; postAtB: boolean;
}>;
export type PlazaCafeTable = Readonly<{
  id: string; kind: 'table'; x: number; y: number; z: number; heading: number; parasol: boolean;
}>;
export type PlazaCafeChair = Readonly<{
  id: string; kind: 'chair'; tableId: string; x: number; y: number; z: number; heading: number;
}>;
export type PlazaKnockableProp = PlazaRailSegment | PlazaCafeTable | PlazaCafeChair;

const rails: PlazaRailSegment[] = [];
function rail(railId: string, a: Point, b: Point, postCount: number) {
  const sections = postCount - 1;
  const at = (i: number): Point => ({ x: a.x + (b.x - a.x) * i / sections, y: a.y + (b.y - a.y) * i / sections, z: a.z + (b.z - a.z) * i / sections });
  for (let section = 0; section < sections; section++) {
    rails.push({ id: `${railId}/${section}`, kind: 'rail', railId, section,
      a: at(section), b: at(section + 1), heading: Math.atan2(b.x - a.x, b.z - a.z),
      postAtA: true, postAtB: section === sections - 1 });
  }
}
const point = (x: number, y: number, z: number): Point => ({ x, y, z });
const { perimeter, center, north } = PLAZA_LEVELS;
// Original union-square.ts handrail endpoints and post counts. Each knockable
// section owns its starting post; the final section also owns the ending post.
for (const x of [-31, -11, 11, 31]) rail(`south-stair-rail-${x}`, point(x, perimeter, -37.3), point(x, center, -28.4), 5);
for (const x of [-7, 7]) rail(`north-entry-rail-${x}`, point(x, perimeter, 44), point(x, north, 35.1), 5);
for (const x of [-16, 16]) rail(`north-terrace-rail-${x}`, point(x, center, 23.4), point(x, north, 26.6), 3);
rail('west-ramp-rail', point(-58.3, perimeter, -42), point(-58.3, center, 26), 15);
for (const z of [-6.7, 2.7]) rail(`stockton-stair-rail-${z}`, point(58.9, perimeter, z), point(44.7, center, z), 6);
export const PLAZA_RAIL_SEGMENTS: readonly PlazaRailSegment[] = rails;

const tables: PlazaCafeTable[] = [];
const chairs: PlazaCafeChair[] = [];
for (const z of [-20, 18]) for (const x of z === 18 ? [-35, -28, 28, 35] : [-36, -29, 29, 36]) {
  const tableId = `cafe-table-${x}-${z}`;
  tables.push({ id: tableId, kind: 'table', x, y: center, z, heading: 0, parasol: z === 18 });
  for (let chair = 0; chair < 3; chair++) {
    const heading = chair * Math.PI * 2 / 3;
    chairs.push({ id: `cafe-chair-${x}-${z}-${chair}`, kind: 'chair', tableId,
      x: x + Math.sin(heading) * 1.33, y: center, z: z + Math.cos(heading) * 1.33, heading });
  }
}
export const PLAZA_CAFE_TABLES: readonly PlazaCafeTable[] = tables;
export const PLAZA_CAFE_CHAIRS: readonly PlazaCafeChair[] = chairs;
export const PLAZA_KNOCKABLE_PROPS: readonly PlazaKnockableProp[] = [...rails, ...tables, ...chairs];

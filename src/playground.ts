import { groundHeight, intersectsSquareParcel, routePoint, routeYaw, sampleRoute, TRACK_LENGTH, ROUTE_POLYLINE, routeProgressAt } from './route.ts';
import { PLAZA_LEVELS, PLAZA_PALMS, PLAZA_TREES } from './plaza-layout.ts';

/** Collision/source coordinates are semantic: X east, Y up, Z north.
 * Keep these measured solids and surfaces beside the corresponding authoring
 * dimensions in union-square.ts and tools/blender/build_*square*.py.
 * Parcel reservations are deliberately NOT collision bodies: they include
 * public gardens, courtyards, facade setbacks and walkable alleys.
 */
export const PLAYGROUND_BOUNDS = { minX: -213, maxX: 187, minZ: -208, maxZ: 196 } as const;
export function containsPlayground(x: number, z: number, margin = 0): boolean {
  const b = PLAYGROUND_BOUNDS;
  return x >= b.minX + margin && x <= b.maxX - margin && z >= b.minZ + margin && z <= b.maxZ - margin;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };
const inside = (x: number, z: number, minX: number, maxX: number, minZ: number, maxZ: number) =>
  x >= minX && x <= maxX && z >= minZ && z <= maxZ;
const { perimeter, center, north } = PLAZA_LEVELS;
// Exact center-level pavement() footprints from union-square.ts. Shared by
// tyre support and retaining-wall collision so neither can drift from the art.
const CENTER_PAVEMENT: readonly (readonly [number, number, number, number])[] = [
  [-44.7, 44.7, -28.7, 23.7], [-52.5, -44.7, -26.5, 18.5],
  [44.7, 52.5, -26, -8], [44.7, 53.2, 4, 22],
  [-55, -49.6, 22.4, 30], [49.6, 55, 22.4, 30],
];

/** Tyres ride a stair's continuous envelope, with a small tread vibration.
 * Individual vertical risers are softened over a wheel contact patch, while
 * the complete 2.06m / 2.78m climbs retain their actual visible elevations.
 */
function stairHeight(t: number, bottom: number, top: number, count: number) {
  const u = clamp01(t);
  return bottom + (top - bottom) * u + .018 * Math.sin(u * count * Math.PI * 2);
}

export function playgroundHeight(x: number, z: number): number {
  const ground = groundHeight(x, z);
  if (!containsPlayground(x, z)) return ground;
  if (!inside(x, z, -60, 60, -50, 50)) {
    // Apple's public garden is an authored, raised paved court behind the
    // pavilion. Its export scales X by36/42 and shifts north coordinates by-2.
    if (inside(x, z, 27, 63, 113, 127)) return Math.max(ground, 22.56);
    return ground;
  }

  // The promenade's 34cm outer curb is rounded across a tyre's contact patch.
  const curbDistance = Math.min(60 - Math.abs(x), 50 - Math.abs(z));
  let height = ground + (perimeter - ground) * smooth(curbDistance / .55);
  const slab = (minX: number, maxX: number, minZ: number, maxZ: number, top: number) => {
    if (inside(x, z, minX, maxX, minZ, maxZ)) height = Math.max(height, top);
  };
  // Exact pavement() footprints from union-square.ts.
  for (const footprint of CENTER_PAVEMENT) slab(...footprint, center);
  slab(-49.6, -10, 26.5, 43.6, north);
  slab(10, 49.6, 26.5, 43.6, north);
  slab(-10, 10, 26.5, 35.3, north);
  for (const side of [-1, 1]) {
    slab(side * 50.6 - 1.65, side * 50.6 + 1.65, 41.65, 43.65, north);
  }
  if (inside(x, z, -45, 45, -36.98, -28.7)) {
    height = Math.max(height, stairHeight((z + 36.98) / 8.28, perimeter, center, 12));
  }
  if (inside(x, z, -44.7, 44.7, 23.7, 26.5)) {
    height = Math.max(height, stairHeight((z - 23.7) / 2.8, center, north, 4));
  }
  // The visual stair is19.8m wide beside a20m opening. Bridge its10cm
  // side seams for tyre contact; they are not full-depth drainage trenches.
  if (inside(x, z, -10, 10, 35.3, 43.62)) {
    height = Math.max(height, stairHeight((43.62 - z) / 8.32, perimeter, north, 16));
  }
  // Bridge the7.5cm mesh seam at the center landing: a wheel cannot fall
  // through a narrower gap than its contact patch.
  if (inside(x, z, 44.7, 58.8, -7.7, 3.7)) {
    height = Math.max(height, stairHeight((58.8 - x) / 14.1, perimeter, center, 17));
  }
  if (inside(x, z, -58.4, -54.6, -42, 26)) height = Math.max(height, perimeter + (center - perimeter) * (z + 42) / 68);
  for (const side of [-1, 1]) {
    if (inside(x, z, side * 51.3 - 1, side * 51.3 + 1, 26, 42)) {
      height = Math.max(height, center + (north - center) * (z - 26) / 16);
    }
  }
  return height;
}

export type PlaygroundCollider = Readonly<{
  id: string; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number;
}>;
const colliders: PlaygroundCollider[] = [];
function bounds(id: string, minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number) {
  colliders.push({ id, minX, maxX, minZ, maxZ, minY, maxY });
}
function solid(id: string, x: number, z: number, w: number, d: number, bottom: number, h: number) {
  bounds(id, x - w / 2, x + w / 2, z - d / 2, z + d / 2, bottom, bottom + h);
}
function rail(id: string, ax: number, az: number, ay: number, bx: number, bz: number, by: number) {
  // Short sections retain the incline's actual height instead of an invisible
  // full-height rectangle covering the entire stair and its landing.
  const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
  for (let i = 0; i < count; i++) {
    const a = i / count, b = (i + 1) / count;
    const x0 = ax + (bx - ax) * a, x1 = ax + (bx - ax) * b;
    const z0 = az + (bz - az) * a, z1 = az + (bz - az) * b;
    const y0 = ay + (by - ay) * a, y1 = ay + (by - ay) * b;
    bounds(`${id}/${i}`, Math.min(x0, x1) - .045, Math.max(x0, x1) + .045,
      Math.min(z0, z1) - .045, Math.max(z0, z1) + .045, Math.min(y0, y1), Math.max(y0, y1) + .982);
  }
}

// Only the exposed outline is a retaining wall. Adjoining slabs, broad stairs
// and side-ramp landings must not acquire invisible collision across them.
// Short probes locate breaks against the same support surface; consecutive
// exposed sections merge into one face inside the authored slab boundary.
for (const [index, [minX, maxX, minZ, maxZ]] of CENTER_PAVEMENT.entries()) {
  for (const [axis, edge, from, to, outward] of [
    ['x', minX, minZ, maxZ, -1], ['x', maxX, minZ, maxZ, 1],
    ['z', minZ, minX, maxX, -1], ['z', maxZ, minX, maxX, 1],
  ] as const) {
    const count = Math.ceil((to - from) / .2), pitch = (to - from) / count;
    let run = -1;
    for (let i = 0; i <= count; i++) {
      const along = from + (i + .5) * pitch;
      const outside = axis === 'x' ? playgroundHeight(edge + outward * .025, along) : playgroundHeight(along, edge + outward * .025);
      const inside = axis === 'x' ? playgroundHeight(edge - outward * .025, along) : playgroundHeight(along, edge - outward * .025);
      const exposed = i < count && outside < center - .55 && inside <= center + .05;
      if (exposed && run < 0) run = i;
      if (!exposed && run >= 0) {
        const start = from + run * pitch, end = from + i * pitch, inner = edge - outward * .12;
        const id = `center-terrace-wall-${index}-${axis}-${outward}-${run}`;
        if (axis === 'x') bounds(id, Math.min(edge, inner), Math.max(edge, inner), start, end, PLAZA_LEVELS.street, center);
        else bounds(id, start, end, Math.min(edge, inner), Math.max(edge, inner), PLAZA_LEVELS.street, center);
        run = -1;
      }
    }
  }
}

// The north pavement() slabs are solid garage-roof terraces all the way
// down to street level. Garden capstones above them are separate solids;
// using only those capstones let a low car drive underneath the visible
// retaining wall until its center reached the height field's abrupt edge.
// Thin faces stay inside the exact slab footprint. Their stair approaches,
// side-ramp landings and upper paving remain open and traversable.
for (const side of [-1, 1]) {
  const inner = side * 10, outer = side * 49.6;
  bounds(`north-terrace-stair-wall-${side}`, Math.min(inner, inner + side * .12), Math.max(inner, inner + side * .12),
    35.3, 43.6, PLAZA_LEVELS.street, north);
  bounds(`north-terrace-rear-wall-${side}`, Math.min(inner, outer), Math.max(inner, outer),
    43.48, 43.6, PLAZA_LEVELS.street, north);
  bounds(`north-terrace-outer-wall-${side}`, Math.min(outer, outer - side * .12), Math.max(outer, outer - side * .12),
    30, 41.65, PLAZA_LEVELS.street, north);
  bounds(`north-terrace-south-return-${side}`, Math.min(side * 44.7, outer), Math.max(side * 44.7, outer),
    26.5, 26.62, PLAZA_LEVELS.street, north);
}

// Blender monument: create_plaza.py has an8.8m lowest plinth, not the9.5m
// development fallback. Separate tiers allow jumping above the lower steps.
let monumentY = center;
for (const [i, [width, height]] of [[8.8, .26], [7.4, .28], [6.3, .32], [5.2, .30]].entries()) {
  solid(`dewey-plinth-${i}`, 0, 0, width, width, monumentY, height);
  monumentY += height;
}
solid('dewey-pedestal', 0, 0, 3.6, 3.6, center + 1.16, 3);
solid('dewey-column', 0, 0, 2.12, 2.12, center + 4.16, 24);

// Granite garden capstones and low benches: union-square.ts dimensions.
solid('west-palm-garden', -48.5, 9, 7.9, 18.3, center, .62);
solid('east-palm-garden', 48.5, -17, 7.9, 18.3, center, .62);
solid('southwest-small-palm-bed', -48.5, -25, 6, 4.3, center, .62);
for (const side of [-1, 1]) {
  solid(`north-garden-${side}`, side * 30, 36, 37.4, 12, north, .62);
  for (const x of [side * 21, side * 37]) solid(`north-bench-${x}`, x, 28.2, 9, .94, north, .59);
  solid(`square-name-wall-${side}`, side * 43.2, side * 47, 12.2, .68, perimeter, 1.08);
}
solid('south-palm-garden', -31, -44, 17.2, 5.3, perimeter, .705);
solid('southeast-palm-garden', 49, -31, 6.4, 5.3, perimeter, .62);
for (const [i, p] of PLAZA_PALMS.entries()) solid(`palm-trunk-${i}`, p.x, p.z, 1.04 * p.scale, 1.04 * p.scale, p.y, 11 * p.scale);
for (const [i, p] of PLAZA_TREES.entries()) solid(`north-tree-trunk-${i}`, p.x, p.z, .48, .48, p.y, p.height * .58);
for (const x of [-53, 53]) for (const z of [-44, 46]) {
  solid(`heart-plinth-${x}-${z}`, x, z, 2.45, 2.45, perimeter, .85);
  solid(`heart-sculpture-${x}-${z}`, x, z, 2.5, 2.5, perimeter + .85, 3);
}
for (const x of [-41, 41]) for (const z of [-40, 45]) solid(`litter-bin-${x}-${z}`, x, z, .89, .89, perimeter, 1.1);
for (const x of [-11, 11]) solid(`flagpole-${x}`, x, 31, .24, .24, north, 7.5);

for (const x of [-31, -11, 11, 31]) rail(`south-stair-rail-${x}`, x, -37.3, perimeter, x, -28.4, center);
for (const x of [-7, 7]) rail(`north-entry-rail-${x}`, x, 44, perimeter, x, 35.1, north);
for (const x of [-16, 16]) rail(`north-terrace-rail-${x}`, x, 23.4, center, x, 26.6, north);
rail('west-ramp-rail', -58.3, -42, perimeter, -58.3, 26, center);
for (const z of [-6.7, 2.7]) rail(`stockton-stair-rail-${z}`, 58.9, z, perimeter, 44.7, z, center);

for (const [x, z] of [[48.95, 13], [-48.6, -13]]) {
  solid(`cafe-pavilion-${x}`, x, z, 8.5, 12.4, center, 2.72);
  // The granite service counter projects into the square, below roof height.
  solid(`cafe-counter-${x}`, x + (x < 0 ? 1 : -1) * 4.7, z, 1.02, 11.3, center + .92, .12);
  solid(`cafe-roof-${x}`, x, z, 10.2, 13.8, center + 2.76, .18);
}
for (const z of [-20, 18]) for (const x of z === 18 ? [-35, -28, 28, 35] : [-36, -29, 29, 36]) {
  solid(`cafe-table-${x}-${z}`, x, z, 1.7, 1.7, center, .90);
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    solid(`cafe-chair-${x}-${z}-${i}`, x + Math.sin(angle) * 1.33, z + Math.cos(angle) * 1.33, .81, .81, center, 1.04);
  }
}

// Station has a walk-in portal, not one solid reservation across the apron.
// The throat is the physical end of that small alcove; no subway interior is
// authored below it. Glass walls and canopy retain their distinct heights.
for (const side of [-1, 1]) {
  solid(`station-side-${side}`, 34, -42 + side * 4.75, 17.6, .79, perimeter + .02, 2.94);
  solid(`station-portal-pier-${side}`, 25.15, -42 + side * 4.47, .46, 1.03, perimeter + .02, 2.83);
}
solid('station-rear', 42.75, -42, .85, 9.6, perimeter + .02, 2.95);
solid('station-throat', 29.4, -42, .055, 8.6, perimeter + .02, 2.54);
solid('station-canopy', 34, -42, 18.5, 10.65, perimeter + 3.01, .32);
solid('muni-blade', 42.2, -48, .8, .37, perimeter, 4.55);
for (const lane of [-1, 1]) for (const edge of [-1, 1]) {
  const z = -42 + lane * 1.45 + edge * 1.16;
  rail(`station-escalator-${lane}-${edge}`, 25, z, perimeter - .15, 29.1, z, perimeter - .67);
}

// Authored north-square building envelopes. Each separate facade stays at its
// real footprint, retaining Campton Place, Apple garden and the hotel alleys.
for (const [id, x, z, w, d, h] of [
  ['saks', -40, 105.5, 52, 49, 27], ['tiffany', -2.5, 105.5, 23, 49, 42], ['williams-sonoma', 15, 105.5, 12, 49, 17],
  ['apple', 45, 96.8, 36, 32, 15], ['grand-hyatt', 46.5, 158.5, 30, 51, 94],
  ['beacon-grand', -47.5, 157.5, 37, 49, 62], ['chancellor', -100, 122.5, 24, 25, 52],
  ['post-powell', -109, 95.5, 42, 29, 20], ['inn-at-union-square', -136, 108, 12, 54, 29],
  ['kensington-park', -163, 106, 40, 50, 45], ['278-post', 109, 106, 40, 50, 27],
  ['post-east', 145, 106, 32, 50, 31], ['campton-place', 108, 153.5, 38, 29, 33],
  ['campton-east', 145, 155.5, 32, 41, 31], ['sutter-service', .5, 157.5, 57, 49, 38],
  ['elkan-gunst', -108, -110, 40, 54, 27], ['handlery', -157, -110, 56, 54, 28],
  ['handlery-rear', -157, -160.5, 56, 43, 36], ['powell-ofarrell', -108, -160.5, 40, 43, 24],
] as const) solid(id, x, z, w, d, 22, h);
const appleX = (x: number) => 27 + (x - 20) * 36 / 42;
for (const x of [23, 59]) solid(`apple-garden-planter-${x}`, appleX(x), 120, 2.8 * 36 / 42, 12, 22.3, 1.31);
solid('apple-garden-living-wall', appleX(41), 127.1, 40 * 36 / 42, .65, 22.1, 14.6);
for (const x of [30, 37, 44, 51]) solid(`apple-garden-bench-${x}`, appleX(x), 118, 5.4 * 36 / 42, 1.2, 22.6, .2);
solid('apple-garden-fountain', appleX(52), 122, 4.2 * 36 / 42, 4.2, 22.15, 1.2);

// Westin's source X runs along Powell, depth extends west. Runtime anchor
//(-93,22,-1.5), rotation PI/2 and scale.x=-1 map it to these three wings.
for (const [i, [along, width]] of [[-33, 25], [0, 22], [33, 25]].entries()) {
  solid(`westin-wing-${i}`, -108.5, along - 1.5, 31, width, 22, 42);
}
for (const along of [-15.75, 15.75]) solid(`westin-court-back-${along}`, -114, along - 1.5, 22, 9.5, 22, 42);
solid('westin-rear-connector', -126.5, -1.5, 5, 91, 22, 42);
solid('westin-tower-south', -143.5, -23.5, 29, 38, 22, 84);
solid('westin-tower-north', -143.5, 21.5, 29, 36, 22, 91);

// Department stores and the five actual Stockton lots. Maiden Lane at z=0
// stays open all the way from Stockton to Grant: no encompassing parcel box.
solid('macys-west', -47, -109.5, 26, 53, 22, 36.5);
solid('macys-east', 6, -109.5, 26, 53, 22, 36.5);
solid('macys-atrium', -20.5, -109.85, 27, 52.3, 22, 36.5);
solid('i-magnin', 39.5, -109.5, 41, 53, 22, 42.5);
solid('macys-rear', 0, -159, 120, 46, 22, 43.3);
solid('neiman-marcus', 127.5, -107.5, 67, 49, 22, 31.3);
for (const [id, z, width, h] of [
  ['breitling', 33.5, 29, 33.3], ['gucci', 12, 14, 40], ['tory-burch', -12, 14, 18],
  ['moncler', -29, 20, 25], ['bvlgari', -43.5, 9, 25],
] as const) solid(id, 127.5, z, 67, width, 22, h);

// Accepted Powell procedural lots from city-loop.ts. The exact reservation
// predicate is used only to decide which rendered bodies exist, never as a
// substitute for collision geometry. Most lots are replaced by authored art.
for (const side of [-1, 1]) for (let z = 132, i = 0; z < 278; z += 24, i++) {
  const x = -75 + side * 27;
  if (Math.abs(z - 185) < 22 || !containsPlayground(x, z) || intersectsSquareParcel(x, z, 30, 22)) continue;
  const base = Math.min(groundHeight(x - 14.5, z - 10.5), groundHeight(x + 14.5, z + 10.5));
  solid(`powell-background-${side}-${z}`, x, z, 29, 21, base, 22 + (i % 3) * 7);
}

// Lamps and signals use the same route placements as city-loop.ts. Their
// poles are collidable without turning their overhead arms into ground walls.
for (let s = 20; s < TRACK_LENGTH - 15; s += 29) {
  const center = sampleRoute(s);
  if (!containsPlayground(center.x, center.z, -15) || Math.abs(routeYaw(s + 9) - routeYaw(s - 9)) > .15) continue;
  for (const side of [-1, 1]) {
    const p = routePoint(s, side * 10.7);
    solid(`street-lamp-${s}-${side}`, p.x, p.z, .42, .42, p.y, 7.4);
  }
}
for (const [x, z] of ROUTE_POLYLINE.slice(1, -1)) {
  const s = routeProgressAt(x, z) - 18, p = routePoint(s, -10);
  if (containsPlayground(p.x, p.z)) solid(`traffic-signal-${x}-${z}`, p.x, p.z, .2, .2, p.y, 5.8);
}
// Blender street-detail kit stores canonical south-Z; these placements are
// its supplied semantic coordinates, so they require no further reflection.
for (const x of [-63.3, 63.3]) for (const z of [-53.3, 53.3]) solid(`street-sign-${x}-${z}`, x, z, .34, .34, 22.05, 4.5);
solid('post-newsracks', -54.5, 75.3, 1.132, .48, 22.05, 1.37);
for (const z of [26, 29, 32]) solid(`stockton-bike-rack-${z}`, 85, z, .87, .063, 22.05, .86);

export const PLAYGROUND_COLLIDERS: readonly PlaygroundCollider[] = colliders;

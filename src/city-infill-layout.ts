/** Shared city parcels: renderers and road paving use these same block edges.
 * X points east; Z points north. All dimensions are horizontal metres.
 */
export type CityFront = 'north' | 'south' | 'east' | 'west';
export type CityDistrict = 'powell' | 'bush' | 'downtown' | 'waterfront';
export type CityRect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type CityParcel = {
  id: string; blockId: string; x: number; z: number; width: number; depth: number;
  height: number; district: CityDistrict; fronts: readonly CityFront[]; style: number;
};
export type CityBlock = CityRect & {
  id: string; x: number; z: number; width: number; depth: number;
  district: CityDistrict; fronts: readonly CityFront[];
};

/** Architecture may project up to .5 m beyond its body. Even the nearest
 * cornice therefore clears the existing 12.7 m route sidewalk and 14.2 m
 * cross-street reservation, including the inside of the 18 m route bends.
 */
export const CITY_BUILDING_SETBACK = 14.8;
export const CITY_FACADE_PROJECTION = .5;
export const CITY_PAVING_SETBACK = 7.8;
export const CITY_STREETS_X = [-199, -75, 75, 175, 300, 410, 500, 590] as const;
export const CITY_STREETS_Z = [185, 300, 400, 500, 600, 700, 850] as const;
const ALL_FRONTS: readonly CityFront[] = ['north', 'south', 'east', 'west'];

/** These models remain authored landmarks, not procedural building lots.
 * The Grant envelope includes projecting pagoda roofs and rear walls. Its
 * California crossing remains open, while other alley ends stop at shops.
 */
export const CITY_AUTHORED_RESERVES: readonly (CityRect & { id: string })[] = [
  { id: 'dragon-gate', minX: 158.5, maxX: 191.5, minZ: 333.5, maxZ: 344 },
  { id: 'grant-south-shops', minX: 138, maxX: 212, minZ: 360, maxZ: 485.5 },
  { id: 'grant-north-shops', minX: 138, maxX: 212, minZ: 514.5, maxZ: 669 },
  { id: 'transamerica-pyramid', minX: 303, maxX: 349, minZ: 790, maxZ: 836 },
];

const blocks: CityBlock[] = [], parcels: CityParcel[] = [];
const rect = (minX: number, maxX: number, minZ: number, maxZ: number): CityRect => ({ minX, maxX, minZ, maxZ });
const overlap = (a: CityRect, b: CityRect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const expand = (r: CityRect, margin: number): CityRect => rect(r.minX - margin, r.maxX + margin, r.minZ - margin, r.maxZ + margin);
const asBody = (p: CityParcel): CityRect => rect(p.x - p.width / 2, p.x + p.width / 2, p.z - p.depth / 2, p.z + p.depth / 2);

function block(id: string, bounds: CityRect, district: CityDistrict, fronts: readonly CityFront[] = ALL_FRONTS) {
  const b: CityBlock = { id, ...bounds, x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2,
    width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ, district, fronts };
  blocks.push(b); return b;
}

function parcel(b: CityBlock, bounds: CityRect, fronts: readonly CityFront[]) {
  const style = parcels.length, district = b.district;
  // A restrained, repeatable height rhythm: corners anchor the street wall,
  // while narrow central lots leave room for the original skyline landmarks.
  const heights = district === 'powell' ? [32, 39, 29, 43, 35, 31]
    : district === 'bush' ? [27, 34, 31, 39, 29, 35]
    : district === 'waterfront' ? [30, 37, 26, 42, 32, 35]
    : [35, 44, 31, 48, 39, 34];
  const p: CityParcel = { id: `${b.id}/lot-${style}`, blockId: b.id,
    x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2,
    width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ,
    height: heights[style % heights.length], district, fronts, style };
  if (CITY_AUTHORED_RESERVES.some(r => overlap(expand(asBody(p), CITY_FACADE_PROJECTION), r))) {
    throw new Error(`City parcel overlaps authored scenery: ${p.id}`);
  }
  parcels.push(p);
}

/** Six connected lots around a narrow service court. The center passages
 * are paved by the street renderer; they are intentional 2.4 m alleys,
 * rather than the previous 40–80 m strips of unused beige terrain.
 */
function divide(b: CityBlock, body: CityRect, columns = 3, rows = 2) {
  const alley = 2.4, w = (body.maxX - body.minX - (columns - 1) * alley) / columns;
  const d = (body.maxZ - body.minZ - (rows - 1) * alley) / rows;
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const minX = body.minX + col * (w + alley), minZ = body.minZ + row * (d + alley);
    const fronts: CityFront[] = [];
    if (row === 0 && b.fronts.includes('south')) fronts.push('south');
    if (row === rows - 1 && b.fronts.includes('north')) fronts.push('north');
    if (col === 0 && b.fronts.includes('west')) fronts.push('west');
    if (col === columns - 1 && b.fronts.includes('east')) fronts.push('east');
    // Lots deep inside a longer strip still address a real street-facing edge.
    if (!fronts.length) fronts.push(...b.fronts.filter(f => f === 'east' || f === 'west'));
    parcel(b, rect(minX, minX + w, minZ, minZ + d), fronts);
  }
}

function streetBlock(id: string, west: number, east: number, south: number, north: number, district: CityDistrict, columns = 3, rows = 2) {
  const p = CITY_PAVING_SETBACK, s = CITY_BUILDING_SETBACK;
  const b = block(id, rect(west + p, east - p, south + p, north - p), district);
  divide(b, rect(west + s, east - s, south + s, north - s), columns, rows);
  return b;
}

// The missing Powell/Bush outlook: the old outer-grid exclusion removed the
// whole Mason–Powell strip, and each eastern block had only one center box.
for (const [i, south] of [185, 300, 400, 500, 600].entries()) {
  const north = CITY_STREETS_Z[i + 1];
  streetBlock(`mason-powell-${south}`, -199, -75, south, north, 'powell');
  streetBlock(`powell-stockton-${south}`, -75, 75, south, north, south === 185 ? 'bush' : 'powell');
}
streetBlock('stockton-grant-185', 75, 175, 185, 300, 'bush', 2, 2);
streetBlock('grant-kearny-185', 175, 300, 185, 300, 'bush', 2, 2);

// Only the rear half of Chinatown's blocks is new. Preserve both authored
// Grant street walls, Dragon Gate, the California opening and flying route.
for (const [i, south] of [300, 400, 500, 600].entries()) {
  const north = [400, 500, 600, 700][i], p = CITY_PAVING_SETBACK, s = CITY_BUILDING_SETBACK;
  const west = block(`stockton-grant-back-${south}`, rect(75 + p, 137, south + p, north - p), 'bush', ['west', 'south', 'north']);
  divide(west, rect(75 + s, 136.5, south + s, north - s), 1, 2);
  const east = block(`grant-kearny-back-${south}`, rect(213, 300 - p, south + p, north - p), 'bush', ['east', 'south', 'north']);
  divide(east, rect(213.5, 300 - s, south + s, north - s), 1, 2);
}
// Bush's final two corners frame the gate without occupying its approach.
const gateWest = block('bush-grant-west-corner', rect(138, 167.2, 307.8, 358.5), 'bush', ['south', 'east']);
divide(gateWest, rect(138.8, 157.6, 314.8, 357.8), 1, 1);
const gateEast = block('bush-grant-east-corner', rect(182.8, 212, 307.8, 358.5), 'bush', ['south', 'west']);
divide(gateEast, rect(192.4, 211.2, 314.8, 357.8), 1, 1);

// Washington's glide reveals the roofs, so these are complete compact blocks
// on both sides of the bayward outlook, not isolated towers on exposed land.
for (const [west, east] of [[300, 410], [410, 500], [500, 590]]) {
  for (const south of [185, 300, 400, 500, 600]) {
    streetBlock(`downtown-${west}-${south}`, west, east, south, south === 185 ? 300 : south + 100, west === 500 ? 'waterfront' : 'downtown', 2, 2);
  }
}
for (const [west, east] of [[175, 300], [410, 500], [500, 590]]) {
  streetBlock(`washington-north-${west}`, west, east, 700, 850, 'waterfront', 2, 3);
}
// Transamerica remains in its authored lot, visible above a low south wing.
const pyramidBlock = block('washington-north-300', rect(307.8, 402.2, 707.8, 842.2), 'downtown');
divide(pyramidBlock, rect(314.8, 348.3, 714.8, 788.5), 1, 2);
divide(pyramidBlock, rect(350.5, 395.2, 714.8, 835.2), 1, 3);

export const CITY_INFILL_BLOCKS: readonly CityBlock[] = blocks;
export const CITY_INFILL_PARCELS: readonly CityParcel[] = parcels;
export const CITY_INFILL_OWNERSHIP: readonly CityRect[] = blocks;

/** Old generic blocks are replaced as a whole if any part occupies an owned
 * block. This also removes their pre-existing overlaps at Powell/Bush, while
 * the separately authored square, Chinatown and landmarks remain untouched.
 */
export function ownsCityInfill(x: number, z: number, width: number, depth: number): boolean {
  const candidate = rect(x - width / 2, x + width / 2, z - depth / 2, z + depth / 2);
  return CITY_INFILL_OWNERSHIP.some(bounds => overlap(candidate, bounds));
}

export function cityParcelBounds(p: CityParcel, margin = 0): CityRect { return expand(asBody(p), margin); }

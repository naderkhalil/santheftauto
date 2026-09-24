import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_AUTHORED_RESERVES, CITY_FACADE_PROJECTION, CITY_INFILL_BLOCKS, CITY_INFILL_PARCELS,
  CITY_STREETS_X, CITY_STREETS_Z, cityParcelBounds, ownsCityInfill, type CityRect,
} from './city-infill-layout.ts';
import { intersectsSquareParcel, sampleRoute, TRACK_LENGTH } from './route.ts';

const overlap = (a: CityRect, b: CityRect) => a.minX < b.maxX - .00001 && a.maxX > b.minX + .00001
  && a.minZ < b.maxZ - .00001 && a.maxZ > b.minZ + .00001;
const pointDistance = (x: number, z: number, b: CityRect) => Math.hypot(Math.max(b.minX - x, x - b.maxX, 0), Math.max(b.minZ - z, z - b.maxZ, 0));

test('complete city blocks fit their parcels without intersecting neighboring facade envelopes', () => {
  assert.ok(CITY_INFILL_PARCELS.length >= 100 && CITY_INFILL_PARCELS.length <= 180, 'the streetwall stays within a bounded city budget');
  assert.equal(new Set(CITY_INFILL_PARCELS.map(p => p.id)).size, CITY_INFILL_PARCELS.length);
  assert.equal(new Set(CITY_INFILL_BLOCKS.map(p => p.id)).size, CITY_INFILL_BLOCKS.length);
  for (const [i, parcel] of CITY_INFILL_PARCELS.entries()) {
    const b = cityParcelBounds(parcel, CITY_FACADE_PROJECTION), owner = CITY_INFILL_BLOCKS.find(block => block.id === parcel.blockId)!;
    assert.ok(parcel.width >= 18 && parcel.depth >= 24 && parcel.height >= 20, `${parcel.id} must remain an architectural lot`);
    assert.ok(b.minX >= owner.minX && b.maxX <= owner.maxX && b.minZ >= owner.minZ && b.maxZ <= owner.maxZ, `${parcel.id} escapes its paved block`);
    assert.ok(parcel.fronts.length && parcel.fronts.every(front => owner.fronts.includes(front)), `${parcel.id} addresses an invented street`);
    for (const other of CITY_INFILL_PARCELS.slice(i + 1)) {
      assert.equal(overlap(b, cityParcelBounds(other, CITY_FACADE_PROJECTION)), false, `${parcel.id} overlaps ${other.id}`);
    }
  }
});

test('new city bodies and facade projections leave all street corridors and rounded racing turns clear', () => {
  const routeSamples = Array.from({ length: Math.ceil(TRACK_LENGTH) + 1 }, (_, s) => sampleRoute(s));
  for (const parcel of CITY_INFILL_PARCELS) {
    const b = cityParcelBounds(parcel, CITY_FACADE_PROJECTION);
    for (const x of CITY_STREETS_X) assert.ok(b.maxX <= x - 14.2 || b.minX >= x + 14.2, `${parcel.id} crosses north–south street ${x}`);
    for (const z of CITY_STREETS_Z) assert.ok(b.maxZ <= z - 14.2 || b.minZ >= z + 14.2, `${parcel.id} crosses east–west street ${z}`);
    for (const p of routeSamples) assert.ok(pointDistance(p.x, p.z, b) >= 12.7 - .001, `${parcel.id} intrudes into the racing sidewalk near ${p.x}, ${p.z}`);
  }
});

test('the authored square, playground, Dragon Gate, Chinatown roofs and Transamerica remain intact', () => {
  for (const parcel of CITY_INFILL_PARCELS) {
    const b = cityParcelBounds(parcel, CITY_FACADE_PROJECTION);
    assert.equal(intersectsSquareParcel(parcel.x, parcel.z, parcel.width + 1, parcel.depth + 1), false, `${parcel.id} overlaps a square landmark`);
    assert.ok(b.minZ > 196, `${parcel.id} creates an unmodeled obstacle in the open playground`);
    for (const reserve of CITY_AUTHORED_RESERVES) assert.equal(overlap(b, reserve), false, `${parcel.id} overlaps ${reserve.id}`);
  }
  for (const [x, z] of [[0, 0], [45, 120], [127, 0], [-140, -23], [175, 340], [175, 500], [655, 480]]) {
    assert.equal(ownsCityInfill(x, z, 2, 2), false, 'public square, Apple garden, Maiden Lane, Westin, gate, California and waterfront stay outside generic ownership');
  }
});

test('Powell/Bush screenshot regression replaces vacant block centers with continuous occupied street walls', () => {
  for (const blockId of ['mason-powell-185', 'mason-powell-300', 'powell-stockton-185', 'powell-stockton-300', 'stockton-grant-185', 'grant-kearny-185']) {
    const block = CITY_INFILL_BLOCKS.find(b => b.id === blockId)!;
    const lots = CITY_INFILL_PARCELS.filter(p => p.blockId === blockId);
    const lotArea = lots.reduce((sum, p) => sum + p.width * p.depth, 0);
    const interiorArea = (block.width - 14) * (block.depth - 14);
    assert.ok(lotArea / interiorArea > .90, `${blockId} still leaves a broad vacant interior`);
    // Street wall ends only at narrow 2.4 m servicing passages; dense bodies
    // align across each face rather than retreating to one central tower.
    for (const front of ['north', 'south', 'east', 'west'] as const) {
      const frontages = lots.filter(p => p.fronts.includes(front));
      const span = front === 'north' || front === 'south' ? block.width - 14 : block.depth - 14;
      const covered = frontages.reduce((sum, p) => sum + (front === 'north' || front === 'south' ? p.width : p.depth), 0);
      assert.ok(covered / span > .94, `${blockId} has a vacant ${front} frontage`);
    }
  }
  // These two old Powell/Bush lots overlap one another. Both must be removed,
  // including any generic center/court filler in the replacement ownership.
  assert.equal(ownsCityInfill(-48, 276, 29, 21), true);
  assert.equal(ownsCityInfill(-39, 274, 24, 27), true);
  assert.equal(ownsCityInfill(0, 242.5, 42, 40), true);
  assert.equal(ownsCityInfill(-145, 350, 2, 2), true);
});

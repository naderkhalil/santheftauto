import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CEREBRAL_GROUND_GRID, CEREBRAL_GROUND_SAMPLES, CEREBRAL_POINTS,
  CEREBRAL_ORIGIN, CEREBRAL_LANDMARKS, cerebralGroundHeight, cerebralPosition,
} from './cerebral-geography.ts';
import type { CerebralLayout } from './cerebral-geography.ts';

const layout = JSON.parse(readFileSync(new URL('../art/references/cerebral-valley-layout.json', import.meta.url), 'utf8')) as CerebralLayout;
const near = (actual: number, expected: number, epsilon = .002) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);

test('Cerebral uses an uncompressed east/north metre grid at the documented WGS84 origin', () => {
  assert.deepEqual(cerebralPosition(CEREBRAL_ORIGIN.longitude, CEREBRAL_ORIGIN.latitude), { x: 0, z: 0 });
  const alamoCorner = cerebralPosition(-122.4361506, 37.7752152);
  const mapped = CEREBRAL_POINTS.find(point => point.label === 'Alamo Square · Hayes → Scott')!;
  near(mapped.x, alamoCorner.x); near(mapped.z, alamoCorner.z);
  assert.ok(mapped.x < -1000, 'Hayes climbs a real kilometre from Octavia to Scott');
});

test('one shared DEM supplies route points, streets and all building frontages', () => {
  assert.equal(CEREBRAL_GROUND_SAMPLES.length, 96 * 96);
  for (const sample of CEREBRAL_GROUND_SAMPLES) near(cerebralGroundHeight(sample.x, sample.z), sample.y, .00001);
  for (const point of CEREBRAL_POINTS) near(cerebralGroundHeight(point.x, point.z), point.y);
  for (const street of layout.streets) for (const point of street.points) near(cerebralGroundHeight(point.x, point.z), point.y);
  for (const building of layout.buildings) near(cerebralGroundHeight(building.frontage.x, building.frontage.z), building.baseHeight);
  const center = cerebralPosition(-122.4327, 37.7764);
  near(cerebralGroundHeight(center.x, center.z), 60.6566, 1.5); // Independent USGS EPQS, 1m DEM.
  for (const value of CEREBRAL_GROUND_GRID.values) assert.ok(Number.isFinite(value) && value > 0 && value < 150);
});

test('Alamo lap repeats the same measured streets before Page, Reveille and Duboce', () => {
  const labels = CEREBRAL_POINTS.map(point => point.label);
  const index = (text: string) => labels.findIndex(label => label.includes(text));
  const southWest = CEREBRAL_POINTS[index('Hayes → Scott')];
  const complete = CEREBRAL_POINTS[index('lap complete')];
  assert.deepEqual({ x: southWest.x, z: southWest.z, y: southWest.y }, { x: complete.x, z: complete.z, y: complete.y });
  assert.ok(index('Scott → Fulton') < index('Fulton → Steiner'));
  assert.ok(index('Fulton → Steiner') < index('Steiner → Hayes'));
  assert.ok(index('Steiner → Hayes') < index('lap complete'));
  assert.ok(index('Page & Pierce') < index('531 Page'));
  assert.ok(index('531 Page') < index('Page → Webster'));
  assert.ok(index('Webster → Waller') < index('Café Réveille'));
  assert.ok(index('Café Réveille') < index('Duboce Park'));
  const cafe = CEREBRAL_POINTS[index('Café Réveille')];
  const corner = cerebralPosition(-122.4319208, 37.7709710);
  near(cafe.x, corner.x); near(cafe.z, corner.z);
  const page = CEREBRAL_POINTS[index('531 Page')];
  const pageBuilding = layout.buildings.find(building => building.id === '261432385')!;
  assert.ok(Math.hypot(page.x - pageBuilding.frontage.x, page.z - pageBuilding.frontage.z) < 13, '531 drive-by runs on Page beside the actual north-facing frontage');
});

test('real parcels preserve all seven Painted Ladies, the narrow Page house and corner cafe', () => {
  assert.equal(layout.buildings.filter(building => building.hero).length, 10);
  for (const number of [710, 712, 714, 716, 718, 720, 722]) {
    const house = CEREBRAL_LANDMARKS.find(landmark => landmark.name === `${number} Steiner Street`)!;
    assert.ok(house, `${number} Steiner is present`);
    assert.ok(house.frontage.nx < -.98, 'the Painted Ladies face west toward Alamo Square');
  }
  assert.ok(layout.parks.some(park => park.name === 'Alamo Square' && park.paths.length > 5));
  assert.ok(layout.parks.some(park => park.name === 'Duboce Park' && park.paths.length > 5));
  const house = layout.buildings.find(building => building.id === '261432385')!;
  assert.ok(house.frontage.width > 7 && house.frontage.width < 9);
  assert.ok(house.frontage.nz > .98, '531 Page faces north, away from its long rear garden');
});

test('runtime and Blender geometry share the same published data', () => {
  const published = readFileSync(new URL('../public/assets/cerebral-valley/layout.json', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../art/references/cerebral-valley-layout.json', import.meta.url), 'utf8');
  assert.equal(published, source);
  assert.deepEqual(layout.route, CEREBRAL_POINTS);
  assert.deepEqual(layout.elevationGrid, CEREBRAL_GROUND_GRID);
});

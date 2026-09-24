import test from 'node:test';
import assert from 'node:assert/strict';
import { groundHeight } from './route.ts';
import { PLAYGROUND_COLLIDERS, containsPlayground, playgroundHeight } from './playground.ts';
import { PLAZA_RAIL_SEGMENTS, PLAZA_CAFE_TABLES, PLAZA_CAFE_CHAIRS, PLAZA_KNOCKABLE_PROPS } from './playground-props.ts';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .001, `${actual} should equal ${expected}`);
function blocked(x: number, z: number, radius = 1) {
  const y = playgroundHeight(x, z);
  return PLAYGROUND_COLLIDERS.some(c => x > c.minX - radius && x < c.maxX + radius
    && z > c.minZ - radius && z < c.maxZ + radius && y + .18 < c.maxY && y + 1.45 > c.minY);
}

test('exploration preserves the three plaza terraces and joins the existing city grade', () => {
  near(playgroundHeight(0, -44), 22.34);
  near(playgroundHeight(20, 0), 24.4);
  near(playgroundHeight(0, 31), 25.12);
  near(playgroundHeight(45, 115), 22.56);
  for (const [x, z] of [[-75, 190], [75, -65], [187.1, 0], [0, -209], [590, 600]]) {
    near(playgroundHeight(x, z), groundHeight(x, z));
  }
  assert.equal(containsPlayground(-212, 0), true);
  assert.equal(containsPlayground(-212, 0, 2), false, 'positive margin accounts for the car width at the outer boundary');
});

test('all four stair approaches and the side ramp reach their landings continuously', () => {
  const approaches = [
    { a: [0, -36.98], b: [0, -28.7], bottom: 22.34, top: 24.4 },
    { a: [0, 23.7], b: [0, 26.5], bottom: 24.4, top: 25.12 },
    { a: [0, 43.62], b: [0, 35.3], bottom: 22.34, top: 25.12 },
    { a: [58.8, -2], b: [44.7, -2], bottom: 22.34, top: 24.4 },
    { a: [-56.5, -42], b: [-56.5, 26], bottom: 22.34, top: 24.4 },
  ];
  for (const { a, b, bottom, top } of approaches) {
    near(playgroundHeight(a[0], a[1]), bottom);
    near(playgroundHeight(b[0], b[1]), top);
    const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .04);
    let last = bottom;
    for (let i = 1; i <= count; i++) {
      const t = i / count, y = playgroundHeight(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      assert.ok(y >= last - .001, 'the stair envelope cannot reverse or drop between treads');
      assert.ok(y - last < .03, 'tyres must not hit instantaneous authored risers');
      last = y;
    }
  }
});

test('the north stair side seams support tyres and the tall retaining faces block the whole car', () => {
  const z = 42.15;
  for (const side of [-1, 1]) {
    // Browser regression: a car at x=-9.99,z=42.15 used to drop to street
    // level in the10cm mesh seam, leaving half its body inside the terrace.
    near(playgroundHeight(side * 9.95, z), playgroundHeight(0, z));
    assert.ok(playgroundHeight(side * 9.95, z) > 22.7);
    assert.ok(blocked(side * 9.95, z), 'a low car cannot straddle the retaining wall');
    const wall = PLAYGROUND_COLLIDERS.find(c => c.id === `north-terrace-stair-wall-${side}`)!;
    assert.ok(wall.minY <= 22.34 && wall.maxY >= 25.12, 'the slab wall must extend below the raised garden');
  }
  assert.equal(blocked(0, z), false, 'the ceremonial stairs remain open between their rails');
  assert.equal(blocked(0, 35), false, 'the stair still opens onto its upper landing');
});

test('center terrace retaining faces block low cars without sealing stair and ramp landings', () => {
  for (const [x, z] of [[53.3, 13], [-52.6, -4], [44.8, 22.8]]) {
    assert.ok(playgroundHeight(x, z) < 22.5, 'the test car must be beside the terrace at promenade height');
    assert.ok(blocked(x, z), `the car body cannot overlap the exposed slab at ${x},${z}`);
  }
  for (const [x, z] of [[0, -29], [0, 24], [45.5, -2], [-56.5, 25]]) {
    assert.equal(blocked(x, z), false, `the stair/ramp approach at ${x},${z} must remain open`);
  }
});

test('real solids block the car while authored courts, sidewalks and Maiden Lane remain open', () => {
  for (const [x, z] of [[0, 0], [-48.5, 9], [48.95, 13], [-108, -34.5], [45, 96], [120, 12], [34, -46.75]]) {
    assert.ok(blocked(x, z), `authored solid at ${x},${z} must collide`);
  }
  for (const [x, z] of [[-97, -17], [45, 115], [24, 98], [-75, 0], [0, -44], [24, 7]]) {
    assert.equal(blocked(x, z), false, `public court/sidewalk at ${x},${z} must remain open`);
  }
  for (let x = 75; x <= 175; x += 1) assert.equal(blocked(x, 0), false, `Maiden Lane must not be sealed at ${x}`);
});

test('a car-width path reaches every plaza postcard from Post Street without climbing a retaining wall', () => {
  // Flood the actual surfaces with a2m-wide car and at most55cm rise per metre.
  // This catches a misplaced planter/rail or a missing stair landing that can
  // look correct individually but disconnect the complete playable plaza.
  const start = [0, 53], queue = [start], seen = new Set(['0,53']);
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, key = `${nx},${nz}`;
      if (nx < -86 || nx > 86 || nz < -76 || nz > 77 || seen.has(key) || blocked(nx, nz)) continue;
      if (playgroundHeight(nx, nz) - playgroundHeight(x, z) > .55) continue;
      seen.add(key); queue.push([nx, nz]);
    }
  }
  for (const [x, z] of [[0, -24], [24, 7], [-18, 16], [0, 31], [53, -36]]) {
    assert.ok(seen.has(`${x},${z}`), `postcard at ${x},${z} must be reachable from the street`);
  }
});

test('knockable rail sections preserve every original post and form continuous authored rails', () => {
  const expected = new Map([
    ...[-31, -11, 11, 31].map(x => [`south-stair-rail-${x}`, 4] as const),
    ...[-7, 7].map(x => [`north-entry-rail-${x}`, 4] as const),
    ...[-16, 16].map(x => [`north-terrace-rail-${x}`, 2] as const),
    ['west-ramp-rail', 14], ...[-6.7, 2.7].map(z => [`stockton-stair-rail-${z}`, 5] as const),
  ]);
  assert.equal(PLAZA_RAIL_SEGMENTS.length, 52);
  assert.equal(PLAZA_RAIL_SEGMENTS.reduce((posts, segment) => posts + Number(segment.postAtA) + Number(segment.postAtB), 0), 63,
    'splitting a rail must neither duplicate nor lose its original posts');
  for (const [railId, count] of expected) {
    const sections = PLAZA_RAIL_SEGMENTS.filter(segment => segment.railId === railId);
    assert.equal(sections.length, count);
    for (const [index, section] of sections.entries()) {
      assert.equal(section.id, `${railId}/${index}`);
      assert.equal(section.postAtB, index === sections.length - 1, 'shared posts belong to exactly one section');
      if (index) assert.deepEqual(section.a, sections[index - 1].b, 'adjacent sections meet at the original post');
    }
  }
});

test('rendered prop identities match knockable collisions while structural fixtures stay solid', () => {
  const props = new Map(PLAZA_KNOCKABLE_PROPS.map(prop => [prop.id, prop]));
  assert.equal(props.size, 84, 'each small prop needs one unique impact/reset identity');
  assert.equal(PLAZA_CAFE_TABLES.filter(table => table.parasol).length, 4, 'each umbrella belongs to its table');
  for (const prop of props.values()) {
    assert.ok(PLAYGROUND_COLLIDERS.some(collider => collider.propId === prop.id), `${prop.id} must have collision geometry`);
  }
  for (const collider of PLAYGROUND_COLLIDERS) {
    if (collider.propId) assert.ok(props.has(collider.propId), `${collider.id} must knock an existing rendered prop`);
    else assert.equal(/^(cafe-table-|cafe-chair-|south-stair-rail-|north-entry-rail-|north-terrace-rail-|west-ramp-rail|stockton-stair-rail-)/.test(collider.id), false,
      `${collider.id} must not leave an invisible fixed collision after the prop moves`);
  }
  for (const prefix of ['station-escalator-', 'north-garden-', 'center-terrace-wall-', 'dewey-', 'cafe-pavilion-']) {
    const solids = PLAYGROUND_COLLIDERS.filter(collider => collider.id.startsWith(prefix));
    assert.ok(solids.length > 0);
    assert.ok(solids.every(collider => !collider.propId), `${prefix} remains structural`);
  }
  for (const table of PLAZA_CAFE_TABLES) {
    const chairs = PLAZA_CAFE_CHAIRS.filter(chair => chair.tableId === table.id);
    assert.equal(chairs.length, 3);
    for (const chair of chairs) {
      near(Math.hypot(chair.x - table.x, chair.z - table.z), 1.33);
      near(chair.y, table.y);
    }
  }
});

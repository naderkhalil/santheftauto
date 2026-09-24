import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { WATERFRONT, waterfrontOwnsGround, waterfrontFinishView } from './waterfront-layout.ts';
import { routeProgressAt, sampleRoute, TRACK_LENGTH } from './route.ts';
import { setCameraFromCity } from './coordinates.ts';

test('Ferry Building faces the Market finish with open approach space', () => {
  const finish = sampleRoute(TRACK_LENGTH), ferry = WATERFRONT.ferry;
  assert.equal(finish.z, ferry.z);
  assert.ok(ferry.x - 28 - finish.x > 25, 'modeled arcade and steps clear the finish by over25m');
  assert.equal(finish.y, 2);
  assert.equal(sampleRoute(routeProgressAt(590, 665)).y, 5);
  assert.equal(waterfrontOwnsGround(687, 700), true);
  assert.equal(waterfrontOwnsGround(687, -700), true, 'south waterfront continuation covers the old blank ground');
  assert.equal(waterfrontOwnsGround(590, 665), false, 'quay ownership does not alter the racing road');
});

test('historic pier order stays north of Washington and palm wells clear the driving corridor', () => {
  const layout = JSON.parse(readFileSync(new URL('../public/assets/waterfront/embarcadero.json', import.meta.url), 'utf8'));
  assert.deepEqual(layout.piers.map((p: { number: number }) => p.number), [1, 1.5, 3, 5, 7]);
  let north = 700;
  for (const pier of layout.piers) { assert.ok(pier.north > north); north = pier.north; }
  for (const palm of [...layout.palmAnchors, ...(layout.southernPalmAnchors ?? [])]) {
    assert.ok(palm.x > 610 && Number.isFinite(palm.height));
    assert.ok(Math.abs(palm.north - 250) > 15, 'no palm blocks the Market entrance');
  }
});

test('finish camera keeps clocktower and full waterfront building in the portrait and wide frames', () => {
  for (const aspect of [705 / 833, 1280 / 720, 390 / 844]) {
    const view = waterfrontFinishView(aspect);
    const camera = new THREE.PerspectiveCamera(view.fov, aspect, .15, 4200);
    setCameraFromCity(camera, view.eye, WATERFRONT.finishLook);
    for (const [x, y, z] of [[702, 77.3, 250], [730, 25, 154], [730, 25, 346]]) {
      const screen = new THREE.Vector3(x, y, -z).project(camera);
      assert.ok(Math.abs(screen.x) < .95 && Math.abs(screen.y) < .85, `landmark clipped at aspect${aspect}`);
    }
  }
});

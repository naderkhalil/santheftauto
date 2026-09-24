import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cityToRender, setCameraFromCity } from './coordinates.ts';
import { ROAD_HALF_WIDTH, TRACK_LENGTH, routeCurvature, routeFrame, routePoint, routeProgressAt } from './route.ts';
import { RACE_CORNER_SPEED, RACE_TURNS, raceTurnPanelPositions, upcomingRaceTurn } from './race-guidance-layout.ts';

const near = (a: number, b: number, epsilon = 1e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);

test('all eight turn boundaries follow the actual route arcs and street sequence', () => {
  assert.equal(RACE_TURNS.length, 8);
  assert.deepEqual(RACE_TURNS.map(turn => turn.street), ['Stockton Street', 'Geary Street', 'Powell Street', 'Bush Street', 'Grant Avenue', 'Washington Street', 'The Embarcadero', 'Market Street']);
  let previous = 0;
  for (const turn of RACE_TURNS) {
    assert.ok(turn.entry > previous && turn.entry < turn.apex && turn.apex < turn.exit);
    near(routeCurvature(turn.entry - .01), 0);
    assert.ok(Math.abs(routeCurvature(turn.entry + .01)) > .01);
    assert.ok(Math.abs(routeCurvature(turn.exit - .01)) > .01);
    near(routeCurvature(turn.exit + .01), 0);
    near(turn.apex - turn.entry, turn.exit - turn.apex);
    previous = turn.exit;
  }
  assert.ok(previous < TRACK_LENGTH);
});

test('every arrow direction matches its turn projected into the actual reflected city camera', () => {
  assert.deepEqual(RACE_TURNS.map(turn => turn.direction), ['right', 'right', 'right', 'right', 'left', 'right', 'right', 'left']);
  for (const turn of RACE_TURNS) {
    const before = routeFrame(turn.entry - 20), after = routePoint(turn.exit + 2);
    const camera = new THREE.PerspectiveCamera(70, 1, .1, 2000);
    setCameraFromCity(camera,
      new THREE.Vector3(before.position.x, before.position.y + 4, before.position.z),
      new THREE.Vector3(before.position.x + before.tangent.x * 50, before.position.y + 4, before.position.z + before.tangent.z * 50));
    const projected = cityToRender(new THREE.Vector3(after.x, before.position.y + 4, after.z)).project(camera);
    assert.ok(projected.x * (turn.direction === 'right' ? 1 : -1) > 0, `wrong screen direction entering ${turn.street}`);
  }
});

test('outside chevron boards keep their complete diagonal footprints clear of the racing road', () => {
  for (const turn of RACE_TURNS) {
    const panels = raceTurnPanelPositions(turn);
    assert.equal(panels.length, 5);
    near(panels[0].progress, turn.entry); near(panels[2].progress, turn.apex); near(panels[4].progress, turn.exit);
    for (const panel of panels) {
      assert.equal(Math.sign(panel.lateral), turn.signSide);
      assert.equal(turn.signSide, turn.direction === 'right' ? -1 : 1);
      // Renderer faces the boards halfway between upstream and the road.
      const facing = { x: (panel.inward.x - panel.tangent.x) / Math.SQRT2, z: (panel.inward.z - panel.tangent.z) / Math.SQRT2 };
      const widthAxis = { x: facing.z, z: -facing.x };
      for (const side of [-1, 1]) for (const depth of [-1, 1]) {
        const x = panel.position.x + side * 1.95 * widthAxis.x + depth * .2 * facing.x;
        const z = panel.position.z + side * 1.95 * widthAxis.z + depth * .2 * facing.z;
        const nearest = routePoint(routeProgressAt(x, z));
        assert.ok(Math.hypot(x - nearest.x, z - nearest.z) > ROAD_HALF_WIDTH + .2, `board clips ${turn.fromStreet} → ${turn.street}`);
      }
    }
  }
});

test('upcoming turns advance immediately at exits, including the waterfront turns and finish', () => {
  for (const turn of RACE_TURNS) {
    const approaching = upcomingRaceTurn(turn.entry - 12, 25)!;
    assert.equal(approaching.turn.id, turn.id); near(approaching.distance, 12); assert.equal(approaching.inTurn, false);
    const inside = upcomingRaceTurn(turn.apex, 25)!;
    assert.equal(inside.turn.id, turn.id); near(inside.distance, 0); assert.equal(inside.inTurn, true);
    assert.equal(upcomingRaceTurn(turn.exit, 25)?.turn.id, RACE_TURNS[turn.id + 1]?.id);
  }
  assert.equal(upcomingRaceTurn(TRACK_LENGTH - 1, 44), null);
  assert.equal(upcomingRaceTurn(TRACK_LENGTH, 44), null);
  assert.equal(upcomingRaceTurn(TRACK_LENGTH + 100, 44), null);
});

test('braking advice gives a high-speed approach time to slow and stays quiet at safe speed', () => {
  const turn = RACE_TURNS[6];
  assert.equal(upcomingRaceTurn(turn.entry - 65, 44)?.brake, true);
  assert.equal(upcomingRaceTurn(turn.entry - 110, 44)?.brake, false);
  assert.equal(upcomingRaceTurn(turn.entry - 90, 58)?.brake, true);
  assert.equal(upcomingRaceTurn(turn.apex, RACE_CORNER_SPEED)?.brake, false);
  assert.equal(upcomingRaceTurn(turn.apex, 44)?.brake, true);
  assert.equal(upcomingRaceTurn(turn.entry - 5, -8)?.brake, false);
  assert.equal(upcomingRaceTurn(turn.entry - 5, Number.NaN)?.brake, false);
  assert.equal(upcomingRaceTurn(Number.NaN, 44), null);
});

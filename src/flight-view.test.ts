import test from 'node:test';
import assert from 'node:assert/strict';
import { flightView } from './flight-view.ts';

const climbing = { speed: 44, y: 90, verticalVelocity: 15.84, altitude: 0, glide: 0, driftAngle: .2 };

test('leaving the road preserves the full climbing attitude before hover deployment', () => {
  const before = flightView(climbing, .36, 88);
  const after = flightView({ ...climbing, altitude: .0001 }, .36, 88);
  assert.ok(Math.abs(before.pitch + Math.atan(.36)) < 1e-12);
  assert.ok(before.pitch < -.18, 'release must not snap to the limited glide pitch');
  assert.deepEqual(after, before);
});

test('camera, pitch and banking transition continuously as clearance and wheels increase', () => {
  let previous = flightView(climbing, .36, 88);
  for (let i = 1; i <= 1000; i++) {
    const view = flightView({ ...climbing, altitude: i * .004, glide: i / 1000 }, .36, 88);
    assert.ok(view.weight >= previous.weight);
    assert.ok(Math.abs(view.pitch - previous.pitch) < .002);
    assert.ok(Math.abs(view.lookHeight - previous.lookHeight) < .01);
    assert.ok(Math.abs(view.bank - previous.bank) < .002);
    previous = view;
  }
  assert.equal(previous.weight, 1);
  assert.equal(previous.pitch, -.18);
  assert.equal(previous.lookHeight, climbing.y - 1.8);
});

test('touchdown restores road framing even before the wheel animation has settled', () => {
  const state = { ...climbing, speed: 0, verticalVelocity: 0, glide: .12 };
  const view = flightView(state, -.2, 92);
  assert.equal(view.weight, 0);
  assert.equal(view.pitch, -Math.atan(-.2));
  assert.equal(view.lookHeight, 91.8);
});

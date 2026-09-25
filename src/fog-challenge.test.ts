import test from 'node:test';
import assert from 'node:assert/strict';
import { FogChallenge } from './fog-challenge.ts';

test('the bridge fog requires three ordered manual crossings before clearing', () => {
  const fog = new FogChallenge(100, 400);
  assert.equal(fog.active, false);
  assert.equal(fog.total, 3);
  assert.equal(fog.update(90, 99, 0), 'none');
  assert.equal(fog.active, false);
  assert.equal(fog.update(99, 110, 0), 'none');
  assert.equal(fog.active, true);
  assert.deepEqual(fog.nextBeacon, { progress: 166, lateral: -3 });
  assert.equal(fog.update(165, 167, -3), 'beacon');
  assert.equal(fog.collected, 1);
  assert.deepEqual(fog.nextBeacon, { progress: 250, lateral: 3 });
  assert.equal(fog.update(249, 251, 3), 'beacon');
  assert.equal(fog.update(333, 335, 0), 'complete');
  assert.equal(fog.complete, true);
  assert.equal(fog.active, false);
  assert.equal(fog.nextBeacon, undefined);
  assert.equal(fog.update(335, 450, 9), 'none');
  assert.equal(fog.collected, 3);
  fog.reset();
  assert.equal(fog.collected, 0);
  assert.equal(fog.complete, false);
  assert.equal(fog.active, false);
});

test('missing a beacon clears the attempt so the caller can retry from the entrance', () => {
  const fog = new FogChallenge(100, 400);
  assert.equal(fog.update(165, 167, 0), 'retry', 'holding a centered line cannot solve the fog');
  assert.equal(fog.collected, 0);
  assert.equal(fog.complete, false);
  assert.equal(fog.update(99, 110, -3), 'none');
  assert.equal(fog.update(165, 167, -.5), 'beacon', 'nearby lane crossings remain forgiving');
  assert.equal(fog.update(249, 251, -3), 'retry');
  assert.equal(fog.collected, 0, 'a later miss restarts all three gates');
  assert.equal(fog.nextBeacon?.progress, 166);
});

test('jumping ahead or crossing several gates cannot bypass the fog skill segment', () => {
  const skipped = new FogChallenge(100, 400);
  assert.equal(skipped.update(300, 350, -3), 'retry');
  const jump = new FogChallenge(100, 400);
  assert.equal(jump.update(90, 450, -3), 'retry');
  assert.equal(jump.complete, false);
  assert.equal(jump.collected, 0);
});

test('a 100 ms frame scores lateral position at the beacon plane, not at frame end', () => {
  // At 40 m/s, this frame advances four metres across the 166 m beacon.
  const crossedInside = new FogChallenge(100, 400);
  assert.equal(crossedInside.update(164, 168, .1, -1.1), 'beacon',
    'the crossing is 2.5 m from the target even though the frame ends outside');
  const crossedOutside = new FogChallenge(100, 400);
  assert.equal(crossedOutside.update(164, 168, -.7, .3), 'retry',
    'the crossing is 2.8 m from the target even though the frame ends inside');
  const subdivided = new FogChallenge(100, 400);
  assert.equal(subdivided.update(164, 166, -.5, -1.1), 'beacon');
  assert.equal(subdivided.update(166, 168, .1, -.5), 'none');
  assert.equal(subdivided.collected, crossedInside.collected);
});

test('reverse movement and invalid updates cannot earn fog beacons', () => {
  const fog = new FogChallenge(100, 400);
  for (const args of [[167, 165, -3], [NaN, 167, -3], [165, Infinity, -3], [165, 167, NaN], [166, 166, -3]]) {
    assert.equal(fog.update(...args as [number, number, number]), 'none');
    assert.equal(fog.collected, 0);
  }
  assert.throws(() => new FogChallenge(1, 1), RangeError);
  assert.throws(() => new FogChallenge(100, 0), RangeError);
  assert.throws(() => new FogChallenge(0, Infinity), RangeError);
});

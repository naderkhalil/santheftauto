import test from 'node:test';
import assert from 'node:assert/strict';
import { getRenderProfile, renderPixelRatio } from './render-profile.ts';

const desktop = { userAgent: 'Mozilla/5.0 Macintosh Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0, coarsePointer: false };
test('iPhone, desktop-mode iPad and touch devices select the bounded path before startup', () => {
  for (const device of [
    { ...desktop, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)' },
    { ...desktop, maxTouchPoints: 5 },
    { ...desktop, platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 Android' },
    { ...desktop, platform: 'Linux', coarsePointer: true },
  ]) {
    const profile = getRenderProfile(device);
    assert.equal(profile.mobile, true);
    assert.equal(profile.postprocessing, false);
    assert.equal(profile.highDetailAssets, false);
    assert.equal(profile.maxPixelRatio, 1);
    assert.equal(getRenderProfile({ ...device, search: '?graphics=high' }).mobile, true);
  }
});
test('desktop keeps its visuals and can opt into the mobile QA path', () => {
  assert.equal(getRenderProfile(desktop).postprocessing, true);
  assert.equal(getRenderProfile({ ...desktop, search: '?graphics=mobile' }).mobile, true);
});
test('mobile canvas stays within a million pixels even on a large iPad', () => {
  const ratio = renderPixelRatio(3, 1366, 1024, 1, true);
  assert.ok(1366 * 1024 * ratio ** 2 <= 1_000_001);
  assert.equal(renderPixelRatio(3, 390, 844, 1, true), 1);
  assert.equal(renderPixelRatio(2, 1920, 1080, 1.6, false), 1.6);
});

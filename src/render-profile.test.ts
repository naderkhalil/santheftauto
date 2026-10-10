import test from 'node:test';
import assert from 'node:assert/strict';
import { getRenderProfile, renderPixelRatio } from './render-profile.ts';

const desktop = { userAgent: 'Mozilla/5.0 Macintosh Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0, coarsePointer: false };
test('iPhone and iPad select the bounded path before startup, including desktop-mode iPad', () => {
  for (const device of [
    { ...desktop, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)' },
    { ...desktop, maxTouchPoints: 5 },
    { ...desktop, platform: 'iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X)' },
  ]) {
    const profile = getRenderProfile(device);
    assert.equal(profile.mobile, true);
    assert.equal(profile.postprocessing, false);
    assert.equal(profile.highDetailAssets, false);
    assert.equal(profile.maxPixelRatio, 1);
    assert.equal(getRenderProfile({ ...device, search: '?graphics=high' }).mobile, true);
  }
});
test('Android, desktop Safari and touch laptops keep the original full graphics profile', () => {
  for (const device of [
    desktop,
    { ...desktop, platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140', maxTouchPoints: 5, coarsePointer: true },
    { ...desktop, platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-X910) Chrome/140', maxTouchPoints: 10, coarsePointer: true },
    { ...desktop, platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/140', maxTouchPoints: 10, coarsePointer: true },
    { ...desktop, platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140', coarsePointer: true },
  ]) {
    assert.deepEqual(getRenderProfile(device), { mobile: false, maxPixelRatio: 1.6, postprocessing: true, highDetailAssets: true });
  }
});
test('other devices can explicitly opt into the safe path for QA', () => {
  assert.equal(getRenderProfile({ ...desktop, search: '?graphics=mobile' }).mobile, true);
});
test('mobile canvas stays within a million pixels even on a large iPad', () => {
  const ratio = renderPixelRatio(3, 1366, 1024, 1, true);
  assert.ok(1366 * 1024 * ratio ** 2 <= 1_000_001);
  assert.equal(renderPixelRatio(3, 390, 844, 1, true), 1);
  assert.equal(renderPixelRatio(2, 1920, 1080, 1.6, false), 1.6);
});

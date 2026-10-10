import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAnalyticsConfig, sanitizeAnalyticsEvent } from './analytics.ts';

test('analytics stays disabled without an explicit nonempty project key', () => {
  for (const PROD of [false, true]) {
    for (const VITE_POSTHOG_ENABLED of [undefined, 'true']) {
      for (const VITE_POSTHOG_KEY of [undefined, '', '  ']) {
        assert.equal(resolveAnalyticsConfig({ PROD, VITE_POSTHOG_ENABLED, VITE_POSTHOG_KEY }), null);
      }
    }
  }
});

test('production analytics uses the configured project key and the default US host', () => {
  assert.deepEqual(resolveAnalyticsConfig({ PROD: true, VITE_POSTHOG_KEY: ' phc_test_project ' }), {
    key: 'phc_test_project', host: 'https://us.i.posthog.com',
  });
  assert.deepEqual(resolveAnalyticsConfig({ PROD: true, VITE_POSTHOG_KEY: 'phc_test_project', VITE_POSTHOG_HOST: ' https://eu.i.posthog.com ' }), {
    key: 'phc_test_project', host: 'https://eu.i.posthog.com',
  });
});

test('development analytics requires both a project key and explicit enablement', () => {
  assert.equal(resolveAnalyticsConfig({ PROD: false, VITE_POSTHOG_KEY: 'phc_test_project' }), null);
  assert.deepEqual(resolveAnalyticsConfig({ PROD: false, VITE_POSTHOG_ENABLED: 'true', VITE_POSTHOG_KEY: 'phc_test_project' }), {
    key: 'phc_test_project', host: 'https://us.i.posthog.com',
  });
});

test('explicitly disabling analytics overrides a configured key in every build', () => {
  for (const PROD of [false, true]) {
    assert.equal(resolveAnalyticsConfig({ PROD, VITE_POSTHOG_ENABLED: 'false', VITE_POSTHOG_KEY: 'phc_test_project' }), null);
  }
});

test('room invitations are removed from all SDK URL and referrer locations', () => {
  const invitation = 'https://racing.example/?room=PRIVATE#secret';
  const event = sanitizeAnalyticsEvent({
    uuid: 'pageview-test',
    event: '$pageview',
    properties: {
      distinct_id: 'anonymous-visitor',
      $session_id: 'visit-1',
      $current_url: invitation,
      $referrer: 'https://friend.example/invite?room=PRIVATE#secret',
      $session_entry_url: invitation,
      $session_entry_referrer: invitation,
      $set_once: { $initial_current_url: invitation, $initial_referrer: invitation },
    },
    $set: { $current_url: invitation },
    $set_once: { $initial_current_url: invitation, $initial_referrer: invitation },
  });

  assert.ok(event);
  assert.equal(event.properties.$current_url, 'https://racing.example/');
  assert.equal(event.properties.$referrer, 'https://friend.example/invite');
  assert.equal(event.properties.$session_entry_url, 'https://racing.example/');
  assert.equal(event.properties.$session_entry_referrer, 'https://racing.example/');
  assert.equal(event.properties.$set_once.$initial_current_url, 'https://racing.example/');
  assert.equal(event.$set?.$current_url, 'https://racing.example/');
  assert.equal(event.$set_once?.$initial_referrer, 'https://racing.example/');
  assert.equal(event.properties.distinct_id, 'anonymous-visitor');
  assert.equal(event.properties.$session_id, 'visit-1');
  assert.doesNotMatch(JSON.stringify(event), /PRIVATE|secret/);
});

test('page-leave duration and direct attribution survive sanitization', () => {
  const event = sanitizeAnalyticsEvent({
    uuid: 'pageleave-test',
    event: '$pageleave',
    properties: {
      $referrer: '$direct',
      $referring_domain: '$direct',
      $prev_pageview_duration: 42,
      $current_url: 'https://user:password@racing.example/play?room=PRIVATE',
      $initial_referrer: 'malformed?room=PRIVATE',
      $session_entry_referrer: 'javascript:secret',
    },
  });

  assert.ok(event);
  assert.equal(event.properties.$referrer, '$direct');
  assert.equal(event.properties.$referring_domain, '$direct');
  assert.equal(event.properties.$prev_pageview_duration, 42);
  assert.equal(event.properties.$current_url, 'https://racing.example/play');
  assert.equal(event.properties.$initial_referrer, '');
  assert.equal(event.properties.$session_entry_referrer, '');
  assert.equal(sanitizeAnalyticsEvent(null), null);
});

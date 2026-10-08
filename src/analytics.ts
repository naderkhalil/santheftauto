import type { CaptureResult } from 'posthog-js';

// PostHog project tokens are public browser keys, not personal API credentials.
const PROJECT_TOKEN = 'phc_ye84QB22CKPBQG4Ai39eYwMcRBZD65sXjvSA4sShUnzn';
const API_HOST = 'https://us.i.posthog.com';

function sanitizeProperties(properties: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && /(?:^|[$_])(?:url|referrer)$/.test(key) && value !== '$direct') {
      try {
        const url = new URL(value);
        properties[key] = ['http:', 'https:'].includes(url.protocol) ? url.origin + url.pathname : '';
      } catch {
        properties[key] = '';
      }
    } else if (value && typeof value === 'object') {
      sanitizeProperties(value as Record<string, unknown>);
    }
  }
}

/** Strip invitation queries/fragments from current, initial, and session-entry URLs. */
export function sanitizeAnalyticsEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  sanitizeProperties(event.properties);
  if (event.$set) sanitizeProperties(event.$set);
  if (event.$set_once) sanitizeProperties(event.$set_once);
  return event;
}

let initialized = false;

export async function initAnalytics(): Promise<void> {
  const enabled = import.meta.env.VITE_POSTHOG_ENABLED;
  if (initialized || enabled === 'false' || (!import.meta.env.PROD && enabled !== 'true')) return;
  initialized = true;

  try {
    // Load independently so analytics never holds up the city or its assets.
    const { default: posthog } = await import('posthog-js');
    posthog.init(import.meta.env.VITE_POSTHOG_KEY || PROJECT_TOKEN, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || API_HOST,
      defaults: '2026-08-30',
      persistence: 'localStorage',
      person_profiles: 'never',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_performance: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_conversations: true,
      disable_product_tours: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      disable_capture_url_hashes: true,
      before_send: sanitizeAnalyticsEvent,
    });
  } catch {
    // A blocked or unavailable analytics SDK must not prevent play.
  }
}

import type { CaptureResult, PostHog } from 'posthog-js';
import { GameAnalytics } from './game-analytics.ts';
import type { GameEvent } from './game-analytics.ts';
import type { StartupEvent } from './startup-diagnostics.ts';

const API_HOST = 'https://us.i.posthog.com';
type AnalyticsEnvironment = {
  PROD: boolean;
  VITE_POSTHOG_ENABLED?: string;
  VITE_POSTHOG_KEY?: string;
  VITE_POSTHOG_HOST?: string;
};
type AnalyticsConfig = { key: string; host: string };

/** A build must explicitly provide its own public project key to send analytics. */
export function resolveAnalyticsConfig(env: AnalyticsEnvironment): AnalyticsConfig | null {
  const key = env.VITE_POSTHOG_KEY?.trim();
  if (!key || env.VITE_POSTHOG_ENABLED === 'false' || (!env.PROD && env.VITE_POSTHOG_ENABLED !== 'true')) return null;
  return { key, host: env.VITE_POSTHOG_HOST?.trim() || API_HOST };
}

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

let initialization: Promise<void> | undefined;
let client: PostHog | undefined;

export function initAnalytics(): Promise<void> {
  if (initialization) return initialization;
  const config = resolveAnalyticsConfig(import.meta.env);
  if (!config) return Promise.resolve();
  initialization = loadAnalytics(config);
  return initialization;
}

async function loadAnalytics(config: AnalyticsConfig): Promise<void> {
  try {
    // Load independently so analytics never holds up the city or its assets.
    const { default: posthog } = await import('posthog-js');
    posthog.init(config.key, {
      api_host: config.host,
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
    client = posthog;
  } catch {
    // A blocked or unavailable analytics SDK must not prevent play.
  }
}

export function captureGameEvent(event: GameEvent, properties: Record<string, unknown>): void {
  const timestamp = new Date();
  // Preserve early starts/finishes while the SDK loads, without blocking play.
  void initAnalytics().then(() => {
    try { client?.capture(event, properties, { timestamp }); } catch { /* Analytics is optional. */ }
  }).catch(() => { /* Analytics is optional. */ });
}

/** Small, allowlisted checkpoints should leave before a later startup failure. */
export function captureStartupEvent(event: StartupEvent, properties: Record<string, unknown>): void {
  const timestamp = new Date();
  try {
    void initAnalytics().then(() => {
      try { client?.capture(event, properties, { timestamp, send_instantly: true }); } catch { /* Diagnostics never block play. */ }
    }).catch(() => { /* Analytics is optional. */ });
  } catch { /* Missing configuration or storage cannot prevent startup. */ }
}

export const gameAnalytics = new GameAnalytics(captureGameEvent);

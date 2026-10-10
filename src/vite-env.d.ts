/// <reference types="vite/client" />
declare const __APP_BUILD__: string;

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_POSTHOG_ENABLED?: string;
}

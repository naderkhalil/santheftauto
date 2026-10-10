import { captureStartupEvent } from './analytics';
import { StartupDiagnostics } from './startup-diagnostics';

const diagnosticMode = new URLSearchParams(location.search).get('diagnostics');
export const startupReportOnly = diagnosticMode === 'report';

let storage: Storage | undefined;
try { storage = window.sessionStorage; } catch { /* Private browsing may deny storage. */ }
let panel: HTMLTextAreaElement | undefined;
let previousInterruption: Record<string, unknown> | undefined;
export const startupDiagnostics = new StartupDiagnostics({
  storage,
  capture: (event, properties) => {
    if (event === 'startup_interrupted') previousInterruption = properties;
    captureStartupEvent(event, properties);
    // Capture is called after the checkpoint is stored; defer the optional UI.
    if (panel) queueMicrotask(updatePanel);
  },
});

const ua = navigator.userAgent;
const ios = /iPhone|iPad|iPod/i.test(ua) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
let savedQuality: string | null = null;
try { savedQuality = localStorage.getItem('sf-night-run-quality'); } catch { /* Optional setting. */ }
const quality = savedQuality === 'low' || savedQuality === 'cinematic' ? savedQuality : 'high';
if (!startupReportOnly) startupDiagnostics.start({
  buildVersion: __APP_BUILD__,
  browser: /CriOS|Chrome|Chromium/i.test(ua) ? 'chrome' : /FxiOS|Firefox/i.test(ua) ? 'firefox' : /Safari/i.test(ua) ? 'safari' : 'other',
  os: ios ? 'ios' : /Android/i.test(ua) ? 'android' : /Mac/i.test(ua) ? 'macos' : /Windows/i.test(ua) ? 'windows' : 'other',
  browserVersion: ua.match(/(?:CriOS|Chrome|Chromium|FxiOS|Firefox|Version)\/([\d.]+)/i)?.[1],
  osVersion: ios ? ua.match(/(?:CPU(?: iPhone)? OS|iPhone OS) ([\d_]+)/i)?.[1]?.replaceAll('_', '.') : undefined,
  width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio, quality,
});

window.addEventListener('error', (event: Event) => {
  // Optional asset failures have their own fallbacks; only uncaught JS errors
  // and failed script loads belong to the startup failure report here.
  if (event instanceof ErrorEvent) startupDiagnostics.failure('javascript', event.error);
  else if (event.target instanceof HTMLScriptElement) startupDiagnostics.failure('resource');
}, true);
window.addEventListener('unhandledrejection', event => startupDiagnostics.failure('unhandled-rejection', event.reason));
window.addEventListener('pagehide', () => startupDiagnostics.pagehide());

function updatePanel() {
  if (panel) panel.value = JSON.stringify({current:startupReportOnly?startupDiagnostics.savedSnapshot():startupDiagnostics.snapshot(),previousInterruptedStartup:previousInterruption}, null, 2);
}

// The support link exposes only the same sanitized report sent to analytics.
// Keep normal gameplay and graphics unchanged.
if (diagnosticMode === '1' || startupReportOnly) {
  const details = document.createElement('details');
  details.open = startupReportOnly;
  details.id = 'startup-diagnostics';
  details.style.cssText = 'box-sizing:border-box;position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:calc(100vw - 24px);width:360px;padding:12px;background:#fff;color:#172d33;border:1px solid #52666b;border-radius:8px;font:14px system-ui';
  const summary = document.createElement('summary');
  summary.textContent = 'Loading diagnostic report';
  panel = document.createElement('textarea');
  panel.readOnly = true;
  panel.setAttribute('aria-label', 'Loading diagnostic report');
  panel.style.cssText = 'box-sizing:border-box;width:100%;height:220px;margin-top:10px;font:16px monospace;background:#fff;color:#172d33';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy report';
  copy.style.cssText = 'min-height:44px;padding:8px 16px;background:#172d33;color:white;border:0;border-radius:4px';
  copy.onclick = () => {
    updatePanel();
    if (!panel) return;
    panel.focus(); panel.select();
    void navigator.clipboard?.writeText(panel.value).then(() => { copy.textContent = 'Copied'; }).catch(() => { copy.textContent = 'Select and copy report'; });
  };
  details.append(summary, panel, copy);
  document.body.append(details);
  details.addEventListener('toggle', updatePanel);
  updatePanel();
}

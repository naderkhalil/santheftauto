export const STARTUP_STORAGE_KEY = 'sf-startup-diagnostics-v1';
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_CHECKPOINTS = 24;
const MAX_STAGE_EVENTS = 28;
const STAGES = ['boot', 'renderer', 'atmosphere', 'city', 'landmarks', 'street-details', 'waterfront', 'racer', 'assets', 'postprocessing', 'lighting', 'reflections', 'first-frame', 'multiplayer', 'ready'] as const;
type StageName = typeof STAGES[number];
export type StartupStage = StageName | `${StageName}:start` | `${StageName}:complete`;
export type StartupEvent = 'startup_started' | 'startup_stage' | 'startup_failed' | 'startup_complete' | 'startup_interrupted';
export type StartupContext = {
  buildVersion?: string;
  browser?: 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';
  os?: 'ios' | 'ipados' | 'android' | 'macos' | 'windows' | 'linux' | 'other';
  browserVersion?: string;
  osVersion?: string;
  width?: number;
  height?: number;
  pixelRatio?: number;
  quality?: 'high' | 'cinematic' | 'low';
};
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Status = 'pending' | 'failed' | 'complete' | 'navigated';
type Checkpoint = { stage: StartupStage; elapsedMs: number; pendingAssets: string[] };
export type StartupSnapshot = {
  version: 1;
  startedAt: number;
  updatedAt: number;
  status: Status;
  context: StartupContext;
  checkpoints: Checkpoint[];
  failure?: { kind: string; errorType: string };
};
type Options = {
  storage?: Storage | null;
  capture?: (event: StartupEvent, properties: Record<string, unknown>) => void | Promise<void>;
  now?: () => number;
};
const ASSETS = ['road textures', 'Pacific sky', 'Union Square', 'city traffic', 'city streets', 'street details', 'the waterfront', 'drivers and cars'];
const FAILURE_KINDS = ['javascript', 'unhandled-rejection', 'resource', 'webgl-create', 'webgl-context-lost', 'timeout', 'startup'];
const ERROR_TYPES = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'DOMException', 'AbortError', 'NetworkError', 'SecurityError', 'QuotaExceededError', 'NotSupportedError', 'InvalidStateError', 'StartupTimeoutError', 'Unknown'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const stageName = (value: unknown): value is StartupStage => typeof value === 'string' && STAGES.some(stage => value === stage || value === `${stage}:start` || value === `${stage}:complete`);
const assets = (value: unknown): string[] => Array.isArray(value) ? ASSETS.filter(asset => value.includes(asset)) : [];

/** Only product-owned enums, numeric dimensions, and a build identifier leave the page. */
function context(value: unknown): StartupContext {
  if (!record(value)) return {};
  const result: StartupContext = {};
  if (typeof value.buildVersion === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value.buildVersion)) result.buildVersion = value.buildVersion;
  for (const key of ['browserVersion', 'osVersion'] as const) {
    if (typeof value[key] === 'string' && /^\d{1,3}(?:\.\d{1,3}){0,3}$/.test(value[key])) result[key] = value[key];
  }
  if (['safari', 'chrome', 'firefox', 'edge', 'other'].includes(value.browser as string)) result.browser = value.browser as StartupContext['browser'];
  if (['ios', 'ipados', 'android', 'macos', 'windows', 'linux', 'other'].includes(value.os as string)) result.os = value.os as StartupContext['os'];
  if (['high', 'cinematic', 'low'].includes(value.quality as string)) result.quality = value.quality as StartupContext['quality'];
  for (const key of ['width', 'height', 'pixelRatio'] as const) {
    const maximum = key === 'pixelRatio' ? 10 : 32768;
    if (finite(value[key]) && value[key] > 0 && value[key] <= maximum) result[key] = Math.round(value[key] * 100) / 100;
  }
  return result;
}

function errorType(error: unknown): string {
  try {
    if (record(error) && typeof error.name === 'string' && ERROR_TYPES.includes(error.name)) return error.name;
  } catch { /* Even a thrown object with unsafe getters is optional diagnostic data. */ }
  return 'Unknown';
}

/** No browser globals or renderer effects; storage, clock and transport are injected. */
export class StartupDiagnostics {
  private current: StartupSnapshot | null = null;
  private stageEvents = 0;
  private readonly options: Options;

  constructor(options: Options = {}) { this.options = options; }

  start(details: StartupContext = {}): void {
    if (this.current) return;
    const now = this.time();
    const previous = this.previous(now);
    this.current = { version: 1, startedAt: now, updatedAt: now, status: 'pending', context: context(details), checkpoints: [{ stage: 'boot', elapsedMs: 0, pendingAssets: [] }] };
    this.persist();
    // A terminated page, closed tab, or lost lifecycle event can all leave this marker.
    if (previous?.status === 'pending') this.emit('startup_interrupted', previous, { crash_confirmed: false });
    this.emit('startup_started', this.current);
  }

  stage(name: string, pendingAssets: readonly string[] = []): void {
    if (this.current?.status !== 'pending' || !stageName(name)) return;
    const pending = assets(pendingAssets), last = this.current.checkpoints.at(-1)!;
    if (last.stage === name && JSON.stringify(last.pendingAssets) === JSON.stringify(pending)) return;
    const now = this.time();
    this.current.updatedAt = now;
    this.current.checkpoints.push({ stage: name, elapsedMs: Math.max(0, now - this.current.startedAt), pendingAssets: pending });
    this.current.checkpoints = this.current.checkpoints.slice(-MAX_CHECKPOINTS);
    this.persist();
    if (this.stageEvents++ < MAX_STAGE_EVENTS) this.emit('startup_stage', this.current);
  }

  failure(kind: string, error?: unknown): void {
    if (this.current?.status !== 'pending') return;
    this.current.status = 'failed';
    this.current.updatedAt = this.time();
    this.current.failure = { kind: FAILURE_KINDS.includes(kind) ? kind : 'startup', errorType: errorType(error) };
    this.persist();
    this.emit('startup_failed', this.current);
  }

  complete(): void {
    if (this.current?.status !== 'pending') return;
    this.current.status = 'complete';
    this.current.updatedAt = this.time();
    this.persist();
    this.emit('startup_complete', this.current);
  }

  /** Normal navigation must not masquerade as an unexplained startup interruption. */
  pagehide(): void {
    if (this.current?.status !== 'pending') return;
    this.current.status = 'navigated';
    this.current.updatedAt = this.time();
    this.persist();
  }

  snapshot(): StartupSnapshot | null {
    return this.current ? JSON.parse(JSON.stringify(this.current)) as StartupSnapshot : null;
  }

  /** Read a recent, sanitized report without beginning or overwriting an attempt. */
  savedSnapshot(): StartupSnapshot | null {
    return this.previous(this.time());
  }

  private time(): number {
    try { const now = (this.options.now ?? Date.now)(); if (finite(now)) return now; } catch { /* Optional clock cannot block boot. */ }
    return this.current?.updatedAt ?? 0;
  }

  private persist(): void {
    try { this.options.storage?.setItem(STARTUP_STORAGE_KEY, JSON.stringify(this.current)); } catch { /* Private browsing/quota failures cannot block boot. */ }
  }

  private emit(event: StartupEvent, state: StartupSnapshot, extra: Record<string, unknown> = {}): void {
    const checkpoint = state.checkpoints.at(-1)!;
    try {
      const result = this.options.capture?.(event, {
        ...state.context, started_at: state.startedAt, status: state.status,
        stage: checkpoint.stage, elapsed_ms: Math.max(0, state.updatedAt - state.startedAt),
        pending_assets: [...checkpoint.pendingAssets],
        ...(state.failure ? { failure_kind: state.failure.kind, error_type: state.failure.errorType } : {}), ...extra,
      });
      if (result) void Promise.resolve(result).catch(() => { /* Optional async transport. */ });
    } catch { /* Analytics is optional. */ }
  }

  private previous(now: number): StartupSnapshot | null {
    try {
      const raw = this.options.storage?.getItem(STARTUP_STORAGE_KEY);
      if (!raw || raw.length > 16000) return null;
      const saved: unknown = JSON.parse(raw);
      if (!record(saved) || saved.version !== 1 || !['pending', 'failed', 'complete', 'navigated'].includes(saved.status as string)) return null;
      if (!finite(saved.startedAt) || !finite(saved.updatedAt) || saved.startedAt > saved.updatedAt || saved.updatedAt > now || now - saved.startedAt > MAX_AGE_MS) return null;
      if (!Array.isArray(saved.checkpoints) || !saved.checkpoints.length || saved.checkpoints.length > MAX_CHECKPOINTS) return null;
      const checkpoints: Checkpoint[] = [];
      for (const point of saved.checkpoints) {
        if (!record(point) || !stageName(point.stage) || !finite(point.elapsedMs) || point.elapsedMs < 0 || point.elapsedMs > MAX_AGE_MS) return null;
        checkpoints.push({ stage: point.stage, elapsedMs: point.elapsedMs, pendingAssets: assets(point.pendingAssets) });
      }
      const failure = saved.status === 'failed' && record(saved.failure)
        && typeof saved.failure.kind === 'string' && FAILURE_KINDS.includes(saved.failure.kind)
        && typeof saved.failure.errorType === 'string' && ERROR_TYPES.includes(saved.failure.errorType)
        ? { kind: saved.failure.kind, errorType: saved.failure.errorType } : undefined;
      return { version: 1, startedAt: saved.startedAt, updatedAt: saved.updatedAt, status: saved.status as Status, context: context(saved.context), checkpoints, ...(failure ? { failure } : {}) };
    } catch { return null; }
  }
}

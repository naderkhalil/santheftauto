import * as THREE from 'three';
import { createCar } from './car';
import { DRIVERS, DEFAULT_PROFILE, normalizeProfile, type RacerProfile } from './racer-profile';
import type { DriveInput } from './driving';
import { COURSE_VERSION, ROOM_CAPACITY, type RoomCommand, type RoomSnapshot, type RacerSnapshot, type RoundResult } from './multiplayer-protocol';
import { setupMarkup, escape, time, clock, driverName, carName, sponsorName, playerStatus, ordinal, dnfLabel } from './multiplayer-ui';
import { RacerShowroom } from './racer-showroom';
import { gameAnalytics } from './analytics';
import { parseRoomStreamEvent, RoomWireDecoder } from './room-wire';
import { RoomInputChannel } from './room-input';
import { RacerSnapshotBuffer } from './room-interpolation';
import { RoomStreamChannel, RoomStreamError, RoomStreamRetryPolicy, roomTransportFor, type RoomTransport } from './room-stream';
import './multiplayer.css';

const read = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { sessionStorage.setItem(key, value); } catch {} };
const neutral = (): DriveInput => ({ throttle: 0, brake: 0, steer: 0, drift: false, boost: false });
type Step = 'mode' | 'name' | 'driver' | 'car' | 'grid';
type Hooks = { start: () => void; state: (player: RacerSnapshot) => void; finish: () => void; leave: () => void; profile: (profile: RacerProfile) => void; solo: () => void };
class RoomRequestError extends Error { constructor(message: string, public code = '', public status = 0, public admitted?: boolean) { super(message); } }

export class Multiplayer {
  room: RoomSnapshot | null = null;
  id = ''; token = ''; connected = false;
  private dialog = document.createElement('dialog');
  private standings = document.createElement('section');
  private profile: RacerProfile = { ...DEFAULT_PROFILE };
  private profileRevision = 0;
  private connectionGeneration = 0;
  private abort: AbortController | null = null;
  private streamGeneration = 0;
  private seenRound = -1;
  private finished = false;
  private sequence = Date.now();
  private sending = false;
  private heartbeatPending = false;
  private lastHeartbeat = 0;
  private receivedAt = 0;
  private restoring = false;
  private blockedSession = false;
  private pendingInput = neutral();
  private inputChannel = new RoomInputChannel((code, message) => this.terminalError(new RoomRequestError(message, code)));
  private roomStream = new RoomStreamChannel();
  private streamRetries = new RoomStreamRetryPolicy();
  private transport: RoomTransport = 'sse';
  private networkTimer: ReturnType<typeof setInterval>;
  private peers = new Map<string, { car: ReturnType<typeof createCar>; profile: string; label: THREE.Sprite; texture: THREE.CanvasTexture }>();
  private requestedCode = '';
  private error = '';
  private networkMessage = '';
  private notice = '';
  private pending = false;
  private pendingAction = false;
  private capacityLimited = false;
  private actionQueue: Promise<unknown> = Promise.resolve();
  private motion = new RacerSnapshotBuffer();
  private step: Step = 'mode';
  private mode: 'solo' | 'friends' = 'solo';
  private showroom: RacerShowroom | null = null;
  private lastMarkers = '';
  private renderedHtml = new WeakMap<Element, string>();
  private viewingLastResults = false;
  private clockBase = 0;
  private clockReceivedAt = 0;
  private bestRtt = Infinity;
  private focused = true;
  private padButtons: boolean[] = [];
  private padNextMove = 0;

  constructor(private root: THREE.Group, private hooks: Hooks) {
    try { this.profile = normalizeProfile(JSON.parse(localStorage.getItem('sf-racer-profile') ?? JSON.stringify(DEFAULT_PROFILE))); } catch {}
    this.hooks.profile(this.profile);
    this.dialog.className = 'mp-dialog';
    this.dialog.setAttribute('aria-labelledby', 'mp-title');
    this.dialog.innerHTML = setupMarkup();
    document.body.append(this.dialog);
    this.standings.className = 'mp-standings';
    this.standings.setAttribute('aria-label', 'Live race standings');
    this.standings.hidden = true;
    this.standings.innerHTML = '<button class="mp-room-button">Return to room ↗</button><small></small><ol></ol>';
    this.standings.querySelector('button')!.onclick = () => this.open();
    document.body.append(this.standings);
    this.input('mp-name').value = this.profile.name;
    this.input('mp-nickname').value = this.profile.name;
    this.button('mp-close').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => { this.pendingInput = neutral(); });
    this.button('mp-solo').onclick = () => { if (this.pending) return; this.mode = 'solo'; this.goStep('driver'); };
    this.button('mp-busy-solo').onclick = () => { if (this.pending || this.room) return; this.capacityLimited = false; this.error = ''; this.mode = 'solo'; this.goStep('driver'); };
    this.button('mp-multi').onclick = () => { this.mode = 'friends'; void this.enter(); };
    this.button('mp-code-entry').onclick = () => { this.mode = 'friends'; this.goStep('name'); };
    this.button('mp-create-instead').onclick = () => { this.mode = 'friends'; void this.enter(); };
    this.button('mp-join').onclick = () => { if (this.restoring && this.token) void this.restore(this.requestedCode); else void this.enter(this.input('mp-code').value.trim().toUpperCase()); };
    this.button('mp-copy').onclick = () => void this.copy();
    this.button('mp-leave').onclick = () => void this.leave();
    for (const id of ['mp-name', 'mp-nickname']) {
      this.input(id).addEventListener('change', () => { this.profile.name = this.input(id).value; this.changed(); });
      this.input(id).addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); this.profile.name = this.input(id).value; this.changed(); if (id === 'mp-name') this.button('mp-join').click(); }
      });
    }
    this.input('mp-code').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); this.button('mp-join').click(); } });
    this.button('mp-driver-next').onclick = () => this.goStep('car');
    this.button('mp-car-next').onclick = () => {
      if (this.room) void this.ready();
      else { this.dialog.close(); this.hooks.solo(); }
    };
    this.button('mp-prev').onclick = () => this.back();
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(button => button.onclick = () => {
      const step = button.dataset.step as Step;
      if (step === 'mode' && this.room) this.goStep('grid');
      else this.goStep(step);
    });
    for (const kind of ['driver', 'car', 'sponsor'] as const) {
      this.dialog.querySelectorAll<HTMLButtonElement>(`[data-${kind}]`).forEach(button => button.onclick = () => {
        this.profile[kind] = button.dataset[kind]!; this.changed();
      });
    }
    this.dialog.querySelector('.mp-party')!.addEventListener('toggle', () => this.showroom?.resize());
    this.dialog.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
      if (!button || button.disabled) return;
      switch (button.dataset.action) {
        case 'ready': void this.ready(); break;
        case 'unready': void this.command({ type: 'ready', ready: false, profileRevision: this.profileRevision, courseVersion: COURSE_VERSION }); break;
        case 'start': void this.perform({ type: 'start' }); break;
        case 'rematch': this.viewingLastResults = false; void this.perform({ type: 'rematch' }); break;
        case 'edit': this.goStep('driver'); break;
        case 'back-race': this.dialog.close(); break;
        case 'last-results': this.viewingLastResults = true; this.render(); break;
        case 'back-room': this.viewingLastResults = false; this.render(); break;
        case 'leave': void this.leave(); break;
        case 'remove': void this.perform({ type: 'remove', playerId: button.dataset.playerId! }); break;
      }
    });
    this.requestedCode = new URL(location.href).searchParams.get('room')?.toUpperCase() ?? '';
    if (this.requestedCode) {
      this.mode = 'friends'; this.step = 'name'; this.input('mp-code').value = this.requestedCode; this.open();
      let saved: { token?: string; id?: string } | null = null;
      try { saved = JSON.parse(read('sf-room-' + this.requestedCode) ?? 'null'); } catch {}
      if (saved?.token && saved.id) { this.id = saved.id; this.token = saved.token; void this.restore(this.requestedCode); }
    }
    this.renderChoices(); this.render();
    this.networkTimer = setInterval(() => {
      if (!this.room || this.blockedSession) return;
      const now = performance.now();
      if (this.receivedAt && now - this.receivedAt > 6000) {
        if (this.transport === 'duplex-v2') this.streamRetries.failed(this.streamSession(this.room.code));
        this.disconnected(); this.receivedAt = now; void this.listen(this.room.code);
      }
      if (now - this.lastHeartbeat > 2000) void this.heartbeat();
      void this.sendInput();
    }, 50);
    window.addEventListener('blur', () => { this.focused = false; this.pendingInput = neutral(); });
    window.addEventListener('focus', () => { this.focused = true; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pendingInput = neutral(); });
    window.addEventListener('pagehide', () => { clearInterval(this.networkTimer); this.abort?.abort(); this.roomStream.close(); this.inputChannel.close(); this.showroom?.dispose(); });
  }

  get active() { return !!this.room; }
  get driving() { return this.room?.phase === 'racing' || this.room?.phase === 'countdown'; }
  get blocking() { return this.dialog.open; }
  private get serverNow() { return this.clockBase ? this.clockBase + performance.now() - this.clockReceivedAt : (this.room?.serverNow ?? Date.now()) + (this.receivedAt ? performance.now() - this.receivedAt : 0); }
  get raceClock() { return this.room ? Math.max(0, (this.serverNow - this.room.startAt) / 1000) : 0; }
  get countdown() { return this.room ? Math.max(0, (this.room.startAt - this.serverNow) / 1000) : 0; }
  private get me() { return this.room?.players.find(p => p.id === this.id); }
  private input(id: string) { return this.dialog.querySelector<HTMLInputElement>('#' + id)!; }
  private button(id: string) { return this.dialog.querySelector<HTMLButtonElement>('#' + id)!; }
  private text(id: string, value: string) { const el = this.dialog.querySelector<HTMLElement>('#' + id)!; if (el.textContent !== value) el.textContent = value; }
  private html(el: Element, value: string) {
    // Browser serialization changes whitespace and boolean attributes. Compare
    // our source strings so live snapshots cannot replace a pressed button.
    if (this.renderedHtml.get(el) === value) return;
    const active = document.activeElement as HTMLElement | null;
    const action = active && el.contains(active) ? active.dataset.action : undefined;
    const playerId = active?.dataset.playerId;
    el.innerHTML = value;
    this.renderedHtml.set(el, value);
    if (action) Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.action === action && b.dataset.playerId === playerId)?.focus({ preventScroll: true });
  }
  private announce(message: string) { this.notice = message; this.text('mp-notice', message); this.dialog.querySelector<HTMLElement>('#mp-notice')!.hidden = !message; }

  open() {
    if (this.room && this.room.phase !== 'lobby') this.step = 'grid';
    if (!this.dialog.open) {
      this.dialog.showModal();
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
      this.padButtons = pad?.buttons.map(b => b.pressed) ?? [];
      this.padNextMove = performance.now() + 250;
    }
    this.ensureShowroom(); this.render(); this.showroom?.resize();
  }
  openSetup() { if (this.room) { this.open(); return; } this.step = 'mode'; this.restoring = false; this.error = ''; this.open(); }
  private ensureShowroom() {
    if (this.showroom || !['driver', 'car'].includes(this.step)) return;
    try { this.showroom = new RacerShowroom(this.dialog.querySelector<HTMLCanvasElement>('#mp-showroom')!); this.showroom.setProfile(this.profile); }
    catch { this.error = 'The 3D preview is unavailable. You can still choose a driver and race.'; }
  }
  private back() {
    if (this.pending) return;
    if (this.room && this.room.phase !== 'lobby') { this.viewingLastResults = false; this.dialog.close(); return; }
    this.goStep(this.step === 'car' ? 'driver' : this.step === 'grid' ? 'car' : this.room ? 'grid' : 'mode');
  }
  private goStep(step: Step) {
    if (this.pending || this.pendingAction || (this.room && this.room.phase !== 'lobby' && step !== 'grid')) return;
    if (step === 'grid' && !this.room) return;
    this.step = step; this.error = ''; this.viewingLastResults = false;
    this.announce('');
    if (step === 'mode') this.restoring = false;
    if (this.room && (step === 'driver' || step === 'car')) {
      if (this.me) { this.me.ready = false; this.me.selectionStatus = step; }
      void this.command({ type: 'selection', status: step, courseVersion: COURSE_VERSION });
    }
    this.ensureShowroom(); this.render(); this.dialog.scrollTop = 0; this.showroom?.resize();
    const selector = step === 'name' ? '#mp-name' : step === 'driver' ? `[data-driver="${this.profile.driver}"]` : step === 'car' ? `[data-car="${this.profile.car}"]` : step === 'mode' ? '#mp-solo' : '#mp-copy';
    this.dialog.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }
  private changed() {
    this.profile = normalizeProfile(this.profile);
    if (this.profile.name === 'Racer' && this.room) this.profile.name = 'Racer ' + (this.room.players.findIndex(p => p.id === this.id) + 1);
    this.input('mp-name').value = this.input('mp-nickname').value = this.profile.name;
    try { localStorage.setItem('sf-racer-profile', JSON.stringify(this.profile)); } catch {}
    this.hooks.profile(this.profile); this.showroom?.setProfile(this.profile);
    if (this.room) {
      const revision = ++this.profileRevision;
      if (this.me) { this.me.ready = false; this.me.selectionStatus = this.step === 'car' ? 'car' : 'driver'; }
      void this.command({ type: 'profile', profile: { ...this.profile }, revision });
    }
    this.renderChoices(); this.render();
  }
  private renderChoices() {
    for (const kind of ['driver', 'car', 'sponsor'] as const) this.dialog.querySelectorAll<HTMLButtonElement>(`[data-${kind}]`).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[kind] === this.profile[kind])));
    const driver = DRIVERS.find(d => d.id === this.profile.driver) ?? DRIVERS[0];
    this.text('mp-driver-number', `${String(DRIVERS.indexOf(driver) + 1).padStart(2, '0')} / ${String(DRIVERS.length).padStart(2, '0')}`);
    this.text('mp-driver-move', driver.name); this.text('mp-driver-bio', driver.bio); this.text('mp-driver-stat', '');
    this.dialog.querySelector<HTMLCanvasElement>('#mp-showroom')!.setAttribute('aria-label', this.step === 'driver' ? `3D portrait of ${driver.name}. Drag to look around.` : 'Live 3D car preview. Drag to look around.');
    this.text('mp-car-title', carName(this.profile.car)); this.text('mp-car-description', 'Open cockpit · Equal performance');
  }
  private renderLineup() {
    const racers = this.room?.players.map(p => ({ id: p.id, name: p.id === this.id ? this.profile.name : p.profile.name, driver: p.id === this.id ? this.profile.driver : p.profile.driver, connected: p.connected })) ?? [{ id: 'local', name: this.profile.name, driver: this.profile.driver, connected: true }];
    const signature = JSON.stringify(racers); if (signature === this.lastMarkers) return; this.lastMarkers = signature;
    for (const driver of DRIVERS) {
      const picks = racers.filter(p => p.driver === driver.id);
      const tag = this.dialog.querySelector(`[data-tags="${driver.id}"]`)!;
      // Stable card markers remain clickable and readable regardless of camera
      // framing. The room strip keeps the complete roster for shared picks.
      const ordered = [...picks].sort((a, b) => Number(b.id === this.id || b.id === 'local') - Number(a.id === this.id || a.id === 'local'));
      tag.innerHTML = ordered.slice(0, 2).map(p => `<span class="mp-pick-tag ${p.id === this.id || p.id === 'local' ? 'is-you' : 'is-friend'}" style="--tag-color:${driver.color}" title="${escape(p.name)}${p.connected ? '' : ' · Offline'}">${p.id === this.id || p.id === 'local' ? 'YOU' : escape(p.name)}${p.connected ? '' : ' · OFFLINE'}</span>`).join('') + (picks.length > 2 ? `<span class="mp-pick-tag is-friend">+${picks.length - 2}</span>` : '');
    }
  }

  private headers(token = this.token) { return { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token, 'X-Room-Generation': String(this.connectionGeneration) } : {}) }; }
  private async request(path: string, data: unknown, token = this.token): Promise<any> {
    const started = performance.now();
    const response = await fetch('/api/rooms' + path, { method: 'POST', headers: this.headers(token), body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
    const result = await response.json().catch(() => ({ error: 'The room service is unavailable. Please try again.' }));
    if (!response.ok) throw new RoomRequestError(result.error ?? 'Room request failed.', result.code, response.status, result.admitted);
    const serverNow = result.serverNow ?? result.room?.serverNow;
    const rtt = performance.now() - started;
    if (Number.isFinite(serverNow) && (rtt <= this.bestRtt || performance.now() - this.clockReceivedAt > 10000)) {
      this.bestRtt = rtt; this.clockBase = serverNow + rtt / 2; this.clockReceivedAt = performance.now();
    }
    return result;
  }
  private async enter(code?: string) {
    if (this.pending || this.room) return;
    if (code !== undefined && !/^[A-F0-9]{8}$/.test(code)) { this.error = 'Enter the 8-character code from your friend’s invite.'; this.render(); return; }
    this.pending = true; this.error = ''; this.capacityLimited = false; this.blockedSession = false; this.networkMessage = ''; this.restoring = false;
    this.profile.name = (this.step === 'name' ? this.input('mp-name').value : this.profile.name) || 'Racer';
    this.profile = normalizeProfile(this.profile);
    const retryKey = 'sf-room-attempt-' + (code ?? 'create');
    this.render();
    try {
      // getRandomValues also works on a plain HTTP LAN origin; randomUUID does not.
      const idempotencyKey = read(retryKey) || (code ? this.randomAttemptKey() : await this.placementKey());
      save(retryKey, idempotencyKey);
      const result = await this.request(code ? `/${code}/join` : '', { profile: this.profile, idempotencyKey }, '');
      this.transport = roomTransportFor(result);
      this.id = result.id; this.token = result.token; this.connectionGeneration = result.generation;
      this.room = result.room; this.mode = 'friends'; this.profileRevision = this.me?.profileRevision ?? 0;
      this.receivedAt = performance.now();
      this.profile = this.me?.profile ?? this.profile;
      this.input('mp-name').value = this.input('mp-nickname').value = this.profile.name;
      save('sf-room-' + this.room!.code, JSON.stringify({ id: this.id, token: this.token })); save(retryKey, '');
      const url = new URL(location.href); url.searchParams.delete('race'); url.searchParams.set('room', this.room!.code); history.replaceState(null, '', url);
      this.requestedCode = this.room!.code; this.step = 'driver'; this.pending = false;
      this.renderChoices(); this.ensureShowroom(); this.showroom?.setProfile(this.profile); this.hooks.profile(this.profile);
      this.announce(code ? 'You joined the room. Choose together.' : 'Your room is open. Send the link while you choose.');
      void this.listen(this.room!.code);
      void this.command({ type: 'selection', status: 'driver', courseVersion: COURSE_VERSION });
      void this.heartbeat();
    } catch (error) {
      this.capacityLimited = error instanceof RoomRequestError && ['ROOM_CAPACITY', 'SERVICE_BUSY', 'SERVER_DRAINING', 'ROOM_WORKER_UNAVAILABLE'].includes(error.code);
      if (error instanceof RoomRequestError && (error.admitted === false || ['SESSION_EXPIRED', 'ROOM_EXPIRED', 'REMOVED_FROM_ROOM', 'AFFINITY_REQUIRED'].includes(error.code))) save(retryKey, '');
      this.error = error instanceof Error ? error.message : 'Could not open the room.';
    }
    finally { this.pending = false; this.render(); this.showroom?.resize(); }
  }
  private randomAttemptKey() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join(''); }
  private async placementKey() {
    try { return (await this.request('/placement', {}, '')).idempotencyKey as string; }
    catch (error) {
      // Existing standalone servers can serve a newer frontend during rollout.
      // Only a missing placement endpoint permits their original create API.
      if (error instanceof RoomRequestError && error.status === 404) return this.randomAttemptKey();
      throw error;
    }
  }
  private async restore(code: string) {
    this.pending = true; this.restoring = true; this.render();
    try {
      const result = await this.request(`/${code}/claim`, {});
      this.transport = roomTransportFor(result);
      this.connectionGeneration = result.generation;
      if (result.room) this.receive(result.room);
      void this.listen(code);
    } catch (error) {
      if (!this.terminalError(error)) {
        this.error = 'Couldn’t reconnect yet. Your racer is saved — try reconnecting.';
        this.restoring = true;
      }
    } finally { this.pending = false; this.render(); }
  }
  private disconnected() {
    this.inputChannel.close();
    this.roomStream.close();
    this.connected = false; this.pendingInput = neutral();
    this.networkMessage = this.driving ? 'Reconnecting… The race clock keeps running.' : 'Reconnecting to your room…';
    this.render();
  }
  private terminalError(error: unknown) {
    if (!(error instanceof RoomRequestError) || !['SESSION_TAKEN_OVER', 'REMOVED_FROM_ROOM', 'SESSION_EXPIRED', 'ROOM_EXPIRED'].includes(error.code)) return false;
    const code = this.room?.code ?? this.requestedCode;
    this.blockedSession = true; this.abort?.abort(); this.streamGeneration++;
    this.inputChannel.close();
    this.roomStream.close();
    this.room = null; this.connected = false; this.pendingInput = neutral(); this.restoring = false;
    this.token = ''; this.id = ''; this.seenRound = -1; this.finished = false; this.pendingAction = false;
    save('sf-room-' + code, ''); this.clearPeers(); this.hooks.leave();
    this.step = 'name'; this.input('mp-code').value = code; this.networkMessage = ''; this.error = error.message;
    this.open(); return true;
  }
  private streamSession(code: string) { return `${code}:${this.connectionGeneration}:${this.token}`; }
  private async listen(code: string) {
    this.abort?.abort(); const controller = new AbortController(); this.abort = controller;
    const generation = ++this.streamGeneration;
    const session = this.streamSession(code);
    while (!controller.signal.aborted && generation === this.streamGeneration && !this.blockedSession) {
      try {
        if (this.streamRetries.useDuplex(session, this.transport)) {
          await this.roomStream.listen(code, this.token, this.connectionGeneration, controller.signal, room => {
            this.streamRetries.received(session); this.receive(room);
          });
          if (controller.signal.aborted) return;
          throw new RoomStreamError('The room connection was interrupted.');
        }
        const response = await fetch(`/api/rooms/${code}/events?wire=v2`, { headers: this.headers(), signal: controller.signal });
        if (!response.ok) { const data = await response.json(); throw new RoomRequestError(data.error, data.code, response.status); }
        const reader = response.body!.getReader(), decoder = new TextDecoder(), wire = new RoomWireDecoder(); let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const event = parseRoomStreamEvent(frame);
            if (!event) continue;
            if (event.event === 'room-error') throw new RoomRequestError(event.error, event.code);
            this.receive(wire.apply(event.frame));
          }
        }
        if (!controller.signal.aborted) throw Error('Connection interrupted');
      } catch (error) {
        if (controller.signal.aborted || generation !== this.streamGeneration) return;
        if (error instanceof RoomStreamError) { this.streamRetries.failed(session); error = new RoomRequestError(error.message, error.code); }
        if (this.terminalError(error)) return;
        this.disconnected(); await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  private receive(room: RoomSnapshot) {
    const previous = this.room; const wasConnected = this.connected;
    this.room = room; this.connected = true; this.networkMessage = ''; this.receivedAt = performance.now();
    const me = this.me; if (!me) return;
    gameAnalytics.observeMultiplayer(room, this.id);
    if (this.restoring) {
      this.restoring = false; this.profile = me.profile; this.profileRevision = me.profileRevision;
      this.input('mp-name').value = this.input('mp-nickname').value = this.profile.name;
      this.renderChoices(); this.hooks.profile(this.profile); this.showroom?.setProfile(this.profile);
      if (room.phase === 'lobby') { this.step = 'grid'; void this.command({ type: 'selection', status: 'car', courseVersion: COURSE_VERSION }); }
    }
    if (previous && previous.host !== room.host) this.announce(room.host === this.id ? 'You’re now the host.' : `${room.players.find(p => p.id === room.host)?.profile.name ?? 'A friend'} is now the host.`);
    else if (previous?.phase === 'lobby' && room.phase === 'lobby') {
      const joined = room.players.find(p => !previous.players.some(old => old.id === p.id));
      const departed = previous.players.find(p => !room.players.some(current => current.id === p.id));
      if (joined) this.announce(`${joined.profile.name} joined the room.`);
      else if (departed) this.announce(`${departed.profile.name} left the room.`);
      else {
        const ready = room.players.find(p => p.id !== this.id && p.ready && !previous.players.find(old => old.id === p.id)?.ready);
        if (ready) this.announce(`${ready.profile.name} is ready.`);
      }
    }
    if (!wasConnected && previous && room.phase === 'lobby') this.announce('Connected. Confirm your selection when you’re ready.');
    if (room.round !== this.seenRound && (room.phase === 'countdown' || room.phase === 'racing' || room.phase === 'results')) {
      this.seenRound = room.round; this.finished = false; this.motion.reset(); this.viewingLastResults = false;
      this.dialog.close(); this.hooks.start();
    }
    this.motion.push(room, this.receivedAt);
    if (room.phase !== 'lobby' && (me.finishTime !== null || me.dnf) && !this.finished) {
      this.hooks.state(me); this.finished = true; this.pendingInput = neutral(); this.hooks.finish(); this.step = 'grid'; this.open();
    }
    if (room.phase === 'results' && previous?.phase !== 'results') { this.step = 'grid'; this.viewingLastResults = false; this.open(); }
    if (room.phase === 'lobby' && this.seenRound >= 0) {
      this.seenRound = -1; this.finished = false; this.clearPeers(); this.hooks.leave(); this.step = 'grid';
      this.announce('Same room, same picks. Ready for another race?'); this.open();
    }
    if (!this.driving || this.finished) this.inputChannel.close();
    this.render();
  }
  command(command: RoomCommand): Promise<boolean> {
    const roomCode = this.room?.code;
    const token = this.token, claim = this.connectionGeneration;
    const current = () => this.room?.code === roomCode && this.token === token && this.connectionGeneration === claim && !this.blockedSession;
    const run = this.actionQueue.then(async () => {
      if (!this.room || !current()) return false;
      try { await this.request(`/${roomCode}/command`, command, token); return current(); }
      catch (error) { if (current() && !this.terminalError(error)) { this.error = error instanceof Error ? error.message : 'Room action failed.'; this.render(); } return false; }
    });
    this.actionQueue = run; return run;
  }
  private async perform(command: RoomCommand) {
    if (this.pendingAction) return; this.pendingAction = true; this.error = ''; this.render();
    await this.command(command); this.pendingAction = false; this.render();
  }
  private async ready() {
    if (!this.room || this.pendingAction || !this.connected) return;
    // Re-submit the latest draft with a newer revision. This also recovers a
    // previous profile request whose acknowledgment was lost in transit.
    this.pendingAction = true; this.error = ''; this.render();
    const revision = ++this.profileRevision;
    const synced = await this.command({ type: 'profile', profile: { ...this.profile }, revision });
    const loaded = synced && await this.command({ type: 'selection', status: 'car', courseVersion: COURSE_VERSION });
    const accepted = loaded && await this.command({ type: 'ready', ready: true, profileRevision: revision, courseVersion: COURSE_VERSION });
    if (accepted && this.me) {
      this.me.ready = true; this.me.readyRevision = this.profileRevision; this.me.selectionStatus = 'ready';
      this.step = 'grid'; this.announce(this.room?.host === this.id ? 'You’re ready. Start when your group has arrived.' : 'You’re ready. Waiting for the host to start.');
    }
    this.pendingAction = false; this.render();
  }
  recover() { if (!this.finished) void this.command({ type: 'recover' }); }
  setInput(input: DriveInput) { this.pendingInput = this.blocking || this.finished || !this.focused ? neutral() : input; }
  private async heartbeat() {
    if (!this.room || this.heartbeatPending || this.blockedSession) return;
    this.heartbeatPending = true; this.lastHeartbeat = performance.now(); const generation = this.streamGeneration;
    try { await this.request(`/${this.room.code}/command`, { type: 'heartbeat' }); }
    catch (error) { if (generation === this.streamGeneration && !this.terminalError(error)) this.disconnected(); }
    finally { this.heartbeatPending = false; }
  }
  private async sendInput() {
    if (!this.driving || !this.connected || this.sending || this.finished || this.blockedSession) return;
    const command: Extract<RoomCommand, { type: 'input' }> = { type: 'input', sequence: ++this.sequence, input: document.hidden || !this.focused ? neutral() : this.pendingInput };
    if (this.transport === 'duplex-v2' ? this.roomStream.send(command) : this.inputChannel.send(this.room!.code, this.token, this.connectionGeneration, command)) return;
    this.sending = true; const generation = this.streamGeneration;
    try { await this.request(`/${this.room!.code}/command`, command); }
    catch (error) { if (generation === this.streamGeneration && this.room && !this.terminalError(error)) this.disconnected(); }
    finally { this.sending = false; }
  }
  private async copy() {
    try { await navigator.clipboard.writeText(this.input('mp-link').value); this.button('mp-copy').textContent = 'Link copied ✓'; this.announce('Invite link copied. Send it to your friends.'); }
    catch { this.input('mp-link').focus(); this.input('mp-link').select(); this.announce('Copy this selected link and send it to your friends.'); }
  }
  async leave() {
    if (this.pendingAction) return;
    const room = this.room;
    this.pendingAction = true; this.render();
    if (room) await this.command({ type: 'leave' });
    this.abort?.abort(); this.roomStream.close(); this.inputChannel.close(); this.streamGeneration++; this.room = null; this.connected = false; this.id = ''; this.token = ''; this.connectionGeneration = 0;
    this.seenRound = -1; this.finished = false; this.error = ''; this.networkMessage = ''; this.step = 'mode'; this.pendingAction = false; this.viewingLastResults = false;
    if (room) save('sf-room-' + room.code, '');
    this.requestedCode = ''; this.announce(''); this.clockBase = 0; this.bestRtt = Infinity;
    const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
    this.clearPeers(); this.dialog.close(); this.hooks.leave(); this.render();
  }

  private startBlocker() {
    if (!this.room) return '';
    if (!this.connected) return 'Reconnect before starting the race.';
    if (this.room.players.length < 2) return 'Invite at least one friend to race.';
    const blockers = this.room.players.filter(p => !p.ready || !p.connected || p.readyRevision !== p.profileRevision || p.loadedCourseVersion !== COURSE_VERSION);
    if (!blockers.length) return 'Everyone here is ready. Start when your group has arrived.';
    const names = blockers.slice(0, 2).map(p => p.id === this.id ? 'you' : p.profile.name).join(' and ') + (blockers.length > 2 ? ` and ${blockers.length - 2} others` : '');
    if (blockers.length === 1 && !blockers[0].connected) return `Waiting for ${names} to reconnect${blockers[0].reconnectUntil ? ' · ' + Math.max(0, Math.ceil((blockers[0].reconnectUntil! - this.serverNow) / 1000)) + 's' : ''}.`;
    return `Waiting for ${names} to get ready.`;
  }
  private render() {
    this.renderStandings();
    // Race snapshots arrive many times per second. The closed selection dialog
    // only needs rebuilding when it is opened again.
    if (!this.dialog.open && this.driving) return;
    const room = this.room, host = room?.host === this.id, me = this.me, locked = !!room && room.phase !== 'lobby';
    this.dialog.dataset.step = this.step; this.dialog.classList.toggle('has-room', !!room);
    this.dialog.querySelector<HTMLFieldSetElement>('#mp-choices')!.disabled = locked || this.pendingAction;
    this.input('mp-nickname').disabled = locked || this.pendingAction; this.input('mp-name').disabled = this.pending || this.restoring;
    this.input('mp-code').disabled = this.pending || this.restoring;
    this.dialog.querySelector<HTMLElement>('#mp-room-strip')!.hidden = !room;
    const error = this.error || this.networkMessage;
    this.text('mp-error', error); this.dialog.querySelector<HTMLElement>('#mp-error')!.hidden = !error;
    this.button('mp-busy-solo').hidden = !this.capacityLimited || !!room;
    this.button('mp-solo').disabled = this.button('mp-multi').disabled = this.button('mp-code-entry').disabled = this.pending;
    this.button('mp-join').disabled = this.button('mp-create-instead').disabled = this.pending;
    this.button('mp-join').textContent = this.restoring ? this.pending ? 'Reconnecting…' : 'Try reconnecting →' : this.pending ? 'Joining…' : 'Join room →';
    this.text('mp-mode-progress', this.pending ? 'Creating your room…' : '');
    const headings: Record<Step, string[]> = {
      mode: ['SAN FRANCISCO', 'How are we racing?', 'One city. Your kind of race.'],
      name: ['RACE TOGETHER', this.restoring ? 'Returning to your room' : 'Join your friends', this.requestedCode ? 'Your invite is ready. Choose a nickname and join.' : 'Enter the code from your friend’s invitation.'],
      driver: ['SAN FRANCISCO', 'Choose your driver', room ? 'Choose at your own pace. Your friends can see your picks.' : ''],
      car: ['SAN FRANCISCO', 'Choose your car', ''],
      grid: ['PRIVATE ROOM', room?.phase === 'results' || this.viewingLastResults ? 'Race results' : this.finished ? 'Across the line' : 'Your room', ''],
    };
    ['mp-kicker', 'mp-title', 'mp-subtitle'].forEach((id, i) => this.text(id, headings[this.step][i]));
    this.dialog.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => panel.hidden = panel.dataset.panel !== this.step);
    const visual = this.dialog.querySelector<HTMLElement>('#mp-visual')!;
    const visualParent = this.dialog.querySelector(this.step === 'driver' ? '#mp-portrait-mount' : '.mp-flow')!;
    if (visual.parentElement !== visualParent) visualParent.append(visual);
    const selectedDriver = DRIVERS.find(driver => driver.id === this.profile.driver) ?? DRIVERS[0];
    this.dialog.querySelector<HTMLCanvasElement>('#mp-showroom')!.setAttribute('aria-label', this.step === 'driver' ? `3D portrait of ${selectedDriver.name}. Drag to look around.` : 'Live 3D car preview. Drag to look around.');
    this.text('mp-roster-note', room ? 'Your friends’ picks appear here live.' : 'Find your kind of fast.');
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(button => {
      button.setAttribute('aria-current', button.dataset.step === this.step ? 'step' : 'false');
      button.disabled = this.pending || this.pendingAction || (locked && button.dataset.step !== 'grid') || (!room && button.dataset.step === 'grid') || (this.step === 'mode' && button.dataset.step !== 'mode');
      button.hidden = button.dataset.step === 'grid' && !room;
    });
    this.button('mp-prev').hidden = this.step === 'mode' || locked;
    this.button('mp-prev').disabled = this.pending;
    this.button('mp-car-next').textContent = room ? this.pendingAction ? 'Getting ready…' : 'Ready to race →' : 'Start race ↗';
    this.button('mp-car-next').disabled = this.pendingAction || (!!room && !this.connected);
    this.text('mp-live-party', room ? this.connected ? `${room.players.length}/${ROOM_CAPACITY} IN YOUR ROOM` : 'RECONNECTING…' : this.step === 'driver' || this.step === 'car' ? 'SINGLE PLAYER' : '');
    this.text('mp-room-code', room ? 'ROOM ' + room.code : 'SINGLE PLAYER / MULTIPLAYER');
    this.showroom?.setMode(this.step); this.renderLineup();
    if (!room) { this.standings.hidden = true; return; }
    const url = new URL(location.href); url.searchParams.delete('race'); url.searchParams.set('room', room.code);
    if (this.input('mp-link').value !== url.href) { this.input('mp-link').value = url.href; this.button('mp-copy').textContent = 'Copy invite'; }
    this.text('mp-strip-title', 'ROOM ' + room.code + (host ? ' · YOU HOST' : ''));
    this.text('mp-count', `${room.players.length}/${ROOM_CAPACITY} players`);
    const partyStatus = room.phase === 'lobby' ? `${room.players.filter(p => p.ready && p.connected).length}/${room.players.length} ready` : room.phase === 'results' ? 'Race complete' : room.phase === 'countdown' ? 'On the grid' : 'Race underway';
    this.text('mp-party-summary', `Players · ${partyStatus} · ${room.players.map(p => p.id === this.id ? 'You' : p.profile.name).join(', ')}`);
    this.html(this.dialog.querySelector('#mp-party-list')!, room.players.map(p => {
      const profile = p.id === this.id ? this.profile : p.profile;
      return `<div class="mp-party-player ${p.id === this.id ? 'is-you' : ''}"><div><strong>${escape(profile.name)}${p.id === this.id ? ' · You' : ''}${p.id === room.host ? ' · Host' : ''}</strong><small>${driverName(profile.driver)} · ${carName(profile.car)} · ${sponsorName(profile.sponsor)}</small></div><span>${escape(locked ? p.dnf ? 'DNF' : p.finishTime !== null ? 'Finished' : 'Racing' : playerStatus(p, this.serverNow))}</span>${host && !locked && p.id !== this.id ? `<button class="mp-remove" data-action="remove" data-player-id="${p.id}" aria-label="Remove ${escape(profile.name)} from room" ${this.pendingAction ? 'disabled' : ''}>Remove</button>` : ''}</div>`;
    }).join(''));
    const result = this.viewingLastResults ? room.lastResults : room.phase === 'results' ? room.results : null;
    this.dialog.querySelector<HTMLElement>('#mp-results')!.hidden = !result;
    this.dialog.querySelector<HTMLElement>('#mp-room-controls')!.hidden = !!result;
    this.dialog.querySelector<HTMLElement>('#mp-room-roster')!.hidden = !!result;
    if (result) this.renderResults(result);
    else {
      const players = room.phase === 'lobby' ? room.players : room.entrants;
      this.html(this.dialog.querySelector('#mp-roster')!, players.map(p => `<div class="mp-racer ${p.id === this.id ? 'is-you' : ''}"><span class="mp-avatar" style="--driver:${DRIVERS.find(d => d.id === p.profile.driver)?.color}">${p.rank && locked ? p.rank : DRIVERS.find(d => d.id === p.profile.driver)?.emoji}</span><div><strong>${escape(p.profile.name)}${p.id === this.id ? ' · You' : ''}${p.id === room.host ? ' · Host' : ''}</strong><small>${driverName(p.profile.driver)} · ${carName(p.profile.car)}</small></div><b>${escape(locked && p.finishTime === null && !p.dnf && p.connected ? room.phase === 'countdown' ? 'On the grid' : 'Racing' : playerStatus(p, this.serverNow))}</b></div>`).join(''));
      const allReady = this.connected && room.players.length >= 2 && room.players.every(p => p.ready && p.connected && p.readyRevision === p.profileRevision && p.loadedCourseVersion === COURSE_VERSION);
      this.text('mp-room-title', this.finished ? me?.dnf ? 'Did not finish' : `You finished ${me?.rank ? ordinal(me.rank) : ''}` : room.phase === 'lobby' ? allReady ? 'The grid is ready.' : 'Getting everyone ready.' : 'The race is live.');
      const waiting = room.entrants.filter(p => p.finishTime === null && !p.dnf).length;
      this.text('mp-room-detail', this.finished ? `${me?.dnf ? dnfLabel(me.dnfReason) : time(me?.finishTime ?? 0)} · Waiting for ${waiting} ${waiting === 1 ? 'racer' : 'racers'} · ${clock((room.deadline - this.serverNow) / 1000)} left` : room.phase === 'lobby' ? host ? this.startBlocker() : me?.ready ? 'You’re ready. Waiting for the host to start.' : 'Confirm your selection when you’re ready.' : 'The race keeps running while this menu is open.');
      let actions = '';
      if (room.phase === 'lobby') {
        actions = me?.ready ? `<button class="mp-text" data-action="edit">Change selection</button>${host ? `<button id="mp-start" data-action="start" class="mp-primary" ${!allReady || this.pendingAction ? 'disabled' : ''}>${this.pendingAction ? 'Starting…' : `Start race · ${room.players.length} ${room.players.length === 1 ? 'player' : 'players'} ↗`}</button>` : '<button class="mp-secondary" data-action="unready">Not ready</button>'}` : `<button id="mp-ready" data-action="ready" class="mp-primary" ${this.pendingAction || !this.connected ? 'disabled' : ''}>${this.pendingAction ? 'Getting ready…' : 'Ready to race ✓'}</button><button class="mp-text" data-action="edit">Change selection</button>`;
        if (room.lastResults) actions += '<button class="mp-text" data-action="last-results">Last results →</button>';
      } else actions = '<button class="mp-primary" data-action="back-race">Back to the race ↗</button>';
      this.html(this.dialog.querySelector('#mp-actions')!, actions);
      this.button('mp-leave').disabled = this.pendingAction;
    }
  }
  private renderStandings() {
    const room = this.room;
    this.standings.hidden = !room || room.phase === 'lobby' || room.phase === 'results';
    if (!room) return;
    if (!this.standings.hidden) {
      const current = room.entrants.find(p => p.id === this.id);
      const status = this.connected ? `${current?.rank ? ordinal(current.rank) + ' / ' + room.entrants.length + ' · ' : ''}LIVE · NO CONTACT` : 'RECONNECTING…';
      const label = this.standings.querySelector('small')!;
      if (label.textContent !== status) label.textContent = status;
      this.html(this.standings.querySelector('ol')!, room.entrants.map(p => `<li class="${p.id === this.id ? 'is-you' : ''}"><span>${escape(p.profile.name)}</span><b>${p.finishTime !== null ? time(p.finishTime) : p.dnf ? 'DNF' : !p.connected ? 'OFFLINE' : `${p.state.checkpoint}/4`}</b></li>`).join(''));
    }
  }
  private renderResults(result: RoundResult) {
    const winners = result.entries.filter(p => p.place === 1);
    const own = result.entries.find(p => p.id === this.id);
    const title = !winners.length ? 'No finisher this race' : winners.length > 1 ? 'Photo finish · Joint winners' : `${escape(winners[0].profile.name)} wins!`;
    const winnerDetail = winners.map(w => `${driverName(w.profile.driver)} · ${carName(w.profile.car)} · ${time(w.finishTime!)}`).join(' / ');
    const ownDetail = own ? own.place ? `You finished ${ordinal(own.place)}${own.tied ? ' · Tied' : ''} · ${time(own.finishTime!)}` : `You did not finish · ${dnfLabel(own.dnfReason)}` : 'Last race in this room';
    const rows = result.entries.map(p => `<tr class="${p.id === this.id ? 'is-you' : ''}"><td>${p.place ?? 'DNF'}${p.tied ? '<small>Tied</small>' : ''}</td><td><strong>${escape(p.profile.name)}${p.id === this.id ? ' · You' : ''}</strong><small>${driverName(p.profile.driver)} · ${carName(p.profile.car)}</small></td><td>${p.finishTime !== null ? time(p.finishTime) : '—'}</td><td>${p.finishTime !== null ? p.gap ? '+' + p.gap.toFixed(3) + 's' : p.tied ? 'Tied' : 'Winner' : dnfLabel(p.dnfReason)}${p.finishTime === null ? `<small>${p.checkpoint}/4 checkpoints</small>` : ''}</td></tr>`).join('');
    const actions = this.viewingLastResults ? '<button class="mp-primary" data-action="back-room">Back to room →</button>' : this.room?.host === this.id ? `<button class="mp-primary" data-action="rematch" ${this.pendingAction ? 'disabled' : ''}>${this.pendingAction ? 'Opening room…' : 'Race again →'}</button>` : '<p class="mp-note">Waiting for the host to open the next race.</p>';
    this.html(this.dialog.querySelector('#mp-results')!, `<div class="mp-results-heading"><small>THE CITY LOOP · ROUND ${result.round}</small><h3 class="mp-winner">${title}</h3><p>${winnerDetail}</p></div><p class="mp-results-summary">${ownDetail}</p><div class="mp-results-scroll"><table class="mp-results-table"><caption class="mp-sr-only">Complete race results</caption><thead><tr><th>Place</th><th>Racer</th><th>Time</th><th>Gap / status</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mp-results-actions">${actions}<button class="mp-text" data-action="leave">Leave room</button></div><p class="mp-note">Same room. Same invitation. Confirm your choices for the next race.</p>`);
  }

  update(dt: number, now: number) {
    if (this.dialog.open) {
      this.updateGamepad();
      if (this.step === 'driver' || this.step === 'car') this.showroom?.render(performance.now());
    }
    const players = this.motion.sample(performance.now());
    for (const [id, peer] of this.peers) if (!players.some(p => p.id === id && !p.dnf) || !this.driving) {
      peer.car.dispose(); peer.label.material.dispose(); peer.texture.dispose(); peer.label.removeFromParent(); this.peers.delete(id);
    }
    if (!this.driving) return;
    const me = players.find(p => p.id === this.id);
    if (me && !this.finished) this.hooks.state(me);
    for (const p of players) {
      if (p.id === this.id || p.dnf) continue;
      let peer = this.peers.get(p.id); const profile = JSON.stringify(p.profile);
      if (!peer) {
        const car = createCar(); this.root.add(car.group); const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#12394ddd'; ctx.fillRect(0, 0, 512, 96); ctx.font = 'bold 36px sans-serif'; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.fillText(p.profile.name, 256, 60, 480);
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false })); label.scale.set(4, .75, 1); this.root.add(label);
        peer = { car, label, texture, profile: '' }; this.peers.set(p.id, peer); car.group.position.set(p.position.x, p.state.y, p.position.z);
      }
      if (peer.profile !== profile) { peer.car.customize(p.profile); peer.profile = profile; }
      const group = peer.car.group; group.position.set(p.position.x, p.state.y + .03, p.position.z);
      group.rotation.order = 'YXZ'; group.rotation.set(-p.state.surfacePitch, p.state.heading, p.state.surfaceRoll);
      peer.label.position.set(group.position.x, group.position.y + 2.9, group.position.z); group.visible = peer.label.visible = p.connected;
      if (me) peer.car.setRemoteDetail(Math.hypot(p.position.x - me.position.x, p.position.z - me.position.z));
      peer.car.update(dt, { speed: p.state.speed, steer: 0, braking: false, boosting: false, time: now, glide: p.state.glide, airborne: p.state.airborne, altitude: p.state.altitude });
    }
  }
  private updateGamepad() {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected); if (!pad) return;
    const buttons = pad.buttons.map(b => b.pressed);
    const targets = Array.from(this.dialog.querySelectorAll<HTMLElement>('button,input,summary')).filter(el => el.getClientRects().length && !(el as HTMLButtonElement).disabled);
    const horizontal = pad.axes[0] ?? 0, vertical = pad.axes[1] ?? 0;
    const direction = buttons[13] || buttons[15] || horizontal > .6 || vertical > .6 ? 1 : buttons[12] || buttons[14] || horizontal < -.6 || vertical < -.6 ? -1 : 0;
    if (direction && performance.now() >= this.padNextMove && targets.length) {
      const index = targets.indexOf(document.activeElement as HTMLElement); targets[(index + direction + targets.length) % targets.length].focus(); this.padNextMove = performance.now() + 220;
    } else if (!direction) this.padNextMove = 0;
    if (buttons[0] && !this.padButtons[0]) (document.activeElement as HTMLElement)?.click();
    if (buttons[1] && !this.padButtons[1]) this.back();
    if (buttons[9] && !this.padButtons[9]) targets.find(el => el.matches('[data-panel] .mp-primary, [data-panel] .mp-mode-card'))?.click();
    this.padButtons = buttons;
  }
  private clearPeers() { for (const peer of this.peers.values()) { peer.car.dispose(); peer.label.material.dispose(); peer.texture.dispose(); peer.label.removeFromParent(); } this.peers.clear(); this.motion.reset(); }
}

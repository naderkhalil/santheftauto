import { DRIVERS } from './racer-profile';
import { normalizeLeaderboardName, type LeaderboardBoard, type LeaderboardMode } from './leaderboard-protocol';
import { comparisonText, leaderboardTime, loadLeaderboard, type PostLeaderboardTime } from './leaderboard-client';
import './leaderboard.css';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const nameKey = 'sf-leaderboard-name';
const savedName = () => { try { return normalizeLeaderboardName(localStorage.getItem(nameKey)) ?? ''; } catch { return ''; } };
const rememberName = (name: string) => { try { localStorage.setItem(nameKey, name); } catch {} };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The leaderboard is unavailable. Please try again.';

export function leaderboardTable(board: LeaderboardBoard, limit = 20): string {
  if (!board.entries.length) return '<div class="lb-empty"><strong>The city is wide open.</strong><p>No times posted yet. Finish a race and be the first name on the board.</p></div>';
  return `<div class="lb-table-scroll" tabindex="0" aria-label="Leaderboard standings"><table class="lb-table"><caption class="lb-sr-only">Global ${board.mode === 'solo' ? 'single player' : 'multiplayer'} leaderboard</caption><thead><tr><th scope="col">Rank</th><th scope="col">Driver</th><th scope="col">Time</th></tr></thead><tbody>${board.entries.slice(0, limit).map(entry => `<tr class="${entry.id === board.own?.id ? 'is-you' : ''}"><td>${entry.rank.toLocaleString()}</td><td><strong>${escape(entry.name)}${entry.id === board.own?.id ? '<span class="lb-you">YOU</span>' : ''}</strong><small>${escape(DRIVERS.find(driver => driver.id === entry.driver)?.short ?? 'Driver')}</small></td><td>${leaderboardTime(entry.timeMs)}</td></tr>`).join('')}</tbody></table></div>`;
}

/** Only the board region updates; a network response never replaces a name being typed. */
export class FinishLeaderboard {
  private revision = 0;
  private loading = 0;
  private mode: LeaderboardMode = 'solo';
  private timeMs = 0;
  private ownId = '';
  private post: PostLeaderboardTime | null = null;
  private board: LeaderboardBoard | null = null;
  private posting = false;
  private form: HTMLFormElement;
  private input: HTMLInputElement;
  private submit: HTMLButtonElement;
  private status: HTMLElement;
  private content: HTMLElement;

  constructor(private root: HTMLElement, openGlobal: (mode: LeaderboardMode, entryId?: string) => void) {
    root.classList.add('lb-finish');
    root.innerHTML = `<div class="lb-finish-heading"><div><small>THE CITY LOOP / WORLDWIDE</small><h3>Where do you stand?</h3></div><button type="button" class="lb-link" data-global>Global leaderboard ↗</button></div><div data-board aria-live="polite"></div><form class="lb-name-form"><label>Your name on the leaderboard<input name="leaderboard-name" required minlength="2" maxlength="24" placeholder="Enter your name" autocomplete="nickname" aria-describedby="${root.id}-name-note" /></label><button type="submit" class="lb-post">Post my time ↗</button><p id="${root.id}-name-note">Choose a name, then post your time publicly. No default “Racer”.</p></form><p class="lb-status" role="status" aria-live="polite"></p>`;
    this.form = root.querySelector('form')!;
    this.input = root.querySelector('input')!;
    this.submit = root.querySelector<HTMLButtonElement>('[type=submit]')!;
    this.status = root.querySelector('.lb-status')!;
    this.content = root.querySelector('[data-board]')!;
    this.input.addEventListener('input', () => { this.input.setCustomValidity(''); this.status.textContent = ''; });
    this.form.addEventListener('submit', event => { event.preventDefault(); void this.publish(); });
    root.querySelector<HTMLButtonElement>('[data-global]')!.onclick = () => openGlobal(this.mode, this.ownId);
    root.addEventListener('click', event => { if ((event.target as Element).closest('[data-retry]')) void this.refresh(); });
    this.clear();
  }

  clear(): void { this.revision++; this.loading++; this.root.hidden = true; this.post = null; this.posting = false; }

  show(mode: LeaderboardMode, timeMs: number, post: PostLeaderboardTime, profileName?: string): void {
    this.revision++; this.mode = mode; this.timeMs = timeMs; this.post = post; this.board = null; this.ownId = ''; this.posting = false;
    this.root.hidden = false; this.form.hidden = false; this.input.disabled = false; this.submit.disabled = false;
    this.submit.textContent = 'Post my time ↗'; this.input.value = savedName() || normalizeLeaderboardName(profileName) || '';
    this.input.setCustomValidity(''); this.status.textContent = ''; this.content.innerHTML = '<p class="lb-loading">Finding your place in the city…</p>';
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const revision = this.revision, loading = ++this.loading;
    try {
      const board = await loadLeaderboard(this.mode, this.timeMs, this.ownId);
      if (revision !== this.revision || loading !== this.loading) return;
      this.board = board; this.renderBoard();
    } catch {
      if (revision !== this.revision || loading !== this.loading) return;
      this.content.innerHTML = '<p class="lb-loading">Couldn’t load other times. Your finish is safe for this run. <button type="button" class="lb-link" data-retry>Try again</button></p>';
    }
  }

  private renderBoard(): void {
    const board = this.board;
    if (!board) return;
    const comparison = board.comparison;
    const own = board.own;
    const headline = own ? `#${own.rank.toLocaleString()} in the world` : comparison ? comparisonText(this.timeMs, comparison) : 'Set the first time.';
    const detail = own ? `${leaderboardTime(own.timeMs)} · ${escape(own.name)} · ${board.total.toLocaleString()} posted ${board.total === 1 ? 'run' : 'runs'}` : comparison ? `${escape(comparison.name)} finished in ${leaderboardTime(comparison.timeMs)}` : 'Your name could lead the City Loop.';
    this.content.innerHTML = `<div class="lb-comparison ${own ? 'is-posted' : ''}"><small>${own ? 'YOUR GLOBAL RANK' : 'YOUR FINISH / COMPARED'}</small><strong>${escape(headline)}</strong><span>${detail}</span>${own && comparison ? `<p>${escape(comparisonText(own.timeMs, comparison))} · ${leaderboardTime(comparison.timeMs)}</p>` : ''}</div><div class="lb-preview-heading"><span>GLOBAL TOP 5</span><span>${this.mode === 'solo' ? 'SINGLE PLAYER' : 'MULTIPLAYER'}</span></div>${leaderboardTable(board, 5)}`;
  }

  private async publish(): Promise<void> {
    if (!this.post || this.posting) return;
    const name = normalizeLeaderboardName(this.input.value);
    if (!name) {
      const message = 'Enter your own name, 2–24 characters. “Racer” is not allowed.';
      this.input.setCustomValidity(message); this.input.reportValidity(); this.status.textContent = message; return;
    }
    this.input.value = name; rememberName(name);
    const revision = this.revision;
    this.posting = true; this.input.disabled = true; this.submit.disabled = true; this.submit.textContent = 'Posting your time…'; this.status.textContent = '';
    try {
      const board = await this.post(name);
      if (revision !== this.revision) return;
      this.loading++; this.board = board; this.ownId = board.own?.id ?? ''; this.form.hidden = true;
      this.renderBoard(); this.status.textContent = 'You’re on the global leaderboard. Go find a faster line.';
    } catch (error) {
      if (revision !== this.revision) return;
      this.status.textContent = errorMessage(error); this.input.disabled = false; this.submit.disabled = false; this.submit.textContent = 'Try posting again ↗';
    } finally { if (revision === this.revision) this.posting = false; }
  }
}

export class GlobalLeaderboard {
  private dialog = document.createElement('dialog');
  private revision = 0;
  private mode: LeaderboardMode = 'solo';
  private entryId = '';
  private lastFocus: HTMLElement | null = null;

  constructor() {
    this.dialog.className = 'lb-dialog'; this.dialog.setAttribute('aria-labelledby', 'lb-title');
    this.dialog.innerHTML = '<header class="lb-dialog-header"><div><small>SAN THEFT AUTO / THE CITY LOOP</small><h2 id="lb-title">The city’s fastest.</h2><p>Real runs. Three hills. One finish line.</p></div><button type="button" class="lb-close" aria-label="Close leaderboard">×</button></header><div class="lb-tabs" role="group" aria-label="Leaderboard race mode"><button type="button" data-mode="solo" aria-pressed="true">Single player</button><button type="button" data-mode="multiplayer" aria-pressed="false">Multiplayer</button></div><div class="lb-global-content" aria-live="polite"></div><footer class="lb-dialog-footer"><span>TOP 20 / THE CITY LOOP</span><button type="button" class="lb-link" data-retry>Refresh ↻</button></footer>';
    this.dialog.querySelector<HTMLButtonElement>('.lb-close')!.onclick = () => this.dialog.close();
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.onclick = () => { this.mode = button.dataset.mode as LeaderboardMode; this.entryId = ''; void this.refresh(); });
    this.dialog.addEventListener('click', event => { if ((event.target as Element).closest('[data-retry]')) void this.refresh(); });
    this.dialog.addEventListener('close', () => { this.revision++; this.lastFocus?.isConnected && this.lastFocus.focus(); });
    document.body.append(this.dialog);
  }

  get blocking(): boolean { return this.dialog.open; }

  open(mode: LeaderboardMode = 'solo', entryId = ''): void {
    this.mode = mode; this.entryId = entryId;
    if (!this.dialog.open) { this.lastFocus = document.activeElement as HTMLElement; this.dialog.showModal(); }
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const revision = ++this.revision;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === this.mode)));
    const content = this.dialog.querySelector<HTMLElement>('.lb-global-content')!;
    content.innerHTML = '<p class="lb-loading">Loading the city’s fastest…</p>';
    try {
      const board = await loadLeaderboard(this.mode, undefined, this.entryId);
      if (revision !== this.revision) return;
      content.innerHTML = `${board.own ? `<div class="lb-global-own"><strong>You’re #${board.own.rank.toLocaleString()}</strong><span>${escape(board.own.name)} · ${leaderboardTime(board.own.timeMs)}</span></div>` : ''}${leaderboardTable(board)}<p class="lb-count">${board.total.toLocaleString()} posted ${board.total === 1 ? 'run' : 'runs'} · Finish a race to add yours.</p>`;
    } catch (error) {
      if (revision !== this.revision) return;
      content.innerHTML = `<div class="lb-empty"><strong>The board is taking a pit stop.</strong><p>${escape(errorMessage(error))}</p><button type="button" class="lb-link" data-retry>Try again ↻</button></div>`;
    }
  }
}

let globalLeaderboard: GlobalLeaderboard | null = null;
export function getGlobalLeaderboard(): GlobalLeaderboard { return globalLeaderboard ??= new GlobalLeaderboard(); }

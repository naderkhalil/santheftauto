import { CARS, DRIVERS, SPONSORS } from './racer-profile';
import type { RacerSnapshot, ResultEntry } from './multiplayer-protocol';

export const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const time = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${Math.floor(ms / 60000)}:${(Math.floor(ms / 1000) % 60).toString().padStart(2, '0')}.${(ms % 1000).toString().padStart(3, '0')}`;
};
export const clock = (seconds: number) => {
  const total = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
};
export const driverName = (id: string) => DRIVERS.find(d => d.id === id)?.short ?? 'Driver';
export const carName = (id: string) => ({sundrop:'Juniper',comet:'Terracotta',tide:'Buttercream'}[id] ?? 'Roadster');
export const sponsorName = (id: string) => SPONSORS.find(s => s.id === id)?.name ?? 'Independent';
export const dnfLabel = (reason: ResultEntry['dnfReason']) => reason === 'left-race' ? 'Left race' : reason === 'disconnected' ? 'Disconnected' : 'Time limit';
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[n % 10] ?? 'th')}`;
export function playerStatus(player: RacerSnapshot, now: number) {
  if (player.finishTime !== null) return `${player.rank ? ordinal(player.rank) + ' · ' : ''}${time(player.finishTime)}`;
  if (player.dnf) return `DNF · ${dnfLabel(player.dnfReason)}`;
  if (!player.connected) return `Reconnecting${player.reconnectUntil ? ' · ' + Math.max(0, Math.ceil((player.reconnectUntil - now) / 1000)) + 's' : ''}`;
  if (player.ready) return 'Ready ✓';
  return ({driver:'Choosing driver',car:'Choosing car',loading:'Loading course','load-failed':'Loading failed',ready:'Ready ✓'})[player.selectionStatus] ?? 'Choosing';
}

export function setupMarkup() {
  return `<header class="mp-header"><a class="mp-wordmark" aria-label="San Theft Auto">STA<span>SAN THEFT<br>AUTO</span></a><nav class="mp-steps" aria-label="Race setup">${['mode','driver','car','grid'].map((step,i)=>`<button data-step="${step}"><span>0${i+1}</span>${['PLAY','DRIVER','CAR','ROOM'][i]}</button>`).join('')}</nav><button id="mp-close" class="mp-icon" aria-label="Close race setup">×</button></header>
  <section class="mp-room-strip" id="mp-room-strip" aria-label="Your private room" hidden>
    <div class="mp-room-strip-top"><div class="mp-room-meta"><strong id="mp-strip-title"></strong><span id="mp-count"></span></div><div class="mp-share"><label class="mp-sr-only" for="mp-link">Invite link</label><input id="mp-link" readonly><button id="mp-copy" class="mp-secondary">Copy invite</button></div></div>
    <details class="mp-party"><summary id="mp-party-summary">Players in your room</summary><label class="mp-nickname">Your nickname<input id="mp-nickname" maxlength="24" autocomplete="nickname"></label><div class="mp-party-list" id="mp-party-list"></div></details>
  </section>
  <p class="mp-notice" id="mp-notice" role="status" aria-live="polite" hidden></p>
  <main class="mp-flow"><div class="mp-stage-heading"><div><small id="mp-kicker"></small><h2 id="mp-title"></h2><p id="mp-subtitle"></p></div><div class="mp-live-party" id="mp-live-party"></div></div>
    <div class="mp-visual" id="mp-visual"><canvas id="mp-showroom" aria-label="Live 3D driver portrait and car preview"></canvas><div class="mp-stage-glow"></div></div>
    <section data-panel="mode" class="mp-mode-stage"><div class="mp-mode-cards"><button id="mp-solo" class="mp-mode-card"><span class="mp-mode-number">01</span><strong>Single player</strong><span>Chase your best time.</span><b aria-hidden="true">↗</b></button><button id="mp-multi" class="mp-mode-card"><span class="mp-mode-number">02—08</span><strong>Multiplayer</strong><span>Create a room. Invite your friends. Race together.</span><b aria-hidden="true">↗</b></button></div><button id="mp-code-entry" class="mp-text">Join with a code →</button><p id="mp-mode-progress" class="mp-note" role="status"></p><p class="mp-note">The City Loop · Equal cars · No car-to-car contact</p></section>
    <section data-panel="name" class="mp-name-stage" hidden><div class="mp-name-form"><label for="mp-name">Your nickname</label><input id="mp-name" maxlength="24" autocomplete="nickname" placeholder="Racer"><label for="mp-code">Room code</label><div class="mp-code-row"><input id="mp-code" maxlength="8" placeholder="8-character code" autocapitalize="characters" spellcheck="false"></div><button id="mp-join" class="mp-primary">Join room <span>→</span></button><p class="mp-note">2–8 players. You join when you press the button.</p><button id="mp-create-instead" class="mp-text">Create a room instead</button></div></section>
    <fieldset id="mp-choices"><legend class="mp-sr-only">Driver and car selection</legend>
    <section data-panel="driver" class="mp-driver-stage" hidden>
      <div class="mp-driver-layout">
        <div class="mp-driver-portrait"><div id="mp-portrait-mount" class="mp-portrait-mount"></div><span class="mp-portrait-hint">Drag to look around</span><div class="mp-driver-bio" aria-live="polite"><span id="mp-driver-number">01 / ${String(DRIVERS.length).padStart(2, '0')}</span><div><strong id="mp-driver-move"></strong><p id="mp-driver-bio"></p></div><span id="mp-driver-stat"></span></div></div>
        <div class="mp-roster-panel"><div class="mp-roster-heading"><span>THE LINEUP</span><p id="mp-roster-note">Find your kind of fast.</p></div><div class="mp-lineup" role="group" aria-label="Choose your driver">${DRIVERS.map((d,i)=>`<button type="button" data-driver="${d.id}" class="mp-founder" aria-label="Pick ${d.name}" aria-describedby="mp-picks-${d.id}" style="--driver-color:${d.color}"><span class="mp-founder-number" aria-hidden="true">${String(i+1).padStart(2, '0')}</span><span class="mp-founder-caption"><strong>${d.name}</strong><small>${d.title}</small></span><span class="mp-founder-check" aria-hidden="true">✓</span><span class="mp-pick-tags" data-tags="${d.id}" id="mp-picks-${d.id}"></span></button>`).join('')}</div></div>
      </div><div class="mp-stage-bottom"><small>Parody characters · Equal driving performance</small><button id="mp-driver-next" class="mp-primary">CHOOSE CAR <span>→</span></button></div>
    </section>
    <section data-panel="car" class="mp-car-stage" hidden><div class="mp-car-caption"><small>VICTORIAN GARAGE</small><h3 id="mp-car-title"></h3><p id="mp-car-description"></p><span>DRAG TO LOOK AROUND</span></div><div class="mp-car-tabs" role="group" aria-label="Choose your car">${CARS.map((c,i)=>`<button data-car="${c.id}" class="mp-car-option" style="--paint:${c.id==='sundrop'?'#427e7c':c.id==='comet'?'#b36b51':'#d9b66e'}"><span>0${i+1}</span><i></i><strong>${c.id==='sundrop'?'Juniper':c.id==='comet'?'Terracotta':'Buttercream'}</strong></button>`).join('')}</div><div class="mp-car-footer"><div class="mp-sponsor-block" role="group" aria-label="Choose a car decal"><div class="mp-sponsor-heading"><small>DECAL <span>OPTIONAL</span></small><button type="button" data-sponsor="none" class="mp-sponsor-none">No logo</button></div><div class="mp-sponsors">${SPONSORS.filter(sp=>sp.id!=='none').map(sp=>`<button type="button" data-sponsor="${sp.id}" class="mp-sponsor" style="--sponsor:${sp.background}" aria-label="${sp.name}"><span class="mp-sponsor-art"><img src="${sp.tileLogo ?? sp.logo}" alt="" draggable="false"></span><span class="mp-sponsor-name">${sp.name}</span></button>`).join('')}</div></div><button id="mp-car-next" class="mp-primary">TO THE STARTING GRID <span>→</span></button></div></section></fieldset>

    <section data-panel="grid" class="mp-grid-stage" hidden><div class="mp-grid-invite" id="mp-room-controls"><small id="mp-room-eyebrow">YOUR PRIVATE ROOM</small><h3 id="mp-room-title"></h3><p class="mp-note" id="mp-room-detail"></p><div id="mp-actions"></div><p class="mp-note">No car-to-car contact. All the Union Square shortcuts you can find.</p><button id="mp-leave" class="mp-text">Leave room</button></div><div class="mp-grid-roster" id="mp-room-roster"><small>PLAYERS</small><div id="mp-roster"></div></div><div id="mp-results" hidden></div></section>
    <p id="mp-error" role="alert" hidden></p><button id="mp-busy-solo" class="mp-secondary" hidden>Play single player while you wait →</button>
  </main><footer class="mp-bottom-bar"><button id="mp-prev" class="mp-text">← Back</button><span>THE CITY LOOP / SAN FRANCISCO</span><span id="mp-room-code"></span></footer>`;
}

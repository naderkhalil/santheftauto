import * as THREE from 'three';
import { createCar } from './car';
import { CARS, DRIVERS, SPONSORS, DEFAULT_PROFILE, normalizeProfile, type RacerProfile } from './racer-profile';
import type { DriveInput } from './driving';
import type { RoomCommand, RoomSnapshot, RacerSnapshot } from './multiplayer-protocol';
import './multiplayer.css';
import { RacerShowroom } from './racer-showroom';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const time=(value:number)=>`${Math.floor(value/60)}:${(value%60).toFixed(2).padStart(5,'0')}`;
const read=(key:string)=>{try{return sessionStorage.getItem(key);}catch{return null;}};
const save=(key:string,value:string)=>{try{sessionStorage.setItem(key,value);}catch{}};
type Hooks={start:()=>void;state:(player:RacerSnapshot)=>void;finish:()=>void;leave:()=>void;profile:(profile:RacerProfile)=>void;solo:()=>void};
export class Multiplayer {
  room:RoomSnapshot|null=null;
  id='';token='';connected=false;
  private dialog=document.createElement('dialog');
  private standings=document.createElement('section');
  private profile:RacerProfile={...DEFAULT_PROFILE};
  private abort:AbortController|null=null;
  private generation=0;private seenRound=-1;private finished=false;
  private sequence=Date.now();private sending=false;private receivedAt=0;private restoring=false;
  private pendingInput:DriveInput={throttle:0,brake:0,steer:0,drift:false,boost:false};
  private networkTimer:ReturnType<typeof setInterval>;
  private peers=new Map<string,{car:ReturnType<typeof createCar>;profile:string;label:THREE.Sprite;texture:THREE.CanvasTexture}>();
  private requestedCode='';
  private error='';private pending=false;private lastUi='';
  private actionQueue:Promise<void>=Promise.resolve();
  private localPosition:THREE.Vector3|null=null;private localHeading=0;
  private step:'name'|'driver'|'car'|'grid'='driver';
  private mode:'solo'|'friends'='solo';
  private showroom:RacerShowroom|null=null;
  private lastMarkers='';
  constructor(private root:THREE.Group,private hooks:Hooks){
    try{this.profile=normalizeProfile(JSON.parse(localStorage.getItem('sf-racer-profile')??JSON.stringify(DEFAULT_PROFILE)));}catch{}
    this.hooks.profile(this.profile);
    this.dialog.className='mp-dialog';this.dialog.setAttribute('aria-labelledby','mp-title');
    this.dialog.innerHTML=`<header class="mp-header"><a class="mp-wordmark" aria-label="Whimsical SF">SF<span>WHIMSICAL<br>SAN FRANCISCO</span></a><nav class="mp-steps" aria-label="Race setup">${['driver','car','name','grid'].map((step,i)=>`<button data-step="${step}"><span>0${i+1}</span>${['DRIVER','CAR','FRIENDS','ROOM'][i]}</button>`).join('')}</nav><button id="mp-close" class="mp-icon" aria-label="Close race setup">×</button></header>
    <main class="mp-flow"><div class="mp-stage-heading"><div><small id="mp-kicker">BEFORE YOU DISRUPT TRAFFIC</small><h2 id="mp-title">WHO’S DRIVING?</h2><p id="mp-subtitle">Every questionable overtake starts with a name.</p></div><div class="mp-live-party" id="mp-live-party"></div></div>
    <div class="mp-visual" id="mp-visual"><canvas id="mp-showroom" aria-label="Live 3D driver lineup and car preview"></canvas><div class="mp-stage-glow"></div></div>
    <section data-panel="name" class="mp-name-stage"><div class="mp-name-form"><span class="mp-player-number">YOUR ROOM</span><label for="mp-name">Nickname</label><input id="mp-name" maxlength="24" autocomplete="nickname" placeholder="Your name" value="${escape(this.profile.name==='Racer'?'':this.profile.name)}"><div id="mp-entry"><div id="mp-mode" class="mp-mode" role="group" aria-label="Race mode"><button type="button" data-mode="solo">SOLO RUN<span>Chase your personal best</span></button><button type="button" data-mode="friends">RACE WITH FRIENDS<span>Create a room and invite your crew</span></button></div><button id="mp-create" class="mp-primary">LET’S MAKE AN ENTRANCE <span>→</span></button><details id="mp-join-details"><summary>Got a room code?</summary><div class="mp-code-row"><input aria-label="Room code" id="mp-code" maxlength="8" placeholder="8-character code" autocapitalize="characters" spellcheck="false"><button id="mp-join" class="mp-secondary">JOIN →</button></div></details></div><button id="mp-name-next" class="mp-primary" hidden>BACK TO MY HUMAN →</button><p class="mp-note">Your friends will see this name above your driver.</p></div></section>
    <fieldset id="mp-choices"><legend class="mp-sr-only">Driver and car selection</legend>
    <section data-panel="driver" class="mp-driver-stage" hidden><div class="mp-lineup">${DRIVERS.map(d=>`<button type="button" data-driver="${d.id}" class="mp-founder" aria-label="Pick ${d.name}"><span class="mp-pick-tags" data-tags="${d.id}"></span><span class="mp-founder-caption"><small>${d.title}</small><strong>${d.name}</strong></span></button>`).join('')}</div><div class="mp-driver-bio" aria-live="polite"><span id="mp-driver-number">01 / 04</span><div><strong id="mp-driver-move"></strong><p id="mp-driver-bio"></p></div><span id="mp-driver-stat"></span></div><div class="mp-stage-bottom"><small>Parody characters · Equal driving performance</small><button id="mp-driver-next" class="mp-primary">CHOOSE CAR <span>→</span></button></div></section>
    <section data-panel="car" class="mp-car-stage" hidden><div class="mp-car-caption"><small>VICTORIAN GARAGE</small><h3 id="mp-car-title"></h3><p id="mp-car-description"></p><span>DRAG TO LOOK AROUND</span></div><div class="mp-car-tabs" role="group" aria-label="Choose your car">${CARS.map((c,i)=>`<button data-car="${c.id}" class="mp-car-option" style="--paint:${c.id==='sundrop'?'#427e7c':c.id==='comet'?'#b36b51':'#d9b66e'}"><span>0${i+1}</span><i></i><strong>${c.id==='sundrop'?'Juniper':c.id==='comet'?'Terracotta':'Buttercream'}</strong></button>`).join('')}</div><div class="mp-car-footer"><div class="mp-sponsor-block"><small>SPONSOR <span>OPTIONAL</span></small><div class="mp-sponsors">${SPONSORS.map(sp=>`<button type="button" data-sponsor="${sp.id}" class="mp-sponsor" style="--sponsor:${sp.background};--ink:${sp.color}" aria-label="${sp.name}">${sp.logo?`<img src="${sp.logo}" alt="${sp.name}">`:'NO SPONSOR'}</button>`).join('')}</div><p>Placeholder sponsors</p></div><button id="mp-car-next" class="mp-primary">TO THE STARTING GRID <span>→</span></button></div></section></fieldset>
    <section data-panel="grid" class="mp-grid-stage" hidden><div class="mp-grid-invite"><small>INVITE FRIENDS</small><h3 id="mp-room-title">Meet at the starting line.</h3><div id="mp-lobby" hidden><label class="mp-name">YOUR PRIVATE INVITE<input id="mp-link" readonly></label><button id="mp-copy" class="mp-secondary">COPY INVITE LINK ↗</button><div id="mp-actions"></div><button id="mp-leave" class="mp-text">LEAVE ROOM</button></div><p class="mp-note">Up to 8 friends. No car-to-car contact.<br>All the Union Square shortcuts you can find.</p></div><div class="mp-grid-roster"><small>PLAYERS</small><div id="mp-roster"></div></div></section>
    <p id="mp-error" role="status" aria-live="polite"></p></main><footer class="mp-bottom-bar"><button id="mp-prev" class="mp-text">← BACK</button><span>THE CITY LOOP / SAN FRANCISCO</span><span id="mp-room-code">PRIVATE RACES · 2–8 FRIENDS</span></footer>`;
    document.body.append(this.dialog);
    this.standings.className='mp-standings';this.standings.hidden=true;document.body.append(this.standings);
    this.button('mp-close').onclick=()=>this.dialog.close();
    this.dialog.addEventListener('cancel',()=>{if(this.active)this.dialog.close();});
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.onclick=()=>{this.mode=button.dataset.mode as typeof this.mode;this.error='';this.render();});
    this.button('mp-create').onclick=()=>{if(!this.acceptName())return;if(this.mode==='solo')this.goStep('driver');else void this.enter(this.requestedCode||undefined);};
    this.button('mp-join').onclick=()=>{if(this.acceptName())void this.enter(this.input('mp-code').value.trim().toUpperCase());};
    this.button('mp-copy').onclick=()=>void this.copy();
    this.button('mp-leave').onclick=()=>void this.leave();
    this.input('mp-name').addEventListener('change',()=>{if(this.input('mp-name').value.trim())this.changed();});
    this.input('mp-name').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();this.button(this.room?'mp-name-next':'mp-create').click();}});
    this.button('mp-name-next').onclick=()=>{if(this.acceptName())this.goStep('driver');};
    this.button('mp-driver-next').onclick=()=>this.goStep('car');
    this.button('mp-car-next').onclick=()=>{if(!this.room){this.mode='solo';this.dialog.close();this.hooks.solo();}else this.goStep('grid');};
    this.button('mp-prev').onclick=()=>this.goStep(this.step==='grid'?'car':this.step==='name'?'car':'driver');
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(button=>button.onclick=()=>{const step=button.dataset.step as typeof this.step;if(step==='name'){this.mode='friends';this.goStep('name');return;}if(step!=='grid'||this.room)this.goStep(step);});
    for(const kind of ['driver','car','sponsor'] as const)this.dialog.querySelectorAll<HTMLButtonElement>(`[data-${kind}]`).forEach(button=>button.onclick=()=>{this.profile[kind]=button.dataset[kind]!;this.changed();});
    this.requestedCode=new URL(location.href).searchParams.get('room')?.toUpperCase()??'';
    if(this.requestedCode){this.mode='friends';this.step='name';this.input('mp-code').value=this.requestedCode;this.open();let saved;try{saved=JSON.parse(read('sf-room-'+this.requestedCode)??'null');}catch{}if(saved?.token&&saved?.id){this.restoring=true;this.id=saved.id;this.token=saved.token;void this.listen(this.requestedCode);} }
    this.renderChoices();this.render();
    this.networkTimer=setInterval(()=>{if(this.room&&this.receivedAt&&performance.now()-this.receivedAt>6000){this.connected=false;this.receivedAt=performance.now();void this.listen(this.room.code);}void this.sendInput();},50);
    window.addEventListener('pagehide',()=>{clearInterval(this.networkTimer);this.abort?.abort();this.showroom?.dispose();});
  }
  get active(){return !!this.room;}
  get driving(){return this.room?.phase==='racing'||this.room?.phase==='countdown';}
  get blocking(){return this.dialog.open;}
  get raceClock(){return this.room?Math.max(0,(this.room.serverNow+performance.now()-this.receivedAt-this.room.startAt)/1000):0;}
  get countdown(){return this.room?Math.max(0,(this.room.startAt-this.room.serverNow-(performance.now()-this.receivedAt))/1000):0;}
  private input(id:string){return this.dialog.querySelector<HTMLInputElement>('#'+id)!;}
  private button(id:string){return this.dialog.querySelector<HTMLButtonElement>('#'+id)!;}
  open(){
    if(!this.dialog.open)this.dialog.showModal();
    if(this.room&&this.room.phase!=='lobby')this.step='grid';
    if(!this.showroom){try{this.showroom=new RacerShowroom(this.dialog.querySelector<HTMLCanvasElement>('#mp-showroom')!);this.showroom.setProfile(this.profile);}catch{this.error='The 3D showroom could not load. Try reloading this tab.';}}
    this.render();this.showroom?.resize();
  }
  openSetup(){if(this.room){this.open();return;}this.mode='solo';this.step='driver';if(!this.input('mp-name').value.trim())this.input('mp-name').value=DRIVERS.find(d=>d.id===this.profile.driver)?.short??'Racer';this.open();}
  private goStep(step:typeof this.step){if(this.room&&this.room.phase!=='lobby'&&step!=='grid')return;this.step=step;this.error='';this.render();this.dialog.scrollTop=0;if(step==='name')this.input('mp-name').focus();else this.dialog.querySelector<HTMLButtonElement>(step==='driver'?`[data-driver="${this.profile.driver}"]`:step==='car'?`[data-car="${this.profile.car}"]`:'#mp-copy')?.focus({preventScroll:true});}
  private acceptName(){if(!this.input('mp-name').value.trim()){this.error='Give your rivals a name to remember.';this.render();this.input('mp-name').focus();return false;}if(this.input('mp-name').value!==this.profile.name)this.changed();return true;}

  private changed(){
    this.profile.name=this.input('mp-name').value;
    this.profile=normalizeProfile(this.profile);this.input('mp-name').value=this.profile.name;
    try{localStorage.setItem('sf-racer-profile',JSON.stringify(this.profile));}catch{}
    this.hooks.profile(this.profile);this.showroom?.setProfile(this.profile);this.renderChoices();this.renderLineup();if(this.room)void this.command({type:'profile',profile:this.profile});
  }
  private renderChoices(){
    for(const kind of ['driver','car','sponsor'] as const)this.dialog.querySelectorAll<HTMLButtonElement>(`[data-${kind}]`).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[kind]===this.profile[kind])));
    const driver=DRIVERS.find(d=>d.id===this.profile.driver)??DRIVERS[0],car=CARS.find(c=>c.id===this.profile.car)??CARS[0];
    this.dialog.querySelector('#mp-driver-number')!.textContent=`0${DRIVERS.indexOf(driver)+1} / 04`;
    this.dialog.querySelector('#mp-driver-move')!.textContent=driver.name;
    this.dialog.querySelector('#mp-driver-bio')!.textContent=driver.bio;
    this.dialog.querySelector('#mp-driver-stat')!.textContent=driver.id==='jensen'?'NEW CHARACTER STUDY':'';
    this.dialog.querySelector('#mp-car-title')!.textContent='Sundrop Coupe';
    this.dialog.querySelector('#mp-car-description')!.textContent='Blender model study · '+(car.id==='sundrop'?'Juniper':car.id==='comet'?'Terracotta':'Buttercream');
  }
  private renderLineup(){
    const racers=this.room?.players.map(p=>({id:p.id,name:p.profile.name,driver:p.id===this.id?this.profile.driver:p.profile.driver,connected:p.connected}))??[{id:'local',name:this.profile.name,driver:this.profile.driver,connected:true}];
    const signature=this.mode+JSON.stringify(racers);if(signature===this.lastMarkers)return;this.lastMarkers=signature;
    for(const driver of DRIVERS){const tag=this.dialog.querySelector(`[data-tags="${driver.id}"]`)!;tag.innerHTML=racers.filter(p=>p.driver===driver.id).map(p=>`<span class="mp-pick-tag ${p.id===this.id||p.id==='local'?'is-you':'is-friend'}" style="--tag-color:${driver.color}">${escape(p.name)}${p.id===this.id||p.id==='local'?' · YOU':''}${p.connected?'':' · OFFLINE'}</span>`).join('');}
    this.dialog.querySelector('#mp-live-party')!.innerHTML=this.room?`<span class="mp-live-dot"></span> ${this.room.players.length}/8 ON THE GRID <button id="mp-quick-copy" aria-label="Copy room invite">INVITE +</button>`:'<button id="mp-invite-friends">INVITE FRIENDS +</button>';
    this.dialog.querySelector<HTMLButtonElement>('#mp-invite-friends')?.addEventListener('click',()=>{this.mode='friends';this.goStep('name');});
    this.dialog.querySelector<HTMLButtonElement>('#mp-quick-copy')?.addEventListener('click',()=>void this.copy());
  }
  private async request(path:string,data:unknown,token=this.token){
    const response=await fetch('/api/rooms'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
    const result=await response.json().catch(()=>({error:'Room service is unavailable. Run the multiplayer server and try again.'}));
    if(!response.ok)throw Error(result.error??'Room request failed.');return result;
  }
  private async enter(code?:string){
    if(this.pending)return;if(code!==undefined&&!/^[A-F0-9]{8}$/.test(code)){this.error='Enter the 8-character code from your friend’s invite.';this.render();return;}
    this.pending=true;this.error='';this.profile.name=this.input('mp-name').value;this.changed();this.render();
    try{const result=await this.request(code?`/${code}/join`:'',{profile:this.profile},'');this.id=result.id;this.token=result.token;this.room=result.room;this.goStep('driver');save('sf-room-'+this.room!.code,JSON.stringify({id:this.id,token:this.token}));const url=new URL(location.href);url.searchParams.set('room',this.room!.code);history.replaceState(null,'',url);void this.listen(this.room!.code);}
    catch(error){this.error=error instanceof Error?error.message:'Could not open room.';}finally{this.pending=false;this.render();}
  }
  private async listen(code:string){
    this.abort?.abort();const controller=new AbortController();this.abort=controller;const generation=++this.generation;
    while(!controller.signal.aborted&&generation===this.generation){
      try{
        const response=await fetch(`/api/rooms/${code}/events`,{headers:{Authorization:'Bearer '+this.token},signal:controller.signal});
        if(!response.ok){const data=await response.json();if(response.status===401||response.status===404){this.error=data.error;save('sf-room-'+code,'');this.room=null;this.step='name';this.token='';this.id='';this.connected=false;this.hooks.leave();this.clearPeers();this.open();this.render();return;}throw Error(data.error);}
        const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='';
        while(!controller.signal.aborted){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.startsWith('data: '))this.receive(JSON.parse(frame.slice(6)));}}
        if(!controller.signal.aborted)throw Error('Connection interrupted');
      }catch{if(controller.signal.aborted)return;this.connected=false;this.error='Reconnecting to your room… The race clock keeps running.';this.render();await new Promise(resolve=>setTimeout(resolve,1000));}
    }
  }
  private receive(room:RoomSnapshot){
    const previousPhase=this.room?.phase;
    this.room=room;this.connected=true;this.error='';this.receivedAt=performance.now();
    const me=room.players.find(p=>p.id===this.id);if(!me)return;
    if(this.restoring){this.restoring=false;this.profile=me.profile;this.input('mp-name').value=me.profile.name;this.renderChoices();this.hooks.profile(me.profile);this.showroom?.setProfile(me.profile);if(room.phase==='lobby')this.goStep('driver');}
    if(room.round!==this.seenRound&&(room.phase==='countdown'||room.phase==='racing')){
      this.seenRound=room.round;this.finished=false;this.localPosition=null;this.dialog.close();this.hooks.start();
    }
    if(room.phase==='racing'||room.phase==='countdown'||room.phase==='results'){if(me.state.finished&&!this.finished){this.hooks.state(me);this.finished=true;this.hooks.finish();}}
    if(room.phase==='results'&&previousPhase!=='results'){this.step='grid';this.open();}
    if(room.phase==='lobby'&&this.seenRound>=0){this.seenRound=-1;this.finished=false;this.clearPeers();this.hooks.leave();this.step='driver';this.open();}
    this.render();
  }
  command(command:RoomCommand){
    this.actionQueue=this.actionQueue.then(async()=>{if(!this.room)return;try{await this.request(`/${this.room.code}/command`,command);}catch(error){this.error=error instanceof Error?error.message:'Room action failed.';this.render();}});
    return this.actionQueue;
  }
  recover(){void this.command({type:'recover'});}
  setInput(input:DriveInput){this.pendingInput=this.blocking?{throttle:0,brake:0,steer:0,drift:false,boost:false}:input;}
  private async sendInput(){
    if(!this.driving||!this.connected||this.sending)return;
    this.sending=true;const generation=this.generation;
    try{await this.request(`/${this.room!.code}/command`,{type:'input',sequence:++this.sequence,input:document.hidden?{throttle:0,brake:0,steer:0,drift:false,boost:false}:this.pendingInput});}
    catch{if(generation===this.generation&&this.room){this.connected=false;this.error='Connection lost. Reconnecting…';this.render();}}finally{this.sending=false;}
  }
  private async copy(){try{await navigator.clipboard.writeText(this.input('mp-link').value);this.button('mp-copy').textContent='LINK COPIED ✓';const quick=this.dialog.querySelector('#mp-quick-copy');if(quick)quick.textContent='COPIED ✓';}catch{this.input('mp-link').select();this.error='Copy the selected invite link and send it to your friends.';this.render();}}
  async leave(){
    const room=this.room;if(room)await this.command({type:'leave'});
    this.abort?.abort();this.generation++;this.room=null;this.connected=false;this.id='';this.token='';this.seenRound=-1;this.finished=false;this.error='';this.step='name';
    if(room)save('sf-room-'+room.code,'');const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);this.clearPeers();this.dialog.close();this.hooks.leave();this.render();
  }
  private render(){
    const room=this.room,host=room?.host===this.id,me=room?.players.find(p=>p.id===this.id),locked=!!room&&room.phase!=='lobby';
    this.dialog.querySelector<HTMLFieldSetElement>('#mp-choices')!.disabled=locked;this.input('mp-name').disabled=locked;
    this.dialog.querySelector<HTMLElement>('#mp-entry')!.hidden=!!room;this.dialog.querySelector<HTMLElement>('#mp-lobby')!.hidden=!room;
    this.button('mp-create').disabled=this.button('mp-join').disabled=this.pending;
    this.dialog.querySelector<HTMLElement>('#mp-mode')!.hidden=true;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.mode===this.mode));button.disabled=this.pending;});
    this.dialog.querySelector('#mp-error')!.textContent=this.error;
    this.dialog.querySelector('#mp-room-title')!.textContent=room?room.phase==='results'?'The finish line.':`Room ${room.code}`:'Meet at the starting line.';
    const copy={name:['RACE TOGETHER','Invite friends','Create a private room or join with a code.'],driver:['SAN FRANCISCO','Choose your driver',''],car:['SAN FRANCISCO','Choose your car',''],grid:['PRIVATE ROOM',room?.phase==='results'?'Race results':'Your room',room?.phase==='results'?'Ready for another race?':'Share the link, then get ready.']}[this.step];
    this.dialog.dataset.step=this.step;
    ['mp-kicker','mp-title','mp-subtitle'].forEach((id,i)=>{const element=this.dialog.querySelector('#'+id)!;if(element.textContent!==copy[i])element.textContent=copy[i];});
    this.dialog.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==this.step);
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(button=>{button.setAttribute('aria-current',button.dataset.step===this.step?'step':'false');button.disabled=(locked&&button.dataset.step!=='grid')||(!room&&button.dataset.step==='grid');});
    this.button('mp-prev').hidden=this.step==='driver'||locked;
    this.button('mp-name-next').hidden=!room;
    this.dialog.querySelector<HTMLElement>('#mp-join-details')!.hidden=this.mode==='solo'||!!this.requestedCode;
    this.button('mp-create').innerHTML=this.mode==='solo'?'CONTINUE SOLO <span>→</span>':this.requestedCode?'JOIN ROOM <span>→</span>':'CREATE ROOM <span>→</span>';
    this.button('mp-car-next').innerHTML=!room?'START RACE <span>↗</span>':'GO TO ROOM <span>→</span>';
    this.dialog.querySelector('#mp-room-code')!.textContent=room?'ROOM '+room.code:this.mode==='solo'?'SOLO RUN / YOUR PERSONAL BEST':'PRIVATE RACES · 2–8 FRIENDS';
    this.showroom?.setMode(this.step);this.renderLineup();
    if(room){
      const url=new URL(location.href);url.searchParams.delete('race');url.searchParams.set('room',room.code);this.input('mp-link').value=url.href;
      const sorted=[...room.players].sort((a,b)=>(a.finishTime??Infinity)-(b.finishTime??Infinity)||Number(a.dnf)-Number(b.dnf)||b.state.checkpoint-a.state.checkpoint||b.state.progress-a.state.progress);
      const roster=sorted.map((p,i)=>{const d=DRIVERS.find(d=>d.id===p.profile.driver)??DRIVERS[0];return `<div class="mp-racer"><span class="mp-avatar" style="--driver:${d.color}">${d.emoji}</span><div><strong>${escape(p.profile.name)}${p.id===this.id?' (you)':''}</strong><small>${CARS.find(c=>c.id===p.profile.car)?.name} · ${p.id===room.host?'HOST':d.name}</small></div><b>${p.finishTime!==null?`#${i+1} · ${time(p.finishTime)}`:p.dnf?'DNF':!p.connected?'OFFLINE':room.phase==='lobby'?(p.ready?'READY ✓':'CHOOSING'):room.phase==='countdown'?'ON THE GRID':'RACING'}</b></div>`;}).join('');
      const rosterElement=this.dialog.querySelector('#mp-roster')!;if(rosterElement.innerHTML!==roster)rosterElement.innerHTML=roster;
      const canStart=room.players.length>=2&&room.players.every(p=>p.ready&&p.connected);
      const actions=room.phase==='lobby'?`<button id="mp-ready" class="mp-secondary">${me?.ready?'NOT READY':'I’M READY ✓'}</button>${host?`<button id="mp-start" class="mp-primary" ${canStart?'':'disabled'}>START RACE ↗</button><p class="mp-note">${room.players.length<2?'Invite at least one friend to race.':canStart?'Everyone is ready. Let’s go.':'Waiting for everyone to get ready.'}</p>`:'<p class="mp-note">The host starts once everyone is ready.</p>'}`:room.phase==='results'?(host?'<button id="mp-rematch" class="mp-primary">BACK TO LOBBY ↗</button>':'<p class="mp-note">Waiting for the host to open the next race.</p>'):'<button id="mp-back" class="mp-primary">BACK TO THE RACE ↗</button><p class="mp-note">The race keeps running while this menu is open.</p>';
      if(this.lastUi!==actions){this.lastUi=actions;this.dialog.querySelector('#mp-actions')!.innerHTML=actions;const bind=(id:string,fn:()=>void)=>{const button=this.dialog.querySelector<HTMLButtonElement>('#'+id);if(button)button.onclick=fn;};bind('mp-ready',()=>void this.command({type:'ready',ready:!this.room?.players.find(p=>p.id===this.id)?.ready}));bind('mp-start',()=>void this.command({type:'start'}));bind('mp-rematch',()=>void this.command({type:'rematch'}));bind('mp-back',()=>this.dialog.close());}
      this.standings.hidden=room.phase==='lobby'||room.phase==='results';
      const standingHtml=`<button class="mp-room-button">ROOM ${room.code} ↗</button><small>${this.connected?'LIVE · NO CONTACT':'RECONNECTING…'}</small><ol>${sorted.map(p=>`<li class="${p.id===this.id?'is-you':''}"><span>${escape(p.profile.name)}</span><b>${p.finishTime!==null?time(p.finishTime):p.dnf?'DNF':!p.connected?'OFFLINE':`${p.state.checkpoint}/4`}</b></li>`).join('')}</ol>`;
      if(this.standings.innerHTML!==standingHtml){this.standings.innerHTML=standingHtml;this.standings.querySelector('button')!.onclick=()=>this.open();}
    }else{this.standings.hidden=true;this.lastUi='';}
  }
  update(dt:number,now:number){
    if(this.dialog.open&&(this.step==='driver'||this.step==='car'))this.showroom?.render(performance.now());
    const players=this.room?.players??[];
    for(const [id,peer] of this.peers)if(!players.some(p=>p.id===id&&!p.dnf)||!this.driving){peer.car.dispose();peer.label.material.dispose();peer.texture.dispose();peer.label.removeFromParent();this.peers.delete(id);}
    if(!this.driving)return;
    const me=players.find(p=>p.id===this.id);
    if(me&&!this.finished){
      const target=new THREE.Vector3(me.position.x,me.state.y,me.position.z);
      if(!this.localPosition||this.localPosition.distanceToSquared(target)>100){this.localPosition=target.clone();this.localHeading=me.state.heading;}
      this.localPosition.lerp(target,1-Math.exp(-24*dt));
      this.localHeading+=Math.atan2(Math.sin(me.state.heading-this.localHeading),Math.cos(me.state.heading-this.localHeading))*(1-Math.exp(-24*dt));
      this.hooks.state({...me,position:{x:this.localPosition.x,y:this.localPosition.y,z:this.localPosition.z},state:{...me.state,y:this.localPosition.y,heading:this.localHeading}});
    }
    for(const p of players){if(p.id===this.id||p.dnf)continue;
      let peer=this.peers.get(p.id);const profile=JSON.stringify(p.profile);
      if(!peer){const car=createCar();this.root.add(car.group);const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#12394ddd';ctx.fillRect(0,0,512,96);ctx.font='bold 36px sans-serif';ctx.fillStyle='white';ctx.textAlign='center';ctx.fillText(p.profile.name,256,60,480);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));label.scale.set(4,.75,1);this.root.add(label);peer={car,label,texture,profile:''};this.peers.set(p.id,peer);car.group.position.set(p.position.x,p.state.y,p.position.z);}
      if(peer.profile!==profile){peer.car.customize(p.profile);peer.profile=profile;}
      const g=peer.car.group;g.position.lerp(new THREE.Vector3(p.position.x,p.state.y+.03,p.position.z),1-Math.exp(-18*dt));const delta=Math.atan2(Math.sin(p.state.heading-g.rotation.y),Math.cos(p.state.heading-g.rotation.y));g.rotation.order='YXZ';g.rotation.y+=delta*(1-Math.exp(-18*dt));g.rotation.x=-p.state.surfacePitch;
      peer.label.position.copy(g.position).add(new THREE.Vector3(0,2.9,0));g.visible=peer.label.visible=p.connected;
      peer.car.update(dt,{speed:p.state.speed,steer:0,braking:false,boosting:false,time:now,glide:p.state.glide,airborne:p.state.airborne,altitude:p.state.altitude});
    }
  }
  private clearPeers(){for(const peer of this.peers.values()){peer.car.dispose();peer.label.material.dispose();peer.texture.dispose();peer.label.removeFromParent();}this.peers.clear();}
}

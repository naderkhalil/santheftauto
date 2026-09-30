import * as THREE from 'three';
import { createCar } from './car';
import { CARS, DRIVERS, SPONSORS, DEFAULT_PROFILE, normalizeProfile, type RacerProfile } from './racer-profile';
import type { DriveInput } from './driving';
import type { RoomCommand, RoomSnapshot, RacerSnapshot } from './multiplayer-protocol';
import './multiplayer.css';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const time=(value:number)=>`${Math.floor(value/60)}:${(value%60).toFixed(2).padStart(5,'0')}`;
const read=(key:string)=>{try{return sessionStorage.getItem(key);}catch{return null;}};
const save=(key:string,value:string)=>{try{sessionStorage.setItem(key,value);}catch{}};
type Hooks={start:()=>void;state:(player:RacerSnapshot)=>void;finish:()=>void;leave:()=>void;profile:(profile:RacerProfile)=>void};
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
  constructor(private root:THREE.Group,private hooks:Hooks){
    try{this.profile=normalizeProfile(JSON.parse(localStorage.getItem('sf-racer-profile')??JSON.stringify(DEFAULT_PROFILE)));}catch{}
    this.hooks.profile(this.profile);
    const trigger=document.createElement('button');trigger.id='race-friends';trigger.className='text-button';trigger.textContent='RACE FRIENDS ↗';document.querySelector('.intro-actions')!.append(trigger);
    trigger.onclick=()=>this.open();
    this.dialog.className='mp-dialog';this.dialog.setAttribute('aria-labelledby','mp-title');
    this.dialog.innerHTML=`<header class="mp-header"><div><small>PRIVATE RACES / THE CITY LOOP</small><h2 id="mp-title">Your friends. Your starting grid.</h2><p id="mp-subtitle">Pick your driver, choose your ride, then send the invite.</p></div><button id="mp-close" class="mp-icon" aria-label="Close multiplayer">×</button></header>
    <div class="mp-layout"><section class="mp-garage"><label class="mp-name">YOUR RACER NAME<input id="mp-name" maxlength="24" autocomplete="nickname" value="${escape(this.profile.name)}"></label>
    <fieldset id="mp-choices"><legend>MAKE IT YOURS</legend><h3>Choose a driver</h3><div class="mp-driver-grid">${DRIVERS.map(d=>`<button type="button" data-driver="${d.id}" class="mp-choice" title="${d.bio}"><span class="mp-avatar" style="--driver:${d.color}">${d.emoji}</span><strong>${d.name}</strong></button>`).join('')}</div>
    <h3>Choose a car <small>Same speed. Different personality.</small></h3><div class="mp-car-grid">${CARS.map(c=>`<button type="button" data-car="${c.id}" class="mp-choice"><svg viewBox="0 0 150 74" aria-hidden="true"><ellipse cx="76" cy="59" rx="61" ry="6" fill="#203c4722"/><path d="M17 44 Q20 31 44 30 L58 14 Q63 10 87 13 L108 31 Q132 33 135 46 L130 54 H21Z" fill="${c.color}"/><path d="M51 30 63 17 85 17 101 31Z" fill="${c.roof}"/><circle cx="43" cy="52" r="11" fill="#163744"/><circle cx="113" cy="52" r="11" fill="#163744"/><circle cx="43" cy="52" r="5" fill="#dbe5de"/><circle cx="113" cy="52" r="5" fill="#dbe5de"/>${c.id==='comet'?'<path d="M18 34V23H34" fill="none" stroke="#163744" stroke-width="5"/>':c.id==='tide'?'<path d="M60 14H89V29H60Z" fill="#f5efdf"/><path d="M63 28V18Q67 10 72 18V28" fill="none" stroke="#163744" stroke-width="3"/>':''}</svg><strong>${c.name}</strong><small>${c.description}</small></button>`).join('')}</div>
    <h3>Pick a sponsor</h3><div class="mp-sponsors">${SPONSORS.map(s=>`<button type="button" data-sponsor="${s.id}" class="mp-choice" style="--sponsor:${s.background};--ink:${s.color}">${s.logo?`<img src="${s.logo}" alt="${s.name}">`:s.mark||'INDEPENDENT'}</button>`).join('')}</div><p class="mp-note">Fictional demo sponsors. Logo placements: hood + both doors.</p></fieldset></section>
    <section class="mp-room"><div class="mp-room-kicker">UP TO 8 FRIENDS · 3 HILL FLIGHTS</div><h3 id="mp-room-title">Meet at the starting line.</h3><div id="mp-entry"><button id="mp-create" class="mp-primary">CREATE A ROOM ↗</button><div class="mp-divider">OR JOIN YOUR FRIENDS</div><label class="mp-name">ROOM CODE<input id="mp-code" maxlength="8" placeholder="8-character code" autocapitalize="characters" spellcheck="false"></label><button id="mp-join" class="mp-secondary">JOIN ROOM ↗</button></div>
    <div id="mp-lobby" hidden><label class="mp-name">INVITE LINK<input id="mp-link" readonly></label><button id="mp-copy" class="mp-secondary">COPY INVITE LINK ↗</button><div id="mp-roster"></div><div id="mp-actions"></div><button id="mp-leave" class="mp-text">LEAVE ROOM</button></div><p id="mp-error" role="status" aria-live="polite"></p><p class="mp-note">Race together, with no car-to-car contact. Everyone can take the Union Square shortcut.</p></section></div>`;
    document.body.append(this.dialog);
    this.standings.className='mp-standings';this.standings.hidden=true;document.body.append(this.standings);
    this.button('mp-close').onclick=()=>this.dialog.close();
    this.dialog.addEventListener('cancel',()=>{if(this.active)this.dialog.close();});
    this.button('mp-create').onclick=()=>void this.enter();
    this.button('mp-join').onclick=()=>void this.enter(this.input('mp-code').value.trim().toUpperCase());
    this.button('mp-copy').onclick=()=>void this.copy();
    this.button('mp-leave').onclick=()=>void this.leave();
    this.input('mp-name').addEventListener('change',()=>{this.profile.name=this.input('mp-name').value;this.changed();});
    for(const kind of ['driver','car','sponsor'] as const)this.dialog.querySelectorAll<HTMLButtonElement>(`[data-${kind}]`).forEach(button=>button.onclick=()=>{this.profile[kind]=button.dataset[kind]!;this.changed();});
    this.requestedCode=new URL(location.href).searchParams.get('room')?.toUpperCase()??'';
    if(this.requestedCode){this.input('mp-code').value=this.requestedCode;this.open();let saved;try{saved=JSON.parse(read('sf-room-'+this.requestedCode)??'null');}catch{}if(saved?.token&&saved?.id){this.restoring=true;this.id=saved.id;this.token=saved.token;void this.listen(this.requestedCode);} }
    this.renderChoices();this.render();
    this.networkTimer=setInterval(()=>{if(this.room&&this.receivedAt&&performance.now()-this.receivedAt>6000){this.connected=false;this.receivedAt=performance.now();void this.listen(this.room.code);}void this.sendInput();},50);
    window.addEventListener('pagehide',()=>{clearInterval(this.networkTimer);this.abort?.abort();});
  }
  get active(){return !!this.room;}
  get driving(){return this.room?.phase==='racing'||this.room?.phase==='countdown';}
  get blocking(){return this.dialog.open;}
  get raceClock(){return this.room?Math.max(0,(this.room.serverNow+performance.now()-this.receivedAt-this.room.startAt)/1000):0;}
  get countdown(){return this.room?Math.max(0,(this.room.startAt-this.room.serverNow-(performance.now()-this.receivedAt))/1000):0;}
  private input(id:string){return this.dialog.querySelector<HTMLInputElement>('#'+id)!;}
  private button(id:string){return this.dialog.querySelector<HTMLButtonElement>('#'+id)!;}
  open(){if(!this.dialog.open)this.dialog.showModal();this.render();}
  private changed(){
    this.profile.name=this.input('mp-name').value;
    this.profile=normalizeProfile(this.profile);this.input('mp-name').value=this.profile.name;
    try{localStorage.setItem('sf-racer-profile',JSON.stringify(this.profile));}catch{}
    this.hooks.profile(this.profile);this.renderChoices();if(this.room)void this.command({type:'profile',profile:this.profile});
  }
  private renderChoices(){for(const kind of ['driver','car','sponsor'] as const)this.dialog.querySelectorAll<HTMLButtonElement>(`[data-${kind}]`).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset[kind]===this.profile[kind])));}
  private async request(path:string,data:unknown,token=this.token){
    const response=await fetch('/api/rooms'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
    const result=await response.json().catch(()=>({error:'Room service is unavailable. Run the multiplayer server and try again.'}));
    if(!response.ok)throw Error(result.error??'Room request failed.');return result;
  }
  private async enter(code?:string){
    if(this.pending)return;if(code!==undefined&&!/^[A-F0-9]{8}$/.test(code)){this.error='Enter the 8-character code from your friend’s invite.';this.render();return;}
    this.pending=true;this.error='';this.profile.name=this.input('mp-name').value;this.changed();this.render();
    try{const result=await this.request(code?`/${code}/join`:'',{profile:this.profile},'');this.id=result.id;this.token=result.token;this.room=result.room;save('sf-room-'+this.room!.code,JSON.stringify({id:this.id,token:this.token}));const url=new URL(location.href);url.searchParams.set('room',this.room!.code);history.replaceState(null,'',url);void this.listen(this.room!.code);}
    catch(error){this.error=error instanceof Error?error.message:'Could not open room.';}finally{this.pending=false;this.render();}
  }
  private async listen(code:string){
    this.abort?.abort();const controller=new AbortController();this.abort=controller;const generation=++this.generation;
    while(!controller.signal.aborted&&generation===this.generation){
      try{
        const response=await fetch(`/api/rooms/${code}/events`,{headers:{Authorization:'Bearer '+this.token},signal:controller.signal});
        if(!response.ok){const data=await response.json();if(response.status===401||response.status===404){this.error=data.error;save('sf-room-'+code,'');this.room=null;this.token='';this.id='';this.connected=false;this.hooks.leave();this.clearPeers();this.open();this.render();return;}throw Error(data.error);}
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
    if(this.restoring){this.restoring=false;this.profile=me.profile;this.input('mp-name').value=me.profile.name;this.renderChoices();this.hooks.profile(me.profile);}
    if(room.round!==this.seenRound&&(room.phase==='countdown'||room.phase==='racing')){
      this.seenRound=room.round;this.finished=false;this.localPosition=null;this.dialog.close();this.hooks.start();
    }
    if(room.phase==='racing'||room.phase==='countdown'||room.phase==='results'){if(me.state.finished&&!this.finished){this.hooks.state(me);this.finished=true;this.hooks.finish();}}
    if(room.phase==='results'&&previousPhase!=='results'){if(!this.dialog.open)this.dialog.showModal();}
    if(room.phase==='lobby'&&this.seenRound>=0){this.seenRound=-1;this.finished=false;this.clearPeers();this.hooks.leave();this.open();}
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
    this.sending=true;
    try{await this.request(`/${this.room!.code}/command`,{type:'input',sequence:++this.sequence,input:document.hidden?{throttle:0,brake:0,steer:0,drift:false,boost:false}:this.pendingInput});}
    catch{this.connected=false;this.error='Connection lost. Reconnecting…';this.render();}finally{this.sending=false;}
  }
  private async copy(){try{await navigator.clipboard.writeText(this.input('mp-link').value);this.button('mp-copy').textContent='LINK COPIED ✓';}catch{this.input('mp-link').select();this.error='Copy the selected invite link and send it to your friends.';this.render();}}
  async leave(){
    const room=this.room;if(room)await this.command({type:'leave'});
    this.abort?.abort();this.generation++;this.room=null;this.connected=false;this.id='';this.token='';this.seenRound=-1;this.finished=false;this.error='';
    if(room)save('sf-room-'+room.code,'');const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);this.clearPeers();this.dialog.close();this.hooks.leave();this.render();
  }
  private render(){
    const room=this.room,host=room?.host===this.id,me=room?.players.find(p=>p.id===this.id),locked=!!room&&room.phase!=='lobby';
    this.dialog.querySelector<HTMLFieldSetElement>('#mp-choices')!.disabled=locked;this.input('mp-name').disabled=locked;
    this.dialog.querySelector<HTMLElement>('#mp-entry')!.hidden=!!room;this.dialog.querySelector<HTMLElement>('#mp-lobby')!.hidden=!room;
    this.button('mp-create').disabled=this.button('mp-join').disabled=this.pending;
    this.dialog.querySelector('#mp-error')!.textContent=this.error;
    this.dialog.querySelector('#mp-room-title')!.textContent=room?room.phase==='results'?'The finish line.':`Room ${room.code}`:'Meet at the starting line.';
    this.dialog.querySelector('#mp-subtitle')!.textContent=room?.phase==='results'?'One city. Another story to tell. Ready for a rematch?':'Pick your driver, choose your ride, then send the invite.';
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

import * as THREE from 'three';
import { createCar } from './car';
import { createCityRoot, setCameraFromCity, steeringFromControls } from './coordinates';
import { DrivingSimulation, type DriveInput } from './driving';
import { GameAudio } from './audio';
import { type CourseDefinition } from './courses';
import { createCourseRoute } from './course-route';
import { createCourseWorld } from './course-world';
import { createCerebralWorld, type CerebralView } from './cerebral-world';
import { createCerebralPresentation } from './cerebral-presentation';
import { createCerebralRaceArt } from './cerebral-race-art';
import { FogChallenge } from './fog-challenge';
import { courseMap, mountRacePicker, raceUrl } from './race-picker';

const read=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const write=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* Storage is optional. */}};
const time=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toFixed(2).padStart(5,'0')}`;
const clamp=THREE.MathUtils.clamp;

export async function bootCourseRace(app:HTMLElement, course:CourseDefinition) {
  document.title=`Whimsical SF — ${course.name}`;
  const cerebral=course.id==='cerebral-valley';
  const route=createCourseRoute(course), bestKey=`whimsical-sf-${course.id}-best-${cerebral?'skyline-v3':'v1'}`;
  const destination=course.points.at(-1)!.label.split(' · ')[0];
  let best=Number(read(bestKey))||0;
  app.className=`course-app${cerebral?' cerebral-course':''}`;
  app.innerHTML=`<canvas id="world" tabindex="-1" aria-label="${course.name} 3D race"></canvas><div class="course-scrim"></div>
    <header class="course-header"><a href="${raceUrl()}" class="course-brand" aria-label="Back to The City Loop">SF<span>WHIMSICAL<br>SAN FRANCISCO</span></a><div><button id="course-collection">ALL RACES ↗</button><button id="course-sound" aria-label="Mute sound">SOUND ON</button><button id="course-pause" hidden>PAUSE Ⅱ</button></div></header>
    <section class="course-brief" id="course-brief"><small>THE RACE COLLECTION / ${course.difficulty.toUpperCase()}</small><h1>${course.name}</h1><p>${course.description}</p><div class="course-facts"><span><b>${(route.TRACK_LENGTH/1000).toFixed(1)} KM</b> OF CITY DAYDREAM</span><span><b>${course.fog?'3 FOG BEACONS':`${route.CHECKPOINTS.length} CHECKPOINTS`}</b> ${course.fog?'BEFORE THE HEADLANDS':'ONE WAY TO THE FINISH'}</span></div><ol>${course.highlights.map(h=>`<li>${h}</li>`).join('')}</ol><button class="primary" id="course-start">LET’S RACE <span>↗</span></button><p class="course-controls-note">W / ↑ gas · A D / ← → steer · S / ↓ brake<br>Shift boost · Space drift · Q recover · R restart</p><button class="course-assist" id="course-assist"></button>${cerebral?'<button class="course-explore" id="course-glide">TRY THE SKYLINE GLIDE ↗</button><button class="course-explore" id="course-explore">EXPLORE THE NEIGHBORHOOD ↗</button>':''}</section>
    <div class="course-timing" id="course-timing" hidden><div><small>YOUR TIME</small><strong id="course-time">00:00.00</strong></div><div><small>PERSONAL BEST</small><strong id="course-best">${best?time(best):'—'}</strong></div><div><small>CHECKPOINT</small><strong id="course-checkpoint">0 / ${route.CHECKPOINTS.length}</strong></div></div>
    <div class="course-directions" id="course-directions" hidden><small id="course-turn">FOLLOW THE GOLD LINE</small><strong id="course-next"></strong><span id="course-turn-distance"></span></div>
    <aside class="course-minimap">${courseMap(course,'course-dot')}<strong>${course.name}</strong><span id="course-map-caption">${course.subtitle}</span></aside>
    <div class="course-bottom" id="course-bottom" hidden><button id="course-recover">Q / RETURN TO ROAD</button><div class="course-progress"><div><i id="course-progress-fill"></i></div><span id="course-remaining"></span></div><div class="course-speed"><strong id="course-speed">0</strong><span>MPH</span><div><i id="course-boost"></i></div><small>SHIFT / BOOST</small></div></div>
    <div class="course-toast" id="course-toast" role="status"></div><div class="course-count" id="course-count" hidden aria-live="polite"></div>
    <div class="course-fog-status" id="course-fog-status" hidden><small>THE FOG RUN</small><strong id="course-fog-count">0 / 3 BEACONS</strong><span>Steer through each glowing ring. Keep the clock running.</span></div>
    <div class="course-touch" id="course-touch"><div><button data-drive="left" aria-label="Steer left">←</button><button data-drive="right" aria-label="Steer right">→</button><button data-drive="drift">DRIFT</button></div><div><button data-drive="boost">BOOST</button><button data-drive="brake">BRAKE</button><button data-drive="gas">GAS</button></div></div>
    <dialog class="course-dialog" id="course-dialog" aria-labelledby="course-dialog-title"><small id="course-dialog-eyebrow"></small><h2 id="course-dialog-title"></h2><p id="course-dialog-copy"></p><button class="primary" id="course-resume">RESUME ↗</button><button id="course-restart">RESTART RACE</button><button id="course-other">CHOOSE ANOTHER RACE ↗</button></dialog>
    ${cerebral?'<nav class="cerebral-views" id="cerebral-views" aria-label="Explore Cerebral Valley" hidden></nav><div class="cerebral-tour-label" id="cerebral-tour-label" hidden><small>A CLOSER LOOK AT THE CITY</small><strong id="cerebral-view-name"></strong><button id="cerebral-back">BACK TO THE RACE ↗</button></div><small class="cerebral-credit">Map © OpenStreetMap contributors · Terrain USGS</small>':''}<div class="loading" id="loading"><span class="brand-mark">SF</span><p>FINDING YOUR SIDE OF THE CITY</p><div class="loading-line"></div></div>`;
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const canvas=el<HTMLCanvasElement>('world');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  const low=read('sf-night-run-quality')==='low';
  renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  renderer.shadowMap.enabled=!low;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();
  const sky=new THREE.Color(course.theme==='bridge'?'#a8c8cf':course.theme==='coast'?'#adcdd1':'#aedee5');
  scene.background=sky.clone();scene.fog=new THREE.FogExp2(sky,.00058);
  if(!cerebral)scene.add(new THREE.HemisphereLight('#fff5de','#6c9188',2.5));
  const sun=new THREE.DirectionalLight('#fff0d2',3.1);sun.castShadow=!low;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.camera.far=420;sun.shadow.normalBias=.06;if(!cerebral)scene.add(sun,sun.target);
  const root=createCityRoot();scene.add(root);
  const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.15,5500);
  const world=cerebral?await createCerebralWorld(scene,route,low):createCourseWorld(root,course,route);
  const raceArt=cerebral?createCerebralRaceArt(scene,route,{boosts:route.BOOST_ZONES??[],launches:route.LAUNCH_ZONES}):undefined;
  const presentation=cerebral?createCerebralPresentation(renderer,scene,camera,route,low,p=>{if('views' in world)world.update(0,route.routeProgressAt(p.x,p.z),new THREE.Vector3(p.x,p.y,-p.z));}):undefined;
  const scenicViews:CerebralView[]='views' in world?world.views:[];
  let scenic=false,selectedView=0,frameMs=16.7,practice=false;
  const car=createCar();root.add(car.group);
  const sim=new DrivingSimulation('obstacles' in world?world.obstacles:[],{route});
  const audio=new GameAudio();let muted=read('sf-night-run-muted')==='true';audio.setMuted(muted);
  const fog=course.fog?new FogChallenge(course.fog.start*route.TRACK_LENGTH,course.fog.end*route.TRACK_LENGTH):undefined;
  const beacon=new THREE.Mesh(new THREE.TorusGeometry(2.7,.16,8,48),new THREE.MeshBasicMaterial({color:'#ffeb7b'}));root.add(beacon);beacon.visible=false;
  const beaconGlow=new THREE.PointLight('#ffdf76',12,18);beacon.add(beaconGlow);
  type Phase='preview'|'countdown'|'racing'|'paused'|'finished';
  let phase:Phase='preview',resumePhase:Phase='racing',countdown=3,last=performance.now(),elapsed=0,toastUntil=0,topSpeed=0,cameraReady=false,cameraMode=0,controllerPause=false;
  let auto=read('sf-night-run-auto-throttle')==='true';
  const keys=new Set<string>(),touch=new Set<string>();
  const eye=new THREE.Vector3(),look=new THREE.Vector3();
  const dialog=el<HTMLDialogElement>('course-dialog');
  const collection=mountRacePicker(app,el('course-collection'));
  const clear=()=>{keys.clear();touch.clear();document.querySelectorAll('[data-drive]').forEach(b=>b.classList.remove('pressed'));};
  const toast=(message:string,seconds=2.4)=>{el('course-toast').textContent=message;toastUntil=elapsed+seconds;};
  function sync(){
    const run=phase!=='preview';el('course-brief').hidden=run||scenic;
    if(cerebral){el('cerebral-views').hidden=run||!scenic;el('cerebral-tour-label').hidden=run||!scenic;app.classList.toggle('cerebral-tour-mode',scenic&&!run);app.classList.toggle('cerebral-glide-view',scenic&&!!scenicViews[selectedView]?.glide);}
    ['course-timing','course-bottom'].forEach(id=>el(id).hidden=!run);
    el('course-pause').hidden=!['racing','countdown','paused'].includes(phase);
    el('course-count').hidden=phase!=='countdown';
    app.classList.toggle('course-running',run);app.classList.toggle('course-driving',phase==='racing');
    el('course-sound').textContent=muted?'SOUND OFF':'SOUND ON';el('course-sound').setAttribute('aria-label',muted?'Unmute sound':'Mute sound');
    el('course-assist').textContent=`AUTO ACCELERATE: ${auto?'ON':'OFF'}`;el('course-assist').setAttribute('aria-pressed',String(auto));
  }
  function start(glidePractice=false){practice=glidePractice;scenic=false;clear();sim.reset();if(practice){sim.seek(route.LAUNCH_ZONES[0].progress-1);sim.state.speed=34;sim.state.checkpoint=route.CHECKPOINTS.filter(p=>p<=sim.state.progress).length;}fog?.reset();el('course-restart').textContent=practice?'RETRY SKYLINE GLIDE':'RESTART RACE';topSpeed=0;countdown=3;phase='countdown';cameraReady=false;if(dialog.open)dialog.close();el('course-count').textContent='3';toastUntil=0;void audio.unlock().then(()=>audio.cue('count'));sync();canvas.focus();}
  function pause(){if(phase!=='racing'&&phase!=='countdown')return;resumePhase=phase;phase='paused';clear();audio.suspend();el('course-dialog-eyebrow').textContent=course.name;el('course-dialog-title').textContent='A moment in the city.';el('course-dialog-copy').textContent='Your run is paused. The clock can wait.';el('course-resume').textContent='RESUME ↗';dialog.showModal();sync();}
  function resume(){if(phase!=='paused')return;phase=resumePhase;dialog.close();clear();void audio.unlock();sync();canvas.focus();}
  function recover(){if(phase!=='racing')return;if(practice){start(true);return;}clear();if(fog?.active&&!fog.complete&&course.fog){sim.seek(course.fog.start*route.TRACK_LENGTH-8);fog.reset();}else sim.recover();cameraReady=false;toast('BACK ON THE ROAD · THE CLOCK KEEPS RUNNING');}
  function finish(){phase='finished';clear();audio.cue('finish');audio.suspend();const record=!practice&&(!best||sim.state.elapsed<best);if(record){best=sim.state.elapsed;write(bestKey,String(best));}el('course-best').textContent=time(best);el('course-dialog-eyebrow').textContent=practice?'GLIDE PRACTICE':record?'NEW PERSONAL BEST':course.name;el('course-dialog-title').textContent=time(sim.state.elapsed);el('course-dialog-copy').textContent=`${destination}. ${Math.round(topSpeed*2.23694)} mph top speed · ${sim.state.collisions} contacts${safelyAirTime()}${fog?' · Fog run complete':''}.`;el('course-resume').textContent='ONE MORE RUN ↗';dialog.showModal();sync();}
  function safelyAirTime(){return sim.state.totalAirTime>.1?` · ${sim.state.totalAirTime.toFixed(1)} seconds in the sky`:'';}
  if(cerebral){
    el('course-glide').onclick=()=>start(true);
    const nav=el('cerebral-views');nav.innerHTML=scenicViews.map((view,i)=>`<button data-view="${i}" aria-pressed="${i===0}">${view.name}</button>`).join('');
    const visit=(i:number)=>{selectedView=i;scenic=true;sim.reset();sim.seek(scenicViews[i].progress);if(scenicViews[i].glide){const zone=route.LAUNCH_ZONES[0];sim.seek(zone.progress-1);sim.state.speed=34;for(let frame=0;frame<1200&&sim.state.progress<(zone.progress+zone.end)/2;frame++)sim.update(1/120,{throttle:1,brake:0,steer:0,drift:false,boost:false});}cameraReady=false;el('cerebral-view-name').textContent=scenicViews[i].name;nav.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));sync();};
    nav.querySelectorAll<HTMLButtonElement>('button').forEach((b,i)=>b.onclick=()=>visit(i));
    el('course-explore').onclick=()=>visit(selectedView);el('cerebral-back').onclick=()=>{scenic=false;sim.reset();cameraReady=false;sync();};
  }
  el('course-start').onclick=()=>start();el('course-restart').onclick=()=>start(practice);el('course-recover').onclick=recover;el('course-resume').onclick=()=>phase==='finished'?start(practice):resume();el('course-pause').onclick=()=>phase==='paused'?resume():pause();
  el('course-other').onclick=()=>{dialog.close();collection();};
  el('course-collection').addEventListener('click',()=>{if(phase==='racing'||phase==='countdown'){pause();dialog.close();}});
  const atlas=app.querySelector<HTMLDialogElement>('.race-atlas')!;atlas.addEventListener('close',()=>{if((phase==='paused'||phase==='finished')&&!dialog.open)dialog.showModal();});
  el('course-sound').onclick=()=>{muted=!muted;audio.setMuted(muted);write('sf-night-run-muted',String(muted));sync();};
  el('course-assist').onclick=()=>{auto=!auto;write('sf-night-run-auto-throttle',String(auto));sync();};
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(phase==='paused')resume();});
  const controls=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space'];
  window.addEventListener('keydown',event=>{
    if(atlas.open)return;
    if(controls.includes(event.code)&&['racing','countdown'].includes(phase)){event.preventDefault();keys.add(event.code);}
    if(event.repeat)return;
    if(event.code==='Escape'){event.preventDefault();if(phase==='racing'||phase==='countdown')pause();else if(phase==='paused')resume();}
    if(event.code==='KeyR'&&phase!=='preview')start(practice);
    if(event.code==='KeyQ')recover();
    if(event.code==='KeyC')cameraMode=(cameraMode+1)%2;
    if(event.code==='KeyM')el('course-sound').click();
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{clear();pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();pause();}});
  document.querySelectorAll<HTMLButtonElement>('[data-drive]').forEach(button=>{
    button.onpointerdown=event=>{event.preventDefault();if(phase!=='racing')return;touch.add(button.dataset.drive!);button.classList.add('pressed');button.setPointerCapture(event.pointerId);};
    const release=()=>{touch.delete(button.dataset.drive!);button.classList.remove('pressed');};button.onpointerup=release;button.onpointercancel=release;button.onlostpointercapture=release;
  });
  function input():DriveInput {
    const gas=keys.has('KeyW')||keys.has('ArrowUp')||touch.has('gas'),brake=keys.has('KeyS')||keys.has('ArrowDown')||touch.has('brake');
    const left=keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left'),right=keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right');
    const result={throttle:gas||auto?1:0,brake:brake?1:0,steer:steeringFromControls(left,right),drift:keys.has('Space')||touch.has('drift'),boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.has('boost')};
    const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected&&p.mapping==='standard');
    if(pad){result.steer=steeringFromControls(left,right,pad.axes[0]);result.throttle=Math.max(result.throttle,pad.buttons[7]?.value??0);result.brake=Math.max(result.brake,pad.buttons[6]?.value??0);result.boost||=!!pad.buttons[0]?.pressed;result.drift||=!!pad.buttons[2]?.pressed;const pressed=!!pad.buttons[9]?.pressed;if(pressed&&!controllerPause&&!atlas.open){if(phase==='paused')resume();else if(phase==='preview')start();else pause();}controllerPause=pressed;}else controllerPause=false;
    if(auto&&result.brake>.1)result.throttle=0;return result;
  }
  window.addEventListener('gamepaddisconnected',()=>{clear();pause();});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);presentation?.resize();});
  const map=app.querySelector<SVGElement>('.course-map-svg')!;
  const mapValues=map.dataset;
  function hud(){
    const s=sim.state;el('course-time').textContent=time(s.elapsed);el('course-speed').textContent=String(Math.round(s.speed*2.23694));el('course-checkpoint').textContent=`${s.checkpoint} / ${route.CHECKPOINTS.length}`;
    el('course-progress-fill').style.width=`${s.progress/route.TRACK_LENGTH*100}%`;el('course-boost').style.width=`${s.boost*100}%`;el('course-remaining').textContent=`${Math.max(0,(route.TRACK_LENGTH-s.progress)/1000).toFixed(2)} KM TO ${destination.toUpperCase()}`;
    const p=sim.position;el('course-dot').setAttribute('cx',String(180+(p.x-(Number(mapValues.minX)+Number(mapValues.maxX))/2)*Number(mapValues.scale)));el('course-dot').setAttribute('cy',String(108-(p.z-(Number(mapValues.minZ)+Number(mapValues.maxZ))/2)*Number(mapValues.scale)));
    const turn=Array.from({length:36},(_,i)=>({at:s.progress+i*4,curve:route.routeCurvature(s.progress+i*4)})).find(t=>Math.abs(t.curve)>.008);
    const next=sim.nextRaceGate;el('course-directions').hidden=phase!=='racing';
    el('course-next').textContent=next?.label??course.name;
    el('course-turn').textContent=turn?`${s.speed>22&&turn.at-s.progress<70?'BRAKE · ':''}${turn.curve>0?'RIGHT':'LEFT'} ${turn.at-s.progress<8?'NOW':'AHEAD'}`:'FOLLOW THE GOLD LINE';
    el('course-turn-distance').textContent=turn?`${Math.ceil((turn.at-s.progress)/5)*5} M`:next?`${Math.ceil(Math.max(0,next.progress-s.progress))} M`:'';
    if(s.airborne){el('course-turn').textContent='SKYLINE GLIDE';el('course-next').textContent='Painted Ladies · San Francisco';el('course-turn-distance').textContent='← → GLIDE · SHIFT LIFT';}else if(s.surge>0){el('course-turn').textContent='RAINBOW RUSH';el('course-turn-distance').textContent='BRAKE ANY TIME TO SLOW DOWN';}
    el('course-fog-status').hidden=!(fog?.active&&phase==='racing');el('course-fog-count').textContent=`${fog?.collected??0} / 3 BEACONS`;
    el('course-toast').classList.toggle('visible',elapsed<toastUntil);
    Object.assign(canvas.dataset,{race:course.id,phase,progress:s.progress.toFixed(2),speed:s.speed.toFixed(2),elapsed:s.elapsed.toFixed(2),checkpoint:String(s.checkpoint),fogComplete:String(fog?.complete??true),fogBeacons:String(fog?.collected??0),airborne:String(s.airborne),altitude:s.altitude.toFixed(2),surge:s.surge.toFixed(2),practice:String(practice),launches:String(s.launches),airTime:s.totalAirTime.toFixed(2),worldX:p.x.toFixed(2),worldZ:p.z.toFixed(2),drawCalls:String(renderer.info.render.calls),frameMs:frameMs.toFixed(1),triangles:String(renderer.info.render.triangles)});
  }
  (window as typeof window & {sfNightRun?:unknown}).sfNightRun={get state(){return{...sim.state,phase,course:course.id,fogBeacons:fog?.collected,fogComplete:fog?.complete};},get rendering(){return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries};}};
  sync();
  if(presentation){el('loading').querySelector('p')!.textContent='OPENING THE NEIGHBORHOOD';await presentation.ready(car.group);}
  el('loading').remove();last=performance.now();
  let lastFrame=performance.now();
  function frame(now:number){
    requestAnimationFrame(frame);const dt=clamp((now-last)/1000,0,.1);last=now;elapsed+=dt;
    frameMs+=(Math.min((now-lastFrame)/1,150)-frameMs)*.04;lastFrame=now;
    const drive=input();
    if(phase==='countdown'){const previous=Math.ceil(countdown);countdown-=dt;el('course-count').textContent=String(Math.max(1,Math.ceil(countdown)));if(Math.ceil(countdown)!==previous)audio.cue(countdown<=0?'go':'count');if(countdown<=0){phase='racing';sync();toast(course.fog?'THE BRIDGE HAS A SECRET. FOLLOW THE BEACONS.':'FIND YOUR LINE. MAKE IT A GOOD ONE.');}}
    if(phase==='racing'){
      const previous=sim.state.progress,previousLateral=sim.state.lateral;const events=sim.update(dt,drive);topSpeed=Math.max(topSpeed,sim.state.speed);
      const result=fog?.update(previous,sim.state.progress,sim.state.lateral,previousLateral);
      if(result==='retry'&&course.fog){sim.seek(course.fog.start*route.TRACK_LENGTH-8);fog!.reset();cameraReady=false;toast('BEACON MISSED · TRY THE FOG AGAIN · TIME CONTINUES',3);audio.cue('crash');}
      else if(result==='beacon'){audio.cue('checkpoint');toast('BEACON FOUND · FOLLOW THE NEXT LIGHT',1.7);}
      else if(result==='complete'){audio.cue('checkpoint');toast('FOG CLEARED · HAWK HILL IS CALLING',3);}
      for(const event of events){if(event==='checkpoint'){audio.cue(event);if(!fog?.active&&!sim.state.airborne&&sim.state.surge===0)toast(`CHECKPOINT ${sim.state.checkpoint} · KEEP GOING`);}if(event==='crash')audio.cue(event);if(event==='boost-pad'){audio.cue(event);toast(sim.state.progress<900?'RAINBOW RUSH · HAYES IS YOURS':'NEXT STOP: THE SKYLINE',2);}if(event==='launch'){audio.cue(event);toast('HELLO, SAN FRANCISCO. · STEER TO GLIDE',3.2);}if(event==='land'){audio.cue(event);toast('TOUCHDOWN · STEINER → PAGE',2.2);}if(event==='finish'){if(!fog||fog.complete)finish();else if(course.fog){sim.seek(course.fog.start*route.TRACK_LENGTH-8);fog.reset();cameraReady=false;toast('CLEAR THE FOG BEACONS TO FINISH');}}}
      audio.update(sim.state.speed,drive.throttle,drive.drift,sim.boosting,sim.state.glide);
    }
    const s=sim.state,p=sim.position,yaw=s.heading;
    car.group.position.set(p.x,p.y+.05,p.z);if(s.airborne){car.group.rotation.set(-Math.atan2(s.verticalVelocity,Math.max(s.speed,1)),yaw+s.driftAngle,-drive.steer*.12,'YXZ');}else if(course.terrainHeight){
      const h=course.terrainHeight,dx=Math.sin(yaw),dz=Math.cos(yaw);
      const pitch=-Math.atan((h(p.x+dx*2.1,p.z+dz*2.1)-h(p.x-dx*2.1,p.z-dz*2.1))/4.2);
      const roll=Math.atan((h(p.x+dz*.95,p.z-dx*.95)-h(p.x-dz*.95,p.z+dx*.95))/1.9);
      car.group.rotation.set(pitch,yaw+s.driftAngle,roll,'YXZ');
    }else car.group.rotation.set(-Math.atan(route.routeSlope(s.progress)),yaw+s.driftAngle,0,'YXZ');
    if(phase!=='paused')car.update(dt,{speed:s.speed,steer:drive.steer,braking:drive.brake>.1,boosting:sim.boosting,time:elapsed,glide:s.glide,airborne:s.airborne,altitude:s.altitude});
    const scenicGlide=scenic&&!!scenicViews[selectedView]?.glide;
    const preview=phase==='preview'&&!scenicGlide;const flight=s.airborne&&cerebral;const distance=preview?25:flight?17:cameraMode?7:11;
    const desiredEye=new THREE.Vector3(p.x-Math.sin(yaw)*distance+(preview?Math.cos(yaw)*14:0),p.y+(preview?14:flight?6.5:cameraMode?3:5.4),p.z-Math.cos(yaw)*distance-(preview?Math.sin(yaw)*14:0));
    const portraitFlight=clamp((1.1-camera.aspect)/.65,0,1);
    const flightYaw=yaw-.13-.10*portraitFlight;
    const ahead=route.sampleRoute(Math.min(route.TRACK_LENGTH,s.progress+16));const desiredLook=new THREE.Vector3(preview?p.x:p.x+Math.sin(flight?flightYaw:yaw)*(flight?50:14),preview?p.y+3:flight?p.y+.5:Math.max(p.y+1.5,ahead.y+1.5),preview?p.z:p.z+Math.cos(flight?flightYaw:yaw)*(flight?50:14));
    if(preview&&cerebral){const v=scenicViews[scenic?selectedView:0];desiredEye.set(v.eye.x,v.eye.y,v.eye.z);desiredLook.set(v.look.x,v.look.y,v.look.z);}
    if(phase==='finished'){
      // Pull beyond the finish and look back over the route, revealing the
      // bridge below Hawk Hill and the neighborhood behind each destination.
      desiredEye.set(p.x+Math.sin(yaw)*65,p.y+48,p.z+Math.cos(yaw)*65);
      const vista=route.sampleRoute(Math.max(0,route.TRACK_LENGTH-180));
      desiredLook.set(vista.x,vista.y+3,vista.z);
    }
    if(!cameraReady){eye.copy(desiredEye);look.copy(desiredLook);cameraReady=true;}else if(phase!=='paused'){eye.lerp(desiredEye,1-Math.exp(-8*dt));look.lerp(desiredLook,1-Math.exp(-9*dt));}
    setCameraFromCity(camera,eye,look);camera.fov=THREE.MathUtils.damp(camera.fov,preview?58:flight?56+18*portraitFlight:s.surge>0?77:62+Math.min(s.speed*.12,6),5,dt);camera.updateProjectionMatrix();
    sun.position.set(p.x-65,p.y+140,-p.z+75);sun.target.position.set(p.x,p.y,-p.z);
    const fogActive=fog?.active&&!fog.complete;if(!cerebral){const fogMaterial=scene.fog as THREE.FogExp2;fogMaterial.density=THREE.MathUtils.damp(fogMaterial.density,fogActive?.022:.00058,2,dt);(scene.background as THREE.Color).lerp(fogActive?new THREE.Color('#d6e3df'):sky,1-Math.exp(-dt*2));}
    const nextBeacon=fog?.nextBeacon;beacon.visible=!!nextBeacon&&s.progress>nextBeacon.progress-180&&phase!=='preview';if(nextBeacon){const q=route.routePoint(nextBeacon.progress,nextBeacon.lateral);beacon.position.set(q.x,q.y+2.7,q.z);beacon.rotation.y=route.routeYaw(nextBeacon.progress);beacon.scale.setScalar(1+Math.sin(elapsed*3)*.035);}
    if('views' in world)world.update(elapsed,s.progress,camera.position);else world.update(elapsed,s.progress);
    raceArt?.update(elapsed,s.progress,scenicGlide?'racing':phase,!scenic||scenicGlide);presentation?.update(elapsed,s.progress);hud();if(presentation)presentation.render();else renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
}

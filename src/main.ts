import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createAtmosphere } from './atmosphere';
import { createSkyline } from './skyline';
import { createLandmarks } from './landmarks';
import { createStreetLife } from './streetlife';
import { createCityLife } from './citylife';
import { createVegetation } from './vegetation';
import { upgradeRoadSurface } from './surfaces';
import { createWorld } from './world';
import { createCar } from './car';
import { GameAudio } from './audio';
import { DrivingSimulation } from './driving';
import type { DriveInput } from './driving';
import { sampleRoute, routeYaw, routeSlope, districtAt, TRACK_LENGTH, START_PROGRESS } from './route';
import { CityTour } from './tour';
import './style.css';

const speakerIcon = `<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>`;
const muteIcon = `<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4zM16 9l6 6m0-6-6 6"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>`;
const mapSvg = `<svg class="minimap" viewBox="0 0 150 145" aria-label="Powell Street route map"><path class="map-grid" d="M13 5v136M47 0v145M78 0v145M111 0v145M140 0v145M0 16h150M0 43h150M0 70h150M0 98h150M0 126h150"/><rect class="map-square" x="82" y="72" width="25" height="23"/><path class="map-course" d="M78 8v28l-3 9v16l5 10v27l-3 13v24"/><circle cx="78" cy="8" r="3" fill="#d9fc87"/><path d="M71 135h12" stroke="#fff" stroke-width="3"/><circle id="map-dot" class="map-progress" cx="78" cy="8" r="5"/></svg>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<canvas id="world" aria-label="3D San Francisco racing game"></canvas>
<div class="shade"></div><div class="race-shade"></div><div class="speed-vignette"></div><div class="grain"></div>
<header class="topbar">
  <button class="brand" id="home" aria-label="Return to main menu"><span class="brand-mark">SF</span><span class="brand-word">CITY<br>RUN</span></button>
  <div class="top-actions"><span class="weather"><span class="weather-dot"></span> PACIFIC SUN <span style="opacity:.4">/</span> 16:48</span><button class="icon-button" id="sound" aria-label="Mute sound">${speakerIcon}</button><button class="icon-button hidden" id="pause" aria-label="Pause race">${pauseIcon}</button></div>
</header>
<main class="intro" id="intro">
  <div class="eyebrow">THE CITY IS YOUR CIRCUIT</div>
  <h1>SAN<br><span>FRANCISCO.</span></h1>
  <p class="intro-copy">Chase the sunshine down Powell Street.<br>Steep hills. Cable car tracks. One perfect run.</p>
  <div class="intro-actions"><button class="primary" id="start">TAKE THE WHEEL <span class="arrow">↗</span></button><button class="text-button" id="how">HOW TO PLAY</button></div>
  <div class="keyboard-note"><button class="text-button" id="tour-start">TAKE A SCENIC DRIVE ↗</button><span></span> NO CLOCK. JUST THE CITY.</div>
</main>
<footer class="intro-bottom" id="intro-bottom"><div class="route-card"><span class="route-index">01</span><div class="route-text"><small>THE FIRST RUN</small><strong>POWELL GOLDEN RUN</strong><em>1.3 KM &nbsp; / &nbsp; DOWNHILL TIME TRIAL</em></div><svg class="route-arrow" viewBox="0 0 30 38" fill="none"><path d="M7 2v10l16 7v9l-9 7" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="3" r="3" fill="currentColor"/><path d="m8 34 6 1 1-6" stroke="currentColor" stroke-width="2"/></svg></div><div class="location-label"><strong><i>↗</i> UNION SQUARE, SAN FRANCISCO</strong><span>37.7880° N &nbsp; 122.4075° W</span></div></footer>
<div class="edition" id="edition">SAN FRANCISCO &nbsp; / &nbsp; VOL. 001</div>
<div class="race-hud faded" id="hud">
  <div class="race-top"><div class="stat"><span class="label">YOUR TIME</span><span class="stat-value" id="timer">00:00.00</span></div><div class="stat"><span class="label">PERSONAL BEST</span><span class="stat-value" id="best">—</span></div><div class="stat"><span class="label">CHECKPOINT</span><span class="stat-value" id="checkpoint">0 <em>/ 4</em></span></div></div>
  <div class="hud-route">${mapSvg}<div class="district-name" id="district">NOB HILL</div><div class="street-name" id="street">CALIFORNIA STREET</div></div>
  <div class="progress-bar"><div class="progress-track"><div class="progress-fill" id="progress-fill"></div><i class="progress-tick" style="left:24.2%"></i><i class="progress-tick" style="left:49.2%"></i><i class="progress-tick" style="left:75%"></i></div><div class="progress-label"><span>CALIFORNIA</span><span id="distance">1.3 KM TO MARKET</span></div></div>
  <div class="speedometer"><div class="gear">GEAR <span id="gear">N</span></div><div class="speed-row"><span class="speed" id="speed">0</span><span class="speed-units">MPH</span></div><div class="boost-track"><div class="boost-fill" id="boost-fill"></div></div><div class="boost-label"><span>BOOST</span><kbd>SHIFT</kbd></div></div>
</div>
<div class="drift-hint" id="drift-hint">DRIFTING</div>
<div class="countdown hidden" id="countdown" aria-live="polite"></div>
<div class="race-message faded" id="message" aria-live="polite" aria-hidden="true"><strong></strong><span></span></div>
<div class="race-flash" id="flash"></div><div class="tour-ui hidden" id="tour-ui"><div class="tour-caption"><span>SCENIC DRIVE</span><strong id="tour-place">NOB HILL</strong><small>Drag to look around</small></div><div class="tour-stops"><button data-stop="38">NOB HILL</button><button data-stop="555">BEACON GRAND</button><button data-stop="740">UNION SQUARE</button><button data-stop="1335">MARKET ST</button></div><div class="tour-actions"><button id="tour-pause">PAUSE</button><button id="tour-race">LET’S RACE ↗</button><button id="tour-exit" aria-label="Exit scenic drive">×</button></div></div>
<div class="touch-controls"><div class="touch-group"><button class="touch-button" data-control="left" aria-label="Steer left">‹</button><button class="touch-button" data-control="right" aria-label="Steer right">›</button><button class="touch-button small" data-control="drift" aria-label="Handbrake drift">DRIFT</button></div><div class="touch-group"><button class="touch-button small" data-control="boost" aria-label="Boost">N₂O</button><button class="touch-button small" data-control="brake" aria-label="Brake">BRAKE</button><button class="touch-button gas" data-control="gas" aria-label="Accelerate">GAS</button></div></div>
<div class="modal-layer hidden" id="help" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="panel"><button class="panel-close" id="close-help" aria-label="Close instructions">×</button><div class="panel-eyebrow">A LITTLE LOCAL KNOWLEDGE</div><h2 id="help-title">OWN THE<br>DOWNHILL.</h2><p>Follow Powell from Nob Hill to Market Street. Pass through all four gates and beat your best time. Watch for parked cars and cable cars.</p><div class="control-list"><div class="control-item"><div class="keys"><kbd>W</kbd><kbd>↑</kbd></div>Accelerate</div><div class="control-item"><div class="keys"><kbd>S</kbd><kbd>↓</kbd></div>Brake</div><div class="control-item"><div class="keys"><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd></div>Steer</div><div class="control-item"><div class="keys"><kbd>SPACE</kbd></div>Hold to drift</div><div class="control-item"><div class="keys"><kbd>SHIFT</kbd></div>Boost · recharges</div><div class="control-item"><div class="keys"><kbd>R</kbd><kbd>ESC</kbd><kbd>C</kbd></div>Restart · pause · camera</div></div><p class="help-caption">Controller: left stick to steer, RT to accelerate, LT to brake, A to boost, X to drift, Menu to pause. Touch controls appear on touchscreens. Scenic drive lets you explore slowly, jump to landmarks, and drag to look around.</p><div class="settings-row"><button id="quality">GRAPHICS: HIGH</button><span>/</span><button id="fullscreen">FULLSCREEN ↗</button></div><div class="settings-row" style="margin-top:12px;padding-top:12px"><button id="auto-throttle" aria-pressed="false">AUTO ACCELERATE: OFF</button><span>/</span><button id="reset-best">RESET BEST</button></div><button class="primary" id="help-play">LET’S DRIVE <span class="arrow">↗</span></button></div></div>
<div class="modal-layer hidden" id="pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="panel"><div class="panel-eyebrow">TAKE A BREATHER</div><h2 id="pause-title">CITY ON<br>STANDBY.</h2><p>Your run is paused. The clock can wait.</p><button class="primary" id="resume">BACK TO THE RUN <span class="arrow">↗</span></button><button class="secondary" id="restart">RESTART RACE</button><button class="secondary" id="pause-home">MAIN MENU</button></div></div>
<div class="modal-layer hidden" id="results" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="panel"><div class="panel-eyebrow" id="result-eyebrow">POWELL STREET / COMPLETE</div><h2 id="result-title">THAT’S<br>A RUN.</h2><div class="result-main"><div><div class="label" style="margin-bottom:8px">YOUR FINISH TIME</div><div class="result-time" id="result-time">00:00.00</div></div><div class="result-medal" id="result-medal">FINISHER</div></div><div class="result-stats"><div><span class="label">TOP SPEED</span><strong id="result-speed">0 MPH</strong></div><div><span class="label">DRIFT DISTANCE</span><strong id="result-drift">0 M</strong></div><div><span class="label">CONTACTS</span><strong id="result-hits">0</strong></div></div><p id="result-copy">There’s always a cleaner line. Go find it.</p><button class="primary" id="again">ONE MORE RUN <span class="arrow">↗</span></button><button class="secondary" id="result-home">BACK TO THE CITY</button></div></div>
<div class="loading" id="loading"><span class="brand-mark">SF</span><p>SETTING THE SCENE</p><div class="loading-line"></div></div>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const safeRead = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const safeWrite = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Private storage can be unavailable. */ } };
const formatTime = (seconds: number) => {
  const hundredths = Math.floor(seconds * 100);
  return `${String(Math.floor(hundredths / 6000)).padStart(2,'0')}:${String(Math.floor(hundredths / 100) % 60).padStart(2,'0')}.${String(hundredths % 100).padStart(2,'0')}`;
};

async function boot() {
  await new Promise(resolve => requestAnimationFrame(resolve));
  const canvas = el<HTMLCanvasElement>('world');
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
  catch { el('loading').innerHTML = `<div class="no-webgl"><h2>This run needs WebGL.</h2><p>Try a recent Chrome, Edge, Firefox, or Safari browser with hardware acceleration enabled, then reload this page.</p><button class="primary" onclick="location.reload()">TRY AGAIN ↗</button></div>`; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset=false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .15, 4200);
  const atmosphere=createAtmosphere(renderer,scene,camera);
  const world = createWorld(scene);
  const landmarks=createLandmarks(scene);
  const streetLife=createStreetLife(scene);
  const cityLife=createCityLife(scene);
  createSkyline(scene);
  const [vegetation]=await Promise.all([createVegetation(scene),upgradeRoadSurface(scene,renderer),atmosphere.loadPhotographicSky()]);
  const car = createCar(); scene.add(car.group);
  const sim = new DrivingSimulation([...world.obstacles,...streetLife.obstacles]);
  const audio = new GameAudio();
  const cableCars=[...streetLife.obstacles,...(streetLife.tourObstacles??[])].filter(obstacle=>obstacle.kind==='cablecar');
  const soundedCableCars=new Set<number>();
  let previousSoundProgress=0;
  function updateCitySound(progress:number,lateral:number){
    if(progress<previousSoundProgress||Math.abs(progress-previousSoundProgress)>60)soundedCableCars.clear();
    previousSoundProgress=progress;
    for(const cable of cableCars){
      if(soundedCableCars.has(cable.progress))continue;
      const distance=Math.hypot(cable.progress-progress,cable.lateral-lateral);
      if(distance<32){audio.cableBell(distance,(lateral-cable.lateral)/9);soundedCableCars.add(cable.progress);}
    }
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const ao=new GTAOPass(scene,camera,innerWidth,innerHeight);ao.blendIntensity=.55;ao.updateGtaoMaterial({radius:.65,thickness:.6,distanceExponent:1.6,samples:8});ao.updatePdMaterial({radius:4,rings:2,samples:8});
  const resizeAO=ao.setSize.bind(ao);ao.setSize=(w,h)=>resizeAO(Math.ceil(w*.55),Math.ceil(h*.55));composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.12,.38,1.55);
  composer.addPass(bloom);
  const grade=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));c=max(vec3(0.),mix(vec3(l),c,1.13));c=pow(c,vec3(1.025))*1.025;vec2 p=vUv*2.-1.;c*=1.-dot(p,p)*.018;gl_FragColor=vec4(c,1.);}'});composer.addPass(grade);
  composer.addPass(new SMAAPass());composer.addPass(new OutputPass());

  // Subtle road dust makes tire movement readable without obscuring the street.
  const particleCount=120, positions=new Float32Array(particleCount*3), ages=new Float32Array(particleCount).fill(3), velocities=new Float32Array(particleCount*3);
  const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const sprayCanvas=document.createElement('canvas');sprayCanvas.width=sprayCanvas.height=32;const sprayCtx=sprayCanvas.getContext('2d')!;const sprayGradient=sprayCtx.createRadialGradient(16,16,0,16,16,16);sprayGradient.addColorStop(0,'rgba(255,255,255,.7)');sprayGradient.addColorStop(.35,'rgba(255,255,255,.3)');sprayGradient.addColorStop(1,'rgba(255,255,255,0)');sprayCtx.fillStyle=sprayGradient;sprayCtx.fillRect(0,0,32,32);
  const particleMat=new THREE.PointsMaterial({map:new THREE.CanvasTexture(sprayCanvas),color:0xc5d9dd,size:.4,transparent:true,opacity:.045,depthWrite:false,sizeAttenuation:true});
  const spray=new THREE.Points(particleGeo,particleMat);spray.frustumCulled=false;scene.add(spray);let particleCursor=0;

  type Phase = 'menu'|'countdown'|'racing'|'paused'|'finished'|'tour';
  const tour=new CityTour([...world.obstacles,...streetLife.obstacles,...(streetLife.tourObstacles??[])]);
  let phase:Phase='menu', previousPhase:Phase='racing', countdownLeft=3, countdownNumber=0;
  let topSpeed=0, best=Number(safeRead('sf-night-run-best-v1'))||0, muted=safeRead('sf-night-run-muted')==='true';
  let autoThrottle=safeRead('sf-night-run-auto-throttle')==='true';
  let cinematicQuality=safeRead('sf-night-run-quality')==='cinematic';
  let lowQuality=safeRead('sf-night-run-quality')==='low', cameraMode=0, totalTime=0, lastTime=performance.now(), uiClock=0, messageUntil=0, flashUntil=0;
  let lastDistrict='', gamepadPauseDown=false, shake=0, helpWasPaused=false, goUntil=0, finishReveal=0;
  const keys=new Set<string>(), touch=new Set<string>();
  const desiredCamera=new THREE.Vector3(), lookAt=new THREE.Vector3(), smoothedLook=new THREE.Vector3();
  let cameraInitialized=false, performanceFrames=0, performanceTime=0;
  let lastFocus:HTMLElement|null=null;
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  audio.setMuted(muted);
  function updateSoundButton(){el('sound').innerHTML=muted?muteIcon:speakerIcon;el('sound').setAttribute('aria-label',muted?'Unmute sound':'Mute sound');el('sound').setAttribute('aria-pressed',String(muted));}
  function applyQuality(){renderer.setPixelRatio(Math.min(devicePixelRatio,lowQuality?1:cinematicQuality?1.6:1.25));renderer.shadowMap.enabled=!lowQuality;bloom.enabled=!lowQuality;ao.enabled=cinematicQuality&&!lowQuality;world.setQuality?.(lowQuality);landmarks.setQuality?.(lowQuality);streetLife.setQuality?.(lowQuality);cityLife.setQuality(lowQuality);vegetation.setQuality(lowQuality);atmosphere.setQuality(lowQuality);resize();el('quality').textContent=`GRAPHICS: ${lowQuality?'PERFORMANCE':cinematicQuality?'CINEMATIC':'HIGH'}`;safeWrite('sf-night-run-quality',lowQuality?'low':cinematicQuality?'cinematic':'high');}
  function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
  function modal(id:string, open:boolean){el(id).classList.toggle('hidden',!open);if(open){lastFocus=document.activeElement as HTMLElement;el(id).querySelector<HTMLButtonElement>('button')?.focus();}else if(lastFocus?.isConnected){lastFocus.focus();}}
  function clearInputs(){keys.clear();touch.clear();document.querySelectorAll('.touch-button').forEach(b=>b.classList.remove('pressed'));}
  function syncPhase(){
    const inGame=phase!=='menu';app.classList.toggle('racing',inGame);
    ['intro','intro-bottom','edition'].forEach(id=>{el(id).setAttribute('aria-hidden',String(inGame));el(id).inert=inGame;});el('hud').setAttribute('aria-hidden',String(!inGame));
    ['intro','intro-bottom','edition'].forEach(id=>el(id).classList.toggle('faded',inGame));
    el('hud').classList.toggle('faded',!inGame||phase==='tour');el('hud').setAttribute('aria-hidden',String(!inGame||phase==='tour'));el('pause').classList.toggle('hidden',!inGame||phase==='finished'||phase==='tour');el('tour-ui').classList.toggle('hidden',phase!=='tour');
    el('pause-panel').classList.toggle('hidden',phase!=='paused');
    el('best').textContent=best?formatTime(best):'—';
  }
  function announce(title:string, detail:string, duration=2){el('message').querySelector('strong')!.textContent=title;el('message').querySelector('span')!.textContent=detail;el('message').classList.remove('faded');el('message').setAttribute('aria-hidden','false');messageUntil=totalTime+duration;}
  function updateCountdown(){
    const n=Math.max(1,Math.ceil(countdownLeft));
    if(n!==countdownNumber){countdownNumber=n;el('countdown').innerHTML=`<strong>${n}</strong><span>POWELL STREET · DOWNHILL SPRINT</span>`;audio.cue('count');}
  }
  function start(){
    clearInputs();sim.reset();topSpeed=0;phase='countdown';countdownLeft=3;countdownNumber=0;finishReveal=0;goUntil=0;cameraInitialized=false;shake=0;lastDistrict='';
    ['help','pause-panel','results'].forEach(id=>el(id).classList.add('hidden'));
    el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');el('countdown').classList.remove('hidden');el('drift-hint').classList.remove('active');
    void audio.unlock().then(()=>audio.cue('count'));updateCountdown();syncPhase();updateHud();canvas.focus();
  }
  function pause(){if(phase!=='racing'&&phase!=='countdown')return;previousPhase=phase;phase='paused';clearInputs();audio.suspend();syncPhase();el('resume').focus();}
  function resume(){if(phase!=='paused')return;phase=previousPhase;clearInputs();void audio.unlock();syncPhase();canvas.focus();}
  function menu(){phase='menu';finishReveal=0;goUntil=0;messageUntil=0;clearInputs();audio.suspend();['help','pause-panel','results','countdown'].forEach(id=>el(id).classList.add('hidden'));el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');el('drift-hint').classList.remove('active');cameraInitialized=false;syncPhase();el('start').focus();}
  function finish(){
    phase='finished';finishReveal=totalTime+.6;audio.suspend();audio.cue('finish');clearInputs();
    const s=sim.state, isBest=!best||s.elapsed<best;
    if(isBest){best=s.elapsed;safeWrite('sf-night-run-best-v1',String(best));}
    el('result-eyebrow').textContent=isBest?'NEW PERSONAL BEST / POWELL STREET':'POWELL STREET / COMPLETE';
    el('result-time').textContent=formatTime(s.elapsed);el('result-speed').textContent=`${Math.round(topSpeed*2.23694)} MPH`;el('result-drift').textContent=`${Math.round(s.distanceDrifted)} M`;el('result-hits').textContent=String(s.collisions);
    el('result-medal').textContent=s.elapsed<29?'GOLD':s.elapsed<35?'SILVER':s.elapsed<45?'BRONZE':'FINISHER';
    el('result-copy').textContent=s.collisions===0?'Clean streets, clean run. Try a little more boost next time.':'There’s always a cleaner line. Go find it.';
    el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');syncPhase();
  }
  function readInput():DriveInput{
    let throttle=(autoThrottle||keys.has('KeyW')||keys.has('ArrowUp')||touch.has('gas'))?1:0;
    let brake=(keys.has('KeyS')||keys.has('ArrowDown')||touch.has('brake'))?1:0;
    // Looking forward along +Z means screen-right is negative world X.
    let steer=((keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left'))?1:0)-((keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right'))?1:0);
    let drift=keys.has('Space')||touch.has('drift'),boost=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.has('boost');
    const pads=navigator.getGamepads?.();const pad=pads?Array.from(pads).find(p=>p?.connected):undefined;
    if(pad){
      const axis=pad.axes[0]||0;if(Math.abs(axis)>.14)steer=-axis;
      throttle=Math.max(throttle,pad.buttons[7]?.value||0);brake=Math.max(brake,pad.buttons[6]?.value||0);drift=drift||!!pad.buttons[2]?.pressed;boost=boost||!!pad.buttons[0]?.pressed;
      const down=!!pad.buttons[9]?.pressed;if(down&&!gamepadPauseDown){if(phase==='racing'||phase==='countdown')pause();else if(phase==='paused')resume();else if(phase==='menu'||phase==='finished')start();}gamepadPauseDown=down;
    }else{gamepadPauseDown=false;}
    if(autoThrottle&&brake>.1)throttle=0;
    return{throttle,brake,steer,drift,boost};
  }
  function updateHud(){
    const s=sim.state;el('timer').textContent=formatTime(s.elapsed);el('speed').textContent=String(Math.round(s.speed*2.23694));el('gear').textContent=s.speed<1?'N':String(Math.min(6,Math.floor(s.speed/10)+1));
    el('checkpoint').innerHTML=`${s.checkpoint} <em>/ 4</em>`;el('boost-fill').style.transform=`scaleX(${s.boost})`;
    const p=(s.progress-START_PROGRESS)/(TRACK_LENGTH-START_PROGRESS);el('progress-fill').style.transform=`scaleX(${p})`;
    el('distance').textContent=`${Math.max(0,(TRACK_LENGTH-s.progress)/1000).toFixed(1)} KM TO MARKET`;
    el('map-dot').setAttribute('cy',String(8+p*127));el('map-dot').setAttribute('cx',String(78+Math.sin(p*10)*2));
    const district=districtAt(s.progress);el('district').textContent=district.name;el('street').textContent=district.street;
    if(district.name!==lastDistrict){if(lastDistrict&&phase==='racing')announce(district.name,district.street,2);lastDistrict=district.name;}
  }
  function updateCamera(dt:number){
    const s=sim.state;
    if(phase==='tour'){const pose=tour.getPose();car.group.position.copy(pose.car);car.group.rotation.copy(pose.rotation);desiredCamera.copy(pose.camera);lookAt.copy(pose.look);camera.fov=60;}else if(phase==='menu'){
      const hero=sampleRoute(750),orbit=reduceMotion?0:Math.sin(totalTime*.08)*1.4;
      car.group.position.set(hero.x+1.8,hero.y+.03,hero.z);car.group.rotation.set(-Math.atan(routeSlope(750)),routeYaw(750),0);
      const cameraSide=1.8+(camera.aspect<1.2?1.1:2.5)*Math.min(camera.aspect,2.2);desiredCamera.set(hero.x+cameraSide+orbit*.12,hero.y+2.9,hero.z-8.8);lookAt.set(hero.x+cameraSide-.15,hero.y+1.5,hero.z+9.5);
      camera.fov=55;
    }else{
      const here=sampleRoute(s.progress),yaw=routeYaw(s.progress);car.group.position.set(here.x+s.lateral,s.y+.03,s.progress);
      const pitch=s.airborne?-Math.atan2(s.verticalVelocity,Math.max(s.speed,1)):-Math.atan(routeSlope(s.progress));
      car.group.rotation.x=THREE.MathUtils.damp(car.group.rotation.x,pitch,10,dt);car.group.rotation.y=yaw+s.driftAngle;car.group.rotation.z=THREE.MathUtils.damp(car.group.rotation.z,-s.driftAngle*.10,7,dt);
      const chaseDistance=cameraMode===1?6.3:10.2, chaseHeight=cameraMode===1?2.25:4.4;
      const behind=s.progress-chaseDistance, behindRoad=sampleRoute(behind),ahead=sampleRoute(s.progress+12);
      desiredCamera.set(here.x+s.lateral*.9-Math.sin(yaw)*chaseDistance,Math.max(s.y+chaseHeight,behindRoad.y+chaseHeight),behind);
      lookAt.set(ahead.x+s.lateral*.68,ahead.y+1.2+(s.y-here.y)*.4,s.progress+12);
      if(shake>.001&&!reduceMotion){desiredCamera.x+=(Math.random()-.5)*shake;desiredCamera.y+=(Math.random()-.5)*shake*.65;shake*=Math.exp(-8*dt);}
      const targetFov=(cameraMode===1?65:58)+(reduceMotion?0:s.speed*.12);camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,3,dt);
    }
    if(!cameraInitialized){camera.position.copy(desiredCamera);smoothedLook.copy(lookAt);cameraInitialized=true;}else{camera.position.lerp(desiredCamera,1-Math.exp(-7*dt));smoothedLook.lerp(lookAt,1-Math.exp(-8*dt));}
    if(phase!=='menu'){camera.position.z=desiredCamera.z;smoothedLook.z=lookAt.z;}
    camera.lookAt(smoothedLook);camera.updateProjectionMatrix();
    atmosphere.update(totalTime,phase==='menu'?750:phase==='tour'?tour.progress:sim.state.progress);
  }
  function updateSpray(dt:number,input:DriveInput){
    const s=sim.state;
    if(phase==='racing'&&s.speed>12&&!s.airborne){const amount=input.drift?4:1;for(let n=0;n<amount;n++){const i=particleCursor++%particleCount,j=i*3;ages[i]=0;positions[j]=car.group.position.x+(i%2?-.81:.81);positions[j+1]=s.y+.12;positions[j+2]=s.progress-1.5;velocities[j]=(Math.random()-.5)*1.4;velocities[j+1]=.25+Math.random()*.5;velocities[j+2]=-s.speed*.07;}}
    for(let i=0;i<particleCount;i++){ages[i]+=dt;const j=i*3;if(ages[i]>1){positions[j+1]=-1000;continue;}positions[j]+=velocities[j]*dt;positions[j+1]+=velocities[j+1]*dt;positions[j+2]+=velocities[j+2]*dt;}
    particleGeo.attributes.position.needsUpdate=true;
  }
  const controls=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
  window.addEventListener('keydown',event=>{
    if(controls.has(event.code)&&(phase==='racing'||phase==='countdown')){event.preventDefault();keys.add(event.code);}
    if(event.repeat)return;
    if(event.code==='Enter'&&el('help').classList.contains('hidden')){if(phase==='menu'&&document.activeElement?.tagName!=='BUTTON')start();else if(phase==='finished'&&document.activeElement?.tagName!=='BUTTON')start();}
    if(event.code==='Escape'){
      if(!el('help').classList.contains('hidden')){closeHelp();return;}
      if(phase==='tour')menu();else if(phase==='paused')resume();else if(phase==='racing'||phase==='countdown')pause();
    }
    if(event.code==='KeyR'&&(phase==='racing'||phase==='countdown'||phase==='paused'||phase==='finished'))start();
    if(event.code==='KeyC')cameraMode=(cameraMode+1)%2;
    if(event.code==='KeyM')toggleSound();
    // Keep keyboard focus inside an open dialog.
    if(event.code==='Tab'){
      const open=Array.from(document.querySelectorAll<HTMLElement>('.modal-layer')).find(p=>!p.classList.contains('hidden'));
      if(open){const buttons=Array.from(open.querySelectorAll<HTMLElement>('button'));const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    }
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));
  function pauseWhenAway(){clearInputs();if(phase==='racing'||phase==='countdown')pause();if(phase==='tour'){tour.paused=true;audio.suspend();el('tour-pause').textContent='RESUME';}}
  window.addEventListener('blur',pauseWhenAway);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseWhenAway();});
  window.addEventListener('resize',resize);
  canvas.tabIndex=-1;
  document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button=>{
    const control=button.dataset.control!;
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);touch.add(control);button.classList.add('pressed');});
    const release=()=>{touch.delete(control);button.classList.remove('pressed');};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  function toggleSound(){muted=!muted;audio.setMuted(muted);safeWrite('sf-night-run-muted',String(muted));updateSoundButton();if(!muted&&(phase==='racing'||phase==='tour'&&!tour.paused))void audio.unlock();}
  function closeHelp(){modal('help',false);if(helpWasPaused){helpWasPaused=false;resume();}}
  el('tour-start').onclick=()=>{phase='tour';tour.jump(38);tour.paused=false;el('tour-pause').textContent='PAUSE';clearInputs();cameraInitialized=false;void audio.unlock();syncPhase();};
  el('tour-exit').onclick=menu;el('tour-race').onclick=start;el('tour-pause').onclick=()=>{tour.paused=!tour.paused;el('tour-pause').textContent=tour.paused?'RESUME':'PAUSE';if(tour.paused)audio.suspend();else void audio.unlock();};
  document.querySelectorAll<HTMLButtonElement>('[data-stop]').forEach(button=>button.onclick=()=>{tour.jump(Number(button.dataset.stop));cameraInitialized=false;});
  let dragX:number|null=null;canvas.addEventListener('pointerdown',event=>{if(phase==='tour'){dragX=event.clientX;canvas.setPointerCapture(event.pointerId);}});canvas.addEventListener('pointermove',event=>{if(phase==='tour'&&dragX!==null){tour.orbit=THREE.MathUtils.clamp(tour.orbit-(event.clientX-dragX)*.004,-1.35,1.35);dragX=event.clientX;}});canvas.addEventListener('pointerup',()=>dragX=null);canvas.addEventListener('pointercancel',()=>dragX=null);
  el('start').onclick=start;el('again').onclick=start;el('restart').onclick=start;el('resume').onclick=resume;el('pause').onclick=()=>phase==='paused'?resume():pause();
  el('home').onclick=menu;el('pause-home').onclick=menu;el('result-home').onclick=menu;el('sound').onclick=toggleSound;
  el('how').onclick=()=>{helpWasPaused=phase==='racing'||phase==='countdown';if(helpWasPaused)pause();modal('help',true);};el('close-help').onclick=closeHelp;el('help-play').onclick=start;
  function updateAssist(){el('auto-throttle').textContent=`AUTO ACCELERATE: ${autoThrottle?'ON':'OFF'}`;el('auto-throttle').setAttribute('aria-pressed',String(autoThrottle));}
  el('auto-throttle').onclick=()=>{autoThrottle=!autoThrottle;safeWrite('sf-night-run-auto-throttle',String(autoThrottle));updateAssist();};updateAssist();
  el('reset-best').onclick=()=>{best=0;safeWrite('sf-night-run-best-v1','0');el('best').textContent='—';el('reset-best').textContent='BEST CLEARED';};
  el('quality').onclick=()=>{if(lowQuality){lowQuality=false;cinematicQuality=false;}else if(cinematicQuality){cinematicQuality=false;lowQuality=true;}else{cinematicQuality=true;}applyQuality();};
  el('fullscreen').onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void document.documentElement.requestFullscreen?.().catch(()=>{el('fullscreen').textContent='USE YOUR BROWSER’S FULLSCREEN';});};
  document.addEventListener('fullscreenchange',()=>el('fullscreen').textContent=document.fullscreenElement?'EXIT FULLSCREEN ↙':'FULLSCREEN ↗');
  updateSoundButton();applyQuality();syncPhase();updateCamera(1);atmosphere.bakeCityReflections(car.group);composer.render();
  el('loading').classList.add('faded');setTimeout(()=>el('loading').classList.add('hidden'),650);

  // Read-only diagnostics are handy when comparing browsers and performance settings.
  (window as typeof window&{sfNightRun?:unknown}).sfNightRun={get state(){return {...sim.state,phase};},get rendering(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}};
  function frame(now:number){
    requestAnimationFrame(frame);
    const dt=Math.min((now-lastTime)/1000,.25);lastTime=now;totalTime+=dt;uiClock+=dt;
    performanceFrames++;performanceTime+=dt;if(performanceTime>=1){canvas.dataset.fps=String(Math.round(performanceFrames/performanceTime));canvas.dataset.drawCalls=String(renderer.info.render.calls);performanceFrames=0;performanceTime=0;}
    const input=readInput();let raceDt=dt;if(phase==='tour'){
      tour.update(dt);
      if(!tour.paused){audio.update(11,.10,false,false);updateCitySound(tour.progress,tour.lateral);}
      el('tour-place').textContent=tour.progress>1160?'POWELL & MARKET':tour.progress>680&&tour.progress<960?'UNION SQUARE':tour.progress>=510&&tour.progress<=680?'BEACON GRAND':districtAt(tour.progress).name;
    }
    if(phase==='countdown'){
      countdownLeft-=dt;updateCountdown();audio.update(0,input.throttle*.25,false,false);
      if(countdownLeft<=0){raceDt=Math.max(0,-countdownLeft);phase='racing';audio.cue('go');el('countdown').innerHTML='<strong>GO.</strong><span>MAKE IT A GOOD ONE</span>';goUntil=totalTime+.8;syncPhase();}
    }
    if(phase==='racing'){
      const events=sim.update(raceDt,input);topSpeed=Math.max(topSpeed,sim.state.speed);
      for(const event of events){if(event==='checkpoint'&&!sim.state.finished){audio.cue('checkpoint');announce('CHECKPOINT',`${sim.state.checkpoint} OF 4 · ${formatTime(sim.state.elapsed)}`,1.6);}if(event==='crash'){audio.cue('crash');shake=.5;flashUntil=totalTime+.16;}if(event==='land'){shake=.3;}if(event==='finish')finish();}
      if(phase==='racing'){audio.update(sim.state.speed,input.throttle,input.drift&&Math.abs(sim.state.driftAngle)>.08,sim.boosting);updateCitySound(sim.state.progress,sim.state.lateral);}
    }
    if(goUntil&&totalTime>goUntil){el('countdown').classList.add('hidden');goUntil=0;}
    if(finishReveal&&totalTime>finishReveal){modal('results',true);finishReveal=0;}
    if(messageUntil&&totalTime>messageUntil){el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');messageUntil=0;}
    el('flash').classList.toggle('hit',totalTime<flashUntil);
    el('drift-hint').classList.toggle('active',phase==='racing'&&(sim.state.airborne||(input.drift&&sim.state.speed>10&&Math.abs(sim.state.driftAngle)>.1)));
    el('drift-hint').textContent=sim.state.airborne?'AIR TIME':'DRIFTING';el('drift-hint').setAttribute('aria-hidden',String(!el('drift-hint').classList.contains('active')));
    document.querySelector('.speed-vignette')!.classList.toggle('active',phase==='racing'&&sim.boosting);
    if(phase!=='paused')updateCamera(dt);
    if(phase!=='paused'){car.update(dt,{speed:phase==='menu'?0:phase==='tour'?(tour.paused?0:11):sim.state.speed,steer:input.steer,braking:input.brake>.1,boosting:phase==='racing'&&sim.boosting,time:totalTime});updateSpray(dt,input);}
    const cityProgress=phase==='menu'?750:phase==='tour'?tour.progress:sim.state.progress;
    world.update(totalTime,cityProgress);landmarks.update(totalTime,cityProgress);streetLife.update(totalTime,cityProgress);cityLife.update(totalTime,cityProgress);vegetation.update(totalTime,cityProgress);
    if(uiClock>.05){uiClock=0;if(phase!=='menu'&&phase!=='tour')updateHud();}
    renderer.info.reset();if(lowQuality)renderer.render(scene,camera);else composer.render();
  }
  requestAnimationFrame(frame);
}
boot().catch(error=>{console.error(error);el('loading').innerHTML='<div class="no-webgl"><h2>The city couldn’t load.</h2><p>Please reload to try again.</p><button class="primary" onclick="location.reload()">RELOAD ↗</button></div>';});

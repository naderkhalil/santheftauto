import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createAtmosphere } from './atmosphere';
import { upgradeRoadSurface } from './surfaces';
import { createCityLoop } from './city-loop';
import { createUnionSquare } from './union-square';
import { createSquareStreetDetails } from './square-street-details';
import { createChinatown } from './chinatown';
import { createCar } from './car';
import { GameAudio } from './audio';
import { DrivingSimulation } from './driving';
import type { DriveInput } from './driving';
import { sampleRoute, routePoint, routeFrame, groundHeight, routeYaw, routeSlope, routeProgressAt, districtAt, CHECKPOINTS, ROUTE_STOPS, TRACK_LENGTH, START_PROGRESS } from './route';
import { CityTour } from './tour';
import { createSkyCourse } from './skycourse';
import { flightView } from './flight-view';
import { createWaterfront } from './waterfront';
import { createBayBridge } from './baybridge';
import { createCityRoot, setCameraFromCity, steeringFromControls } from './coordinates';
import { cityMapSvg } from './city-map';
import './style.css';

const speakerIcon = `<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>`;
const muteIcon = `<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4zM16 9l6 6m0-6-6 6"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>`;
const mapPoint = (p:{x:number;z:number}) => ({x:18+(p.x+85)*.157,y:134-(p.z+90)*.157});
const mapPath = Array.from({length:240},(_,i)=>{const p=mapPoint(sampleRoute(TRACK_LENGTH*i/239));return `${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;}).join(' ');
const mapSvg = `<svg class="minimap" viewBox="0 0 150 145" aria-label="Union Square, Powell and Grant Avenue route map"><path class="map-grid" d="M20 5v136M43 0v145M59 0v145M78 0v145M96 0v145M124 0v145M0 11h150M0 27h150M0 43h150M0 73h150M0 92h150M0 111h150M0 130h150"/><rect class="map-square" x="22" y="112" width="18" height="15"/><path class="map-course" d="${mapPath}"/><circle id="map-dot" class="map-progress" cx="22" cy="111" r="4"/></svg>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<canvas id="world" aria-label="3D San Francisco racing game"></canvas>
<div class="shade"></div><div class="race-shade"></div><div class="speed-vignette"></div><div class="grain"></div>
<header class="topbar">
  <button class="brand" id="home" aria-label="Return to main menu"><span class="brand-mark">SF</span><span class="brand-word">WHIMSICAL<br>SAN FRANCISCO</span></button>
  <div class="top-actions"><span class="weather"><span class="weather-dot"></span> SUNSHINE <span style="opacity:.4">/</span> ZERO GRAVITY</span><button class="icon-button" id="sound" aria-label="Mute sound">${speakerIcon}</button><button class="icon-button hidden" id="pause" aria-label="Pause race">${pauseIcon}</button></div>
</header>
<main class="intro" id="intro">
  <div class="eyebrow">A SAN FRANCISCO DAYDREAM</div>
  <h1>HILLS.<br><span>THRILLS.</span><br><i>NO GRAVITY.</i></h1>
  <p class="intro-copy">Big hills. Little car. Wild imagination.<br>Lap Union Square. Climb Powell. Fly down Grant.<br>Fall in love with San Francisco all over again.</p>
  <div class="intro-actions"><button class="primary" id="start">TAKE FLIGHT <span class="arrow">↗</span></button><button class="text-button" id="how">HOW TO PLAY</button></div>
  <div class="keyboard-note"><button class="text-button" id="tour-start">WATCH A RUN ↗</button><span></span> LET THE CITY SWEEP YOU AWAY.</div>
</main>
<footer class="intro-bottom" id="intro-bottom">
  <button class="route-card" id="open-city-map" aria-label="Open San Francisco city map and race route" aria-haspopup="dialog" aria-controls="city-map-dialog">
    <span class="route-details"><span class="route-index">01</span><span class="route-text"><small>POSTCARD 01</small><strong>THE CITY LOOP</strong><em>2.3 KM &nbsp; / &nbsp; 3 HILL FLIGHTS</em></span><span class="route-map-prompt">EXPLORE THE CITY <span>↗</span></span></span>
    <span class="route-map-preview">${cityMapSvg('postcard')}<span class="route-map-expand" aria-hidden="true">⤢</span></span>
  </button>
  <div class="location-label"><strong><i>↗</i> SAN FRANCISCO, REIMAGINED</strong><span>UNION SQUARE → CHINATOWN → THE BAY</span></div>
</footer>
<div class="modal-layer hidden city-map-dialog" id="city-map-dialog" role="dialog" aria-modal="true" aria-labelledby="city-map-title">
  <section class="city-map-panel">
    <header class="city-map-header"><div><small>POSTCARD 01 &nbsp; / &nbsp; THE CITY LOOP</small><h2 id="city-map-title">A little city. A big adventure.</h2></div><button id="close-city-map" aria-label="Close city map">×</button></header>
    <div class="city-map-art">${cityMapSvg('expanded',true)}</div>
    <div class="city-map-pan-hint">SWIPE TO EXPLORE THE MAP <span>↔</span></div>
    <div class="city-map-itinerary" aria-label="Route highlights"><span><b>01</b> Union Square</span><i>→</i><span><b>02</b> Powell Street</span><i>→</i><span><b>03</b> Chinatown</span><i>→</i><span><b>04</b> The waterfront</span></div>
    <footer class="city-map-footer"><div><strong><i></i> YOUR ROUTE THROUGH SAN FRANCISCO</strong><span>2.3 km of city streets. Three hills with wings.</span></div><button class="primary" id="city-map-play">TAKE FLIGHT <span class="arrow">↗</span></button></footer>
  </section>
</div>
<div class="edition" id="edition">WHIMSICAL SF &nbsp; / &nbsp; VOL. 001</div>
<div class="race-hud faded" id="hud">
  <div class="race-top"><div class="stat"><span class="label">YOUR TIME</span><span class="stat-value" id="timer">00:00.00</span></div><div class="stat"><span class="label">PERSONAL BEST</span><span class="stat-value" id="best">—</span></div><div class="stat"><span class="label">CHECKPOINT</span><span class="stat-value" id="checkpoint">0 <em>/ 4</em></span></div></div>
  <div class="hud-route">${mapSvg}<div class="district-name" id="district">UNION SQUARE</div><div class="street-name" id="street">POST STREET</div></div>
  <div class="progress-bar"><div class="progress-track"><div class="progress-fill" id="progress-fill"></div><i class="progress-tick" style="left:24.2%"></i><i class="progress-tick" style="left:49.2%"></i><i class="progress-tick" style="left:75%"></i></div><div class="progress-label"><span>UNION SQUARE</span><span id="distance">2.3 KM TO MARKET</span></div></div>
  <div class="speedometer"><div class="gear">GEAR <span id="gear">N</span></div><div class="speed-row"><span class="speed" id="speed">0</span><span class="speed-units">MPH</span></div><div class="boost-track"><div class="boost-fill" id="boost-fill"></div></div><div class="boost-label"><span>BOOST</span><kbd>SHIFT</kbd></div></div>
</div>
<div class="flight-hud" id="flight-hud" aria-hidden="true"><span class="flight-icon">✧</span><div><small id="flight-mode">HOVER DRIVE</small><strong id="flight-height">0 <em>M UP</em></strong></div><div class="flight-time" id="flight-time">0.0<small>SECONDS OF MAGIC</small></div></div><div class="drift-hint" id="drift-hint">DRIFTING</div>
<div class="countdown hidden" id="countdown" aria-live="polite"></div>
<div class="race-message faded" id="message" aria-live="polite" aria-hidden="true"><strong></strong><span></span></div>
<div class="race-flash" id="flash"></div><div class="tour-ui hidden" id="tour-ui"><div class="tour-caption"><span id="tour-mode">POSTCARD MODE / AUTOPILOT</span><strong id="tour-place">UNION SQUARE</strong><small>Drag to look around</small></div><div class="tour-stops" style="overflow-x:auto;white-space:nowrap"><button data-stop="35" data-scene="square">UNION SQUARE</button><button data-stop="${routeProgressAt(-75,-15)}" data-scene="westin">THE WESTIN</button><button data-stop="${routeProgressAt(45,65)}" data-scene="post" aria-label="POST STREET">POST ST</button><button data-stop="${ROUTE_STOPS.powell}">POWELL ST</button><button data-stop="${ROUTE_STOPS.grant-8}">GRANT AVE</button><button data-stop="${TRACK_LENGTH}">THE BAY</button></div><div class="tour-actions"><button id="tour-pause">PAUSE</button><button id="tour-race">LET’S RACE ↗</button><button id="tour-exit" aria-label="Exit scenic drive">×</button></div></div>
<div class="touch-controls"><div class="touch-group"><button class="touch-button" data-control="left" aria-label="Steer left">‹</button><button class="touch-button" data-control="right" aria-label="Steer right">›</button><button class="touch-button small" data-control="drift" aria-label="Handbrake drift">DRIFT</button></div><div class="touch-group"><button class="touch-button small" data-control="boost" aria-label="Boost">N₂O</button><button class="touch-button small" data-control="brake" aria-label="Brake">BRAKE</button><button class="touch-button gas" data-control="gas" aria-label="Accelerate">GAS</button></div></div>
<div class="modal-layer hidden" id="help" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="panel"><button class="panel-close" id="close-help" aria-label="Close instructions">×</button><div class="panel-eyebrow">A LITTLE LOCAL KNOWLEDGE</div><h2 id="help-title">THE HILLS<br>HAVE WINGS.</h2><p>Lap Union Square, climb Powell, and enter Chinatown through the Dragon Gate on Grant Avenue. Hold the accelerator to build speed, ease off or brake before corners, and steer all the way through each turn. Build speed up the three hills, then launch. Your wheels fold flat automatically: steer through the sky, collect sun rings, and touch down with a boost refill.</p><div class="control-list"><div class="control-item"><div class="keys"><kbd>W</kbd><kbd>↑</kbd></div>Hold to accelerate</div><div class="control-item"><div class="keys"><kbd>S</kbd><kbd>↓</kbd></div>Brake</div><div class="control-item"><div class="keys"><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd></div>Steer · on road & in air</div><div class="control-item"><div class="keys"><kbd>SPACE</kbd></div>Hold to drift</div><div class="control-item"><div class="keys"><kbd>SHIFT</kbd></div>Boost · recharges</div><div class="control-item"><div class="keys"><kbd>R</kbd><kbd>ESC</kbd><kbd>C</kbd></div>Restart · pause · camera</div></div><p class="help-caption">Controller: left stick to steer, RT to accelerate, LT to brake, A to boost, X to drift, Menu to pause. Touch controls appear on touchscreens. Wheels deploy automatically above 54 mph at a launch. Brake to dive; boost to gain lift. Auto Accelerate holds the gas for you; you still steer and brake. Watch a Run demonstrates the course; drag to look around.</p><div class="settings-row"><button id="quality">GRAPHICS: HIGH</button><span>/</span><button id="fullscreen">FULLSCREEN ↗</button></div><div class="settings-row" style="margin-top:12px;padding-top:12px"><button id="auto-throttle" aria-pressed="false">AUTO ACCELERATE: OFF</button><span>/</span><button id="reset-best">RESET BEST</button></div><button class="primary" id="help-play">LET’S DRIVE <span class="arrow">↗</span></button></div></div>
<div class="modal-layer hidden" id="pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="panel"><div class="panel-eyebrow">TAKE A BREATHER</div><h2 id="pause-title">CITY ON<br>STANDBY.</h2><p>Your run is paused. The clock can wait.</p><button class="primary" id="resume">BACK TO THE RUN <span class="arrow">↗</span></button><button class="secondary" id="restart">RESTART RACE</button><button class="secondary" id="pause-home">MAIN MENU</button></div></div>
<div class="bay-caption" id="bay-caption" aria-hidden="true"><small>YOU MADE IT TO THE WATER</small><strong>San Francisco Bay.</strong><span>FERRY BUILDING &nbsp; / &nbsp; BAY BRIDGE</span></div><div class="modal-layer hidden" id="results" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="panel"><div class="panel-eyebrow" id="result-eyebrow">POWELL STREET / COMPLETE</div><h2 id="result-title">THAT’S<br>A RUN.</h2><div class="result-main"><div><div class="label" style="margin-bottom:8px">YOUR FINISH TIME</div><div class="result-time" id="result-time">00:00.00</div></div><div class="result-medal" id="result-medal">FINISHER</div></div><div class="result-stats"><div><span class="label">TOP SPEED</span><strong id="result-speed">0 MPH</strong></div><div><span class="label">TIME IN THE SKY</span><strong id="result-drift">0 M</strong></div><div><span class="label">CONTACTS</span><strong id="result-hits">0</strong></div></div><p id="result-copy">There’s always a cleaner line. Go find it.</p><button class="primary" id="again">ONE MORE RUN <span class="arrow">↗</span></button><button class="secondary" id="result-home">BACK TO THE CITY</button></div></div>
<div class="loading" id="loading"><span class="brand-mark">SF</span><p>BENDING THE CITY</p><div class="loading-line"></div></div>`;

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
  document.querySelectorAll<HTMLElement>('.progress-tick').forEach((tick,i)=>tick.style.left=`${CHECKPOINTS[i]/TRACK_LENGTH*100}%`);
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
  // The authored map/physics use north +Z; the visible city uses north -Z.
  // Reflect geometry once, while every camera remains outside this root.
  const cityRoot = createCityRoot(); scene.add(cityRoot);
  const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .15, 4200);
  const atmosphere=createAtmosphere(renderer,scene,camera);
  const world = createCityLoop(cityRoot);
  const landmarks=createUnionSquare(cityRoot),chinatown=createChinatown(cityRoot);
  // This new kit already uses the physical world axes and readable lettering.
  const squareStreetDetails=createSquareStreetDetails(scene);
  const bayStage=new THREE.Group();bayStage.rotation.y=Math.PI/2;bayStage.position.set(-750,0,250);cityRoot.add(bayStage);
  const waterfront=createWaterfront(bayStage);createBayBridge(bayStage);
  await Promise.all([upgradeRoadSurface(scene,renderer),atmosphere.loadPhotographicSky(),landmarks.ready,world.ready,squareStreetDetails.ready]);
  const car = createCar(); cityRoot.add(car.group);
  const heroFill=new THREE.PointLight('#ffe8c8',100,26,2);cityRoot.add(heroFill);
  const sim = new DrivingSimulation(world.obstacles);
  const audio = new GameAudio();
  const skyCourse=createSkyCourse(cityRoot);
  const cableCars=world.obstacles.filter(obstacle=>obstacle.kind==='cablecar');
  const soundedCableCars=new Set<number>();
  let previousSoundProgress=0;
  function updateCitySound(progress:number,lateral:number){
    if(progress<previousSoundProgress||Math.abs(progress-previousSoundProgress)>60)soundedCableCars.clear();
    previousSoundProgress=progress;
    for(const cable of cableCars){
      if(soundedCableCars.has(cable.progress))continue;
      const distance=Math.hypot(cable.progress-progress,cable.lateral-lateral);
      if(distance<32){audio.cableBell(distance,(cable.lateral-lateral)/9);soundedCableCars.add(cable.progress);}
    }
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const ao=new GTAOPass(scene,camera,innerWidth,innerHeight);ao.blendIntensity=.45;ao.updateGtaoMaterial({radius:1.05,thickness:.75,distanceExponent:1.6,samples:8});ao.updatePdMaterial({radius:4,rings:2,samples:8});
  // GTAO's normal override cannot reproduce glass transparency or leaf alpha
  // masks. Omit those surfaces from AO instead of treating panes and leaf cards
  // as solid occluders. All mesh-producing assets have resolved above; only dust
  // Points are added below, and GTAO already excludes those itself.
  const aoExcludedMeshes:THREE.Mesh[]=[];
  scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.length&&materials.every(material=>material.transparent||material.alphaTest>0))aoExcludedMeshes.push(object);
  });
  const aoHiddenMeshes:THREE.Mesh[]=[];
  const renderAO=ao.render.bind(ao);
  ao.render=(activeRenderer,writeBuffer,readBuffer,deltaTime,maskActive)=>{
    const shadowAutoUpdate=activeRenderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate=activeRenderer.shadowMap.needsUpdate;
    // The preceding RenderPass already refreshed this frame's shadows. GTAO
    // otherwise redraws the entire city's shadow map for its unlit normal pass.
    activeRenderer.shadowMap.autoUpdate=false;
    activeRenderer.shadowMap.needsUpdate=false;
    try{
      for(const mesh of aoExcludedMeshes){
        if(!mesh.visible)continue;
        mesh.visible=false;aoHiddenMeshes.push(mesh);
      }
      renderAO(activeRenderer,writeBuffer,readBuffer,deltaTime,maskActive);
    }finally{
      for(const mesh of aoHiddenMeshes)mesh.visible=true;
      aoHiddenMeshes.length=0;
      activeRenderer.shadowMap.autoUpdate=shadowAutoUpdate;
      activeRenderer.shadowMap.needsUpdate=shadowNeedsUpdate;
    }
  };
  const resizeAO=ao.setSize.bind(ao);ao.setSize=(w,h)=>resizeAO(Math.ceil(w*.55),Math.ceil(h*.55));composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.12,.38,1.55);
  composer.addPass(bloom);
  const grade=new ShaderPass({uniforms:{tDiffuse:{value:null},lens:{value:.18}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;uniform float lens;varying vec2 vUv;void main(){vec2 p=vUv*2.-1.;float r2=dot(p,p);vec2 uv=.5+.5*p*(1.-lens+ lens*r2*.48);vec3 c=texture2D(tDiffuse,clamp(uv,vec2(.001),vec2(.999))).rgb;float l=dot(c,vec3(.2126,.7152,.0722));c=max(vec3(0.),mix(vec3(l),c,1.22));c=pow(c,vec3(1.025))*1.025;c*=1.-dot(p,p)*.022;gl_FragColor=vec4(c,1.);}'});composer.addPass(grade);
  const smaa=new SMAAPass();composer.addPass(smaa);composer.addPass(new OutputPass());

  // Subtle road dust makes tire movement readable without obscuring the street.
  const particleCount=120, positions=new Float32Array(particleCount*3), ages=new Float32Array(particleCount).fill(3), velocities=new Float32Array(particleCount*3);
  const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const sprayCanvas=document.createElement('canvas');sprayCanvas.width=sprayCanvas.height=32;const sprayCtx=sprayCanvas.getContext('2d')!;const sprayGradient=sprayCtx.createRadialGradient(16,16,0,16,16,16);sprayGradient.addColorStop(0,'rgba(255,255,255,.7)');sprayGradient.addColorStop(.35,'rgba(255,255,255,.3)');sprayGradient.addColorStop(1,'rgba(255,255,255,0)');sprayCtx.fillStyle=sprayGradient;sprayCtx.fillRect(0,0,32,32);
  const particleMat=new THREE.PointsMaterial({map:new THREE.CanvasTexture(sprayCanvas),color:0xc5d9dd,size:.4,transparent:true,opacity:.045,depthWrite:false,sizeAttenuation:true});
  const spray=new THREE.Points(particleGeo,particleMat);spray.frustumCulled=false;cityRoot.add(spray);let particleCursor=0;

  type Phase = 'menu'|'countdown'|'racing'|'paused'|'finished'|'tour';
  const tour=new CityTour(world.obstacles);
  type TourScene = 'square'|'westin'|'post';
  let tourArt:TourScene|null=null;
  const tourSceneNames:Record<TourScene,string>={square:'UNION SQUARE',westin:'THE WESTIN ST. FRANCIS',post:'POST STREET'};
  let phase:Phase='menu', previousPhase:Phase='racing', countdownLeft=3, countdownNumber=0;
  let topSpeed=0, best=Number(safeRead('whimsical-sf-manual-driving-best-v2'))||0, muted=safeRead('sf-night-run-muted')==='true';
  let autoThrottle=safeRead('sf-night-run-auto-throttle')==='true';
  let cinematicQuality=safeRead('sf-night-run-quality')==='cinematic';
  let lowQuality=safeRead('sf-night-run-quality')==='low', cameraMode=0, totalTime=0, lastTime=performance.now(), uiClock=0, messageUntil=0, flashUntil=0;
  let landingPulse=0, collectedRings=0, presentedLaunches=0, finishedAt=0, tourBayStarted:number|null=null;
  const finishCameraStart=new THREE.Vector3(),finishLookStart=new THREE.Vector3();
  const bayCamera=new THREE.Vector3(640,45,250),bayLook=new THREE.Vector3(845,25,250);
  let lastDistrict='', gamepadPauseDown=false, shake=0, helpWasPaused=false, goUntil=0, finishReveal=0;
  const keys=new Set<string>(), touch=new Set<string>();
  const desiredCamera=new THREE.Vector3(), cityCameraPosition=new THREE.Vector3(), lookAt=new THREE.Vector3(), smoothedLook=new THREE.Vector3();
  let cameraInitialized=false, performanceFrames=0, performanceTime=0;
  let lastFocus:HTMLElement|null=null;
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  audio.setMuted(muted);
  function updateSoundButton(){el('sound').innerHTML=muted?muteIcon:speakerIcon;el('sound').setAttribute('aria-label',muted?'Unmute sound':'Mute sound');el('sound').setAttribute('aria-pressed',String(muted));}
  function applyQuality(){renderer.setPixelRatio(Math.min(devicePixelRatio,lowQuality?1:cinematicQuality?1.6:1.25));renderer.shadowMap.enabled=!lowQuality;grade.uniforms.lens.value=reduceMotion?.02:.065;smaa.enabled=!lowQuality;bloom.enabled=!lowQuality;ao.enabled=!lowQuality;world.setQuality?.(lowQuality);landmarks.setQuality?.(lowQuality);squareStreetDetails.setQuality(lowQuality);chinatown.setQuality(lowQuality);waterfront.setQuality?.(lowQuality);atmosphere.setQuality(lowQuality,cinematicQuality);resize();el('quality').textContent=`GRAPHICS: ${lowQuality?'PERFORMANCE':cinematicQuality?'CINEMATIC':'HIGH'}`;safeWrite('sf-night-run-quality',lowQuality?'low':cinematicQuality?'cinematic':'high');}
  function resize(){
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
    // Scenic stops scroll as one row on small screens. On wider screens,
    // reserve the action buttons' actual width so both groups remain usable.
    const stops=document.querySelector<HTMLElement>('.tour-stops')!;
    const actions=document.querySelector<HTMLElement>('.tour-actions')!;
    stops.style.maxWidth=innerWidth>760?`${Math.max(250,innerWidth-104-actions.getBoundingClientRect().width)}px`:'';
  }
  function modal(id:string, open:boolean){el(id).classList.toggle('hidden',!open);if(open){lastFocus=document.activeElement as HTMLElement;el(id).querySelector<HTMLButtonElement>('button')?.focus();}else if(lastFocus?.isConnected){lastFocus.focus();}}
  function clearInputs(){keys.clear();touch.clear();document.querySelectorAll('.touch-button').forEach(b=>b.classList.remove('pressed'));}
  function syncPhase(){
    const inGame=phase!=='menu';app.classList.toggle('racing',inGame);app.classList.toggle('at-finish',phase==='finished');el('bay-caption').setAttribute('aria-hidden',String(phase!=='finished'));
    ['intro','intro-bottom','edition'].forEach(id=>{el(id).setAttribute('aria-hidden',String(inGame));el(id).inert=inGame;});el('hud').setAttribute('aria-hidden',String(!inGame));
    ['intro','intro-bottom','edition'].forEach(id=>el(id).classList.toggle('faded',inGame));
    el('hud').classList.toggle('faded',!inGame||phase==='tour'||phase==='finished');el('hud').setAttribute('aria-hidden',String(!inGame||phase==='tour'||phase==='finished'));el('pause').classList.toggle('hidden',!inGame||phase==='finished'||phase==='tour');el('tour-ui').classList.toggle('hidden',phase!=='tour');
    el('pause-panel').classList.toggle('hidden',phase!=='paused');
    el('best').textContent=best?formatTime(best):'—';
  }
  function announce(title:string, detail:string, duration=2){el('message').querySelector('strong')!.textContent=title;el('message').querySelector('span')!.textContent=detail;el('message').classList.remove('faded');el('message').setAttribute('aria-hidden','false');messageUntil=totalTime+duration;}
  function updateCountdown(){
    const n=Math.max(1,Math.ceil(countdownLeft));
    if(n!==countdownNumber){countdownNumber=n;el('countdown').innerHTML=`<strong>${n}</strong><span>CITY LOOP · HILLS HAVE WINGS</span>`;audio.cue('count');}
  }
  function start(){
    clearInputs();tourArt=null;sim.reset();skyCourse.reset();collectedRings=0;landingPulse=0;presentedLaunches=0;topSpeed=0;phase='countdown';countdownLeft=3;countdownNumber=0;finishReveal=0;goUntil=0;cameraInitialized=false;shake=0;lastDistrict='';
    ['help','pause-panel','results','city-map-dialog'].forEach(id=>el(id).classList.add('hidden'));
    el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');el('countdown').classList.remove('hidden');el('drift-hint').classList.remove('active');
    void audio.unlock().then(()=>audio.cue('count'));updateCountdown();syncPhase();updateHud();canvas.focus();
  }
  function pause(){if(phase!=='racing'&&phase!=='countdown')return;previousPhase=phase;phase='paused';clearInputs();audio.suspend();syncPhase();el('resume').focus();}
  function resume(){if(phase!=='paused')return;phase=previousPhase;clearInputs();void audio.unlock();syncPhase();canvas.focus();}
  function menu(){phase='menu';tourArt=null;skyCourse.reset();finishReveal=0;goUntil=0;messageUntil=0;clearInputs();audio.suspend();['help','pause-panel','results','countdown','city-map-dialog'].forEach(id=>el(id).classList.add('hidden'));el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');el('drift-hint').classList.remove('active');cameraInitialized=false;syncPhase();el('start').focus();}
  function finish(){
    phase='finished';finishedAt=totalTime;finishCameraStart.copy(cityCameraPosition);finishLookStart.copy(smoothedLook);finishReveal=totalTime+4.4;audio.suspend();audio.cue('finish');clearInputs();
    const s=sim.state, isBest=!best||s.elapsed<best;
    if(isBest){best=s.elapsed;safeWrite('whimsical-sf-manual-driving-best-v2',String(best));}
    el('result-eyebrow').textContent=isBest?'NEW PERSONAL BEST / CITY LOOP':'SAN FRANCISCO / CITY LOOP';
    el('result-time').textContent=formatTime(s.elapsed);el('result-speed').textContent=`${Math.round(topSpeed*2.23694)} MPH`;el('result-drift').textContent=`${s.totalAirTime.toFixed(1)} SEC`;el('result-hits').textContent=String(s.collisions);
    el('result-medal').textContent=s.elapsed<63?'GOLD':s.elapsed<76?'SILVER':s.elapsed<95?'BRONZE':'FINISHER';
    el('result-copy').textContent=`${s.launches} flights. ${collectedRings} sun rings. ${s.collisions===0?'A little San Francisco magic.':'The sky is calling. Go again.'}`;
    el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');syncPhase();
  }
  function readInput():DriveInput{
    let throttle=(autoThrottle||keys.has('KeyW')||keys.has('ArrowUp')||touch.has('gas'))?1:0;
    let brake=(keys.has('KeyS')||keys.has('ArrowDown')||touch.has('brake'))?1:0;
    const left=keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left');
    const right=keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right');
    let steer=steeringFromControls(left,right);
    let drift=keys.has('Space')||touch.has('drift'),boost=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.has('boost');
    // Ignore unrecognized controller mappings and resting trigger noise.
    const pads=navigator.getGamepads?.();const pad=pads?Array.from(pads).find(p=>p?.connected&&p.mapping==='standard'):undefined;
    if(pad){
      steer=steeringFromControls(left,right,pad.axes[0]||0);
      const trigger=(index:number)=>{const value=pad.buttons[index]?.value??0;return Number.isFinite(value)?THREE.MathUtils.clamp((value-.08)/.92,0,1):0;};
      throttle=Math.max(throttle,trigger(7));brake=Math.max(brake,trigger(6));drift=drift||!!pad.buttons[2]?.pressed;boost=boost||!!pad.buttons[0]?.pressed;
      const down=!!pad.buttons[9]?.pressed;if(down&&!gamepadPauseDown){if(phase==='racing'||phase==='countdown')pause();else if(phase==='paused')resume();else if(phase==='menu'||phase==='finished')start();}gamepadPauseDown=down;
    }else{gamepadPauseDown=false;}
    if(autoThrottle&&brake>.1)throttle=0;
    return{throttle,brake,steer,drift,boost};
  }
  function updateHud(){
    const s=sim.state;el('timer').textContent=formatTime(s.elapsed);el('speed').textContent=String(Math.round(s.speed*2.23694));el('gear').textContent=s.airborne?'✧':s.speed<1?'N':String(Math.min(6,Math.floor(s.speed/10)+1));
    canvas.dataset.airborne=String(s.airborne);canvas.dataset.glide=s.glide.toFixed(2);canvas.dataset.altitude=s.altitude.toFixed(1);canvas.dataset.launches=String(s.launches);canvas.dataset.progress=s.progress.toFixed(1);canvas.dataset.airTime=s.totalAirTime.toFixed(1);
    el('checkpoint').innerHTML=`${s.checkpoint} <em>/ 4</em>`;el('boost-fill').style.transform=`scaleX(${s.boost})`;
    const p=(s.progress-START_PROGRESS)/(TRACK_LENGTH-START_PROGRESS);el('progress-fill').style.transform=`scaleX(${p})`;
    el('distance').textContent=`${Math.max(0,(TRACK_LENGTH-s.progress)/1000).toFixed(1)} KM TO MARKET`;
    const map=mapPoint(sampleRoute(s.progress));el('map-dot').setAttribute('cy',String(map.y));el('map-dot').setAttribute('cx',String(map.x));
    const district=districtAt(s.progress);el('district').textContent=district.name;el('street').textContent=district.street;
    if(district.name!==lastDistrict){if(lastDistrict&&phase==='racing')announce(district.name,district.street,2);lastDistrict=district.name;}
  }
  function updateCamera(dt:number){
    const s=sim.state;
    if(phase==='finished'){
      const here=routePoint(s.progress,s.lateral);car.group.position.set(here.x,s.y+.03,here.z);car.group.rotation.set(-Math.atan(routeSlope(s.progress)),s.heading,0);
      const u=reduceMotion?1:THREE.MathUtils.clamp((totalTime-finishedAt)/4.2,0,1),ease=u*u*u*(u*(u*6-15)+10);
      desiredCamera.copy(finishCameraStart).lerp(bayCamera,ease);desiredCamera.y+=Math.sin(u*Math.PI)*7;lookAt.copy(finishLookStart).lerp(bayLook,ease);
      camera.fov=THREE.MathUtils.damp(camera.fov,camera.aspect<.65?82:camera.aspect<1?65:58,3,dt);
    }else if(phase==='tour'){
      const pose=tour.getPose();car.group.position.copy(pose.car);car.group.rotation.copy(pose.rotation);
      if(tour.progress>=TRACK_LENGTH-1){
        const u=tourBayStarted===null||reduceMotion?1:THREE.MathUtils.clamp((totalTime-tourBayStarted)/4.2,0,1),ease=u*u*u*(u*(u*6-15)+10);
        desiredCamera.copy(finishCameraStart).lerp(bayCamera,ease);desiredCamera.y+=Math.sin(u*Math.PI)*7;
        lookAt.copy(finishLookStart).lerp(bayLook,ease);lookAt.z-=Math.sin(tour.orbit)*90*ease;
        camera.fov=THREE.MathUtils.damp(camera.fov,camera.aspect<.65?82:camera.aspect<1?65:58,3,dt);
      }
      else if(tourArt==='westin'){
        desiredCamera.set(-18+Math.sin(tour.orbit)*22,31,-25+Math.cos(tour.orbit)*4);lookAt.set(-104,43,0);camera.fov=camera.aspect<.7?76:62;
      }else if(tourArt==='square'){
        const angle=tour.orbit*.28,portrait=camera.aspect<.7?1.18:1;
        desiredCamera.set((105*Math.cos(angle)+112*Math.sin(angle))*portrait,115+(portrait-1)*72,(105*Math.sin(angle)-112*Math.cos(angle))*portrait);
        lookAt.set(-6,34,7);camera.fov=camera.aspect<.7?82:camera.aspect<1.2?70:58;
      }else if(tourArt==='post'){
        // The glass store stays at street scale while the Hyatt rises behind it.
        desiredCamera.set(12+Math.sin(tour.orbit*.35)*12,29,51+(1-Math.cos(tour.orbit*.35))*8);
        lookAt.set(43,38,102);camera.fov=camera.aspect<.7?78:70;
      }
      else{desiredCamera.copy(pose.camera);lookAt.copy(pose.look);camera.fov=72;}
    }else if(phase==='menu'){
      const hero=routePoint(40,1.3);car.group.position.set(hero.x,hero.y+.05,hero.z);car.group.rotation.set(0,routeYaw(40),0);
      const orbit=reduceMotion?0:Math.sin(totalTime*.055)*10;
      desiredCamera.set(35+orbit*.28,42,-45);lookAt.set(-86,47,-36);
      camera.fov=camera.aspect<.7?76:camera.aspect<1.2?64:56;
    }else{
      const here=routePoint(s.progress,s.lateral),frame=routeFrame(s.progress),yaw=s.heading;
      car.group.position.set(here.x,s.y+.03,here.z);
      const forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw);
      const ahead={x:here.x+forwardX*23,z:here.z+forwardZ*23};
      const view=flightView(s,frame.slope*Math.cos(yaw-frame.yaw),groundHeight(ahead.x,ahead.z));
      car.group.rotation.order='YXZ';car.group.rotation.x=THREE.MathUtils.damp(car.group.rotation.x,view.pitch,10,dt);car.group.rotation.y=yaw+s.driftAngle;car.group.rotation.z=THREE.MathUtils.damp(car.group.rotation.z,view.bank,7,dt);
      const chaseDistance=cameraMode===1?6.3:9.4,chaseHeight=cameraMode===1?2.25:4.2;
      const back={x:here.x-forwardX*chaseDistance,z:here.z-forwardZ*chaseDistance};
      desiredCamera.set(back.x,Math.max(s.y+chaseHeight,groundHeight(back.x,back.z)+chaseHeight),back.z);
      lookAt.set(ahead.x,view.lookHeight,ahead.z);
      if(shake>.001&&!reduceMotion){desiredCamera.x+=(Math.random()-.5)*shake;desiredCamera.y+=(Math.random()-.5)*shake*.65;shake*=Math.exp(-8*dt);}
      const targetFov=(cameraMode===1?70:68)+(reduceMotion?0:s.speed*.12+view.weight*3);camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,3,dt);
    }
    if(!cameraInitialized){cityCameraPosition.copy(desiredCamera);smoothedLook.copy(lookAt);cameraInitialized=true;}else{cityCameraPosition.lerp(desiredCamera,1-Math.exp(-7*dt));smoothedLook.lerp(lookAt,1-Math.exp(-8*dt));}
    if(phase!=='menu')cityCameraPosition.y=Math.max(cityCameraPosition.y,groundHeight(cityCameraPosition.x,cityCameraPosition.z)+1.8);
    setCameraFromCity(camera,cityCameraPosition,smoothedLook);camera.updateProjectionMatrix();
    atmosphere.update(totalTime,phase==='menu'?35:phase==='tour'?tour.progress:sim.state.progress);
  }
  function updateSpray(dt:number,input:DriveInput){
    const s=sim.state;
    if(phase==='racing'&&s.speed>12&&!s.airborne){const amount=input.drift?4:1;for(let n=0;n<amount;n++){const i=particleCursor++%particleCount,j=i*3;ages[i]=0;const f=routeFrame(s.progress),side=i%2?-.81:.81;positions[j]=car.group.position.x+f.normal.x*side-f.tangent.x*1.5;positions[j+1]=s.y+.12;positions[j+2]=car.group.position.z+f.normal.z*side-f.tangent.z*1.5;velocities[j]=(Math.random()-.5)*1.4-f.tangent.x*s.speed*.07;velocities[j+1]=.25+Math.random()*.5;velocities[j+2]=-f.tangent.z*s.speed*.07;}}
    for(let i=0;i<particleCount;i++){ages[i]+=dt;const j=i*3;if(ages[i]>1){positions[j+1]=-1000;continue;}positions[j]+=velocities[j]*dt;positions[j+1]+=velocities[j+1]*dt;positions[j+2]+=velocities[j+2]*dt;}
    particleGeo.attributes.position.needsUpdate=true;
  }
  const controls=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
  window.addEventListener('keydown',event=>{
    if(controls.has(event.code)&&(phase==='racing'||phase==='countdown')){event.preventDefault();keys.add(event.code);}
    if(event.repeat)return;
    if(event.code==='Enter'&&el('help').classList.contains('hidden')&&el('city-map-dialog').classList.contains('hidden')){if(phase==='menu'&&document.activeElement?.tagName!=='BUTTON')start();else if(phase==='finished'&&document.activeElement?.tagName!=='BUTTON')start();}
    if(event.code==='Escape'){
      if(!el('city-map-dialog').classList.contains('hidden')){modal('city-map-dialog',false);return;}
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
  window.addEventListener('gamepaddisconnected',pauseWhenAway);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseWhenAway();});
  window.addEventListener('resize',resize);
  canvas.tabIndex=-1;
  document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button=>{
    const control=button.dataset.control!;
    button.addEventListener('pointerdown',event=>{if(phase!=='racing'&&phase!=='countdown')return;if(event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);touch.add(control);button.classList.add('pressed');});
    const release=()=>{touch.delete(control);button.classList.remove('pressed');};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  function toggleSound(){muted=!muted;audio.setMuted(muted);safeWrite('sf-night-run-muted',String(muted));updateSoundButton();if(!muted&&(phase==='racing'||phase==='tour'&&!tour.paused))void audio.unlock();}
  function closeHelp(){modal('help',false);if(helpWasPaused){helpWasPaused=false;resume();}}
  el('tour-start').onclick=()=>{phase='tour';tourArt=null;tourBayStarted=null;skyCourse.reset();tour.jump(START_PROGRESS);tour.paused=false;el('tour-pause').textContent='PAUSE';clearInputs();cameraInitialized=false;void audio.unlock();syncPhase();resize();};
  el('tour-exit').onclick=menu;el('tour-race').onclick=start;el('tour-pause').onclick=()=>{if(tourArt){tour.orbit=0;cameraInitialized=false;}tourArt=null;if(tour.progress>=TRACK_LENGTH-1){tour.jump(START_PROGRESS);cameraInitialized=false;}tour.paused=!tour.paused;el('tour-pause').textContent=tour.paused?'RESUME':'PAUSE';if(tour.paused)audio.suspend();else void audio.unlock();};
  document.querySelectorAll<HTMLButtonElement>('[data-stop]').forEach(button=>button.onclick=()=>{const stop=Number(button.dataset.stop);tourBayStarted=null;tour.jump(stop);const scene=button.dataset.scene;tourArt=scene==='square'||scene==='westin'||scene==='post'?scene:null;if(tourArt){tour.paused=true;audio.suspend();}if(stop>=TRACK_LENGTH-1){tour.paused=true;audio.suspend();}el('tour-pause').textContent=stop>=TRACK_LENGTH-1?'RUN AGAIN':tour.paused?'RESUME':'PAUSE';skyCourse.reset();cameraInitialized=false;});
  let dragX:number|null=null;canvas.addEventListener('pointerdown',event=>{if(phase==='tour'){dragX=event.clientX;canvas.setPointerCapture(event.pointerId);}});canvas.addEventListener('pointermove',event=>{if(phase==='tour'&&dragX!==null){tour.orbit=THREE.MathUtils.clamp(tour.orbit+(event.clientX-dragX)*.004,-1.35,1.35);dragX=event.clientX;}});canvas.addEventListener('pointerup',()=>dragX=null);canvas.addEventListener('pointercancel',()=>dragX=null);
  el('start').onclick=start;el('again').onclick=start;el('restart').onclick=start;el('resume').onclick=resume;el('pause').onclick=()=>phase==='paused'?resume():pause();
  el('home').onclick=menu;el('pause-home').onclick=menu;el('result-home').onclick=menu;el('sound').onclick=toggleSound;
  el('how').onclick=()=>{helpWasPaused=phase==='racing'||phase==='countdown';if(helpWasPaused)pause();modal('help',true);};el('close-help').onclick=closeHelp;el('help-play').onclick=start;
  el('open-city-map').onclick=()=>modal('city-map-dialog',true);
  el('close-city-map').onclick=()=>modal('city-map-dialog',false);
  el('city-map-dialog').addEventListener('click',event=>{if(event.target===el('city-map-dialog'))modal('city-map-dialog',false);});
  el('city-map-play').onclick=start;
  function updateAssist(){el('auto-throttle').textContent=`AUTO ACCELERATE: ${autoThrottle?'ON':'OFF'}`;el('auto-throttle').setAttribute('aria-pressed',String(autoThrottle));}
  el('auto-throttle').onclick=()=>{autoThrottle=!autoThrottle;safeWrite('sf-night-run-auto-throttle',String(autoThrottle));updateAssist();};updateAssist();
  el('reset-best').onclick=()=>{best=0;safeWrite('whimsical-sf-manual-driving-best-v2','0');el('best').textContent='—';el('reset-best').textContent='BEST CLEARED';};
  el('quality').onclick=()=>{if(lowQuality){lowQuality=false;cinematicQuality=false;}else if(cinematicQuality){cinematicQuality=false;lowQuality=true;}else{cinematicQuality=true;}applyQuality();};
  el('fullscreen').onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void document.documentElement.requestFullscreen?.().catch(()=>{el('fullscreen').textContent='USE YOUR BROWSER’S FULLSCREEN';});};
  document.addEventListener('fullscreenchange',()=>el('fullscreen').textContent=document.fullscreenElement?'EXIT FULLSCREEN ↙':'FULLSCREEN ↗');
  updateSoundButton();applyQuality();syncPhase();updateCamera(1);landmarks.update(0,35,camera);atmosphere.bakeCityReflections(car.group);composer.render();
  el('loading').classList.add('faded');setTimeout(()=>el('loading').classList.add('hidden'),650);

  // Read-only diagnostics are handy when comparing browsers and performance settings.
  (window as typeof window&{sfNightRun?:unknown}).sfNightRun={get state(){return {...sim.state,phase};},get rendering(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}};
  function frame(now:number){
    requestAnimationFrame(frame);
    const dt=Math.min((now-lastTime)/1000,.25);lastTime=now;totalTime+=dt;uiClock+=dt;
    performanceFrames++;performanceTime+=dt;if(performanceTime>=1){canvas.dataset.fps=String(Math.round(performanceFrames/performanceTime));canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.textures=String(renderer.info.memory.textures);performanceFrames=0;performanceTime=0;}
    const input=readInput();
    canvas.dataset.throttle=String(input.throttle);canvas.dataset.steer=String(input.steer);
    canvas.dataset.speed=sim.state.speed.toFixed(2);canvas.dataset.heading=sim.state.heading.toFixed(4);
    let raceDt=dt;if(phase==='tour'){
      const beforeTour=tour.progress,wasTourPaused=tour.paused;tour.update(dt);if(tour.progress<beforeTour){cameraInitialized=false;tourBayStarted=null;}
      if(tour.progress>=TRACK_LENGTH-1&&tour.paused){el('tour-pause').textContent='RUN AGAIN';if(!wasTourPaused){audio.suspend();tourBayStarted=totalTime;finishCameraStart.copy(cityCameraPosition);finishLookStart.copy(smoothedLook);}}
      if(!tour.paused){audio.update(tour.speed,.40,false,false,tour.glide);updateCitySound(tour.progress,tour.lateral);}
      el('tour-place').textContent=tourArt?tourSceneNames[tourArt]:tour.progress>=TRACK_LENGTH-1?'FERRY BUILDING & THE BAY':districtAt(tour.progress).name;
      el('tour-mode').textContent=tourArt?'POSTCARD MODE / CITY PORTRAITS':tour.paused?'POSTCARD MODE / PAUSED':'POSTCARD MODE / AUTOPILOT';
    }
    if(phase==='countdown'){
      countdownLeft-=dt;updateCountdown();audio.update(0,input.throttle*.25,false,false);
      if(countdownLeft<=0){raceDt=Math.max(0,-countdownLeft);phase='racing';audio.cue('go');el('countdown').innerHTML='<strong>GO.</strong><span>MAKE IT A GOOD ONE</span>';goUntil=totalTime+.8;syncPhase();}
    }
    if(phase==='racing'){
      const events=sim.update(raceDt,input);topSpeed=Math.max(topSpeed,sim.state.speed);
      for(const event of events){if(event==='checkpoint'&&!sim.state.finished){audio.cue('checkpoint');announce('CHECKPOINT',`${sim.state.checkpoint} OF 4 · ${formatTime(sim.state.elapsed)}`,1.6);}if(event==='crash'){audio.cue('crash');shake=.5;flashUntil=totalTime+.16;}if(event==='land'){shake=.24;landingPulse=1;audio.cue('land');announce('STUCK THE LANDING','BOOST RECHARGED',1.3);}if(event==='finish')finish();}
      if(sim.state.airborne&&sim.state.glide>.35&&sim.state.launches>presentedLaunches){presentedLaunches=sim.state.launches;audio.cue('launch');announce('HELLO, SKY.','WHEELS OUT · STEER TO GLIDE',1.8);}
      if(phase==='racing'){audio.update(sim.state.speed,input.throttle,input.drift&&Math.abs(sim.state.driftAngle)>.08,sim.boosting,sim.state.glide);updateCitySound(sim.state.progress,sim.state.lateral);}
    }
    if(goUntil&&totalTime>goUntil){el('countdown').classList.add('hidden');goUntil=0;}
    if(finishReveal&&totalTime>finishReveal){modal('results',true);finishReveal=0;}
    if(messageUntil&&totalTime>messageUntil){el('message').classList.add('faded');el('message').setAttribute('aria-hidden','true');messageUntil=0;}
    el('flash').classList.toggle('hit',totalTime<flashUntil);
    el('drift-hint').classList.toggle('active',phase==='racing'&&((sim.state.airborne&&sim.state.glide>.2)||(!sim.state.airborne&&input.drift&&sim.state.speed>10&&Math.abs(sim.state.driftAngle)>.1)));
    el('drift-hint').textContent=sim.state.airborne?'A / D TO GLIDE · BRAKE TO DIVE':'DRIFTING';el('drift-hint').setAttribute('aria-hidden',String(!el('drift-hint').classList.contains('active')));
    document.querySelector('.speed-vignette')!.classList.toggle('active',phase==='racing'&&sim.boosting);
    if(phase!=='paused')updateCamera(dt);
    if(phase!=='paused'){car.update(dt,{speed:phase==='menu'?0:phase==='tour'?(tour.paused?0:tour.speed):sim.state.speed,steer:phase==='tour'?tour.steer:input.steer,braking:input.brake>.1,boosting:phase==='racing'&&sim.boosting,time:totalTime,glide:phase==='menu'?0:phase==='tour'?tour.glide:sim.state.glide,airborne:phase==='menu'?false:(phase==='tour'?tour.airborne:sim.state.airborne),altitude:phase==='tour'?tour.altitude:sim.state.altitude,landing:landingPulse});updateSpray(dt,input);}
    landingPulse*=Math.exp(-7*dt);
    const flight=phase==='tour'?tour:sim.state;
    const showingFlight=(phase==='racing'||phase==='tour')&&flight.airborne&&flight.glide>.2;
    el('flight-hud').classList.toggle('active',showingFlight);el('flight-hud').setAttribute('aria-hidden',String(!showingFlight));
    el('flight-height').innerHTML=`${Math.round(flight.altitude)} <em>M UP</em>`;
    el('flight-time').innerHTML=`${flight.airTime.toFixed(1)}<small>SECONDS OF MAGIC</small>`;
    app.classList.toggle('flying',showingFlight);
    const cityProgress=phase==='menu'?35:phase==='tour'?tour.progress:sim.state.progress;
    canvas.dataset.heroAssets=String(!!landmarks.group.getObjectByName('Westin St. Francis / Blender landmark')?.userData.loaded);canvas.dataset.phase=phase;canvas.dataset.scenicView=phase==='tour'?(tourArt??'drive'):'';canvas.dataset.wheelFold=String(car.group.userData.wheelFoldDegrees??0);
    if(phase==='tour'){canvas.dataset.progress=tour.progress.toFixed(1);canvas.dataset.airborne=String(tour.airborne);canvas.dataset.altitude=tour.altitude.toFixed(1);canvas.dataset.glide=tour.glide.toFixed(2);}
    const hits=skyCourse.update(totalTime,cityProgress,car.group.position,phase==='racing');
    if(hits){collectedRings+=hits;sim.state.boost=Math.min(1,sim.state.boost+.14*hits);audio.cue('checkpoint');announce('SUN RING',`${collectedRings} COLLECTED · +BOOST`,1);}
    world.update(totalTime,cityProgress);landmarks.update(totalTime,cityProgress,camera);squareStreetDetails.update(camera);chinatown.update(totalTime,cityProgress);waterfront.update(totalTime,cityProgress);
    if(uiClock>.05){uiClock=0;if(phase!=='menu'&&phase!=='tour')updateHud();}
    heroFill.position.set(car.group.position.x-4,car.group.position.y+6,car.group.position.z-7);
    renderer.info.reset();composer.render();
  }
  requestAnimationFrame(frame);
}
boot().catch(error=>{console.error(error);el('loading').innerHTML='<div class="no-webgl"><h2>The city couldn’t load.</h2><p>Please reload to try again.</p><button class="primary" onclick="location.reload()">RELOAD ↗</button></div>';});

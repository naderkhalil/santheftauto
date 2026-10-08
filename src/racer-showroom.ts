import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createAtmosphere } from './atmosphere';
import { createCar } from './car';
import { cloneRacerPart, loadRacerKit, releaseRacerPart, RACER_ASSET_VERSION } from './racer-assets';
import { DRIVERS, type RacerProfile } from './racer-profile';

/** Real map architecture and game lighting; the car is the same playable instance type. */
export class RacerShowroom {
  private renderer:THREE.WebGLRenderer;private composer:EffectComposer;private pass:RenderPass;private ao:GTAOPass;
  private scene=new THREE.Scene();private lineup=new THREE.Group();private garage=new THREE.Group();private world=new THREE.Group();
  private car=createCar();private founders:THREE.Object3D[]=[];
  private camera=new THREE.PerspectiveCamera(42,1,.1,4200);
  private lineupCamera=new THREE.OrthographicCamera(-5,5,2,-2,.1,4200);
  private atmosphere:ReturnType<typeof createAtmosphere>;
  private mode='driver';private selected='jensen';private rotation=.57;private dragX:number|null=null;private last=0;
  private observer:ResizeObserver;private disposed=false;
  constructor(private canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1;
    this.lineup.scale.z=-1;this.world.scale.z=-1;this.world.add(this.garage,this.car.group);this.scene.add(this.world,this.lineup);
    this.atmosphere=createAtmosphere(this.renderer,this.scene,this.camera,{sampleRoute:()=>new THREE.Vector3(0,-18,0),shadowExtent:22,sunDirection:{x:-.57,y:.682,z:.461},reflectionPoints:[{x:0,y:1.5,z:0}]});
    void this.atmosphere.loadPhotographicSky();this.atmosphere.update(0,0);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(35,30),new THREE.MeshStandardMaterial({color:'#b9b3a5',roughness:.92}));floor.rotation.x=-Math.PI/2;floor.position.y=-.04;floor.receiveShadow=true;this.lineup.add(floor);
    this.composer=new EffectComposer(this.renderer);this.pass=new RenderPass(this.scene,this.camera);this.composer.addPass(this.pass);
    this.ao=new GTAOPass(this.scene,this.camera,640,360);this.ao.blendIntensity=.4;this.ao.updateGtaoMaterial({radius:.65,thickness:.6,distanceExponent:1.6,samples:8});this.ao.updatePdMaterial({radius:4,rings:2,samples:8});this.composer.addPass(this.ao);this.composer.addPass(new OutputPass());
    const renderAO=this.ao.render.bind(this.ao);
    this.ao.render=(renderer,write,read,dt,mask)=>{
      const hidden:THREE.Mesh[]=[];this.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.visible){const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.every(m=>m.transparent||m.alphaTest>0)){o.visible=false;hidden.push(o);}}});
      const shadows=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
      try{renderAO(renderer,write,read,dt,mask);}finally{hidden.forEach(o=>o.visible=true);renderer.shadowMap.autoUpdate=shadows;}
    };
    loadRacerKit().then(kit=>{if(this.disposed)return;DRIVERS.forEach(driver=>{const actor=cloneRacerPart(kit,`Standing_${driver.id}`);actor.scale.setScalar(1.35);this.lineup.add(actor);this.founders.push(actor);});this.resize();}).catch(()=>{this.canvas.dataset.loaded='error';});
    new GLTFLoader().load(`/assets/models/racer-garage.glb?v=${RACER_ASSET_VERSION}`,asset=>{
      if(this.disposed){this.release(asset.scene);return;}
      asset.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});this.garage.add(asset.scene);this.canvas.dataset.loaded='true';this.resize();
    },undefined,()=>{this.canvas.dataset.loaded='error';});
    // Use the map's scanned asphalt on the road outside the garage.
    const textureLoader=new THREE.TextureLoader();Promise.all(['asphalt-color.jpg','asphalt-normal.jpg','asphalt-roughness.jpg'].map(path=>textureLoader.loadAsync('/assets/'+path))).then(([color,normal,roughness])=>{
      if(this.disposed){[color,normal,roughness].forEach(t=>t.dispose());return;}
      color.colorSpace=THREE.SRGBColorSpace;for(const t of [color,normal,roughness]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(7,3);}
      const street=new THREE.Mesh(new THREE.PlaneGeometry(40,12),new THREE.MeshStandardMaterial({map:color,normalMap:normal,normalScale:new THREE.Vector2(.25,.25),roughnessMap:roughness,color:'#b2bbcb',roughness:.87}));street.rotation.x=-Math.PI/2;street.position.set(0,-.105,6);street.receiveShadow=true;this.garage.add(street);
    }).catch(()=>{});
    this.lineupCamera.position.set(0,2.7,-10);this.lineupCamera.lookAt(0,1.3,0);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    canvas.addEventListener('pointerdown',event=>{if(this.mode!=='car')return;this.dragX=event.clientX;canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{if(this.dragX===null)return;this.rotation=THREE.MathUtils.clamp(this.rotation+(event.clientX-this.dragX)*.006,-.8,1.0);this.dragX=event.clientX;this.resize();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>this.dragX=null);
    this.resize();
  }
  resize(){
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(!width||!height)return;
    this.renderer.setSize(width,height,false);this.composer.setSize(width,height);this.ao.setSize(Math.ceil(width*.65),Math.ceil(height*.65));const aspect=width/height;this.camera.aspect=aspect;
    const distance=aspect<1?8:5.6;this.camera.position.set(Math.sin(this.rotation)*distance,2.8,-Math.cos(this.rotation)*distance);this.camera.lookAt(0,1.2,.5);this.camera.updateProjectionMatrix();
    const horizontal=Math.max(3.65,1.65*aspect),vertical=horizontal/aspect;Object.assign(this.lineupCamera,{left:-horizontal,right:horizontal,top:vertical,bottom:-vertical});this.lineupCamera.updateProjectionMatrix();
    this.founders.forEach((actor,i)=>actor.position.x=-horizontal*[-.75,-.25,.25,.75][i]);
    this.lineupCamera.updateMatrixWorld();const head=new THREE.Vector3(0,2.9,0).project(this.lineupCamera);this.canvas.closest('dialog')?.style.setProperty('--tag-y',`${Math.max(0,(1-head.y)*height/2-28)}px`);
  }
  setMode(mode:string){this.mode=mode;this.lineup.visible=mode==='driver';this.world.visible=mode==='car';this.resize();}
  setProfile(profile:RacerProfile){this.selected=profile.driver;this.car.customize(profile);}
  render(now:number){
    const dt=this.last?Math.min(.05,(now-this.last)/1000):0;this.last=now;
    this.founders.forEach((actor,i)=>actor.scale.setScalar(DRIVERS[i].id===this.selected?1.40:1.35));
    this.car.update(dt,{speed:0,steer:0,braking:false,boosting:false,time:now/1000});
    const camera=this.mode==='car'?this.camera:this.lineupCamera;this.pass.camera=camera;this.ao.camera=camera;this.composer.render();
  }
  private release(root:THREE.Object3D){const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}
  dispose(){this.disposed=true;this.observer.disconnect();this.car.dispose();this.founders.forEach(actor=>{actor.removeFromParent();releaseRacerPart(actor);});this.release(this.garage);this.release(this.lineup);this.ao.dispose();this.composer.dispose();this.atmosphere.dispose();this.renderer.dispose();}
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createFounder } from './founder-figures';
import { CARS, DRIVERS, SPONSORS, type RacerProfile } from './racer-profile';

/** The first art study: an editable Blender garage, coupe and Jensen model. */
export class RacerShowroom {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private lineup=new THREE.Group();
  private garage=new THREE.Group();
  private car=new THREE.Group();
  private founders:THREE.Group[]=[];
  private camera=new THREE.PerspectiveCamera(38,1,.1,100);
  private lineupCamera=new THREE.OrthographicCamera(-5,5,2,-2,.1,50);
  private mode='driver';private selected='jensen';private rotation=-.22;private dragX:number|null=null;
  private observer:ResizeObserver;private disposed=false;private profile:RacerProfile|null=null;
  private environment:THREE.WebGLRenderTarget;
  private decalMap:THREE.CanvasTexture;
  private decals=new THREE.Group();
  constructor(private canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#e7f0ee','#b5a68a',2));
    const sun=new THREE.DirectionalLight('#fff2d3',3.4);sun.position.set(-5,9,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:10,bottom:-10});sun.shadow.normalBias=.025;this.scene.add(sun);
    this.scene.add(this.lineup,this.garage,this.car);
    DRIVERS.forEach((driver,index)=>{const holder=new THREE.Group();holder.add(createFounder(driver.id));this.lineup.add(holder);this.founders.push(holder);holder.userData.index=index;});
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,12),new THREE.MeshStandardMaterial({color:'#d8d0b9',roughness:.93}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;ground.receiveShadow=true;this.lineup.add(ground);
    const decalCanvas=document.createElement('canvas');decalCanvas.width=512;decalCanvas.height=256;this.decalMap=new THREE.CanvasTexture(decalCanvas);this.decalMap.colorSpace=THREE.SRGBColorSpace;
    const decalMaterial=new THREE.MeshStandardMaterial({map:this.decalMap,roughness:.4,transparent:true,polygonOffset:true,polygonOffsetFactor:-2});
    for(const side of [-1,1]){const badge=new THREE.Mesh(new THREE.PlaneGeometry(.55,.275),decalMaterial);badge.position.set(side*.902,.64,-.1);badge.rotation.y=side*Math.PI/2;this.decals.add(badge);}this.car.add(this.decals);
    new GLTFLoader().load('/assets/models/victorian-garage.glb?v=3',asset=>{
      if(this.disposed){this.release(asset.scene);return;}
      asset.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
      const garage=asset.scene.getObjectByName('Garage'),coupe=asset.scene.getObjectByName('Coupe'),jensen=asset.scene.getObjectByName('Jensen');
      if(garage)this.garage.add(garage);if(coupe)this.car.add(coupe);
      if(jensen){const holder=this.founders[3];for(const child of [...holder.children]){this.release(child);holder.remove(child);}jensen.scale.setScalar(1.32);holder.add(jensen);}
      if(this.profile)this.setProfile(this.profile);
      this.canvas.dataset.loaded='true';this.resize();
    },undefined,()=>{this.canvas.dataset.loaded='error';this.canvas.setAttribute('aria-label','Garage preview unavailable. Reload to try again.');});
    this.lineupCamera.position.set(0,2.8,10);this.lineupCamera.lookAt(0,1.3,0);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    canvas.addEventListener('pointerdown',event=>{if(this.mode!=='car')return;this.dragX=event.clientX;canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{if(this.dragX===null)return;this.rotation=THREE.MathUtils.clamp(this.rotation+(event.clientX-this.dragX)*.006,-1.1,.65);this.dragX=event.clientX;this.resize();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>this.dragX=null);
    this.resize();
  }
  resize(){
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(!width||!height)return;
    this.renderer.setSize(width,height,false);const aspect=width/height;this.camera.aspect=aspect;
    const distance=aspect<1?7.7:5.8;
    this.camera.position.set(Math.sin(this.rotation+.86)*distance,2.55,Math.cos(this.rotation+.86)*distance);this.camera.lookAt(0,.9,-.2);this.camera.updateProjectionMatrix();
    const horizontal=Math.max(3.65,1.65*aspect),vertical=horizontal/aspect;
    Object.assign(this.lineupCamera,{left:-horizontal,right:horizontal,top:vertical,bottom:-vertical});this.lineupCamera.updateProjectionMatrix();
    this.founders.forEach((figure,i)=>figure.position.x=horizontal*[-.75,-.25,.25,.75][i]);
    this.lineupCamera.updateMatrixWorld();const head=new THREE.Vector3(0,2.95,0).project(this.lineupCamera);
    this.canvas.closest('dialog')?.style.setProperty('--tag-y',`${Math.max(0,(1-head.y)*height/2-32)}px`);
  }
  setMode(mode:string){this.mode=mode;this.lineup.visible=mode==='driver';this.garage.visible=this.car.visible=mode==='car';this.resize();}
  setProfile(profile:RacerProfile){
    this.profile=profile;this.selected=profile.driver;
    const style=CARS.find(c=>c.id===profile.car)??CARS[0];
    this.car.traverse(o=>{if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials)if(m.name==='Coupe paint'&&m instanceof THREE.MeshStandardMaterial)m.color.set(style.id==='sundrop'?'#427e7c':style.id==='comet'?'#b36b51':'#d9b66e');}});
    const sponsor=SPONSORS.find(s=>s.id===profile.sponsor)??SPONSORS[0];this.decals.visible=!!sponsor.mark;
    const canvas=this.decalMap.image as HTMLCanvasElement,ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,512,256);ctx.fillStyle=sponsor.background;ctx.fillRect(0,0,512,256);ctx.fillStyle=sponsor.color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 80px sans-serif';ctx.fillText(sponsor.mark,256,128,460);this.decalMap.needsUpdate=true;
  }
  render(_now:number){
    this.founders.forEach((figure,i)=>{const chosen=DRIVERS[i].id===this.selected;figure.scale.setScalar(chosen?1.04:1);});
    this.renderer.render(this.scene,this.mode==='car'?this.camera:this.lineupCamera);
  }
  private release(root:THREE.Object3D){const materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  dispose(){this.disposed=true;this.observer.disconnect();this.release(this.scene);this.environment.dispose();this.decalMap.dispose();this.renderer.dispose();}
}

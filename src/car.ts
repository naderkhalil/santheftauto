import * as THREE from 'three';
import { createLegacyCar, type CarState } from './legacy-car';
import { cloneRacerPart, loadRacerKit, releaseRacerPart } from './racer-assets';
import { CARS, DRIVERS, SPONSORS, DEFAULT_PROFILE, normalizeProfile, type RacerProfile } from './racer-profile';
export type { CarState } from './legacy-car';

/** The same Blender vehicle and seated driver are used in setup and every race. */
export function createCar(){
  const group=new THREE.Group();group.name='Playable Blender roadster';
  let fallback:ReturnType<typeof createLegacyCar>|null=createLegacyCar();group.add(fallback.group);
  let model:THREE.Object3D|null=null,disposed=false,profile:RacerProfile={...DEFAULT_PROFILE},hover=0;
  const drivers=new Map<string,THREE.Object3D>();
  const wheels:Array<{mount:THREE.Group;fold:THREE.Group;steer:THREE.Group;spin:THREE.Object3D;side:number;front:boolean}>=[];
  const body=new THREE.Group();group.add(body);
  const decalCanvas=document.createElement('canvas');decalCanvas.width=512;decalCanvas.height=256;
  const decalMap=new THREE.CanvasTexture(decalCanvas);decalMap.colorSpace=THREE.SRGBColorSpace;
  // The gameplay city reflects Z; undo that reflection for readable lettering.
  decalMap.repeat.x=-1;decalMap.offset.x=1;
  const decalMaterial=new THREE.MeshStandardMaterial({map:decalMap,transparent:true,roughness:.5,polygonOffset:true,polygonOffsetFactor:-2});
  const decals=new THREE.Group();body.add(decals);decals.visible=false;
  for(const side of [-1,1]){const door=new THREE.Mesh(new THREE.PlaneGeometry(.59,.265),decalMaterial);door.position.set(side*.906,.64,-.06);door.rotation.y=side*Math.PI/2;decals.add(door);}
  const hood=new THREE.Mesh(new THREE.PlaneGeometry(.5,.24),decalMaterial);hood.rotation.x=-Math.PI/2;hood.position.set(0,.878,.93);decals.add(hood);
  const glowMaterial=new THREE.MeshStandardMaterial({color:'#86f4e2',emissive:'#27d7cf',emissiveIntensity:0,transparent:true,opacity:0});
  const glows:THREE.Mesh[]=[];
  function customize(next:RacerProfile){
    group.userData.visualRevision=(group.userData.visualRevision??0)+1;
    profile=normalizeProfile(next);fallback?.customize(profile);group.userData.profile={...profile};
    const car=CARS.find(c=>c.id===profile.car)??CARS[0];
    model?.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial&&m.name==='Coupe paint')m.color.set(car.color);});
    for(const [id,driver] of drivers)driver.visible=id===profile.driver;
    const sponsor=SPONSORS.find(s=>s.id===profile.sponsor)??SPONSORS[0];decals.visible=!!model&&!!sponsor.mark;
    const ctx=decalCanvas.getContext('2d')!;ctx.clearRect(0,0,512,256);if(sponsor.mark){ctx.fillStyle=sponsor.background;ctx.fillRect(0,0,512,256);ctx.fillStyle=sponsor.color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 80px sans-serif';ctx.fillText(sponsor.mark,256,128,460);}decalMap.needsUpdate=true;
    if(sponsor.logo){const id=sponsor.id,image=new Image();image.onload=()=>{
      if(disposed||profile.sponsor!==id)return;
      const padding=sponsor.logoPadding??24,scale=Math.min((512-padding*2)/image.naturalWidth,(256-padding*2)/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
      ctx.clearRect(0,0,512,256);ctx.fillStyle=sponsor.background;ctx.fillRect(0,0,512,256);ctx.drawImage(image,(512-width)/2,(256-height)/2,width,height);
      decalMap.needsUpdate=true;group.userData.visualRevision=(group.userData.visualRevision??0)+1;
    };image.src=sponsor.logo;}
    group.userData.driverVisible=!!model;
  }
  const ready=loadRacerKit().then(kit=>{
    if(disposed)return;
    model=cloneRacerPart(kit,'Vehicle');body.add(model);
    for(const axle of ['F','R'])for(const side of [-1,1]){
      const wheel=model.getObjectByName(`Wheel_${axle}${side<0?'L':'R'}`);if(!wheel)throw new Error('Blender wheel pivot is missing');
      const mount=new THREE.Group(),fold=new THREE.Group(),steer=new THREE.Group();mount.position.copy(wheel.position);wheel.removeFromParent();wheel.position.set(0,0,0);mount.add(fold);fold.add(steer);steer.add(wheel);group.add(mount);
      wheels.push({mount,fold,steer,spin:wheel,side,front:axle==='F'});
      const glow=new THREE.Mesh(new THREE.TorusGeometry(.25,.019,8,32),glowMaterial);glow.rotation.y=Math.PI/2;glow.position.x=side*.14;steer.add(glow);glows.push(glow);
    }
    for(const d of DRIVERS){const driver=cloneRacerPart(kit,`Seated_${d.id}`);driver.scale.multiplyScalar(.88);driver.position.set(-.35,.30,-.37);body.add(driver);drivers.set(d.id,driver);}
    fallback?.dispose();fallback=null;customize(profile);group.userData.asset='blender';
  }).catch(error=>{group.userData.asset='fallback';console.warn('Blender racer unavailable; keeping the playable fallback.',error);});
  function update(dt:number,state:CarState){
    if(fallback){fallback.update(dt,state);Object.assign(group.userData,{hover:fallback.group.userData.hover,wheelFoldDegrees:fallback.group.userData.wheelFoldDegrees});return;}
    const step=Math.max(0,Math.min(dt,.1));hover=THREE.MathUtils.damp(hover,THREE.MathUtils.clamp(state.glide??(state.airborne?1:0),0,1),10,step);
    for(const wheel of wheels){wheel.spin.rotation.x+=(state.speed/.384*(1-hover)+hover*22)*step;wheel.steer.rotation.y=wheel.front?state.steer*.43*(1-hover):0;wheel.fold.rotation.z=-wheel.side*hover*Math.PI/2;wheel.mount.position.x=wheel.side*(.9+hover*.30);wheel.mount.position.y=.4+hover*.055;}
    body.rotation.z=THREE.MathUtils.damp(body.rotation.z,-state.steer*.03*(1-hover),8,step);body.position.y=Math.sin(state.time*3.6)*.022*hover-(state.landing??0)*.05;
    for(const driver of drivers.values())if(driver.visible)driver.rotation.z=-state.steer*.035;
    const wheel=model?.getObjectByName('Steering');if(wheel)wheel.rotation.z=state.steer*.22;
    model?.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial&&m.name==='Tail lamp'){m.emissive.set('#b14435');m.emissiveIntensity=state.braking?2:.18;}});
    glowMaterial.opacity=hover;glowMaterial.emissiveIntensity=hover*(state.boosting?4:2);group.userData.hover=hover;group.userData.wheelFoldDegrees=hover*90;group.userData.hoverAltitude=state.altitude??0;
  }
  function dispose(){disposed=true;fallback?.dispose();if(model)releaseRacerPart(model);drivers.forEach(releaseRacerPart);for(const wheel of wheels)releaseRacerPart(wheel.spin);glows.forEach(g=>g.geometry.dispose());decals.children.forEach(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});decalMaterial.dispose();decalMap.dispose();glowMaterial.dispose();group.removeFromParent();}
  return {group,ready,customize,update,dispose};
}

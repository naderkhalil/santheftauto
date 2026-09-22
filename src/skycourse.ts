import * as THREE from 'three';
import { LAUNCH_ZONES, sampleRoute, routePoint, routeFrame, sampleGlidePath, routeSlope, routeYaw } from './route';

/** The airborne racing line: three handcrafted flights with collectible sun hoops. */
export function createSkyCourse(scene:THREE.Scene){
  const root=new THREE.Group();root.name='The Powell Skyway';scene.add(root);
  const gold=new THREE.MeshStandardMaterial({color:'#ffc426',emissive:'#ff9e05',emissiveIntensity:.55,metalness:.45,roughness:.26});
  const mint=new THREE.MeshStandardMaterial({color:'#38fff1',emissive:'#08d5d6',emissiveIntensity:.8,metalness:.2,roughness:.32});
  const cream=new THREE.MeshStandardMaterial({color:'#fff4ca',roughness:.55});
  const coral=new THREE.MeshStandardMaterial({color:'#ff4c70',roughness:.55});
  const ringGeo=new THREE.TorusGeometry(5.1,.19,8,56);
  const innerGeo=new THREE.TorusGeometry(4.7,.045,4,56);
  const rings:{mesh:THREE.Group,position:THREE.Vector3,collected:boolean,progress:number}[]=[];
  const courseGroups:THREE.Group[]=[];
  const box=new THREE.BoxGeometry(1,1,1);
  function label(text:string,color='#fff7d2'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#143b54';ctx.fillRect(0,0,1024,128);
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 60px sans-serif';ctx.fillText(text,512,67);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
  }
  LAUNCH_ZONES.forEach((zone,zi)=>{
    const group=new THREE.Group();group.name=zone.label;root.add(group);courseGroups.push(group);
    const p=sampleRoute(zone.progress-12);
    for(const side of [-1,1]){
      const edge=routePoint(zone.progress-12,side*7.1);
      const pole=new THREE.Mesh(box,mint);pole.position.set(edge.x,p.y+5.5,edge.z);pole.scale.set(.22,11,.22);group.add(pole);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.45,10,8),gold);cap.position.set(edge.x,p.y+11,edge.z);group.add(cap);
    }
    const banner=new THREE.Mesh(new THREE.PlaneGeometry(13.8,1.65),label(`${String(zi+1).padStart(2,'0')}  /  SKYWAY ↑`));banner.position.set(p.x,p.y+10,p.z);banner.rotation.y=routeYaw(zone.progress-12)+Math.PI;group.add(banner);
    // Painted launch chevrons follow the actual hill surface rather than floating above it.
    for(let i=0;i<5;i++){
      const progress=zone.progress-30+i*5.3;
      for(const side of [-1,1]){
        const q=routePoint(progress,side*2.35);
        const line=new THREE.Mesh(box,i%2?cream:coral);line.scale.set(5.2,.028,.85);line.position.set(q.x,q.y+.064,q.z);line.rotation.set(-Math.atan(routeSlope(progress)),routeYaw(progress)+side*.22,0,'YXZ');group.add(line);
      }
    }
    for(const [ri,t] of [.24,.48,.73].entries()){
      const progress=THREE.MathUtils.lerp(zone.progress,zone.end,t),r=routePoint(progress,ri===1?(zi%2?2:-2):0);
      const position=new THREE.Vector3(r.x,sampleGlidePath(progress,zone)+1.25,r.z);
      const hoop=new THREE.Group();hoop.position.copy(position);hoop.name=`Sun ring ${zi+1}.${ri+1}`;
      hoop.rotation.order='YXZ';hoop.rotation.y=routeYaw(progress);
      hoop.add(new THREE.Mesh(ringGeo,gold),new THREE.Mesh(innerGeo,mint));
      for(let i=0;i<8;i++){
        const tick=new THREE.Mesh(box,cream),a=i*Math.PI/4;
        tick.position.set(Math.sin(a)*5.1,Math.cos(a)*5.1,0);tick.scale.set(.14,.62,.24);tick.rotation.z=-a;hoop.add(tick);
      }
      group.add(hoop);rings.push({mesh:hoop,position,collected:false,progress});
    }
  });
  const trailCount=72,trailPositions=new Float32Array(trailCount*3).fill(-1000),trailAges=new Float32Array(trailCount).fill(99);
  const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3));
  const trailMaterial=new THREE.PointsMaterial({color:'#77fff7',size:.12,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending});
  const trail=new THREE.Points(trailGeometry,trailMaterial);trail.frustumCulled=false;root.add(trail);
  let previousTime=0,previousProgress=0,cursor=0;const previousCar=new THREE.Vector3();let hasPrevious=false;
  return {
    reset(){for(const r of rings){r.collected=false;r.mesh.scale.setScalar(1);r.mesh.visible=true;}trailAges.fill(99);hasPrevious=false;},
    update(time:number,progress:number,car:THREE.Vector3,collect:boolean){
      const dt=Math.min(.1,time-previousTime);previousTime=time;let hits=0;
      courseGroups.forEach((g,i)=>g.visible=LAUNCH_ZONES[i].end>progress-80&&LAUNCH_ZONES[i].progress<progress+700);
      for(const r of rings){
        if(r.collected){if(r.mesh.visible){r.mesh.scale.setScalar(Math.min(1.8,r.mesh.scale.x*(1+dt*3)));r.mesh.visible=r.mesh.scale.x<1.8;}continue;}
        r.mesh.rotation.z=Math.sin(time*.65+r.progress)*.05;
        const crossed=hasPrevious&&previousProgress<=r.progress&&progress>=r.progress&&progress-previousProgress<40;
        const near=Math.abs(progress-r.progress)<2;
        if(collect&&(crossed||near)){
          const t=crossed?THREE.MathUtils.clamp((r.progress-previousProgress)/(progress-previousProgress||1),0,1):1;
          const x=THREE.MathUtils.lerp(previousCar.x,car.x,t),y=THREE.MathUtils.lerp(previousCar.y,car.y,t),z=THREE.MathUtils.lerp(previousCar.z,car.z,t);
          const normal=routeFrame(r.progress).normal;
          if(Math.hypot((x-r.position.x)*normal.x+(z-r.position.z)*normal.z,y+1-r.position.y)<5.4){r.collected=true;hits++;}
        }
      }
      const flying=car.y-sampleRoute(progress).y>3;
      if(flying){const {normal,tangent}=routeFrame(progress);for(const side of [-1,1]){const j=(cursor++%trailCount)*3;trailAges[j/3]=0;trailPositions[j]=car.x+normal.x*side*1.4-tangent.x*1.8;trailPositions[j+1]=car.y+.35;trailPositions[j+2]=car.z+normal.z*side*1.4-tangent.z*1.8;}}
      for(let i=0;i<trailCount;i++){trailAges[i]+=dt;if(trailAges[i]>.65)trailPositions[i*3+1]=-1000;}
      previousCar.copy(car);previousProgress=progress;hasPrevious=true;trailGeometry.attributes.position.needsUpdate=true;return hits;
    },
  };
}

import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cerebralGroundHeight as ground, CEREBRAL_GROUND_GRID, type CerebralLayout } from './cerebral-geography';
import type { CourseRoute } from './course-route';
import { createCerebralBackground } from './cerebral-background';
import { parkedCarObstacles } from './cerebral-obstacles';
import { CEREBRAL_PLAY_ANCHORS as A } from './cerebral-play-route';
import { createCerebralSkyline } from './cerebral-skyline';

type Point={x:number;y:number;z:number};
type Placement=Point&{yaw:number;scale?:number};
export type CerebralView={name:string;eye:Point;look:Point;progress:number;glide?:boolean};
const rand=(n:number)=>{const x=Math.sin(n*127.17+78.3)*43758.5453;return x-Math.floor(x);};
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);

/** Surveyed district in canonical glTF coordinates. Gameplay stays in city space;
 * the scene attachment deliberately sits outside the reflected vehicle root. */
export async function createCerebralWorld(scene:THREE.Scene,route:CourseRoute,low:boolean){
  const response=await fetch('/assets/cerebral-valley/layout.json');
  if(!response.ok)throw new Error('Cerebral Valley geography could not load.');
  const layout: CerebralLayout=await response.json();
  const group=new THREE.Group();group.name='Cerebral Valley · surveyed streets and Blender architecture';scene.add(group);
  const decoder=new DRACOLoader().setDecoderPath('/assets/draco/');
  const loader=new GLTFLoader().setDRACOLoader(decoder);
  const cull:Array<{object:THREE.Object3D;center:THREE.Vector3;radius:number;near:number;far:number}>=[];
  function register(object:THREE.Object3D,near=0,far=550){
    const bounds=new THREE.Box3().setFromObject(object),sphere=bounds.getBoundingSphere(new THREE.Sphere());
    cull.push({object,center:sphere.center,radius:Math.min(sphere.radius,140),near,far});
  }
  const material=(name:string,color:string,roughness=.86,metalness=0)=>{
    const m=new THREE.MeshStandardMaterial({name,color,roughness,metalness});m.envMapIntensity=.35;return m;
  };
  const concrete=material('Weathered San Francisco sidewalk','#c6c2b8');
  concrete.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 cvPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\ncvPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 cvPosition;').replace('#include <color_fragment>',`#include <color_fragment>
      vec2 slab=abs(fract(cvPosition.xz/1.8)-.5);
      float seam=smoothstep(.475,.495,max(slab.x,slab.y));
      float grain=fract(sin(dot(floor(cvPosition.xz*70.),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=mix(.98,1.035,grain)*(1.-seam*.14);`);
  };
  const asphalt=material('Cerebral / scanned asphalt','#727879');asphalt.userData.cityAsphalt=true;
  const white=material('Worn traffic paint','#dedac7'),yellow=material('SF yellow traffic paint','#ceb667');
  const curb=material('Granite curb','#bcbdb4'),red=material('Red intersection curbs','#9e6254');
  const metal=material('SF dark green street furniture','#3d4a42',.58,.3);
  const batches=new Map<string,{mat:THREE.Material;geos:THREE.BufferGeometry[]}>();
  function batch(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,z:number){
    const key=`${Math.floor(x/120)},${Math.floor(z/120)}/${mat.uuid}`;
    if(!batches.has(key))batches.set(key,{mat,geos:[]});batches.get(key)!.geos.push(geo);
  }
  function box(mat:THREE.Material,x:number,z:number,y:number,w:number,h:number,d:number,yaw=0){
    const geo=new THREE.BoxGeometry(w,h,d);geo.rotateY(-yaw);geo.translate(x,y,-z);batch(geo,mat,x,z);
  }
  function strip(points:readonly {x:number;z:number}[],left:number,right:number,rise:number,mat:THREE.Material){
    if(points.length<2)return;
    const vertices:number[]=[],uvs:number[]=[],indices:number[]=[];
    points.forEach((p,i)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const length=distance(a,b)||1,nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length;
      for(const width of [left,right]){const x=p.x+nx*width,z=p.z+nz*width;vertices.push(x,ground(x,z)+rise,-z);uvs.push(x/12,-z/12);}
      if(i){const n=i*2;indices.push(n-2,n-1,n,n-1,n+1,n);}
    });
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
    batch(geo,mat,points[0].x,points[0].z);
  }
  // Shared bare-earth elevations keep park slopes, sidewalks and street corners
  // joined. Source parcel buildings include their own stepped foundations.
  const grid=CEREBRAL_GROUND_GRID;
  const streetPoints=layout.streets.flatMap(street=>street.points);
  const cellX=(grid.maxX-grid.minX)/(grid.columns-1),cellZ=(grid.maxZ-grid.minZ)/(grid.rows-1);
  const edgeMinX=Math.min(layout.bounds.minX,...streetPoints.map(p=>p.x))-25,edgeMaxX=Math.max(layout.bounds.maxX,...streetPoints.map(p=>p.x))+25;
  const edgeMinZ=Math.min(layout.bounds.minZ,...streetPoints.map(p=>p.z))-25,edgeMaxZ=Math.max(layout.bounds.maxZ,...streetPoints.map(p=>p.z))+25;
  const extraLeft=Math.max(0,Math.ceil((grid.minX-edgeMinX)/cellX)),extraRight=Math.max(0,Math.ceil((edgeMaxX-grid.maxX)/cellX));
  const extraSouth=Math.max(0,Math.ceil((grid.minZ-edgeMinZ)/cellZ)),extraNorth=Math.max(0,Math.ceil((edgeMaxZ-grid.maxZ)/cellZ));
  const terrainMinX=grid.minX-extraLeft*cellX,terrainMaxX=grid.maxX+extraRight*cellX;
  const terrainMinZ=grid.minZ-extraSouth*cellZ,terrainMaxZ=grid.maxZ+extraNorth*cellZ;
  // Preserve the DEM's pixel-centre alignment while subdividing its bilinear
  // cells. A single triangle per half-cell can poke through measured roads.
  const terrain=new THREE.PlaneGeometry(terrainMaxX-terrainMinX,terrainMaxZ-terrainMinZ,(grid.columns-1+extraLeft+extraRight)*3,(grid.rows-1+extraSouth+extraNorth)*3);
  terrain.rotateX(-Math.PI/2);terrain.translate((terrainMinX+terrainMaxX)/2,0,-(terrainMinZ+terrainMaxZ)/2);
  const verts=terrain.attributes.position;
  for(let i=0;i<verts.count;i++)verts.setY(i,ground(verts.getX(i),-verts.getZ(i))-.07);
  terrain.computeVertexNormals();const base=new THREE.Mesh(terrain,concrete);base.name='USGS 3DEP terrain / real neighborhood grades';base.receiveShadow=true;group.add(base);

  const segments=layout.streets.flatMap(street=>street.points.slice(1).map((b,i)=>({a:street.points[i],b,width:street.width,name:street.name})));
  function roadDistance(x:number,z:number,exclude=''){
    let best=Infinity;
    for(const s of segments){if(s.name===exclude)continue;const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;const t=THREE.MathUtils.clamp(((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz||1),0,1);best=Math.min(best,Math.hypot(x-s.a.x-dx*t,z-s.a.z-dz*t)-s.width/2);}
    return best;
  }
  function curbSection(a:{x:number;z:number},b:{x:number;z:number},offset:number,street:string,mat:THREE.Material,rise:number){
    const length=distance(a,b);if(length<.01)return;
    const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,steps=Math.ceil(length/2);
    let run:Array<{x:number;z:number}>=[];
    for(let i=0;i<=steps;i++){
      const p={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps};
      const clear=roadDistance(p.x+dz*offset,p.z-dx*offset,street)>.4;
      if(clear)run.push(p);
      if(!clear||i===steps){if(run.length>1)strip(run,offset-.13,offset+.13,rise,mat);run=[];}
    }
  }
  for(const street of layout.streets){
    strip(street.points,-street.width/2,street.width/2,.035,asphalt);
    for(let i=1;i<street.points.length;i++){
      const a=street.points[i-1],b=street.points[i];
      for(const side of [-1,1])curbSection(a,b,side*(street.width/2+.12),street.name,curb,.15);
    }
  }
  // The measured southwest entrance and southeast exit get a modestly widened
  // asphalt racing surface. A narrow fictional connector under the glide keeps
  // a slow approach playable without cutting an invisible track across grass.
  const parkStart=route.anchorProgress[A.parkEntrance]-8,parkEnd=route.anchorProgress[A.steinerDescent]+6;
  const launch=route.LAUNCH_ZONES[0];
  const parkVertices:number[]=[],parkUvs:number[]=[],parkIndices:number[]=[];
  const parkSteps=Math.ceil((parkEnd-parkStart)/1.5);
  for(let i=0;i<=parkSteps;i++){
    const s=THREE.MathUtils.lerp(parkStart,parkEnd,i/parkSteps);
    let half=THREE.MathUtils.lerp(6.4,4.4,THREE.MathUtils.smoothstep(s,parkStart,parkStart+20));
    if(launch){
      half=THREE.MathUtils.lerp(half,2.8,THREE.MathUtils.smoothstep(s,launch.progress-6,launch.progress+12));
      half=THREE.MathUtils.lerp(half,4.6,THREE.MathUtils.smoothstep(s,launch.end-12,launch.end+8));
    }
    half=THREE.MathUtils.lerp(half,6.4,THREE.MathUtils.smoothstep(s,parkEnd-20,parkEnd));
    for(const side of [-1,1]){const p=route.routePoint(s,half*side);parkVertices.push(p.x,ground(p.x,p.z)+.13,-p.z);parkUvs.push(p.x/12,-p.z/12);}
    if(i){const n=i*2;parkIndices.push(n-2,n-1,n,n-1,n+1,n);}
  }
  const parkSurface=new THREE.BufferGeometry();parkSurface.setAttribute('position',new THREE.Float32BufferAttribute(parkVertices,3));parkSurface.setAttribute('uv',new THREE.Float32BufferAttribute(parkUvs,2));parkSurface.setIndex(parkIndices);parkSurface.computeVertexNormals();
  batch(parkSurface,asphalt,-950,-65);
  // Distinct street edges and markings follow the measured, tilted grid.
  const placements:Record<string,Placement[]>={Sedan:[],Hatchback:[],Estate:[],ParkingMeter:[],Hydrant:[],Bicycle:[],LitterBin:[]};
  const trees:Placement[]=[];
  const usedParked:Point[]=[];
  let serial=0;
  for(const street of layout.streets){
    let travel=0,next=10+rand(serial++)*8;
    for(let i=1;i<street.points.length;i++){
      const a=street.points[i-1],b=street.points[i],len=distance(a,b),dx=(b.x-a.x)/len,dz=(b.z-a.z)/len,yaw=Math.atan2(dx,dz);
      if(len<.01)continue;
      while(next<travel+len){
        const t=(next-travel)/len,cx=a.x+(b.x-a.x)*t,cz=a.z+(b.z-a.z)*t;
        const progress=route.routeProgressAt(cx,cz),near=distance(route.sampleRoute(progress),{x:cx,z:cz});
        const seed=serial++;
        if(near<130&&street.width>=9&&roadDistance(cx,cz,street.name)>street.width/2+7){
          for(const side of [-1,1]){
            const x=cx+dz*side*(street.width/2-1.12),z=cz-dx*side*(street.width/2-1.12);
            if(usedParked.some(p=>distance(p,{x,z})<6.5)||rand(seed+side*4)<.2)continue;
            const p={x,z,y:ground(x,z)+.045,yaw:yaw+(side===1?0:Math.PI)};
            placements[['Sedan','Hatchback','Estate'][seed%3]].push(p);usedParked.push(p);
            const sx=cx+dz*side*(street.width/2+1),sz=cz-dx*side*(street.width/2+1);
            if(seed%3===0)placements.ParkingMeter.push({x:sx,z:sz,y:ground(sx,sz)+.05,yaw});
            if(seed%5===0&&roadDistance(sx,sz)>0&&!(sx>-795&&sx<-750&&sz>-90&&sz<20)){
              trees.push({x:sx,z:sz,y:ground(sx,sz),yaw:rand(seed)*Math.PI*2,scale:6.8+rand(seed+12)*3});
              box(metal,sx,sz,ground(sx,sz)+.015,1.25,.07,1.25);
            }
          }
        }
        next+=8+rand(seed+33)*4;
      }
      travel+=len;
    }
  }
  function sign(text:string,x:number,z:number,y:number,yaw:number,width=2.5,bg='#275741',fg='#f4efda'){
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=112;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=bg;ctx.fillRect(0,0,640,112);ctx.strokeStyle=fg;ctx.lineWidth=3;ctx.strokeRect(5,5,630,102);ctx.font='500 58px Arial';ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,320,61,590);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width*112/640),new THREE.MeshStandardMaterial({map:texture,roughness:.65,side:THREE.FrontSide}));
    mesh.name=text;mesh.position.set(x,y,-z);mesh.rotation.y=-yaw;group.add(mesh);register(mesh,0,230);
    const reverse=mesh.clone();reverse.rotation.y+=Math.PI;group.add(reverse);register(reverse,0,230);
  }
  // Crossing bars sit on the local terrain instead of floating across hills.
  const unique=new Set<string>();
  layout.route.forEach((p,index)=>{
    const key=`${Math.round(p.x)},${Math.round(p.z)}`;if(unique.has(key)||p.label.includes('531'))return;unique.add(key);
    const before=layout.route[Math.max(0,index-1)],after=layout.route[Math.min(layout.route.length-1,index+1)];
    const headingPoint=distance(before,p)>.1?before:after;
    const yaw=headingPoint===before?Math.atan2(p.x-before.x,p.z-before.z):Math.atan2(after.x-p.x,after.z-p.z);
    const dx=Math.sin(yaw),dz=Math.cos(yaw);
    for(const s of [-1,1])for(let j=-5;j<=5;j++){
      const cx=p.x+dx*s*9+dz*j*.95,cz=p.z+dz*s*9-dx*j*.95;
      strip([{x:cx-dx*1.25,z:cz-dz*1.25},{x:cx+dx*1.25,z:cz+dz*1.25}],-.28,.28,.065,white);
    }
    const junctions=new Map<string,{name:string;width:number;yaw:number;alignment:number}>();
    for(const s of segments){
      const vx=s.b.x-s.a.x,vz=s.b.z-s.a.z,len=Math.hypot(vx,vz);if(len<.01)continue;
      const t=THREE.MathUtils.clamp(((p.x-s.a.x)*vx+(p.z-s.a.z)*vz)/(len*len),0,1);
      if(Math.hypot(p.x-s.a.x-vx*t,p.z-s.a.z-vz*t)>1.5)continue;
      junctions.set(s.name,{name:s.name,width:s.width,yaw:Math.atan2(vx,vz),alignment:Math.abs((vx*dx+vz*dz)/len)});
    }
    const junction=[...junctions.values()].sort((a,b)=>b.alignment-a.alignment);
    const incoming=junction[0],crossing=junction.find(street=>street.alignment<.5);
    const sideOffset=(incoming?.width??12.8)/2+2,alongOffset=(crossing?.width??12.8)/2+2;
    const sx=p.x+dz*sideOffset+dx*alongOffset,sz=p.z-dx*sideOffset+dz*alongOffset,sy=ground(sx,sz);
    box(metal,sx,sz,sy+2.1,.095,4.2,.095);
    if(incoming)sign(incoming.name.replace(/ Street$/,' ST'),sx,sz,sy+3.9,incoming.yaw-Math.PI/2);
    if(crossing)sign(crossing.name.replace(/ Street$/,' ST'),sx,sz,sy+3.55,crossing.yaw-Math.PI/2);
    placements.Hydrant.push({x:sx+dz*1.6,z:sz-dx*1.6,y:ground(sx+dz*1.6,sz-dx*1.6),yaw});
    if(index%2===0)placements.LitterBin.push({x:sx-dx*2,z:sz-dz*2,y:ground(sx-dx*2,sz-dz*2),yaw});
    if(index%3===0)placements.Bicycle.push({x:sx-dx*4,z:sz-dz*4,y:ground(sx-dx*4,sz-dz*4),yaw});
    // No-parking red belongs on the actual curb, outside the cross-street.
    if(incoming){
      const start=(crossing?.width??12.8)/2+.65,end=start+6;
      curbSection({x:p.x+dx*start,z:p.z+dz*start},{x:p.x+dx*end,z:p.z+dz*end},incoming.width/2+.12,incoming.name,red,.17);
    }
  });
  // Sparse yellow dashes guide a race without replacing real streets with a track.
  for(let s=15;s<route.TRACK_LENGTH;s+=9){const p=route.sampleRoute(s),q=route.sampleRoute(s+2.8);strip([p,q],-.10,.10,s>parkStart&&s<parkEnd?.155:.075,yellow);}
  for(const s of [route.START_PROGRESS-5,route.TRACK_LENGTH-1]){
    const yaw=route.routeYaw(s);for(let row=0;row<2;row++)for(let i=-6;i<=6;i++){
      const p=route.routePoint(s+row*.65,i*.85);strip([{x:p.x-Math.sin(yaw)*.3,z:p.z-Math.cos(yaw)*.3},{x:p.x+Math.sin(yaw)*.3,z:p.z+Math.cos(yaw)*.3}],-.42,.42,.08,(i+row)%2?white:metal);
    }
  }
  for(const {mat,geos} of batches.values()){
    const geo=mergeGeometries(geos);geos.forEach(g=>g.dispose());if(!geo)continue;
    const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;mesh.castShadow=mat===metal;group.add(mesh);register(mesh,0,650);
  }
  function configure(model:THREE.Object3D,cast=true){model.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=cast&&!low;o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)if(m instanceof THREE.MeshStandardMaterial){m.envMapIntensity=/glazing/.test(m.name)?1.35:m.metalness>.2?.65:.35;for(const map of [m.map,m.normalMap,m.roughnessMap])if(map)map.anisotropy=8;}}});}
  const assets=await Promise.all([
    loader.loadAsync('/assets/cerebral-valley/heroes.glb'),
    loader.loadAsync('/assets/cerebral-valley/neighborhood.glb'),
    loader.loadAsync('/assets/cerebral-valley/neighborhood-lod.glb'),
    loader.loadAsync('/assets/cerebral-valley/streetlife.glb'),
    loader.loadAsync('/assets/vegetation/jacaranda.glb'),
    loader.loadAsync('/assets/cerebral-valley/canopy-lod.glb'),
    fetch('/assets/cerebral-valley/vegetation-anchors.json').then(r=>r.json()),
    createCerebralBackground(),createCerebralSkyline()
  ]);
  const [heroes,nearBuildings,farBuildings,streetlife,treeSource,treeLOD,anchors,background,skyline]=assets;
  group.add(skyline);
  background.userData.cerebralSkipAO=true;
  group.add(background);background.children.forEach(o=>register(o,0,1100));
  for(const [asset,near,far] of [[heroes,0,650],[nearBuildings,0,low?80:125],[farBuildings,low?80:125,650]] as const){
    const model=asset.scene;configure(model,near===0);group.add(model);model.updateMatrixWorld(true);
    if(near>0)model.userData.cerebralSkipAO=true;
    const blocks=new Map<string,THREE.Group>();
    for(const o of [...model.children]){
      const block=o.userData.spatial_block as string|undefined;
      if(block){if(!blocks.has(block)){const b=new THREE.Group();b.name=block;blocks.set(block,b);model.add(b);}blocks.get(block)!.add(o);}
      else if(o instanceof THREE.Mesh)register(o,near,far);
    }
    for(const [name,block] of blocks){
      if(near>0){
        // The distant Blender mesh retains modeled windows/roof silhouettes.
        // Bake its finish colors into vertices to draw each block in one call.
        const geometries:THREE.BufferGeometry[]=[];
        for(const o of [...block.children])if(o instanceof THREE.Mesh){
          const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
          for(const attribute of Object.keys(geo.attributes))if(!['position','normal'].includes(attribute))geo.deleteAttribute(attribute);
          geo.applyMatrix4(o.matrixWorld);const m=Array.isArray(o.material)?o.material[0]:o.material;
          const color=m instanceof THREE.MeshStandardMaterial?m.color:new THREE.Color('#bbb9aa');
          const values=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<values.length;i+=3){values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}
          geo.setAttribute('color',new THREE.BufferAttribute(values,3));geometries.push(geo);block.remove(o);
        }
        const geo=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
        if(geo){const m=new THREE.MeshStandardMaterial({name:'Cerebral / batched distant Blender facade',vertexColors:true,roughness:.82,envMapIntensity:.35});const mesh=new THREE.Mesh(geo,m);mesh.receiveShadow=true;block.add(mesh);}
      }
      const match=name.match(/^block (-?\d+) (-?\d+)$/);
      if(match)cull.push({object:block,center:new THREE.Vector3((Number(match[1])+.5)*190,0,-(Number(match[2])+.5)*190),radius:134,near,far});
      else register(block,near,far);
    }
  }
  // Every prototype is instanced per spatial cell; materials and geometry are
  // shared. The Blender study-row parent translations are stripped first.
  const transform=new THREE.Object3D();
  function instanceModel(model:THREE.Object3D,positions:Placement[],name:string,near=0,far=330,isTree=false){
    model.updateMatrixWorld(true);
    const cells=new Map<string,Placement[]>();for(const p of positions){const key=`${Math.floor(p.x/75)},${Math.floor(p.z/75)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(p);}
    for(const [key,points] of cells){
      const cell=new THREE.Group();cell.name=`${name} / ${key}`;if(near>0)cell.userData.cerebralSkipAO=true;
      model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
        const geo=o.geometry.clone().applyMatrix4(o.matrixWorld);const mesh=new THREE.InstancedMesh(geo,o.material,points.length);mesh.name=`${name} / ${o.name}`;
        mesh.castShadow=!low&&near===0;mesh.receiveShadow=true;
        points.forEach((p,i)=>{
          transform.position.set(p.x,p.y,-p.z);const dx=Math.sin(p.yaw),dz=Math.cos(p.yaw);const pitch=isTree?0:Math.atan((ground(p.x+dx,p.z+dz)-ground(p.x-dx,p.z-dz))/2);transform.rotation.set(pitch,-p.yaw,0,'YXZ');transform.scale.setScalar(p.scale??1);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
          if(!isTree&&o.material instanceof THREE.MeshStandardMaterial&&o.material.name.includes('car paint'))mesh.setColorAt(i,new THREE.Color(['#adbfc7','#ece8dd','#3c484d','#718080','#8a4d40','#c5bb9f','#546477'][Math.abs(Math.floor(p.x+p.z))%7]));
        });mesh.computeBoundingSphere();cell.add(mesh);
      });group.add(cell);register(cell,near,far);
    }
  }
  for(const [name,points] of Object.entries(placements)){
    const prototype=streetlife.scene.getObjectByName(name);if(!prototype)throw new Error(`Street-life prototype missing: ${name}`);
    const model=prototype.clone(true);model.position.set(0,0,0);configure(model);instanceModel(model,points,name,0,['Sedan','Hatchback','Estate'].includes(name)?200:150);
  }
  const source=treeSource.scene;source.updateMatrixWorld(true);
  const treeBounds=new THREE.Box3().setFromObject(source),treeHeight=treeBounds.max.y-treeBounds.min.y;
  const treeMaterials=new Map<string,THREE.Material|THREE.Material[]>();
  source.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const materials=Array.isArray(o.material)?o.material:[o.material];
    materials.forEach(m=>{treeMaterials.set(m.name,m);if(!(m instanceof THREE.MeshStandardMaterial))return;m.roughness=.83;m.envMapIntensity=.3;
      if(m.name.includes('leaves')){m.transparent=false;m.alphaTest=.42;m.alphaToCoverage=true;m.side=m.shadowSide=THREE.DoubleSide;m.color.set('#b8ce99');m.emissiveMap=m.map;m.emissive.set('#6a814e');m.emissiveIntensity=.22;m.normalScale.set(.45,.45);}
      for(const map of [m.map,m.normalMap,m.roughnessMap])if(map)map.anisotropy=4;
    });
  });
  treeLOD.scene.traverse(o=>{if(o instanceof THREE.Mesh){const mat=treeMaterials.get(o.name);if(!mat)throw new Error(`Missing scanned canopy material ${o.name}`);if(mat instanceof THREE.MeshStandardMaterial&&o.name.includes('leaves')){const leaves=mat.clone();leaves.alphaTest=.26;o.material=leaves;}else o.material=mat;}});
  for(const p of anchors.anchors as Array<Placement&{park?:string}>){
    // The familiar eastern Alamo lawn is open: retain mature perimeter trees
    // without planting an invented screen across the Painted Ladies panorama.
    if(p.park==='Alamo Square'&&p.x>-925&&p.z<55&&p.z>-108)continue;
    const onRoute=route.routeProgressAt(p.x,p.z),near=route.sampleRoute(onRoute);
    if(p.park==='Alamo Square'&&onRoute>parkStart-10&&onRoute<parkEnd+10&&distance(p,near)<10)continue;
    trees.push({...p,scale:11*(p.scale??1)});
  }
  const treePlacements=trees.map(p=>{const scale=(p.scale??9)/treeHeight;return {...p,y:p.y-treeBounds.min.y*scale,scale};});
  if(!low)instanceModel(source,treePlacements,'Scanned mature canopy',0,40,true);
  instanceModel(treeLOD.scene,treePlacements,'Distant mature canopy',low?0:40,low?240:380,true);

  const at=(index:number)=>route.anchorProgress[index];
  const view=(name:string,x:number,z:number,ex:number,ez:number,rise:number,progress:number):CerebralView=>({name,look:{x,y:ground(x,z)+5,z},eye:{x:ex,y:ground(ex,ez)+rise,z:ez},progress});
  const views=[
    view('Hayes Valley',-145,-1,15,23,4.5,route.START_PROGRESS),
    view('Alamo Square',-941,-30,-1050,-153,11,at(A.parkEntrance)),
    view('Painted Ladies',-757,-34,-809,-48,4,at(A.landing)),
    {...view('Skyline Glide',-757,-34,-913,-61,22,at(A.launchCrest)),glide:true},
    view('531 Page',-475,-401,-493,-377,3.5,at(A.page531)),
    view('Café Réveille',-705,-608,-676,-627,3.7,at(A.reveille)),
    view('Duboce Park',-835,-782,-665,-786,5,at(A.duboce)),
  ];
  const obstacles=parkedCarObstacles(route,[...placements.Sedan,...placements.Hatchback,...placements.Estate]);
  decoder.dispose();
  return {group,views,layout,obstacles,update(_time:number,progress:number,eye?:THREE.Vector3){
    const p=route.sampleRoute(progress),camera=eye??new THREE.Vector3(p.x,p.y,-p.z);
    for(const entry of cull){const d=Math.hypot(camera.x-entry.center.x,camera.z-entry.center.z);entry.object.visible=d<entry.far+entry.radius&&(entry.near===0||d>=entry.near+entry.radius);}
  }};
}

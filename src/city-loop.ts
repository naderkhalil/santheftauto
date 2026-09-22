import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHECKPOINTS, ROAD_HALF_WIDTH, ROUTE_POLYLINE, ROUTE_STOPS, TRACK_LENGTH, groundHeight, routePoint, routeProgressAt, routeSlope, routeYaw, sampleRoute, type Obstacle } from './route';

/** A compact street grid, with the square and Grant left to their authored sets. */
export function createCityLoop(scene: THREE.Scene) {
  const group = new THREE.Group(); group.name = 'Downtown San Francisco / connected city blocks'; scene.add(group);
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, roughness = .8, metalness = 0) => {
    const key = `${color}/${roughness}/${metalness}`;
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({color, roughness, metalness}));
    return mats.get(key)!;
  };
  const stone=mat('#e8dbc2'), curb=mat('#c9c4b7'), dark=mat('#354149'), metal=mat('#526760',.55,.45), glass=mat('#567a86',.27,.25), roof=mat('#6e7878'), cream=mat('#f1e6d1');
  const gold=mat('#dab148',.5,.3), green=mat('#366847'), red=mat('#b93332'), mint=mat('#b3eacf');
  const cube=new THREE.BoxGeometry(1,1,1), cyl=new THREE.CylinderGeometry(1,1,1,8), sphere=new THREE.SphereGeometry(1,8,6);
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const add=(geo:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,yaw=0,pitch=0)=>{
    const g=geo.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ')),new THREE.Vector3(sx,sy,sz)));
    if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(g);
  };
  const box=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,yaw=0,pitch=0)=>add(cube,m,x,y,z,w,h,d,yaw,pitch);
  const roadBox=(m:THREE.Material,s:number,lateral:number,w:number,h:number,d:number)=>{const p=routePoint(s,lateral),pitch=-Math.atan(routeSlope(s));box(m,p.x,p.y+.165,p.z,w,h,d/Math.cos(pitch),routeYaw(s),pitch);};
  const pole=(m:THREE.Material,x:number,y:number,z:number,r:number,h:number)=>add(cyl,m,x,y,z,r,h,r);
  const beam=(m:THREE.Material,a:THREE.Vector3,b:THREE.Vector3,r:number)=>{
    const g=new THREE.CylinderGeometry(r,r,a.distanceTo(b),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(g);
  };
  function label(text:string,x:number,y:number,z:number,w:number,h:number,yaw=0,bg='#284a41',color='#f9f2d7') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const c=canvas.getContext('2d')!;
    c.fillStyle=bg;c.fillRect(0,0,1024,128);c.strokeStyle=color;c.lineWidth=3;c.strokeRect(9,9,1006,110);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='600 58px Arial';c.fillText(text,512,66,960);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,roughness:.8,side:THREE.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=yaw;group.add(mesh);
  }
  // One continuous road ribbon keeps the tyres on precisely the same hills as physics.
  function ribbon(left:number,right:number,height:number,material:THREE.Material,name:string) {
    const pos:number[]=[],uv:number[]=[],indices:number[]=[];const steps=Math.ceil((TRACK_LENGTH+25)/2);
    for(let i=0;i<=steps;i++){
      const s=-15+(TRACK_LENGTH+40)*i/steps;
      for(const lateral of [left,right]){const p=routePoint(s,lateral);pos.push(p.x,p.y+height,p.z);uv.push(lateral/9,s/9);}
      if(i<steps){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
  }
  const asphalt=mat('#697079',.93),sideRoad=mat('#697076',.94);
  // Terrain sits below street surfaces; building foundations meet the local slope.
  const terrain=new THREE.PlaneGeometry(1480,1900,148,190);terrain.rotateX(-Math.PI/2);terrain.translate(-55,0,180);
  const verts=terrain.attributes.position;
  for(let i=0;i<verts.count;i++)verts.setY(i,groundHeight(verts.getX(i),verts.getZ(i))-.34);
  terrain.computeVertexNormals();const land=new THREE.Mesh(terrain,mat('#b8b9a8'));land.receiveShadow=true;group.add(land);
  ribbon(-12.7,12.7,.05,curb,'continuous sidewalks');ribbon(-ROAD_HALF_WIDTH,ROAD_HALF_WIDTH,.13,asphalt,'powell-asphalt');
  ribbon(-7.6,-7.35,.20,cream,'west curb');ribbon(7.35,7.6,.20,cream,'east curb');

  const streetsX=[-75,75,175,300,410,500,590],streetsZ=[-65,65,185,300,400,500,600,700];
  // Cross streets establish the grid and give views into the rest of the city.
  function crossRoad(ax:number,az:number,bx:number,bz:number,width=14.8){
    const length=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/length,dz=(bz-az)/length;const points:number[]=[],ids:number[]=[];
    const n=Math.ceil(length/5);
    for(let i=0;i<=n;i++)for(const side of [-1,1]){const x=ax+(bx-ax)*i/n+dz*width/2*side,z=az+(bz-az)*i/n-dx*width/2*side;points.push(x,groundHeight(x,z)+.07,z);if(i<n&&side===-1){const j=i*2;ids.push(j,j+2,j+1,j+1,j+2,j+3);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(ids);g.computeVertexNormals();if(!batches.has(sideRoad))batches.set(sideRoad,[]);batches.get(sideRoad)!.push(g);
  }
  for(const z of streetsZ)crossRoad(-260,z,635,z);
  for(const x of streetsX)crossRoad(x,-180,x,860);

  // Street furniture follows the course frame, including turns and the eastbound finish.
  for(let s=20;s<TRACK_LENGTH-15;s+=29){
    const center=sampleRoute(s),yaw=routeYaw(s);
    if(Math.abs(routeYaw(s+9)-routeYaw(s-9))>.15)continue;
    for(const side of [-1,1]){
      const p=routePoint(s,side*10.7),y=p.y;
      pole(metal,p.x,y+3.7,p.z,.09,7.4);pole(metal,p.x,y+.38,p.z,.21,.75);
      const arm=routePoint(s,side*9.4);beam(metal,new THREE.Vector3(p.x,y+7.1,p.z),new THREE.Vector3(arm.x,y+7.65,arm.z),.055);
      add(sphere,cream,arm.x,y+7.63,arm.z,.29,.39,.29);pole(metal,arm.x,y+8.03,arm.z,.10,.16);
      if(Math.floor(s)%3===0){box(red,p.x,y+.23,p.z,1.4,.09,.3,yaw);}
    }
    if(s<ROUTE_STOPS.bush || s>ROUTE_STOPS.washington){
      for(const lane of [-.15,.15])roadBox(gold,s,lane,.10,.014,5.5);
    }
  }
  // Powell's twin cable-car rails, slot and overhead wire give the climb its identity.
  const powellStart=routeProgressAt(-75,-46),powellEnd=routeProgressAt(-75,279);
  for(let s=powellStart;s<powellEnd;s+=3){for(const offset of [-2.8,-1.45,1.45,2.8])roadBox(metal,s,offset,.07,.014,3.12);roadBox(dark,s,0,.13,.016,3.12);}
  const roadNames:[number,string][]=[[32,'POST ST'],[ROUTE_STOPS.stockton+18,'STOCKTON ST'],[ROUTE_STOPS.geary+18,'GEARY ST'],[ROUTE_STOPS.powell+45,'POWELL ST'],[ROUTE_STOPS.bush+20,'BUSH ST'],[ROUTE_STOPS.grant+24,'GRANT AVE'],[ROUTE_STOPS.washington+25,'WASHINGTON ST'],[ROUTE_STOPS.embarcadero+35,'THE EMBARCADERO']];
  for(const [s,name] of roadNames){const p=routePoint(s,-10.5),yaw=routeYaw(s);pole(metal,p.x,p.y+3.5,p.z,.065,7);label(name,p.x,p.y+6.1,p.z,5,.64,yaw+Math.PI,'#284a41');}
  for(const [cornerX,cornerZ] of ROUTE_POLYLINE.slice(1,-1)){
    const corner=routeProgressAt(cornerX,cornerZ),s=corner-30;
    for(let stripe=-6;stripe<=6;stripe+=1.5){const p=routePoint(s,stripe);box(cream,p.x,p.y+.17,p.z,.65,.018,3.4,routeYaw(s));}
    const p=routePoint(s+12,-10);pole(metal,p.x,p.y+2.9,p.z,.09,5.8);box(dark,p.x,p.y+5.1,p.z,.40,1.12,.30);
    for(let i=0;i<3;i++)add(sphere,i===2?green:i===0?red:gold,p.x,p.y+5.42-i*.31,p.z-.18,.10,.10,.05);
    const arrow=routePoint(s+5,-9.5),angle=routeYaw(corner+22)-routeYaw(corner-22),turn=Math.atan2(Math.sin(angle),Math.cos(angle));
    label(turn>0?'‹  ‹  ‹':'›  ›  ›',arrow.x,arrow.y+3.3,arrow.z,3.6,.7,routeYaw(s)+Math.PI,'#2e665e','#d0f8b3');
  }

  // Narrow frontages, regular floor heights, recessed glazing and real rooflines.
  const palette=['#d9c7af','#c7b0a2','#d5d4bf','#c29b84','#bcbfc0','#e5d5be','#a9b7ad','#dbc59c'];
  function building(x:number,z:number,w:number,d:number,h:number,index:number,front:'east'|'west'|'north'|'south'='south'){
    const base=Math.min(groundHeight(x-w/2,z-d/2),groundHeight(x+w/2,z+d/2));
    const wall=mat(palette[index%palette.length]);box(wall,x,base+h/2,z,w,h,d);
    box(stone,x,base+3.2,z,w+.16,.65,d+.16);box(stone,x,base+h-.7,z,w+.5,.45,d+.5);box(roof,x,base+h+.1,z,w+.25,.65,d+.25);
    const across=front==='north'||front==='south';const span=across?w:d,depth=across?d:w,faceSign=front==='north'||front==='east'?1:-1;const angle=across?0:Math.PI/2;
    const place=(along:number,y:number,out:number,m:THREE.Material,ww:number,hh:number,dd:number)=>box(m,across?x+along:x+faceSign*(depth/2+out),y,across?z+faceSign*(depth/2+out):z+along,ww,hh,dd,angle);
    const cols=Math.max(2,Math.round(span/3.8)),floors=Math.floor((h-5)/3.35);
    for(let floor=0;floor<floors;floor++)for(let col=0;col<cols;col++){
      const a=(col+.5)*span/cols-span/2,y=base+5.6+floor*3.35;
      place(a,y,.055,dark,2.04,2.2,.09);place(a,y,.115,glass,1.72,1.9,.08);place(a,y-1.13,.24,cream,2.2,.15,.40);place(a,y,.22,stone,.08,2.08,.09);
      if(index%3===0)place(a,y+1.14,.14,cream,2.12,.14,.20);
    }
    for(let i=0;i<Math.max(2,cols-1);i++){
      const a=(i+.5)*span/(cols-1)-span/2;place(a,base+1.65,.08,glass,span/(cols-1)-.7,2.6,.10);place(a,base+3.25,.55,index%2?green:red,span/(cols-1)-.35,.3,1.3);
    }
    for(let j=0;j<2;j++)box(roof,x-w*.22+j*w*.35,base+h+1.1,z+d*.1,w*.16,1.5,d*.22);
    // The return façade has windows too; turning around a block must not reveal blank slabs.
    const rows=Math.max(2,Math.floor(d/4));for(let y=base+6;y<base+h-2;y+=3.35)for(let i=0;i<rows;i++)for(const side of [-1,1])box(glass,x+side*(w/2+.04),y,z+(i+.5)*d/rows-d/2,.08,1.8,1.8);
    const endCols=Math.max(2,Math.floor(w/4));for(let y=base+6;y<base+h-2;y+=3.35)for(let i=0;i<endCols;i++)for(const side of [-1,1]){const xx=x+(i+.5)*w/endCols-w/2;box(glass,xx,y,z+side*(d/2+.04),1.8,1.8,.08);box(cream,xx,y-.98,z+side*(d/2+.12),2.1,.12,.26);}
  }
  // Powell uphill; reserve the square's historic buildings and every cross street.
  for(const side of [-1,1])for(let z=132,i=0;z<278;z+=24,i++){
    if(Math.abs(z-185)<22)continue;
    building(-75+side*27,z,29,21,22+(i%3)*7,i+(side>0?1:4),side>0?'west':'east');
  }
  for(const side of [-1,1])for(let x=-39,i=0;x<144;x+=27,i++)building(x,300+side*26,24,27,22+(i%4)*4,i+3,side>0?'south':'north');
  // Washington is a long downhill view toward the bay, flanked by masonry offices.
  for(const side of [-1,1])for(let x=218,i=0;x<562;x+=32,i++){
    if([300,410,500].some(v=>Math.abs(v-x)<24))continue;
    building(x,700+side*30,29,34,25+i%3*9,i+4,side>0?'south':'north');
  }
  for(let z=310,i=0;z<665;z+=43,i++){
    if(streetsZ.some(v=>Math.abs(v-z)<23))continue;
    building(557,z,38,36,27+i%3*8,i+2,'east');
  }
  // Interior blocks anchor the views around corners; no buildings occupy the plaza.
  let index=0;
  for(let xi=0;xi<streetsX.length-1;xi++)for(let zi=0;zi<streetsZ.length-1;zi++){
    const a=streetsX[xi],b=streetsX[xi+1],c=streetsZ[zi],d=streetsZ[zi+1];
    if(a<90&&c<90)continue;
    if(a===75&&c>=300||a===175&&c>=300)continue;
    const x=(a+b)/2,z=(c+d)/2,w=Math.min(42,b-a-34),depth=Math.min(40,d-c-34);if(w<12||depth<12)continue;
    building(x,z,w,depth,25+(index%7)*6,index++,'south');
  }
  for(let z=-130;z<840;z+=78){if(z>-75&&z<85)continue;building(-206,z,40,48,23+(index%4)*7,index++,'east');}
  // The square belongs to a continuous city, with streets visible beyond every turn.
  building(-192,0,43,101,54,index++,'east');
  building(149,0,25,99,48,index++,'west');
  for(const x of [-43,31])building(x,145,54,40,34+(index%2)*10,index++,'south');
  const outerX=[-660,-530,-400,-270,-150,-20,110,240,365,485,590];
  const outerZ=[-660,-525,-390,-250,-130,15,140,255,375,495,615,785,920,1050];
  for(const x of [-600,-465,-335])crossRoad(x,-730,x,1110);
  for(const z of [-600,-465,-335,-195,850,990])crossRoad(-740,z,640,z);
  for(const x of outerX)for(const z of outerZ){
    if(x>-245&&z>-170&&z<760)continue;
    if(x>530&&z>100)continue;
    // Tight blocks with multiple roof heights rather than isolated towers on empty ground.
    const width=x<-200?54:58,depth=64,height=22+(index%6)*8;
    building(x,z,width,depth,height,index++,'north');
    if(x<-240||z<-200)building(x+36,z+28,20,31,height*.72,index++,'east');
  }
  // A few recognisable distant silhouettes, positioned relative to the street grid.
  const blue=mat('#70a4b3',.27,.35),white=mat('#e0ded1');
  for(let floor=0;floor<49;floor++){const r=20*(1-.24*(floor/49)**2);pole(blue,403,4+floor*3.55,-242,r,3.3);pole(white,403,5.7+floor*3.55,-242,r+.13,.12);}
  add(sphere,white,403,177,-242,15,9,15);
  const pyramid=new THREE.ConeGeometry(22,140,4);pyramid.rotateY(Math.PI/4);add(pyramid,cream,326,90,813,1,1,1);pole(white,326,174,813,.65,29);
  box(cream,326,18,813,40,30,40);for(const side of [-1,1])box(stone,326+side*14,87,813,6,100,13);
  pole(stone,271,99,1030,9,53);pole(cream,271,127,1030,10.5,4);for(let i=0;i<8;i++){const a=i*Math.PI/4;pole(dark,271+Math.sin(a)*8.6,121,1030+Math.cos(a)*8.6,.9,9);}

  // Cars and one Powell cable car remain physical obstacles, in route coordinates.
  const obstacles:Obstacle[]=[];
  function parked(s:number,lateral:number,cable=false){
    const p=routePoint(s,lateral),yaw=routeYaw(s),root=new THREE.Group();root.position.set(p.x,p.y+.16,p.z);root.rotation.set(-Math.atan(routeSlope(s)),yaw,0,'YXZ');group.add(root);
    const part=(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;root.add(mesh);};
    const w=cable?2.25:1.85,length=cable?7.2:4.2;part(w,cable?.85:.65,length,cable?mat('#aa4734'):mat('#7897a5'),0,.64,0);part(w*.85,cable?1.45:.62,length*.57,glass,0,cable?1.77:1.17,0);part(w+.13,.16,length*.91,cream,0,cable?2.65:1.51,0);
    if(cable){for(const x of [-1,1])for(let z=-2.9;z<=2.9;z+=.97)part(.08,1.6,.08,gold,x,1.72,z);part(w+.2,.2,length+.3,dark,0,2.74,0);}
    for(const side of [-1,1])for(const z of [-length*.33,length*.33]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.18,12),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(side*w/2,.35,z);root.add(wheel);}
    obstacles.push({progress:s,lateral,width:w,length,kind:cable?'cablecar':'car'});
  }
  parked(routeProgressAt(-75,139),-3.4,true);parked(routeProgressAt(175,385),4.6);parked(routeProgressAt(350,700),-4.7);parked(routeProgressAt(590,450),4.6);
  // A few sidewalk residents establish scale without crowding the racing line.
  for(let s=35,i=0;s<TRACK_LENGTH-80;s+=17,i++){
    if(i%3===0)continue;const p=routePoint(s,(i%2?1:-1)*(9+((i*7)%3)));
    add(sphere,mat(['#b87a56','#d8ab83','#8a5e46'][i%3]),p.x,p.y+1.65,p.z,.16,.21,.16);box(mat(['#51698b','#cb5842','#e1ae52','#657c64'][i%4]),p.x,p.y+1.08,p.z,.43,.7,.27);
    for(const side of [-1,1])box(dark,p.x+side*.11,p.y+.4,p.z,.13,.68,.15);
  }
  CHECKPOINTS.forEach((s,i)=>{
    const p=routePoint(s,0),yaw=routeYaw(s),finish=i===CHECKPOINTS.length-1;
    // Dragon Gate is the Chinatown checkpoint: an extra gantry would hide its roof.
    if(i!==1){
      for(const side of [-1,1]){const q=routePoint(s,side*8.9);pole(metal,q.x,q.y+3.5,q.z,.08,7);}
      box(dark,p.x,p.y+6.7,p.z,18,.65,.20,yaw);
      const face=routePoint(s-.13,0);
      label(finish?'THE BAY / FINISH':`${String(i+1).padStart(2,'0')} / ${['UNION SQUARE','CHINATOWN','THE EMBARCADERO'][i]}`,face.x,p.y+6.7,face.z,17,.48,yaw+Math.PI);
    }
    for(let row=0;row<(finish?4:1);row++)for(let col=0;col<18;col++){const q=routePoint(s+row*.6,-7+(col+.5)*14/18);box((row+col)%2?dark:cream,q.x,q.y+.18,q.z,14/18,.018,.6,routeYaw(s));}
  });
  // Promenade ends where the rotated waterfront begins, without a wall across Market.
  box(stone,654,1.6,480,53,1,600);
  for(let z=160;z<785;z+=17){pole(metal,680,2.8,z,.08,3);if(Math.abs(z-250)>30)beam(metal,new THREE.Vector3(680,3.2,z),new THREE.Vector3(680,3.2,z+17),.055);}
  const meshes:THREE.Mesh[]=[];
  for(const [material,geometries] of batches){const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geometry)continue;const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=material!==sideRoad;mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh);}
  cube.dispose();cyl.dispose();sphere.dispose();
  return {group,obstacles,update(_time:number,_progress:number){},setQuality(low:boolean){meshes.forEach(m=>m.castShadow=!low);}};
}

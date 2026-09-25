import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cerebralGroundHeight, type CerebralBuilding } from './cerebral-geography';

/** Low-detail surveyed parcels behind the driving district. Their true roofline
 * and continuous street walls close park vistas without invented tower blocks. */
export async function createCerebralBackground(){
  const response=await fetch('/assets/cerebral-valley/background-buildings.json');
  if(!response.ok)throw new Error('Cerebral neighborhood surroundings could not load.');
  const data=await response.json() as {buildings:CerebralBuilding[]};
  const includedResponse=await fetch('/assets/cerebral-valley/neighborhood-parcels.json');
  if(!includedResponse.ok)throw new Error('Cerebral detailed parcel manifest could not load.');
  const included=new Set<string>(await includedResponse.json());
  const group=new THREE.Group();group.name='Surveyed surrounding hillside blocks';
  const material=new THREE.MeshStandardMaterial({name:'Cerebral / distant actual parcels',vertexColors:true,roughness:.88,envMapIntensity:.3});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 districtUv;varying float districtWall;').replace('#include <begin_vertex>','#include <begin_vertex>\ndistrictUv=uv;districtWall=1.-abs(normal.y);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 districtUv;varying float districtWall;').replace('#include <color_fragment>',`#include <color_fragment>
      vec2 pane=fract(districtUv);
      float windowShape=step(.25,pane.x)*step(pane.x,.70)*step(.24,pane.y)*step(pane.y,.79)*districtWall;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.11,.17,.19),windowShape*.82);`);
  };
  const batches=new Map<string,THREE.BufferGeometry[]>();
  const palette=['#c2b7a5','#adb7b2','#c7bdb0','#a6b0b2','#bdc0b6','#c9bfa9','#999f96'];
  for(const b of data.buildings){
    if(included.has(b.id))continue;
    const points=b.polygon.map(p=>new THREE.Vector2(p.x,-p.z));if(points.length<3)continue;
    const vertices:number[]=[],uv:number[]=[],colors:number[]=[],color=new THREE.Color(b.colour?.startsWith('#')?b.colour:palette[Number(b.id)%palette.length]);
    const top=b.baseHeight+b.height;
    function vertex(x:number,y:number,z:number,u:number,v:number,roof=false){vertices.push(x,y,z);uv.push(u,v);const c=roof?new THREE.Color('#7d807b'):color;colors.push(c.r,c.g,c.b);}
    points.forEach((a,i)=>{
      const c=points[(i+1)%points.length],span=a.distanceTo(c)/3.05;
      for(const [p,y,u] of [[a,b.baseHeight-2,0],[c,b.baseHeight-2,span],[a,top,0],[c,b.baseHeight-2,span],[c,top,span],[a,top,0]] as const)vertex(p.x,y===top?y:Math.min(y,cerebralGroundHeight(p.x,-p.y)-.2),p.y,u,(y-b.baseHeight)/3.1);
    });
    for(const face of THREE.ShapeUtils.triangulateShape(points,[]))for(const id of face){const p=points[id];vertex(p.x,top,p.y,0,0,true);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const key=`${Math.floor(points[0].x/150)},${Math.floor(points[0].y/150)}`;if(!batches.has(key))batches.set(key,[]);batches.get(key)!.push(geo);
  }
  // Sources contain both windings; double-sided walls avoid deleting a surveyed
  // parcel when its mapped ring runs clockwise. They never cast nearby shadows.
  material.side=THREE.DoubleSide;
  for(const [key,geometries] of batches){const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;const mesh=new THREE.Mesh(merged,material);mesh.name=`Surrounding city / ${key}`;mesh.receiveShadow=true;group.add(mesh);}
  return group;
}

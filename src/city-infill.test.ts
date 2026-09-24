import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCityInfill, CITY_INFILL_PROJECTION } from './city-infill.ts';
import { CITY_INFILL_PARCELS } from './city-infill-layout.ts';

function withCanvas<T>(run:()=>T):T {
  const previous=globalThis.document;
  const context=new Proxy({}, {get:()=>()=>{}});
  // Geometry QA needs the texture object, but no browser canvas or WebGL.
  Object.defineProperty(globalThis,'document',{value:{createElement:()=>({width:0,height:0,getContext:()=>context})},configurable:true,writable:true});
  try{return run();}finally{Object.defineProperty(globalThis,'document',{value:previous,configurable:true,writable:true});}
}

test('neighborhood projections stay inside reserved sidewalk clearance, including corner bays and roofs',()=>withCanvas(()=>{
  const representative=[CITY_INFILL_PARCELS[0],CITY_INFILL_PARCELS[1],
    CITY_INFILL_PARCELS.find(p=>p.width>60)??CITY_INFILL_PARCELS[6],
    CITY_INFILL_PARCELS.find(p=>p.district==='waterfront')!];
  for(const parcel of representative) {
    const city=createCityInfill(new THREE.Group(),[parcel]);
    city.group.updateMatrixWorld(true);
    const actual=new THREE.Box3().setFromObject(city.group),tolerance=.0001;
    assert.ok(actual.min.x>=parcel.x-parcel.width/2-CITY_INFILL_PROJECTION-tolerance,parcel.id);
    assert.ok(actual.max.x<=parcel.x+parcel.width/2+CITY_INFILL_PROJECTION+tolerance,parcel.id);
    assert.ok(actual.min.z>=parcel.z-parcel.depth/2-CITY_INFILL_PROJECTION-tolerance,parcel.id);
    assert.ok(actual.max.z<=parcel.z+parcel.depth/2+CITY_INFILL_PROJECTION+tolerance,parcel.id);
    assert.equal(city.group.userData.materialCount,3);
  }
}));

test('four-sided facades have finite geometry and outward window normals',()=>withCanvas(()=>{
  const parcel={...CITY_INFILL_PARCELS[0],fronts:['north','south','east','west'] as const,style:0};
  const city=createCityInfill(new THREE.Group(),[parcel]);
  const directions=new Set<string>();
  city.group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(const name of ['position','normal','uv']) {
      for(const value of object.geometry.getAttribute(name).array)assert.ok(Number.isFinite(value));
    }
    if(object.name!=='window reflections')return;
    const position=object.geometry.getAttribute('position'),normal=object.geometry.getAttribute('normal');
    for(let vertex=0;vertex<position.count;vertex+=4) {
      const nx=normal.getX(vertex),nz=normal.getZ(vertex),px=position.getX(vertex),pz=position.getZ(vertex);
      // Bay return panes face across the street wall; main planes face away
      // from the building center. Check these cardinal outward surfaces.
      if(Math.abs(nx)>.9&&Math.abs(px-parcel.x)>=parcel.width/2){assert.ok((px-parcel.x)*nx>0);directions.add(nx>0?'east':'west');}
      if(Math.abs(nz)>.9&&Math.abs(pz-parcel.z)>=parcel.depth/2){assert.ok((pz-parcel.z)*nz>0);directions.add(nz>0?'north':'south');}
    }
  });
  assert.deepEqual([...directions].sort(),['east','north','south','west']);
}));

test('neighborhood culling accounts for the semantic-to-render reflection',()=>withCanvas(()=>{
  const parcel=CITY_INFILL_PARCELS[0],root=new THREE.Group();root.scale.z=-1;
  const city=createCityInfill(root,[parcel]),camera=new THREE.PerspectiveCamera();
  camera.position.set(parcel.x,40,-parcel.z);city.update(camera);
  assert.equal(city.group.children[0].visible,true);
  assert.ok(city.group.children[0].children.every(child=>child.visible));
  camera.position.set(20000,40,-20000);city.update(camera);
  assert.equal(city.group.children[0].visible,false);
  city.setQuality(true);camera.position.set(parcel.x,40,-parcel.z);city.update(camera);
  city.group.traverse(child=>{if(child instanceof THREE.Mesh)assert.equal(child.castShadow,false);});
}));

test('steep Powell storefronts use narrow bays and grounded entrance landings',()=>withCanvas(()=>{
  const steepParcels=CITY_INFILL_PARCELS.filter(p=>p.blockId==='mason-powell-185');
  const city=createCityInfill(new THREE.Group(),steepParcels);
  const entrances=city.group.userData.entrances as {threshold:number;supportBottom:number;groundMin:number;groundMax:number;shopWidth:number;steep:boolean}[];
  assert.ok(entrances.some(entrance=>entrance.steep),'the regression must cover actual sloping faces');
  for(const entrance of entrances) {
    assert.ok(entrance.supportBottom<entrance.groundMin,'landing foundation embeds into both sides of the hillside');
    assert.ok(Math.abs(entrance.threshold-entrance.groundMax-.12)<.00001,'door sill sits on a landing above the local uphill edge');
    if(entrance.steep)assert.ok(entrance.shopWidth<=3.8+.00001,'steep frontage cannot use a wide center-sampled shop');
  }
}));

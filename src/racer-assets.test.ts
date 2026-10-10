import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import { DRIVERS } from './racer-profile.ts';
import * as THREE from 'three';
import { cloneRacerPart, releaseRacerPart } from './racer-assets.ts';

function glb(file:string){const bytes=readFileSync(new URL('../public/assets/models/'+file,import.meta.url));assert.equal(bytes.readUInt32LE(0),0x46546c67);const size=bytes.readUInt32LE(12);return JSON.parse(bytes.subarray(20,20+size).toString());}
test('playable Blender kit has four independently animated wheels and all seated drivers',()=>{
 const kit=glb('racer-kit.glb');
 for(const name of ['Vehicle','Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Steering',...DRIVERS.flatMap(({id})=>['Standing_'+id,'Seated_'+id])]){
  const nodes=kit.nodes.filter((n:{name:string})=>n.name===name);assert.equal(nodes.length,1,`${name} must have one unambiguous runtime node`);assert.ok(nodes[0].children?.length,`${name} must contain visible geometry`);
 }
 for(const name of ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR']){const wheel=kit.nodes.find((n:{name:string})=>n.name===name);assert.ok(Math.abs(Math.abs(wheel.translation[0])-.9)<.001);assert.ok(Math.abs(wheel.translation[1]-.4)<.001);}
 const steering=kit.nodes.find((n:{name:string})=>n.name==='Steering');
 for(const [axis,value] of [-.35,.99,.04].entries())assert.ok(Math.abs(steering.translation[axis]-value)<.001,'Steering must turn around its own hub');
 const wind=kit.materials.find((m:{name:string})=>m.name==='Windscreen');assert.equal(wind.alphaMode,'BLEND','The driver must not be hidden by opaque glazing');
 assert.ok(!kit.nodes.some((n:{name:string})=>n.name==='Ivory roof'||n.name==='Cabin glass'));
});
test('garage exports map architecture separately from the racing payload',()=>{
 const garage=glb('racer-garage.glb'),kit=glb('racer-kit.glb');
 assert.ok(garage.nodes.some((n:{name:string})=>n.name==='Garage'));
 assert.ok(garage.materials.some((m:{name:string})=>m.name==='Cerebral / garage eucalyptus weatherboard'));
 assert.ok(garage.materials.some((m:{normalTexture:unknown})=>m.normalTexture));
 assert.ok(!kit.nodes.some((n:{name:string})=>n.name==='Garage'));
});

test('the shipped cartoon roster preserves artwork and stays within multiplayer budgets',()=>{
 const output=execFileSync(process.execPath,[fileURLToPath(new URL('../tools/validate-racers.mjs',import.meta.url))],{encoding:'utf8',maxBuffer:2*1024*1024});
 const report=JSON.parse(output);
 assert.equal(report.characterArt.length,DRIVERS.length);
 assert.deepEqual(report.characterArt.map((actor:{id:string})=>actor.id),DRIVERS.map(driver=>driver.id));
});

test('racer instances share baked geometry and textures but isolate customization materials',()=>{
 const kit=new THREE.Group(),actor=new THREE.Group();actor.name='Seated_mark';kit.add(actor);
 const geometry=new THREE.BoxGeometry(),map=new THREE.Texture(),normalMap=new THREE.Texture();
 const material=new THREE.MeshStandardMaterial({map,normalMap,color:0x336699});
 const first=new THREE.Mesh(geometry,material),second=new THREE.Mesh(geometry,[material,material]);
 first.name='face';second.name='jacket';actor.add(first,second);
 const left=cloneRacerPart(kit,'Seated_mark'),right=cloneRacerPart(kit,'Seated_mark');
 const leftFace=left.getObjectByName('face') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
 const rightFace=right.getObjectByName('face') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
 const leftJacket=left.getObjectByName('jacket') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial[]>;
 assert.equal(leftFace.geometry,geometry,'Cloning an opponent must not copy the baked mesh');
 assert.equal(rightFace.geometry,geometry);
 assert.equal(leftFace.material.map,map,'Large color textures remain shared by the cached kit');
 assert.equal(leftFace.material.normalMap,normalMap);
 assert.notEqual(leftFace.material,material);
 assert.notEqual(leftFace.material,rightFace.material,'Changing one player cannot recolor another');
 assert.equal(leftJacket.material[0],leftFace.material,'One source material creates one material per instance');
 assert.equal(leftJacket.material[1],leftFace.material);
 leftFace.material.color.set(0xff0000);
 assert.equal(material.color.getHex(),0x336699);
 assert.equal(rightFace.material.color.getHex(),0x336699);
 assert.ok(leftFace.castShadow&&leftFace.receiveShadow);
 assert.throws(()=>cloneRacerPart(kit,'Seated_unknown'),/Missing racer asset/);
 releaseRacerPart(left);releaseRacerPart(right);material.dispose();geometry.dispose();map.dispose();normalMap.dispose();
});

test('changing or removing a racer releases only that instance’s materials',()=>{
 const kit=new THREE.Group(),actor=new THREE.Group();actor.name='Seated_mira';kit.add(actor);
 const geometry=new THREE.BoxGeometry(),texture=new THREE.Texture();
 const materials=[new THREE.MeshStandardMaterial({map:texture}),new THREE.MeshStandardMaterial({map:texture})];
 actor.add(new THREE.Mesh(geometry,materials),new THREE.Mesh(geometry,materials[0]));
 const parent=new THREE.Group(),clone=cloneRacerPart(kit,actor.name);parent.add(clone);
 const disposed={geometry:0,texture:0,source:0,instance:0};
 geometry.addEventListener('dispose',()=>disposed.geometry++);texture.addEventListener('dispose',()=>disposed.texture++);
 materials.forEach(material=>material.addEventListener('dispose',()=>disposed.source++));
 const clonedMaterials=new Set<THREE.Material>();
 clone.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])clonedMaterials.add(material);});
 clonedMaterials.forEach(material=>material.addEventListener('dispose',()=>disposed.instance++));
 releaseRacerPart(clone);
 assert.equal(clone.parent,null);
 assert.deepEqual(disposed,{geometry:0,texture:0,source:0,instance:2},'Selection cleanup disposes each private material once and keeps shared resources alive');
 materials.forEach(material=>material.dispose());geometry.dispose();texture.dispose();
});

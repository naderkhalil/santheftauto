import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function glb(file:string){const bytes=readFileSync(new URL('../public/assets/models/'+file,import.meta.url));assert.equal(bytes.readUInt32LE(0),0x46546c67);const size=bytes.readUInt32LE(12);return JSON.parse(bytes.subarray(20,20+size).toString());}
test('playable Blender kit has four independently animated wheels and all seated drivers',()=>{
 const kit=glb('racer-kit.glb');
 for(const name of ['Vehicle','Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Steering',...['dario','sam','elon','jensen'].flatMap(id=>['Standing_'+id,'Seated_'+id])]){
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

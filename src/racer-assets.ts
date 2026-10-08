import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const RACER_ASSET_VERSION='20261008-1';
let kit:Promise<THREE.Group>|null=null;
/** One download shared by the showroom, local car and multiplayer opponents. */
export function loadRacerKit(){
  return kit??=new GLTFLoader().loadAsync(`/assets/models/racer-kit.glb?v=${RACER_ASSET_VERSION}`).then(asset=>asset.scene).catch(error=>{kit=null;throw error;});
}
export function cloneRacerPart(source:THREE.Object3D,name:string){
  const original=source.getObjectByName(name);
  if(!original)throw new Error(`Missing racer asset: ${name}`);
  const root=original.clone(true),materials=new Map<THREE.Material,THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;
    const clone=(material:THREE.Material)=>{if(!materials.has(material))materials.set(material,material.clone());return materials.get(material)!;};
    object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);
  }});
  return root;
}
/** Geometry and baked textures belong to the cached kit; only materials are per instance. */
export function releaseRacerPart(root:THREE.Object3D){const materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});materials.forEach(m=>m.dispose());root.removeFromParent();}

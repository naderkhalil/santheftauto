import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** The modeled Powell frontage uses metres, +Y up and +Z facing the square. */
export function createWestin(parent: THREE.Group, fallback: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'Westin St. Francis / Blender landmark';
  group.position.set(-93, 22, -1.5);
  group.rotation.y = Math.PI / 2;
  // Local authored models retain readable lettering under the city's Z reflection.
  group.scale.x = -1;
  parent.add(group);
  const lod = new THREE.LOD();
  // Explicit camera-distance selection also accounts for the aerial menu.
  lod.autoUpdate = false;
  group.add(lod);
  let low = false;
  let loaded = false;
  const shadowMeshes: THREE.Mesh[] = [];
  const sharedMaterials = new Map<string,THREE.MeshStandardMaterial>();
  const prepare = (object: THREE.Object3D) => {
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.receiveShadow = true;
      child.castShadow = !low;
      shadowMeshes.push(child);
      child.geometry.computeBoundingSphere();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      child.material = materials.map(material=>{
        if(!(material instanceof THREE.MeshStandardMaterial))return material;
        const existing=sharedMaterials.get(material.name);
        if(existing&&existing!==material){
          for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'] as const){if(material[key]&&material[key]!==existing[key])material[key]!.dispose();}
          material.dispose();return existing;
        }
        sharedMaterials.set(material.name,material);return material;
      });
      if(!Array.isArray(child.geometry.groups)||child.geometry.groups.length<2)child.material=child.material[0];
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if(!material.name.startsWith('Westin'))material.name = `Westin / ${material.name}`;
        const glass = /glass|glazing/i.test(material.name);
        material.envMapIntensity = glass ? 1.15 : .55;
        for (const texture of [material.map, material.normalMap, material.roughnessMap, material.aoMap]) {
          if (texture) texture.anisotropy = 8;
        }
      }
    });
    return object;
  };
  const decoder = new DRACOLoader().setDecoderPath('/assets/draco/');
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const ready = loader.loadAsync('/assets/hero/westin.glb').then(async asset => {
    lod.addLevel(prepare(asset.scene), 0);
    fallback.visible = false;
    loaded = true;
    group.userData.loaded = true;
    try {
      const distant = await loader.loadAsync('/assets/hero/westin-lod.glb');
      lod.addLevel(prepare(distant.scene), 290, .14);
    } catch (error) {
      console.warn('Westin distant model unavailable; retaining the complete model.', error);
    }
  }).catch(error => {
    console.warn('Westin model unavailable; retaining the existing hotel.', error);
  }).finally(()=>decoder.dispose());
  return {
    group,
    ready,
    update(camera: THREE.Camera) {
      if (!loaded) return;
      group.updateWorldMatrix(true, false);
      lod.update(camera);
      if (low && lod.levels.length > 1) {
        lod.levels[0].object.visible = false;
        lod.levels[1].object.visible = true;
      }
    },
    setQuality(value: boolean) {
      low = value;
      for (const mesh of shadowMeshes) mesh.castShadow = !low;
    },
  };
}

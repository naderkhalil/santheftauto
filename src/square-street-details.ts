import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/** Original Blender kit in CANONICAL coordinates: X east, Y up, Z south.
 * Attach directly to the corrected world, outside any legacy Z-reflection group.
 * Semantic Post +65 north is stored at canonical Z -65. No runtime rotation.
 */
export function createSquareStreetDetails(parent: THREE.Scene | THREE.Group) {
  const group = new THREE.Group();
  group.name = 'Union Square / canonical street details';
  group.position.set(0, 22, 0);
  group.userData.coordinateSystem = 'X east / Y up / Z south';
  parent.add(group);
  let low = false;
  const meshes: THREE.Mesh[] = [];
  const decoder = new DRACOLoader().setDecoderPath('/assets/draco/');
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const ready = loader.loadAsync('/assets/square-street-details/square-street-details.glb').then(gltf => {
    let triangles = 0;
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const glazing = materials.some(material => material.name.includes('glass'));
      object.castShadow = !low && !glazing;
      object.receiveShadow = true;
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.envMapIntensity = material.metalness > .4 ? .65 : .45;
        if (material.transparent) material.depthWrite = false;
      }
      object.userData.sfShadowEligible = !glazing;
      meshes.push(object);
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    group.add(gltf.scene);
    group.userData.triangles = triangles;
    group.userData.drawCalls = meshes.length;
    group.userData.loaded = true;
  }).catch(error => {
    console.warn('Union Square street details unavailable.', error);
  }).finally(() => decoder.dispose());
  return {
    group,
    ready,
    update(camera?: THREE.Camera) {
      if (camera) group.visible = Math.hypot(camera.position.x, camera.position.z) < (low ? 230 : 370);
    },
    setQuality(value: boolean) {
      low = value;
      for (const mesh of meshes) mesh.castShadow = !low && mesh.userData.sfShadowEligible;
    },
  };
}

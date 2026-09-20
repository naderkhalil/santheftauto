import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sampleRoute } from './route';

/** Two real CC0 jacaranda models, sharing one optimized geometry/material set.
 * Source: Poly Haven, https://polyhaven.com/a/jacaranda_tree
 * Ground follows the Union Square planting terraces in landmarks.ts.
 */
export async function createVegetation(scene: THREE.Scene): Promise<{
  update(time: number, progress: number): void;
  setQuality(low: boolean): void;
}> {
  const group = new THREE.Group(); group.name = 'Union Square · photographic jacaranda trees';
  scene.add(group);
  const trees: Array<{ object: THREE.Object3D; z: number }> = [];
  const shadowMeshes: THREE.Mesh[] = [];
  let lowQuality = false;
  try {
    const asset = await new GLTFLoader().loadAsync('/assets/vegetation/jacaranda.glb');
    const bounds = new THREE.Box3().setFromObject(asset.scene), height = bounds.max.y - bounds.min.y;
    asset.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.computeBoundingSphere();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.roughness = Math.max(.76, material.roughness);
        material.metalness = 0;
        material.envMapIntensity = .30;
        if (material.name.includes('leaves')) {
          // Alpha-cut leaves write depth and cast their actual silhouettes; no
          // transparent sorting or rectangular foliage-card shadows.
          material.transparent = false;
          material.alphaTest = .42;
          material.alphaToCoverage = true;
          material.side = THREE.DoubleSide;
          material.shadowSide = THREE.DoubleSide;
          material.color.set('#b8d18e');
          // A small texture-driven transmission approximation keeps thin
          // sunlit leaves readable from their shaded side.
          material.emissiveMap = material.map;
          material.emissive.set('#8fb164');
          material.emissiveIntensity = .35;
          material.normalScale.set(.45, .45);
        } else material.normalScale.set(.65, .65);
        for (const map of [material.map, material.normalMap, material.roughnessMap]) if (map) map.anisotropy = 4;
        material.needsUpdate = true;
      }
    });
    for (const [x, z, targetHeight, angle] of [[34, 755, 12.6, .33], [35, 884, 13.8, 2.15]]) {
      const tree = asset.scene.clone(true), scale = targetHeight / height;
      tree.name = `Jacaranda · Union Square ${z < 800 ? 'north' : 'south'} garden`;
      tree.scale.setScalar(scale); tree.rotation.y = angle;
      // Root sits inside the raised planting bed, rather than floating above it.
      tree.position.set(x, sampleRoute(z).y + 1.38 - bounds.min.y * scale, z);
      tree.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = !lowQuality; object.receiveShadow = true;
        shadowMeshes.push(object);
      });
      group.add(tree); trees.push({ object: tree, z });
    }
  } catch (error) {
    // The playable course and its procedural planting remain usable if an
    // optional scenic asset cannot be fetched on a restricted connection.
    console.warn('Jacaranda scenery could not load', error);
  }
  return {
    update(_time: number, progress: number) {
      for (const tree of trees) tree.object.visible = Math.abs(tree.z - progress) < (lowQuality ? 310 : 480);
    },
    setQuality(low: boolean) {
      lowQuality = low;
      for (const mesh of shadowMeshes) mesh.castShadow = !low;
    },
  };
}

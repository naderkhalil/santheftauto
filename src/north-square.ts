import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Post Street and the occupied outside corners, authored in Blender metres. */
export function createNorthSquare(parent: THREE.Group, fallback: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'Union Square / Post Street and corner buildings';
  group.position.y = 22;
  parent.add(group);
  const shared = new Map<string, THREE.MeshStandardMaterial>();
  const shadowMeshes: THREE.Mesh[] = [];
  const lod = new THREE.LOD();
  lod.position.z = 70;
  lod.autoUpdate = false;
  group.add(lod);
  let low = false, loaded = false;
  const prepare = (source: THREE.Group) => {
    const result = new THREE.Group();
    result.position.z = -70;
    const batches = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    source.updateMatrixWorld(true);
    source.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      let material = child.material as THREE.MeshStandardMaterial;
      const known = shared.get(material.name);
      if (known && known !== material) {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
          if (material[key] && material[key] !== known[key]) material[key]!.dispose();
        }
        material.dispose(); material = known;
      } else shared.set(material.name, material);
      const glass = /glass|glazing/i.test(material.name);
      material.envMapIntensity = glass ? 1.05 : .6;
      if (/Apple tree.*leaves/i.test(material.name)) {
        material.side = THREE.DoubleSide;
        material.shadowSide = THREE.DoubleSide;
        material.roughness = .82;
      }
      if (/structural glass|shopfront clear glazing/i.test(material.name)) {
        material.transparent = true;
        material.opacity = .13;
        material.depthWrite = false;
        material.side = THREE.DoubleSide;
        material.forceSinglePass = true;
      }
      for (const texture of [material.map, material.normalMap, material.roughnessMap]) if (texture) texture.anisotropy = 8;
      const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      // Preserve separate culling for Post and each outside corner. One giant
      // material batch would draw all four blocks even behind the camera.
      const cell = `${Math.floor(center.x / 90)},${Math.floor(center.z / 110)}`;
      const key = `${cell}/${material.name}`;
      const batch = batches.get(key) ?? { material, geometries: [] };
      batch.geometries.push(geometry); batches.set(key, batch);
      child.geometry.dispose();
    });
    for (const [name, { material, geometries }] of batches) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(part => part.dispose());
      if (!geometry) throw new Error(`Could not prepare Post Street batch ${name}`);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = !low && !material.transparent;
      mesh.receiveShadow = true;
      if (material.transparent) mesh.renderOrder = 2;
      shadowMeshes.push(mesh); result.add(mesh);
    }
    return result;
  };
  const decoder = new DRACOLoader().setDecoderPath('/assets/draco/');
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const ready = loader.loadAsync('/assets/north-square/north-square.glb').then(async asset => {
    lod.addLevel(prepare(asset.scene), 0);
    loaded = true; group.userData.loaded = true;
    fallback.visible = false;
    try {
      const distant = await loader.loadAsync('/assets/north-square/north-square-lod.glb');
      lod.addLevel(prepare(distant.scene), 270, .12);
    } catch (error) {
      console.warn('Post Street distant models unavailable; retaining complete buildings.', error);
    }
  }).catch(error => {
    console.warn('Post Street models unavailable; retaining frontage placeholders.', error);
  }).finally(() => decoder.dispose());
  return {
    group, ready,
    update(camera: THREE.Camera) {
      if (!loaded) return;
      group.updateWorldMatrix(true, false); lod.update(camera);
      if (low && lod.levels.length > 1) {
        lod.levels[0].object.visible = false; lod.levels[1].object.visible = true;
      }
    },
    setQuality(value: boolean) {
      low = value;
      for (const mesh of shadowMeshes) mesh.castShadow = !low && !(mesh.material as THREE.Material).transparent;
    },
  };
}

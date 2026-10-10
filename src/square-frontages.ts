import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getRenderProfile } from './render-profile';

/** Blender-authored Macy's, I. Magnin, Neiman Marcus and the five Stockton
 * parcels. Coordinates are world X/Z relative to Union Square's street datum.
 * No guessed rotations or landmark-dependent scaling are needed at runtime. */
export function createSquareFrontages(parent: THREE.Object3D, fallback?: THREE.Group) {
  const mobile = getRenderProfile().mobile;
  const group = new THREE.Group();
  group.name = 'Union Square / reference department stores and Stockton parcels';
  group.position.set(0, 22, 0);
  parent.add(group);
  const lod = new THREE.LOD();
  lod.autoUpdate = false;
  group.add(lod);
  const shared = new Map<string, THREE.MeshStandardMaterial>();
  const shadowMeshes: THREE.Mesh[] = [];
  let low = mobile;
  let loaded = false;

  const prepare = (source: THREE.Group) => {
    // The editable .blend keeps each building separate. At runtime shared stone,
    // bronze and window materials are batched across the five adjacent parcels.
    const result = new THREE.Group();
    source.updateMatrixWorld(true);
    const batches = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    source.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      if (materials.length !== 1) return;
      let material = materials[0];
      if (material instanceof THREE.MeshStandardMaterial) {
        // The regional reflection capture identifies this prefix. Otherwise the
        // Macy's/Neiman glass would inherit whichever distant region is active.
        material.name = material.name.replace(/^Square \/ /, 'Union Square / ');
        const known = shared.get(material.name);
        if (known && known !== material) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
            if (material[key] && material[key] !== known[key]) material[key]!.dispose();
          }
          material.dispose(); material = known;
        } else shared.set(material.name, material);
        const glazing = /glass/i.test(material.name);
        material.envMapIntensity = glazing ? .85 : .58;
        if (/transparent glass/i.test(material.name)) {
          // Low opacity reflections preserve the modeled atrium, doors, displays
          // and Rotunda behind the pane without a costly transmission pass.
          material.transparent = true;
          material.opacity = .17;
          material.depthWrite = false;
          material.side = THREE.DoubleSide;
          material.forceSinglePass = true;
        }
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture) texture.anisotropy = mobile ? 1 : 8;
        }
      }
      const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
      // Opaque stone can batch across the block. Keep each building's clear
      // panes separate so the renderer sorts them correctly when turning.
      const building = material.transparent ? child.name : 'opaque';
      const key = `${building}/${material.name}`;
      const batch = batches.get(key) ?? { material, geometries: [] as THREE.BufferGeometry[] };
      batch.geometries.push(geometry); batches.set(key, batch);
      child.geometry.dispose();
    });
    for (const [name, { material, geometries }] of batches) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(item => item.dispose());
      if (!geometry) throw new Error(`Cannot prepare Union Square material batch: ${name}`);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.castShadow = !low && !material.transparent;
      if (material.transparent) mesh.renderOrder = 2;
      shadowMeshes.push(mesh); result.add(mesh);
    }
    result.userData.drawCalls = result.children.length;
    return result;
  };
  const decoder = new DRACOLoader().setDecoderPath('/assets/draco/');
  if (mobile) decoder.setWorkerLimit(1);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  const ready = loader.loadAsync(`/assets/square-frontages/square-frontages${mobile ? '-lod' : ''}.glb`).then(async asset => {
    lod.addLevel(prepare(asset.scene), 0);
    if (fallback) fallback.visible = false;
    loaded = true; group.userData.loaded = true;
    if (mobile) return;
    try {
      const distant = await loader.loadAsync('/assets/square-frontages/square-frontages-lod.glb');
      lod.addLevel(prepare(distant.scene), 235, .12);
    } catch (error) {
      console.warn('Union Square distant frontages unavailable; retaining the complete models.', error);
    }
  }).catch(error => {
    console.warn('Union Square building models unavailable; retaining procedural frontages.', error);
  }).finally(() => decoder.dispose());
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
      low = mobile || value;
      for (const mesh of shadowMeshes) {
        const material = mesh.material as THREE.Material;
        mesh.castShadow = !low && !material.transparent;
      }
    },
  };
}

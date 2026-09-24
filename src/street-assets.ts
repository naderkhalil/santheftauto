import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let cableCar: Promise<THREE.Group> | undefined;

/** Replace the existing visual in its route frame; collision dimensions stay in city-loop. */
export function createCableCarAsset(parent: THREE.Group, fallback: THREE.Group) {
  let lowQuality = false;
  const opaqueMeshes: THREE.Mesh[] = [];
  parent.name = 'Powell / museum-reference cable car';
  parent.userData.assetState = 'loading';
  cableCar ??= new GLTFLoader().loadAsync('/assets/models/cable-car.glb').then(gltf => gltf.scene);
  const ready = cableCar.then(template => {
    const model = template.clone(true);
    model.scale.x = -1; // local asset chirality inside the reflected map root
    model.name = 'Blender / Powell combination car / 16';
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      let glazing = false;
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.envMapIntensity = .65;
        if (material.map) material.map.anisotropy = 4;
        if (material.name.includes('carriage glass')) {
          // Thin saloon panes reveal the benches. Avoid opaque window shadows.
          material.transparent = true;
          material.opacity = .24;
          material.depthWrite = false;
          material.side = THREE.DoubleSide;
          glazing = true;
        }
      }
      object.castShadow = !glazing && !lowQuality;
      if (!glazing) opaqueMeshes.push(object);
    });
    parent.add(model);
    parent.remove(fallback);
    fallback.traverse(object => {
      // The placeholder shares palette materials with the rest of the city.
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    parent.userData.assetState = 'ready';
  }).catch(error => {
    parent.userData.assetState = 'fallback';
    console.warn('Powell cable car asset could not load; keeping its playable placeholder.', error);
  });
  return {
    ready,
    setQuality(low: boolean) {
      lowQuality = low;
      opaqueMeshes.forEach(mesh => { mesh.castShadow = !low; });
    },
  };
}

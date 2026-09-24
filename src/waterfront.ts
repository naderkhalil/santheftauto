import * as THREE from 'three';
import { createWaterfrontAssets } from './waterfront-assets';
import { createHarborWater } from './harbor-water';

/** Canonical waterfront: Blender buildings/quays plus realtime bay movement.
 * Attach to the visible scene, outside the legacy semantic city reflection. */
export function createWaterfront(scene: THREE.Object3D) {
  const group = new THREE.Group(); group.name = 'The Embarcadero / reference waterfront'; scene.add(group);
  const water = createHarborWater(group), assets = createWaterfrontAssets(group);
  // Broad, restrained light reflected from the open plaza keeps the western
  // arcade readable while the established sun still rims the roof and tower.
  const plazaBounce = new THREE.PointLight('#edf2f6', 14000, 280, 2);
  plazaBounce.name = 'Ferry Plaza / soft reflected daylight'; plazaBounce.position.set(642, 43, -250); group.add(plazaBounce);
  return {
    group, ready: assets.ready,
    update(time: number, _progress: number, camera?: THREE.Camera) { water.update(time); assets.update(camera); },
    setQuality(low: boolean) { water.setQuality(low); assets.setQuality(low); },
  };
}

import * as THREE from 'three';

export type CityPosition = { x: number; y: number; z: number };

/** Route/map coordinates keep +X east, +Z north and +Y up. A right-handed
 * Three.js view needs north along -Z, otherwise east appears to the left
 * when looking north and the entire street map is mirrored on screen.
 */
export function cityToRender(position: CityPosition, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(position.x, position.y, -position.z);
}

/** Reflection is its own inverse; use this only at an explicit render boundary. */
export function renderToCity(position: CityPosition, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(position.x, position.y, -position.z);
}

/** Geometry and animated objects stay in city coordinates beneath this root.
 * Cameras must remain outside it, with ordinary right-handed world matrices.
 */
export function createCityRoot(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'San Francisco / east +X, north -Z in rendered space';
  root.scale.z = -1;
  return root;
}

const renderLook = new THREE.Vector3();

/** Preserve semantic camera state separately; never feed camera.position
 * back into route sampling or a city-space finish interpolation.
 */
export function setCameraFromCity(camera: THREE.Camera, eye: CityPosition, look: CityPosition): void {
  cityToRender(eye, camera.position);
  cityToRender(look, renderLook);
  camera.lookAt(renderLook);
  camera.updateMatrixWorld(true);
}

/** Positive route lateral is geographic right after the render conversion. */
export function steeringFromControls(left: boolean, right: boolean, gamepadAxis = 0): number {
  if (Number.isFinite(gamepadAxis) && Math.abs(gamepadAxis) > .14) return THREE.MathUtils.clamp(gamepadAxis, -1, 1);
  return Number(right) - Number(left);
}

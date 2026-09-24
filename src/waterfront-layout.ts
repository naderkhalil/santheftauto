/** Geographic coordinates: +X east, +Z north, Y up. The Blender exports
 * use ordinary glTF axes and attach directly to the canonical render scene. */
export const WATERFRONT = {
  promenadeWest: 604,
  south: -770,
  north: 1130,
  seaLevel: -2,
  ferry: { x: 730, y: 2.3, z: 250, halfDepth: 23, halfLength: 95 },
  finishCamera: { x: 560, y: 78, z: 395 },
  finishLook: { x: 747, y: 29, z: 235 },
} as const;

/** The quay asset owns the visible ground here, including its level Ferry
 * apron. Lower the old generic terrain underneath it, not the driving grade. */
export function waterfrontOwnsGround(x: number, z: number) {
  return x >= WATERFRONT.promenadeWest && z >= WATERFRONT.south && z <= WATERFRONT.north;
}

export function waterfrontFinishView(aspect: number) {
  const scale = aspect < .65 ? 1.2 : 1, look = WATERFRONT.finishLook, original = WATERFRONT.finishCamera;
  return {
    eye: { x: look.x + (original.x - look.x) * scale, y: look.y + (original.y - look.y) * scale, z: look.z + (original.z - look.z) * scale },
    fov: aspect < .65 ? 82 : aspect < 1 ? 65 : 58,
  };
}

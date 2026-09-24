import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityToRender } from './coordinates';
import { routeFrame, routePoint, groundHeight } from './route';
import { RACE_TURNS, RACE_GUIDANCE_PANEL_OFFSET, raceTurnPanelPositions } from './race-guidance-layout';

/** Temporary race wayfinding. Rendered in canonical axes, with no physics
 * bodies: the signs clarify the course without closing any city streets. */
export function createRaceGuidance(scene: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'Race course / open city wayfinding'; root.visible = false; scene.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const boards: { group: THREE.Group; materials: THREE.MeshBasicMaterial[]; entry: number; exit: number }[] = [];

  function distanceTexture(distance: number) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 320;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#153e54'; c.fillRect(0, 0, 256, 320);
    c.fillStyle = '#ffe15a'; c.fillRect(0, 0, 256, 12); c.fillRect(0, 308, 256, 12);
    c.font = '800 118px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(distance), 128, 137);
    c.font = '700 27px Arial'; c.fillText('METRES', 128, 221);
    c.font = '700 21px Arial'; c.fillStyle = '#a9dfdf'; c.fillText('CORNER', 128, 271);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
  }
  const distanceMaps = new Map([50, 25].map(distance => [distance, distanceTexture(distance)]));
  // Chevron geometry carries the direction itself; no mirrored label atlas.
  function chevron(direction: 'left' | 'right') {
    const sign = direction === 'right' ? 1 : -1, shape = new THREE.Shape();
    const points = [[-.66, .61], [-.10, .61], [.63, 0], [-.10, -.61], [-.66, -.61], [.04, 0]];
    points.forEach(([x, y], i) => i ? shape.lineTo(x * sign, y) : shape.moveTo(x * sign, y)); shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }
  const arrows = { left: chevron('left'), right: chevron('right') };
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const direction = new THREE.Vector3(), normal = new THREE.Vector3(), center = new THREE.Vector3();

  for (const turn of RACE_TURNS) {
    const group = new THREE.Group(); group.name = `${turn.direction} / ${turn.street}`; root.add(group);
    const materials = [
      new THREE.MeshBasicMaterial({ color: '#153e54', side: THREE.DoubleSide, transparent: true, opacity: .88, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: '#ffe15a', side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: '#91e8dc', side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }),
    ];
    materials.forEach((material, i) => { material.userData.baseOpacity = i === 0 ? .88 : 1; });
    const batches = materials.map(() => [] as THREE.BufferGeometry[]);
    const add = (geo: THREE.BufferGeometry, material: number, pose: THREE.Matrix4, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      matrix.makeScale(sx, sy, sz); matrix.setPosition(x, y, z); matrix.premultiply(pose);
      const copy = geo.clone().applyMatrix4(matrix), flat = copy.index ? copy.toNonIndexed() : copy;
      if (copy !== flat) copy.dispose(); batches[material].push(flat);
    };
    function boardPose(progress: number, lateral: number, height: number, angled: boolean) {
      const frame = routeFrame(progress), p = routePoint(progress, lateral);
      cityToRender({ ...p, y: groundHeight(p.x, p.z) + height }, center);
      direction.set(-frame.tangent.x, 0, frame.tangent.z);
      if (angled) {
        normal.set(-frame.normal.x * turn.signSide, 0, frame.normal.z * turn.signSide);
        direction.add(normal).normalize();
      }
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(direction.x, direction.z));
      return new THREE.Matrix4().compose(center, rotation, scale.set(1, 1, 1));
    }
    for (const panel of raceTurnPanelPositions(turn)) {
      const pose = boardPose(panel.progress, panel.lateral, 1.75, true);
      add(cube, 0, pose, 0, 0, 0, 3.9, 1.75, .12);
      add(cube, 1, pose, 0, .855, .08, 3.9, .07, .035);
      add(cube, 2, pose, 0, -.855, .08, 3.9, .055, .035);
      add(arrows[turn.direction], 1, pose, -.88, 0, .085);
      add(arrows[turn.direction], 1, pose, .88, 0, .085);
      // Open space below the boards makes them read as a race overlay.
      add(cube, 2, pose, -1.82, -1.53, 0, .12, .11, .62);
      add(cube, 2, pose, 1.82, -1.53, 0, .12, .11, .62);
    }
    for (const distance of [50, 25]) {
      const progress = turn.entry - distance;
      const pose = boardPose(progress, turn.signSide * RACE_GUIDANCE_PANEL_OFFSET, 1.85, false);
      const material = new THREE.MeshBasicMaterial({ map: distanceMaps.get(distance), side: THREE.FrontSide, transparent: true, depthWrite: false, toneMapped: false });
      material.userData.baseOpacity = 1; materials.push(material);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.06).applyMatrix4(pose), material);
      board.name = `${distance} m to ${turn.street}`; group.add(board);
    }
    batches.forEach((geometries, index) => {
      const geometry = mergeGeometries(geometries)!; geometries.forEach(source => source.dispose());
      geometry.computeBoundingSphere(); const mesh = new THREE.Mesh(geometry, materials[index]);
      mesh.name = index === 0 ? 'Passable race marker panels' : 'Corner reflectors and direction chevrons';
      group.add(mesh);
    });
    boards.push({ group, materials, entry: turn.entry, exit: turn.exit });
  }
  cube.dispose(); arrows.left.dispose(); arrows.right.dispose();
  return {
    group: root,
    update(progress: number, enabled: boolean) {
      root.visible = enabled;
      if (!enabled) return;
      for (const board of boards) {
        // Fade the next corner in early; retire it only once the turn is behind.
        const fadeIn = THREE.MathUtils.smoothstep(progress, board.entry - 230, board.entry - 160);
        const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, board.exit + 18, board.exit + 48);
        const opacity = fadeIn * fadeOut; board.group.visible = opacity > .001;
        if (board.group.visible) for (const material of board.materials) material.opacity = material.userData.baseOpacity * opacity;
      }
    },
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A condensed western Bay Bridge: two silver suspension spans and their
 * monumental centre anchorage, framed across the water behind the Ferry Building. */
export function createBayBridge(scene: THREE.Object3D): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Bay Bridge / western double suspension spans';
  scene.add(group);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const material = (name: string, color: string, roughness = .65, metalness = .12) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: .45 });
    mat.name = `Bay Bridge / ${name}`;
    return mat;
  };
  const steel = material('silver steel', '#d5dfdb', .52, .25);
  const shade = material('blue steel lattice', '#7198a7', .62, .16);
  const bright = material('sunlit cable', '#f3e8c8', .49, .18);
  const road = material('double deck', '#688b94', .90, .02);
  const concrete = material('anchorage limestone', '#c5c7b0', .91, .01);
  const concreteLight = material('anchorage ledges', '#e1dcc2', .85, .01);
  const green = material('Yerba Buena Island', '#529b85', .96, 0);
  const cliff = material('island shoreline', '#94b2a0', .95, 0);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const depth = (x: number) => 2200 + x * .23;
  const yaw = -Math.atan(.23);
  const add = (geometry: THREE.BufferGeometry, mat: THREE.Material) => {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat)!.push(geometry);
  };
  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rotation = yaw) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateY(rotation); geometry.translate(x, y, z); add(geometry, mat);
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, mat: THREE.Material) {
    const geometry = new THREE.BoxGeometry(w, a.distanceTo(b), d);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    add(geometry, mat);
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) {
    const geometry = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 5);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    add(geometry, mat);
  }
  // Local across-road offsets preserve the bridge's diagonal perspective.
  const point = (x: number, y: number, side = 0) => v(x - Math.sin(-yaw) * side, y, depth(x) + Math.cos(yaw) * side);
  const first = -820, last = 1040, deck = 56;
  const bridgeLength = Math.hypot(last - first, depth(last) - depth(first));
  const middle = (first + last) / 2;
  box(bridgeLength, 2.4, 29, road, middle, deck, depth(middle));
  box(bridgeLength, 2, 28, shade, middle, deck - 8.6, depth(middle));
  // The dark gap and side lattice distinguish the Bay Bridge's two decks from
  // the single flat ribbon of the Golden Gate already visible farther west.
  for (const side of [-1, 1]) {
    const d = side * 15;
    for (const y of [deck + 1.8, deck - 2.1, deck - 9.1]) {
      const p = point(middle, y, d);
      box(bridgeLength, y > deck ? .9 : 1.15, .9, steel, p.x, y, p.z);
    }
    for (let x = first; x < last - 16; x += 18) {
      beam(point(x, deck - 8.6, d), point(x + 18, deck - 1.6, d), .7, .75, shade);
      beam(point(x, deck - 1.6, d), point(x + 18, deck - 8.6, d), .7, .75, shade);
      beam(point(x, deck - 9, d), point(x, deck + 2, d), .9, .9, steel);
    }
  }

  const towerXs = [-540, -185, 350, 705];
  const towerTop = 185;
  for (const x of towerXs) {
    const z = depth(x);
    box(34, 10, 62, concrete, x, 2, z);
    box(29, 5, 54, concreteLight, x, 9.5, z);
    // Four slender, tapered steel legs retain the open lattice silhouette.
    for (const along of [-1, 1]) for (const across of [-1, 1]) {
      const bottom = point(x + along * 7, 11, across * 22);
      const top = point(x + along * 5.5, towerTop, across * 16.5);
      beam(bottom, top, 4.0, 4.0, steel);
      beam(bottom.clone().add(v(0, 0, 2.08)), top.clone().add(v(0, 0, 2.08)), 1.3, .45, shade);
    }
    const levels = [13, 46, 81, 116, 150, 179];
    for (let i = 0; i < levels.length; i++) {
      const y = levels[i], across = THREE.MathUtils.lerp(22, 16.5, y / towerTop);
      box(18, 3, across * 2 + 5.6, steel, x, y, z);
      box(18.8, .8, across * 2 + 6, bright, x, y + 1.7, z);
      if (i === levels.length - 1) continue;
      const next = levels[i + 1];
      const nextAcross = THREE.MathUtils.lerp(22, 16.5, next / towerTop);
      for (const side of [-1, 1]) {
        // Cross-brace both faces; the shallow angle reveals the broad side.
        beam(point(x - 6.4, y + 2, side * across), point(x + 6.0, next - 2, side * nextAcross), 1.35, 1.35, shade);
        beam(point(x + 6.4, y + 2, side * across), point(x - 6.0, next - 2, side * nextAcross), 1.35, 1.35, steel);
        beam(point(x + side * 6.4, y + 2, -across), point(x + side * 6.0, next - 2, nextAcross), 1.7, 1.7, steel);
        beam(point(x + side * 6.4, y + 2, across), point(x + side * 6.0, next - 2, -nextAcross), 1.7, 1.7, shade);
      }
    }
    box(19.5, 4.6, 40, steel, x, towerTop, z);
    for (const side of [-1, 1]) {
      const p = point(x, towerTop + 3.2, side * 16.5);
      box(9, 3.8, 8, bright, p.x, p.y, p.z);
      rod(point(x, towerTop + 5, side * 16.5), point(x, towerTop + 10, side * 16.5), .26, steel);
    }
  }

  // The massive centre pier is the signature of the Bay Bridge's western
  // crossing: one anchorage joining two complete suspension bridges.
  const anchorX = 94, anchorZ = depth(anchorX);
  box(52, 12, 69, concrete, anchorX, 2, anchorZ);
  box(41, 77, 57, concrete, anchorX, 38, anchorZ);
  box(46, 4.2, 63, concreteLight, anchorX, 78, anchorZ);
  box(32, 13, 47, concrete, anchorX, 86, anchorZ);
  box(37, 3, 52, concreteLight, anchorX, 93, anchorZ);
  for (const side of [-1, 1]) for (const offset of [-12, 0, 12]) {
    const p = point(anchorX + offset, 43, side * 29);
    box(2.2, 65, 1.4, concreteLight, p.x, p.y, p.z);
  }

  const spans: [number, number, number, number, number][] = [
    [first, -540, deck + 7, towerTop + 2, 21],
    [-540, -185, towerTop + 2, towerTop + 2, 107],
    [-185, anchorX, towerTop + 2, 83, 21],
    [anchorX, 350, 83, towerTop + 2, 21],
    [350, 705, towerTop + 2, towerTop + 2, 107],
    [705, last, towerTop + 2, deck + 7, 21],
  ];
  for (const side of [-1, 1]) for (const [start, end, startY, endY, sag] of spans) {
    const cableHeight = (t: number) => THREE.MathUtils.lerp(startY, endY, t) - 4 * t * (1 - t) * sag;
    const points = Array.from({ length: 49 }, (_, i) => point(THREE.MathUtils.lerp(start, end, i / 48), cableHeight(i / 48), side * 17.5));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, 1.25, 6, false), bright);
    for (let x = start + 10; x < end - 5; x += 12) {
      rod(point(x, deck + 2.3, side * 14.6), point(x, cableHeight((x - start) / (end - start)), side * 17.5), .37, steel);
    }
  }
  // Quiet traffic glints establish the bridge's scale without another update
  // loop or hundreds of tiny moving draw calls at this distance.
  for (let i = 0; i < 28; i++) {
    const x = first + 22 + i * 64.3;
    const p = point(x, deck + 2.1, i % 2 ? -6 : 6);
    box(4.8, 1.9, 2.1, i % 5 === 0 ? bright : steel, p.x, p.y, p.z);
  }

  // Yerba Buena's green crown closes the eastern span against the bay horizon.
  for (const [x, z, w, h, d] of [[1090, 2640, 310, 94, 250], [1250, 2750, 260, 60, 220], [-1050, 2720, 390, 27, 130]]) {
    const shore = new THREE.SphereGeometry(1, 24, 12); shore.scale(w * 1.08, h * .38, d * 1.05); shore.translate(x, -8, z); add(shore, cliff);
    const hill = new THREE.SphereGeometry(1, 24, 16); hill.scale(w, h, d); hill.translate(x, -18, z); add(hill, green);
  }
  for (const [mat, geometries] of batches) {
    const geometry = mergeGeometries(geometries)!;
    geometries.forEach(source => source.dispose());
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = mat.name; mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
  }
  return group;
}

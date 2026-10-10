import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { playgroundHeight } from './playground.ts';
import { PLAYGROUND_POSTCARDS } from './race-replay.ts';
export { PLAYGROUND_POSTCARDS } from './race-replay.ts';

/** Semantic city coordinates: east is +X and north is +Z. */
export function playgroundMapPoint(x: number, z: number): { x: number; y: number } {
  return { x: 20 + (x + 213) * .7, y: 19 + (196 - z) * .7 };
}

/** North-up map of the playable streets, using the same footprints as the city. */
export function playgroundMapSvg(): string {
  const p = (x: number, z: number) => {
    const point = playgroundMapPoint(x, z);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  };
  const rect = (minX: number, maxX: number, minZ: number, maxZ: number, fill: string, radius = 1) => {
    const top = playgroundMapPoint(minX, maxZ);
    return `<rect x="${top.x.toFixed(1)}" y="${top.y.toFixed(1)}" width="${((maxX - minX) * .7).toFixed(1)}" height="${((maxZ - minZ) * .7).toFixed(1)}" rx="${radius}" fill="${fill}"/>`;
  };
  const buildings: readonly (readonly [number, number, number, number])[] = [
    [-161, -92, -50, 50], [-67, 63, 79, 132],
    [31, 63, 132, 185], [-67, -28, 132, 183], [-28.5, 30, 132, 183],
    [-131, -87, 80, 111], [-113, -87, 110, 136], [-184, -129, 80, 136],
    [88, 162, 80, 132], [88, 162, 138, 177],
    [-129, -87, -183, -82], [-186, -128, -183, -82],
    [-61, 61, -183, -82], [93, 162, -133, -82],
    [93, 162, 5, 49], [93, 162, -49, -5],
  ];
  const road = (x1: number, z1: number, x2: number, z2: number) => `<path d="M${p(x1, z1)} L${p(x2, z2)}"/>`;
  const dot = playgroundMapPoint(-63, 65);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-labelledby="playground-map-title playground-map-description">
    <title id="playground-map-title">Explore Union Square</title>
    <desc id="playground-map-description">North-up map showing the plaza terraces, surrounding buildings, Powell, Post, Stockton and Geary. The blue marker is your car; gold postcards are discoveries on the square.</desc>
    <rect width="320" height="320" rx="14" fill="#183e46"/>
    <rect x="20" y="19" width="280" height="282.8" rx="3" fill="#c4cbb9"/>
    <g stroke="#eee7d2" stroke-width="17.8" fill="none">
      ${[-199, -75, 75, 175].map(x => road(x, -208, x, 196)).join('')}
      ${[-195, -65, 65, 185].map(z => road(-213, z, 187, z)).join('')}
    </g>
    <g stroke="#93aaa2" stroke-width="9.8" fill="none">
      ${[-199, -75, 75, 175].map(x => road(x, -208, x, 196)).join('')}
      ${[-195, -65, 65, 185].map(z => road(-213, z, 187, z)).join('')}
    </g>
    <g stroke="#b2b6a4" stroke-width="1">${buildings.map((b, index) => rect(...b, index === 0 ? '#a39b85' : ['#b5aa91', '#b2b5a1', '#a5afa0'][index % 3])).join('')}</g>
    ${rect(-60, 60, -50, 50, '#eee9d7', 2)}
    ${rect(-44.7, 44.7, -28.7, 23.7, '#dcd7c4')}
    ${rect(-49.6, -10, 26.5, 43.6, '#9dae82')}
    ${rect(10, 49.6, 26.5, 43.6, '#9dae82')}
    ${rect(-10, 10, 26.5, 35.3, '#e1d9bd')}
    ${rect(-52.5, -44.5, 0, 18, '#8da47b')}
    ${rect(44.5, 52.5, -26, -8, '#8da47b')}
    ${rect(-39.5, -22.5, -46.5, -41.5, '#8da47b')}
    <g stroke="#b7ad91" stroke-width=".6" fill="none">
      ${[-36, -34.6, -33.2, -31.8, -30.4, -29].map(z => road(-44.7, z, 44.7, z)).join('')}
      ${[24.4, 25.8].map(z => road(-44.7, z, 44.7, z)).join('')}
      ${[36.2, 38.1, 40, 41.9, 43.1].map(z => road(-9.8, z, 9.8, z)).join('')}
      ${[47, 49, 51, 53, 55, 57].map(x => road(x, -7.7, x, 3.7)).join('')}
    </g>
    ${rect(-4.75, 4.75, -4.75, 4.75, '#829888', .5)}
    <circle cx="${playgroundMapPoint(0, 0).x}" cy="${playgroundMapPoint(0, 0).y}" r="1.8" fill="#fbf2d7"/>
    <path d="M${p(-87.5, 196)} L${p(-213, 196)} L${p(-213, -208)} L${p(187, -208)} L${p(187, 196)} L${p(-62.5, 196)}" fill="none" stroke="#dcba67" stroke-width="1.4" stroke-dasharray="3 3"/>
    <g font-family="'Avenir Next','Segoe UI',sans-serif" font-size="6.4" font-weight="700" letter-spacing=".65" fill="#31565a" text-anchor="middle">
      <text x="${playgroundMapPoint(0, 65).x}" y="${playgroundMapPoint(0, 65).y + 2.1}">POST ST</text>
      <text x="${playgroundMapPoint(0, -65).x}" y="${playgroundMapPoint(0, -65).y + 2.1}">GEARY ST</text>
      <text transform="translate(${p(-75, 0)}) rotate(-90)" y="2.1">POWELL ST</text>
      <text transform="translate(${p(75, 0)}) rotate(-90)" y="2.1">STOCKTON ST</text>
      <text x="${playgroundMapPoint(-128, 0).x}" y="${playgroundMapPoint(-128, 0).y}" font-size="6">WESTIN</text>
      <text x="${playgroundMapPoint(0, -135).x}" y="${playgroundMapPoint(0, -135).y}" font-size="7">MACY’S</text>
      <text x="${playgroundMapPoint(45, 96).x}" y="${playgroundMapPoint(45, 96).y}" font-size="5.4">APPLE</text>
    </g>
    <g fill="#ffda54" stroke="#806e32" stroke-width="1">${PLAYGROUND_POSTCARDS.map((point, i) => {
      const at = playgroundMapPoint(point.x, point.z);
      return `<path data-postcard="${i}" id="playground-postcard-${i}" d="M${at.x},${at.y - 3.2} l3.2,3.2 -3.2,3.2 -3.2,-3.2 Z"/>`;
    }).join('')}</g>
    <circle id="playground-map-dot" cx="${dot.x}" cy="${dot.y}" r="4" fill="#167aac" stroke="#fff9df" stroke-width="1.8"/>
    <g fill="#fbf2d7" font-family="'Avenir Next','Segoe UI',sans-serif" font-weight="700" text-anchor="middle">
      <rect x="267" y="30" width="24" height="34" rx="5" fill="#214b50"/>
      <text x="279" y="41" font-size="8">N</text><path d="M279,45 l-4,11 4,-3 4,3 Z"/>
    </g>
  </svg>`;
}

/** Temporary street closures, plus five rotating postcards during free drive. */
export function createPlayground(scene: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = 'Union Square / street playground';
  scene.add(group);
  const discoveries = new THREE.Group();
  discoveries.name = 'Union Square / postcards to discover';
  discoveries.visible = false;
  group.add(discoveries);

  const orange = new THREE.MeshStandardMaterial({ color: '#ed8240', roughness: .72 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff0cd', roughness: .7 });
  const iron = new THREE.MeshStandardMaterial({ color: '#43635f', roughness: .7, metalness: .15 });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd656', emissive: '#d99d24', emissiveIntensity: .18, roughness: .34, metalness: .55 });
  const ink = new THREE.MeshStandardMaterial({ color: '#315d62', roughness: .64 });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw = 0) => {
    matrix.compose(position.set(x, y, z), rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), scale.set(1, 1, 1));
    geometry.applyMatrix4(matrix);
    const batch = batches.get(material) ?? [];
    batch.push(geometry); batches.set(material, batch);
  };
  const box = (material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z, yaw);

  // Sawhorses sit only at street openings; the existing buildings form the other edges.
  function closure(x: number, z: number, yaw: number) {
    const alongX = Math.cos(yaw), alongZ = -Math.sin(yaw);
    for (const offset of [-9, -3, 3, 9]) {
      const xx = x + alongX * offset, zz = z + alongZ * offset;
      const base = playgroundHeight(xx, zz);
      box(cream, xx, base + 1.18, zz, 5.5, .50, .16, yaw);
      box(orange, xx, base + .66, zz, 5.5, .18, .13, yaw);
      for (const stripe of [-2.2, -1.1, 0, 1.1, 2.2]) {
        const sx = xx + stripe * alongX, sz = zz + stripe * alongZ;
        box(orange, sx, base + 1.18, sz, .55, .51, .18, yaw);
      }
      for (const foot of [-1.85, 1.85]) {
        const fx = xx + foot * alongX, fz = zz + foot * alongZ;
        box(iron, fx, base + .57, fz, .13, 1.14, .17, yaw);
        box(iron, fx, base + .08, fz, .54, .16, 1.12, yaw);
      }
    }
    // Amber beacons make the closure legible in the low driving camera.
    for (const offset of [-8.8, 8.8]) {
      const xx = x + offset * alongX, zz = z + offset * alongZ, base = playgroundHeight(xx, zz);
      add(new THREE.CylinderGeometry(.17, .23, .34, 8), orange, xx, base + 1.59, zz);
      box(iron, xx, base + 1.40, zz, .32, .10, .28, yaw);
    }
  }
  for (const z of [-195, -65, 65, 185]) {
    closure(-212.7, z, Math.PI / 2);
    closure(186.7, z, Math.PI / 2);
  }
  for (const x of [-199, -75, 75, 175]) closure(x, -207.7, 0);
  for (const x of [-199, 75, 175]) closure(x, 195.7, 0);
  for (const [material, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false)!, material);
    mesh.name = 'Union Square / temporary street closure';
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); geometries.forEach(geometry => geometry.dispose());
  }
  batches.clear();

  // Postcard art is geometry: cream stock, a gold edge, and a miniature SF skyline.
  box(gold, 0, 0, 0, 1.7, 1.13, .12);
  for (const side of [-1, 1]) {
    box(cream, 0, 0, side * .071, 1.53, .97, .03);
    box(gold, .56, .29, side * .093, .24, .24, .02);
    box(ink, -.20, -.30, side * .097, 1.03, .035, .024);
    for (const [x, h, w] of [[-.56, .25, .17], [-.31, .39, .20], [-.02, .57, .13], [.20, .22, .17]] as const) {
      box(ink, x, -.29 + h / 2, side * .095, w, h, .025);
    }
    box(ink, -.02, .32, side * .095, .055, .16, .025);
    for (const y of [-.04, -.15, -.26]) box(gold, .56, y, side * .094, .25, .025, .02);
  }
  const cards: THREE.InstancedMesh[] = [];
  for (const [material, geometries] of batches) {
    const mesh = new THREE.InstancedMesh(mergeGeometries(geometries, false)!, material, PLAYGROUND_POSTCARDS.length);
    mesh.name = 'Union Square / discoverable golden postcards';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    cards.push(mesh); discoveries.add(mesh); geometries.forEach(geometry => geometry.dispose());
  }
  const ringGeometry = new THREE.TorusGeometry(1.55, .027, 4, 36);
  ringGeometry.rotateX(Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeometry, gold, PLAYGROUND_POSTCARDS.length);
  rings.name = 'Union Square / postcard ground rings';
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rings.frustumCulled = false;
  discoveries.add(rings);
  const shadowGeometry = new THREE.CircleGeometry(.71, 20); shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeometry, new THREE.MeshBasicMaterial({ color: '#294c43', transparent: true, opacity: .15, depthWrite: false }), PLAYGROUND_POSTCARDS.length);
  shadows.name = 'Union Square / postcard contact shadows';
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shadows.frustumCulled = false;
  discoveries.add(shadows);

  const found = PLAYGROUND_POSTCARDS.map(() => false);
  const foundAt = PLAYGROUND_POSTCARDS.map(() => -Infinity);
  const heights = PLAYGROUND_POSTCARDS.map(point => playgroundHeight(point.x, point.z));
  let collected = 0;
  function update(time: number, car: { x: number; y: number; z: number }, active: boolean): number {
    discoveries.visible = active;
    if (!active) return 0;
    let pickedUp = 0;
    PLAYGROUND_POSTCARDS.forEach((point, i) => {
      if (!found[i] && Math.hypot(car.x - point.x, car.z - point.z) < 3 && Math.abs(car.y - heights[i]) < 3) {
        found[i] = true; foundAt[i] = time; collected++; pickedUp++;
      }
      const fade = found[i] ? Math.max(0, 1 - (time - foundAt[i]) / .45) : 1;
      const lift = found[i] ? (1 - fade) * 2.2 : Math.sin(time * 1.8 + i * 1.3) * .16;
      position.set(point.x, heights[i] + 1.65 + lift, point.z);
      rotation.setFromEuler(new THREE.Euler(.08 * Math.sin(time + i), time * .65 + i * 1.4, .08));
      matrix.compose(position, rotation, scale.setScalar(fade));
      for (const mesh of cards) mesh.setMatrixAt(i, matrix);
      position.set(point.x, heights[i] + .07, point.z);
      rotation.identity();
      matrix.compose(position, rotation, scale.setScalar(found[i] ? 0 : 1)); rings.setMatrixAt(i, matrix);
      position.y = heights[i] + .045;
      matrix.compose(position, rotation, scale.setScalar(found[i] ? 0 : 1)); shadows.setMatrixAt(i, matrix);
    });
    for (const mesh of [...cards, rings, shadows]) mesh.instanceMatrix.needsUpdate = true;
    return pickedUp;
  }
  return {
    reset() { found.fill(false); foundAt.fill(-Infinity); collected = 0; },
    update,
    get collected() { return collected; },
    get total() { return PLAYGROUND_POSTCARDS.length; },
    get found(): readonly boolean[] { return found; },
  };
}

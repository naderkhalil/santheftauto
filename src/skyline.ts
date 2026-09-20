import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The eastern landmarks, with Pacific glazing and warm older roofs. */
export function createSkyline(scene: THREE.Scene) {
  const group = new THREE.Group(); group.name = 'San Francisco skyline'; scene.add(group);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const finish = (name: string, color: string, roughness: number, metalness = .05) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: .55 });
    material.name = `Skyline / ${name}`; return material;
  };
  const stone = finish('sunlit limestone', '#e5d7b4', .80);
  const terracotta = finish('terracotta', '#f97b72', .82);
  const sandstone = finish('golden sandstone', '#ffcb50', .79);
  const cream = finish('ivory cornices', '#f2e5c6', .75);
  const steel = finish('blue silver mullions', '#99c5ce', .30, .36);
  const dark = finish('deep blue recesses', '#336d87', .35, .20);
  const white = finish('silver structural fins', '#dbe7dc', .40, .20);
  const glass = finish('Pacific blue glazing', '#14bed0', .22, .25);
  const glassLight = finish('sky reflections', '#8bcbd7', .23, .20);
  const glassDeep = finish('ocean reflections', '#3b8ac5', .23, .27);
  const bronze = finish('copper roofs', '#07bda4', .51, .25);
  const crownLight = new THREE.MeshStandardMaterial({ color: '#e4efdf', emissive: '#afdbeb', emissiveIntensity: .06, roughness: .40 });
  crownLight.name = 'Skyline / Salesforce crown';
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rotation = new THREE.Euler()) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(v(x, y, z), new THREE.Quaternion().setFromEuler(rotation), v(1, 1, 1)));
    if (!batches.has(material)) batches.set(material, []); batches.get(material)!.push(geometry);
  }
  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  }
  function face(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number) {
    add(new THREE.PlaneGeometry(w, h), mat, x, y, z, new THREE.Euler(0, Math.PI, 0));
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
    const middle = a.clone().add(b).multiplyScalar(.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    add(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 5), material, middle.x, middle.y, middle.z, new THREE.Euler().setFromQuaternion(rotation));
  }
  function markFeature() { return new Map([...batches].map(([material, geometries]) => [material, geometries.length])); }
  function stretchFeature(mark: Map<THREE.Material, number>, height: number) {
    const matrix = new THREE.Matrix4().makeScale(1, height, 1);
    for (const [material, geometries] of batches) for (let i = mark.get(material) ?? 0; i < geometries.length; i++) geometries[i].applyMatrix4(matrix);
  }

  // Recognisable landmarks are staged along the chase-camera sightline. Their
  // storybook proportions deliberately rise above the foreground roof canyon.
  const salesforceStart = markFeature();
  const sx = 180, sz = 1340, base = -12;
  const radiusAt = (y: number) => 30.5 * (1 - .29 * Math.pow(y / 286, 2));
  for (let floor = 0; floor < 61; floor++) {
    const y = floor * 4.4, r1 = radiusAt(y), r2 = radiusAt(y + 4.4);
    const reflection = floor > 43 ? glassLight : floor % 11 < 4 ? glass : glassDeep;
    add(new THREE.CylinderGeometry(r2, r1, 4.15, 32), reflection, sx, base + y + 2.075, sz);
    add(new THREE.CylinderGeometry(r2 + .3, r2 + .3, .25, 32), steel, sx, base + y + 4.25, sz);
  }
  for (let j = 0; j < 40; j++) {
    const angle = j / 40 * Math.PI * 2, points: THREE.Vector3[] = [];
    for (let y = 0; y <= 277; y += 6) {
      const radius = radiusAt(y) + .32;
      points.push(v(sx + Math.cos(angle) * radius, base + y, sz + Math.sin(angle) * radius));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 46, .25, 4, false), white, 0, 0, 0);
  }
  add(new THREE.SphereGeometry(22, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), crownLight, sx, base + 268, sz);
  for (let j = 0; j < 12; j++) add(new THREE.TorusGeometry(22 * Math.sqrt(1 - Math.pow(j / 12, 2)), .16, 4, 48), steel,
    sx, base + 268 + j * 1.8, sz, new THREE.Euler(Math.PI / 2, 0, 0));
  stretchFeature(salesforceStart, 1.38);

  // 181 Fremont: slender blue prism, silver exoskeleton, asymmetric crown.
  box(29, 202, 28, glassDeep, 430, 91, 1325);
  for (let y = 0; y < 202; y += 4.2) box(29.45, .20, 28.45, steel, 430, -10 + y, 1325);
  for (const side of [-1, 1]) {
    rod(v(430 + side * 14.8, -10, 1310.6), v(430 - side * 14.8, 192, 1310.6), .60, white);
    box(.72, 198, .72, white, 430 + side * 14.2, 91, 1310.4);
  }
  for (let x = 418; x < 444; x += 3.6) box(.14, 195, .07, glassLight, x, 91, 1310.94);
  box(15, 8, 22, steel, 436, 196, 1325);
  add(new THREE.ConeGeometry(1, 38, 6), white, 431, 211, 1325);

  // Transamerica's elegant pyramid balances the rounded Salesforce tower.
  const pyramidStart = markFeature();
  const px = -78, pz = 1110;
  const cone = new THREE.ConeGeometry(27, 151, 4, 1); cone.rotateY(Math.PI / 4); add(cone, stone, px, 117, pz);
  box(37, 44, 37, stone, px, 21, pz);
  for (let level = 0; level < 37; level++) {
    const y = 44 + level * 3.85, half = 19.1 * (1 - (y - 41.5) / 151);
    if (half < .7) continue;
    for (const side of [-1, 1]) {
      box(half * 1.8, .66, .06, dark, px, y, pz + side * half);
      box(.06, .66, half * 1.8, dark, px + side * half, y, pz);
    }
  }
  box(6, 100, 9, stone, px - 18, 61, pz); box(6, 100, 9, stone, px + 18, 61, pz);
  add(new THREE.ConeGeometry(.7, 26, 6), white, px, 205, pz);
  stretchFeature(pyramidStart, 1.53);

  // A deliberately impossible postcard view: the bridge is pulled into the
  // western panorama so the first great hill reveals an unmistakable SF icon.
  // Its red towers and sweeping cables remain true to the familiar silhouette.
  const bridgeRed = finish('International Orange', '#f95635', .60, .15);
  const bridgeShade = finish('bridge recessed steel', '#af3446', .65, .16);
  const bayWater = finish('turquoise bay', '#13bfbf', .30, .25);
  const islandGreen = finish('Marin headlands', '#34aa8a', .92);
  box(1700, 2, 1550, bayWater, -1170, -4, 960);
  for (const [x, z, w, h, d] of [[-1200, 1110, 470, 97, 250], [-1470, 780, 350, 130, 300], [-890, 1350, 400, 75, 220]]) {
    const hill = new THREE.SphereGeometry(1, 20, 10); hill.scale(w, h, d); add(hill, islandGreen, x, -25, z);
  }
  const bridgeZ = 880, deckY = 75, towers = [-780, -405], bridgeStart = -1110, bridgeEnd = -155;
  box(bridgeEnd - bridgeStart, 4.2, 25, bridgeShade, (bridgeStart + bridgeEnd) / 2, deckY, bridgeZ);
  box(bridgeEnd - bridgeStart, .9, 23.7, dark, (bridgeStart + bridgeEnd) / 2, deckY + 2.5, bridgeZ);
  for (const side of [-1, 1]) {
    box(bridgeEnd - bridgeStart, 1.2, .8, bridgeRed, (bridgeStart + bridgeEnd) / 2, deckY + 4.2, bridgeZ + side * 12.25);
    for (const x of towers) {
      box(8.4, 204, 8.4, bridgeRed, x, 100, bridgeZ + side * 14.0);
      box(3.0, 188, .5, bridgeShade, x, 102, bridgeZ + side * 18.28);
      for (const yy of [76, 107, 143, 174, 201]) box(10.0, 2.0, 10.0, bridgeRed, x, yy, bridgeZ + side * 14);
      box(7.0, 6, 7.0, cream, x, 206, bridgeZ + side * 14);
    }
    const spans = [[bridgeStart, towers[0], 78, 199], [towers[0], towers[1], 199, 199], [towers[1], bridgeEnd, 199, 79]];
    for (let spanIndex = 0; spanIndex < spans.length; spanIndex++) {
      const [a, b, ya, yb] = spans[spanIndex], points: THREE.Vector3[] = [];
      const curveY = (t: number) => ya + (yb - ya) * t - Math.sin(t * Math.PI) * (spanIndex === 1 ? 106 : 24);
      for (let i = 0; i <= 40; i++) points.push(v(a + (b - a) * i / 40, curveY(i / 40), bridgeZ + side * 14));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 1.08, 7, false), bridgeRed, 0, 0, 0);
      for (let x = a + 11; x < b; x += 15) {
        const height = curveY((x - a) / (b - a));
        rod(v(x, deckY + 4, bridgeZ + side * 12.5), v(x, height, bridgeZ + side * 14), .26, bridgeRed);
      }
    }
  }
  for (const x of towers) {
    for (const yy of [104, 139, 173, 198]) {
      box(8.2, 5.3, 31, bridgeRed, x, yy, bridgeZ);
      box(8.5, 1.15, 31.6, bridgeShade, x, yy - 2.35, bridgeZ);
    }
    box(17, 8, 45, bridgeShade, x, 5, bridgeZ);
  }

  // Varied older masonry, terracotta crowns and glass setbacks replace the
  // repetitive charcoal blocks, within the same intermediate skyline area.
  let seed = 31;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 35; i++) {
    const x = 180 + random() * 550, z = 1070 + random() * 275;
    const floors = 12 + Math.floor(random() * 34), h = floors * 3.85;
    const w = 16 + random() * 27, d = 16 + random() * 32;
    if (Math.abs(x - sx) < 45 && Math.abs(z - sz) < 65) continue;
    const style = i % 5, masonry = style === 0 || style === 1 || style === 4;
    const material = [stone, terracotta, glass, glassDeep, sandstone][style];
    box(w, h, d, material, x, h / 2 - 12, z);
    if (masonry) {
      const columns = Math.max(3, Math.floor(w / 3.8)), bay = w / columns;
      for (let floor = 1; floor < floors; floor++) {
        const y = floor * 3.85 - 10;
        for (let col = 0; col < columns; col++) {
          const xx = x - w / 2 + (col + .5) * bay;
          face(bay * .57, 2.22, (floor + col + i) % 5 === 0 ? glassLight : dark, xx, y, z - d / 2 - .12);
          face(.075, 2.3, cream, xx, y, z - d / 2 - .18);
          box(bay * .69, .13, .28, cream, xx, y - 1.20, z - d / 2 - .16);
        }
        if (floor % 5 === 0) box(w + .40, .19, d + .35, cream, x, y + 1.8, z);
      }
      for (let col = 0; col <= columns; col++) box(.16, h - 1, .21, cream, x - w / 2 + col * bay, h / 2 - 12, z - d / 2 - .09);
      box(w + .9, .40, d + .8, cream, x, h - 12, z);
      box(w + .55, .16, d + .50, bronze, x, h - 11.7, z);
    } else {
      for (let y = 3; y < h - 2; y += 3.85) box(w + .09, .15, d + .09, steel, x, y - 12, z);
      for (let xx = -w / 2 + 2; xx < w / 2 - 1; xx += 3.35) {
        box(.12, h - .4, .15, white, x + xx, h / 2 - 12, z - d / 2 - .035);
        if (Math.floor(xx + w) % 3 === 0) box(1.32, h - .5, .035, glassLight, x + xx + .8, h / 2 - 12, z - d / 2 - .022);
      }
      for (const side of [-1, 1]) box(.26, h, .30, white, x + side * (w / 2 + .035), h / 2 - 12, z - d / 2);
    }
    // Roof families stay inside their original footprints.
    if (style === 1 || style === 4) {
      for (let step = 0; step < 3; step++) {
        const sw = w * (.76 - step * .17), sd = d * (.78 - step * .18), sh = 4.0;
        box(sw, sh, sd, material, x, h - 10 + step * sh, z + step * .55);
        box(sw + .55, .23, sd + .55, cream, x, h - 8 + step * sh, z + step * .55);
      }
      rod(v(x, h + 1, z + 1), v(x, h + 11, z + 1), .09, bronze);
    } else if (style === 2) {
      box(w * .65, 8, d * .62, glassLight, x + w * .12, h - 8, z + d * .08);
      box(w * .69, .36, d * .66, white, x + w * .12, h - 3.8, z + d * .08);
      box(w * .29, 5.4, d * .30, steel, x + w * .19, h - 1.0, z + d * .10);
    } else if (style === 3) {
      box(w * .43, 13, d * .63, glass, x - w * .18, h - 5.5, z + d * .10);
      box(w * .47, .25, d * .67, white, x - w * .18, h + 1.10, z + d * .10);
    } else {
      box(w * .54, 3.6, d * .58, sandstone, x, h - 10, z + 1.2);
      const roof = new THREE.ConeGeometry(1, 4.4, 4); roof.rotateY(Math.PI / 4); roof.scale(w * .45, 1, d * .48);
      add(roof, bronze, x, h - 6.0, z + 1.2);
    }
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries)!; geometries.forEach(source => source.dispose());
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name; group.add(mesh);
  }
  return group;
}

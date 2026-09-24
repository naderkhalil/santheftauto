import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_AUTHORED_RESERVES, CITY_INFILL_BLOCKS, CITY_INFILL_PARCELS } from './city-infill-layout';
import { groundHeight, routeProgressAt, sampleRoute } from './route';
import { containsPlayground } from './playground';

type Front = 'north' | 'south' | 'east' | 'west';
type Block = { minX: number; maxX: number; minZ: number; maxZ: number; fronts: readonly Front[] };

/** Street-height details for the infill parcels. All positions are semantic
 * east/up/north, like city-loop. The seven-metre sidewalk belongs to the
 * street-facing perimeter; rear courts and the historic Grant set stay clear.
 */
export function createInfillStreets(scene: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = 'Downtown / continuous sidewalks and corner details';
  scene.add(group);

  // A single repeating aggregate/contraction-joint texture, rather than one
  // material or thousands of thin meshes for every concrete paving slab.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e3e2df'; ctx.fillRect(0, 0, 256, 256);
  let randomState = 413;
  const random = () => { randomState = Math.imul(randomState, 1664525) + 1013904223; return (randomState >>> 0) / 4294967296; };
  for (let i = 0; i < 7200; i++) {
    const shade = Math.round(179 + random() * 70);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${.12 + random() * .25})`;
    ctx.fillRect(random() * 256, random() * 256, .5 + random() * 1.5, .5 + random() * 1.5);
  }
  ctx.strokeStyle = '#c5c5bf'; ctx.lineWidth = 2.2;
  ctx.strokeRect(.5, .5, 255, 255);
  ctx.strokeStyle = '#f2eee3'; ctx.lineWidth = .8;
  ctx.strokeRect(2, 2, 252, 252);
  const concrete = new THREE.CanvasTexture(canvas);
  concrete.colorSpace = THREE.SRGBColorSpace;
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  concrete.anisotropy = 4;
  const paving = new THREE.MeshStandardMaterial({ map: concrete, vertexColors: true, roughness: .96, metalness: 0 });
  const detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .12 });
  const names = ['MASON ST', 'POWELL ST', 'STOCKTON ST', 'GRANT AVE', 'KEARNY ST', 'MONTGOMERY ST', 'SANSOME ST', 'THE EMBARCADERO', 'SUTTER ST', 'BUSH ST', 'PINE ST', 'CALIFORNIA ST', 'SACRAMENTO ST', 'WASHINGTON ST', 'JACKSON ST'];
  const signs = document.createElement('canvas'); signs.width = 512; signs.height = names.length * 64;
  const sc = signs.getContext('2d')!;
  names.forEach((name, i) => {
    sc.fillStyle = '#244c40'; sc.fillRect(0, i * 64, 512, 64);
    sc.strokeStyle = '#cadbcc'; sc.lineWidth = 2; sc.strokeRect(5, i * 64 + 5, 502, 54);
    sc.fillStyle = '#fff4dc'; sc.font = '600 31px Arial'; sc.textAlign = 'center'; sc.textBaseline = 'middle';
    sc.fillText(name, 256, i * 64 + 34, 480);
  });
  const atlas = new THREE.CanvasTexture(signs); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  const signage = new THREE.MeshStandardMaterial({ map: atlas, roughness: .72, side: THREE.DoubleSide });

  const batches = new Map<string, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const color = new THREE.Color(), cube = new THREE.BoxGeometry(1, 1, 1);
  const trunk = new THREE.CylinderGeometry(1, 1, 1, 7), leaf = new THREE.IcosahedronGeometry(1, 1);
  const q = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  function stash(geometry: THREE.BufferGeometry, material: THREE.Material, tint?: string) {
    if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
    if (tint) {
      color.set(tint); const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    // All primitive attributes agree before merging (including discs/lines).
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    geometry.computeBoundingBox(); const b = geometry.boundingBox!;
    const cell = `${Math.floor((b.min.x + b.max.x) / 256)},${Math.floor((b.min.z + b.max.z) / 256)}`;
    if (!batches.has(cell)) batches.set(cell, new Map());
    const materials = batches.get(cell)!;
    if (!materials.has(material)) materials.set(material, []);
    materials.get(material)!.push(geometry);
  }
  function part(geometry: THREE.BufferGeometry, tint: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    stash(geometry.clone().applyMatrix4(matrix.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))), detail, tint);
  }
  function box(tint: string, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) { part(cube, tint, x, y, z, w, h, d, yaw); }
  function beam(tint: string, ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), delta = b.clone().sub(a);
    const g = trunk.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(a.add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, delta.clone().normalize()), new THREE.Vector3(radius, delta.length(), radius)));
    stash(g, detail, tint);
  }
  function patch(minX: number, maxX: number, minZ: number, maxZ: number, height: number | ((x: number, z: number) => number), tint: string, material = detail) {
    if (minX >= maxX || minZ >= maxZ) return;
    const nx = Math.max(1, Math.ceil((maxX - minX) / 2)), nz = Math.max(1, Math.ceil((maxZ - minZ) / 2));
    const p: number[] = [], uv: number[] = [], ids: number[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = minX + (maxX - minX) * i / nx, z = minZ + (maxZ - minZ) * j / nz;
      p.push(x, groundHeight(x, z) + (typeof height === 'number' ? height : height(x, z)), z); uv.push(x / 3.25, z / 3.25);
      if (i < nx && j < nz) { const a = j * (nx + 1) + i; ids.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
    }
    // Inner corners of the racing road are rounded. Clip paving triangles to
    // that actual curved edge, instead of covering it with square block slabs.
    if (material === paving) {
      type V = { x: number; y: number; z: number; distance: number };
      const out: number[] = [], outUV: number[] = [];
      for (let i = 0; i < ids.length; i += 3) {
        let triangle: V[] = ids.slice(i, i + 3).map(id => ({ x: p[id * 3], y: p[id * 3 + 1], z: p[id * 3 + 2], distance: trackDistance(p[id * 3], p[id * 3 + 2]) - 7.66 }));
        const clipped: V[] = [];
        for (let j = 0; j < triangle.length; j++) {
          const a = triangle[j], b = triangle[(j + 1) % triangle.length];
          if (a.distance >= 0) clipped.push(a);
          if ((a.distance >= 0) !== (b.distance >= 0)) {
            const t = a.distance / (a.distance - b.distance);
            clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, distance: 0 });
          }
        }
        triangle = clipped;
        for (let j = 1; j < triangle.length - 1; j++) for (const v of [triangle[0], triangle[j], triangle[j + 1]]) {
          out.push(v.x, v.y, v.z); outUV.push(v.x / 3.25, v.z / 3.25);
        }
      }
      if (!out.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(outUV, 2)); g.computeVertexNormals(); stash(g, material, tint);
    } else {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ids); g.computeVertexNormals(); stash(g, material, tint);
    }
  }

  const sidewalk = 7, paintKeys = new Set<string>(), fixtureKeys = new Set<string>();
  const streetX = [-199, -75, 75, 175, 300, 410, 500, 590];
  const streetZ = [185, 300, 400, 500, 600, 700, 850];
  const nearestIndex = (array: number[], value: number) => array.reduce((best, current, i) => Math.abs(current - value) < Math.abs(array[best] - value) ? i : best, 0);
  const trackDistance = (x: number, z: number) => { const p = sampleRoute(routeProgressAt(x, z)); return Math.hypot(x - p.x, z - p.z); };
  const reserved = (x: number, z: number, margin = 0) => CITY_AUTHORED_RESERVES.some(r => x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin);

  function streetSign(x: number, z: number, xStreet: number, zStreet: number) {
    const y = groundHeight(x, z) + .22;
    part(trunk, '#52645c', x, y + 2.25, z, .055, 4.5, .055);
    for (let face = 0; face < 2; face++) {
      const id = face ? nearestIndex(streetZ, zStreet) + streetX.length : nearestIndex(streetX, xStreet);
      const g = new THREE.PlaneGeometry(3.3, .42), uv = g.getAttribute('uv');
      for (let j = 0; j < uv.count; j++) uv.setXY(j, 1 - uv.getX(j), 1 - (id + 1 - uv.getY(j)) / names.length);
      g.rotateY(face * Math.PI / 2); g.translate(x, y + 4.13 - face * .5, z); stash(g, signage);
    }
  }
  function lamp(x: number, z: number, inwardX: number, inwardZ: number) {
    const y = groundHeight(x, z) + .22;
    part(trunk, '#384d47', x, y + .32, z, .23, .64, .23);
    part(trunk, '#53675d', x, y + 3.6, z, .075, 7.2, .075);
    const dx = -inwardX * 1.2, dz = -inwardZ * 1.2;
    beam('#53675d', x, y + 6.45, z, x + dx * .65, y + 7.25, z + dz * .65, .065);
    beam('#53675d', x + dx * .65, y + 7.25, z + dz * .65, x + dx, y + 7.1, z + dz, .065);
    part(leaf, '#fbebc0', x + dx, y + 6.93, z + dz, .31, .35, .31);
    part(trunk, '#354943', x + dx, y + 7.27, z + dz, .24, .12, .24);
  }
  function tree(x: number, z: number, seed: number) {
    const y = groundHeight(x, z) + .235;
    // The dark metal tree well is flush, with a visible opening for the trunk.
    patch(x - 1, x + 1, z - 1, z + 1, .237, '#4f5e53');
    patch(x - .45, x + .45, z - .45, z + .45, .243, '#655746');
    for (let i = -4; i <= 4; i++) {
      const o = i * .2;
      patch(x - .95, x + .95, z + o - .022, z + o + .022, .251, '#849087');
    }
    const h = 5.25 + seed % 3 * .32;
    part(trunk, '#6b6351', x, y + h * .43, z, .14, h * .86, .14);
    for (let i = 0; i < 5; i++) {
      const angle = seed * .72 + i * 2.399, radius = i ? 1.12 : 0;
      const xx = x + Math.sin(angle) * radius, zz = z + Math.cos(angle) * radius, yy = y + h + (i % 2) * .43;
      beam('#72674f', x, y + h * .62, z, xx, yy, zz, .06);
      part(leaf, ['#487743', '#668e4b', '#7c9d58', '#557e42', '#6e914c'][i], xx, yy, zz, 1.7, 1.75, 1.55, angle);
    }
  }
  function hydrant(x: number, z: number) {
    const y = groundHeight(x, z) + .22;
    part(trunk, '#ddba52', x, y + .43, z, .19, .74, .19);
    part(trunk, '#9c8b52', x, y + .09, z, .28, .14, .28);
    part(leaf, '#f1d477', x, y + .87, z, .21, .17, .21);
    beam('#d2ad43', x - .32, y + .57, z, x + .32, y + .57, z, .115);
    box('#746740', x, y + 1.025, z, .085, .07, .085);
  }
  function manhole(x: number, z: number) {
    const key = `m/${Math.round(x)},${Math.round(z)}`; if (fixtureKeys.has(key)) return; fixtureKeys.add(key);
    const g = new THREE.CircleGeometry(.57, 20); g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const xx = p.getX(i) + x, zz = p.getZ(i) + z; p.setXYZ(i, xx, groundHeight(xx, zz) + .153, zz); }
    g.computeVertexNormals(); stash(g, detail, '#4b5353');
    for (let i = -2; i <= 2; i++) patch(x - .33, x + .33, z + i * .135 - .016, z + i * .135 + .016, .159, '#73807b');
  }

  function edge(block: Block, front: Front, index: number) {
    const horizontal = front === 'north' || front === 'south', sign = front === 'north' || front === 'east' ? 1 : -1;
    const min = horizontal ? block.minX : block.minZ, max = horizontal ? block.maxX : block.maxZ;
    const outside = horizontal ? sign > 0 ? block.maxZ : block.minZ : sign > 0 ? block.maxX : block.minX;
    const inside = outside - sign * sidewalk;
    const transform = (along: number, depth: number) => horizontal ? { x: along, z: outside - sign * depth } : { x: outside - sign * depth, z: along };
    const slabHeight = (x: number, z: number) => {
      const along = horizontal ? x : z, depth = Math.abs((horizontal ? z : x) - outside);
      // Wheelchair/tyre-friendly aprons where the two sidewalks meet a crossing.
      const corner = Math.min(along - min, max - along);
      return .225 - .105 * Math.max(0, 1 - corner / 4.6) * Math.max(0, 1 - depth / 4);
    };
    const tint = ['#d4d1c7', '#d1cfc5', '#d9d6cc'][index % 3];
    const innerMin = Math.min(outside, inside), innerMax = Math.max(outside, inside);
    if (horizontal) patch(min, max, innerMin, innerMax, slabHeight, tint, paving);
    else patch(innerMin, innerMax, min + (block.fronts.includes('south') ? sidewalk : 0), max - (block.fronts.includes('north') ? sidewalk : 0), slabHeight, tint, paving);
    // A narrow granite nose connects pavement to the asphalt without walls.
    for (let a = min; a < max; a += 2) {
      const b = Math.min(max, a + 1.975), mid = (a + b) / 2, p = transform(mid, .11);
      if (trackDistance(p.x, p.z) < 8.3) continue;
      const h = slabHeight(p.x, p.z), y = groundHeight(p.x, p.z);
      const g = cube.clone(); g.scale(horizontal ? b - a : .24, .16, horizontal ? .24 : b - a); g.translate(p.x, y + h - .08, p.z);
      // Terrain deformation follows the real hill at every curb vertex.
      const attr = g.getAttribute('position');
      for (let i = 0; i < attr.count; i++) attr.setY(i, attr.getY(i) + groundHeight(attr.getX(i), attr.getZ(i)) - y);
      g.computeVertexNormals(); stash(g, detail, '#b7bcb5');
    }
    const center = outside + sign * 7.8;
    const crossings: number[] = [];
    if (block.fronts.includes(horizontal ? 'west' : 'south')) crossings.push(min + 4.9);
    if (block.fronts.includes(horizontal ? 'east' : 'north')) crossings.push(max - 4.9);
    for (const along of crossings) {
      const key = `${horizontal ? 'h' : 'v'}/${Math.round(center)},${Math.round(along)}`;
      if (!paintKeys.has(key)) {
        paintKeys.add(key);
        for (let stripe = -6.35; stripe < 7; stripe += 1.42) {
          if (horizontal) patch(along - 1.65, along + 1.65, center + stripe, center + stripe + .69, .154, '#e9e6d2');
          else patch(center + stripe, center + stripe + .69, along - 1.65, along + 1.65, .154, '#e9e6d2');
        }
      }
    }
    // Utility hardware sits flush with the road and never narrows a driving lane.
    const mid = (min + max) / 2, road = transform(mid + 8, -6);
    manhole(road.x, road.z);
    for (const a of [min + 11, max - 11]) {
      const p = transform(a, -.55);
      patch(p.x - (horizontal ? .52 : .22), p.x + (horizontal ? .52 : .22), p.z - (horizontal ? .22 : .52), p.z + (horizontal ? .22 : .52), .145, '#424c48');
      for (let i = -3; i <= 3; i++) {
        const q = transform(a + i * .13, -.55);
        patch(q.x - (horizontal ? .022 : .2), q.x + (horizontal ? .022 : .2), q.z - (horizontal ? .2 : .022), q.z + (horizontal ? .2 : .022), .154, '#81867c');
      }
    }
    const count = Math.max(1, Math.round((max - min) / 38));
    for (let i = 0; i < count; i++) {
      const a = min + (i + .5) * (max - min) / count, p = transform(a, 2.6);
      // The square already has precise collision-backed trees/street hardware.
      // No new solid street props are introduced inside its playable bounds.
      if (containsPlayground(p.x, p.z, -2) || reserved(p.x, p.z, 2.5)) continue;
      const clear = trackDistance(p.x, p.z) > 15;
      if (clear && (index + i) % 2 === 0) lamp(p.x, p.z, horizontal ? 0 : -sign, horizontal ? -sign : 0);
      else if ((index + i) % 3 !== 0) tree(p.x, p.z, index * 11 + i);
    }
    if (index % 3 === 0) {
      const p = transform(min + 9, 2.05);
      if (!containsPlayground(p.x, p.z, -2) && !reserved(p.x, p.z, 1)) hydrant(p.x, p.z);
    }
  }

  CITY_INFILL_BLOCKS.forEach((block, index) => {
    for (const [i, front] of block.fronts.entries()) edge(block, front, index * 4 + i);
    // Pave only the narrow service passages between actual building bodies.
    // Their footprint comes from the same parcel list as the architecture.
    const lots = CITY_INFILL_PARCELS.filter(parcel => parcel.blockId === block.id);
    const minX = block.minX + (block.fronts.includes('west') ? sidewalk : 0), maxX = block.maxX - (block.fronts.includes('east') ? sidewalk : 0);
    const minZ = block.minZ + (block.fronts.includes('south') ? sidewalk : 0), maxZ = block.maxZ - (block.fronts.includes('north') ? sidewalk : 0);
    const xs = [...new Set([minX, maxX, ...lots.flatMap(p => [p.x - p.width / 2, p.x + p.width / 2])].map(v => Math.min(maxX, Math.max(minX, v))))].sort((a, b) => a - b);
    const zs = [...new Set([minZ, maxZ, ...lots.flatMap(p => [p.z - p.depth / 2, p.z + p.depth / 2])].map(v => Math.min(maxZ, Math.max(minZ, v))))].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
      if (lots.some(p => Math.abs(x - p.x) < p.width / 2 && Math.abs(z - p.z) < p.depth / 2) || reserved(x, z)) continue;
      patch(xs[i], xs[i + 1], zs[j], zs[j + 1], .035, '#8d938b', paving);
    }
    const west = block.fronts.includes('west'), north = block.fronts.includes('north');
    if (west && north) {
      const x = block.minX + 2.4, z = block.maxZ - 3.2;
      if (!containsPlayground(x, z, -2) && trackDistance(x, z) > 15) streetSign(x, z, block.minX - 7.8, block.maxZ + 7.8);
    }
  });
  const meshes: THREE.Mesh[] = [];
  for (const [cell, materials] of batches) for (const [material, pieces] of materials) {
    const geometry = mergeGeometries(pieces, false); pieces.forEach(piece => piece.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; mesh.castShadow = material === detail;
    mesh.name = `Street details [${cell}] / ${material === paving ? 'pavement' : material === detail ? 'curbs and fixtures' : 'street names'}`;
    group.add(mesh); meshes.push(mesh);
  }
  group.userData.cullingCells = batches.size; group.userData.cullingCellSize = 128;
  group.userData.drawCalls = meshes.length;
  group.userData.triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
  cube.dispose(); trunk.dispose(); leaf.dispose(); batches.clear();
  return { group, setQuality(low: boolean) { for (const mesh of meshes) mesh.castShadow = !low && mesh.material === detail; } };
}

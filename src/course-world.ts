import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CourseDefinition } from './courses';
import type { DrivingRoute } from './driving';

type Point = { x: number; y: number; z: number };

/** Self-contained course scenery. Everything, including signs and animation,
 * lives below the geographic city root and is released when a course changes. */
export function createCourseWorld(parent: THREE.Object3D, course: CourseDefinition, route: DrivingRoute) {
  const group = new THREE.Group();
  group.name = `${course.name} / city course`;
  parent.add(group);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string, roughness = .84, metalness = 0) => {
    const key = `${color}/${roughness}/${metalness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    return materials.get(key)!;
  };
  const asphalt = material(course.theme === 'coast' ? '#707b77' : '#69777e');
  const cream = material('#efe7d0'), stone = material('#c8c1ad'), dark = material('#344a4d');
  const gold = material('#e6b955', .52, .2), accent = material(course.accent);
  const glass = material('#7da8ac', .25, .25), leaf = material('#5f8469');
  const evergreen = material('#42695d'), bark = material('#706450'), orange = material('#bd5139', .64, .12);
  const grass = material(course.theme === 'coast' ? '#91a184' : '#96af86');
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  // Keep every batched primitive indexed with position/normal/uv attributes.
  const ball = new THREE.SphereGeometry(1, 8, 6);
  const cone = new THREE.ConeGeometry(1, 1, 8);
  const templates = [cube, cylinder, ball, cone];
  const batches = new Map<string, { mat: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const animatedRotors: THREE.Group[] = [];
  const clouds: { mesh: THREE.Mesh; origin: Point; phase: number }[] = [];
  const oceanLines: THREE.Mesh[] = [];
  const length = route.TRACK_LENGTH;
  const roadWidth = route.ROAD_HALF_WIDTH;
  const samples: (Point & { progress: number })[] = [];
  const count = Math.ceil(length / 12);
  for (let i = 0; i <= count; i++) samples.push({ ...route.sampleRoute(length * i / count), progress: length * i / count });
  const bounds = new THREE.Box3().setFromPoints(samples.map(p => new THREE.Vector3(p.x, p.y, p.z)));
  const fogRange = course.fog ? { start: course.fog.start * length, end: course.fog.end * length } : null;
  const anchors = (route as DrivingRoute & { anchorProgress?: readonly number[] }).anchorProgress;
  const station = (pattern: RegExp, fallback: number) => {
    const index = course.points.findIndex(point => pattern.test(point.label));
    return index >= 0 ? anchors?.[index] ?? fallback : fallback;
  };
  // The bridge deck stays above water; the hill and southern approach own land.
  const bridgeStart = course.theme === 'bridge' ? station(/south entrance/i, length * .35) : Infinity;
  const bridgeEnd = course.theme === 'bridge' ? station(/bridge complete/i, length * .73) : -Infinity;

  function add(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number,
    width: number, height: number, depth: number, yaw = 0, pitch = 0) {
    position.set(x, y, z); scale.set(width, height, depth);
    quaternion.setFromEuler(euler.set(pitch, yaw, 0));
    const transformed = geometry.clone().applyMatrix4(matrix.compose(position, quaternion, scale));
    const key = `${Math.floor(x / 160)},${Math.floor(z / 160)}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { mat, geometries: [] });
    batches.get(key)!.geometries.push(transformed);
  }
  const box = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, pitch = 0) =>
    add(cube, mat, x, y, z, w, h, d, yaw, pitch);
  const pole = (mat: THREE.Material, x: number, y: number, z: number, radius: number, height: number) =>
    add(cylinder, mat, x, y, z, radius, height, radius);
  function beam(mat: THREE.Material, a: Point, b: Point, radius: number) {
    const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(b.x, b.y, b.z);
    const midpoint = from.clone().add(to).multiplyScalar(.5);
    const geometry = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize()));
    geometry.translate(midpoint.x, midpoint.y, midpoint.z);
    const key = `${Math.floor(midpoint.x / 160)},${Math.floor(midpoint.z / 160)}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { mat, geometries: [] });
    batches.get(key)!.geometries.push(geometry);
  }
  function label(text: string, p: Point, width: number, height: number, yaw: number, bg = '#344f4b', fg = '#fff5d9') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(12, 12, 1000, 136);
    ctx.fillStyle = fg; ctx.font = '600 60px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 512, 84, 960);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    // The parent mirrors north for the rendering coordinate system.
    texture.repeat.x = -1; texture.offset.x = 1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({
      map: texture, roughness: .8, side: THREE.DoubleSide,
    }));
    mesh.position.set(p.x, p.y, p.z); mesh.rotation.y = yaw; mesh.name = text;
    group.add(mesh);
  }
  function nearest(x: number, z: number) {
    let distance = Infinity, best = samples[0];
    for (const sample of samples) {
      const d = (sample.x - x) ** 2 + (sample.z - z) ** 2;
      if (d < distance) { distance = d; best = sample; }
    }
    return { sample: best, distance: Math.sqrt(distance) };
  }
  function clearOfRoad(x: number, z: number, radius: number) {
    return nearest(x, z).distance > roadWidth + radius + 4;
  }
  function ribbon(left: number, right: number, offset: number, mat: THREE.Material, name: string, from = -18, to = length + 24) {
    const vertices: number[] = [], indices: number[] = [];
    const steps = Math.ceil((to - from) / 2);
    for (let i = 0; i <= steps; i++) {
      const s = from + (to - from) * i / steps;
      for (const lateral of [left, right]) {
        const p = route.routePoint(s, lateral); vertices.push(p.x, p.y + offset, p.z);
      }
      if (i < steps) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.receiveShadow = true; group.add(mesh);
  }
  function roadBox(mat: THREE.Material, s: number, lateral: number, w: number, h: number, d: number, rise = .2) {
    const p = route.routePoint(s, lateral), pitch = -Math.atan(route.routeSlope(s));
    box(mat, p.x, p.y + rise, p.z, w, h, d / Math.cos(pitch), route.routeYaw(s), pitch);
  }

  // Shared terrain follows the elevation of the closest authored street. A fine
  // road ribbon independently matches physics, including bank-free hill turns.
  const padding = 260, terrainWidth = bounds.max.x - bounds.min.x + padding * 2;
  const terrainDepth = bounds.max.z - bounds.min.z + padding * 2;
  const terrain = new THREE.PlaneGeometry(terrainWidth, terrainDepth, Math.ceil(terrainWidth / 24), Math.ceil(terrainDepth / 24));
  terrain.rotateX(-Math.PI / 2); terrain.translate((bounds.min.x + bounds.max.x) / 2, 0, (bounds.min.z + bounds.max.z) / 2);
  const vertices = terrain.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i), close = nearest(x, z);
    let y = close.sample.y - .55;
    if (course.theme === 'coast') y -= Math.max(0, close.distance - 18) * .28;
    if (course.theme === 'bridge' && close.sample.progress > bridgeStart && close.sample.progress < bridgeEnd) y = -10;
    if (course.theme === 'park') {
      const finish = samples[samples.length - 1], yaw = route.routeYaw(length);
      const seaward = (x - finish.x) * Math.sin(yaw) + (z - finish.z) * Math.cos(yaw);
      y -= Math.max(0, seaward - 14) * .65;
    }
    if (course.theme === 'presidio') y -= Math.max(0, z - samples[samples.length - 1].z - 22) * .3;
    vertices.setY(i, y);
  }
  terrain.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(terrain, course.theme === 'city' || course.theme === 'victorian' ? material('#c0c4b1') : grass);
  terrainMesh.receiveShadow = true; group.add(terrainMesh);
  ribbon(-11.8, 11.8, .04, stone, 'continuous sidewalks');
  ribbon(-roadWidth, roadWidth, .13, asphalt, 'continuous course road');
  ribbon(-roadWidth - .18, -roadWidth + .02, .19, cream, 'left road edge');
  ribbon(roadWidth - .02, roadWidth + .18, .19, cream, 'right road edge');
  for (let s = 8; s < length + 12; s += 14) {
    for (const side of [-1, 1]) roadBox(gold, s, side * .16, .10, .016, 5.5);
  }

  function tree(p: Point, size: number, conifer = false, seed = 0) {
    pole(bark, p.x, p.y + size * .35, p.z, size * .032, size * .7);
    if (conifer) {
      for (let tier = 0; tier < 3; tier++) add(cone, tier % 2 ? evergreen : leaf,
        p.x, p.y + size * (.58 + tier * .14), p.z, size * (.32 - tier * .06), size * .65, size * (.32 - tier * .06), seed);
    } else {
      add(ball, leaf, p.x, p.y + size * .79, p.z, size * .34, size * .36, size * .35, seed);
      add(ball, evergreen, p.x - size * .17, p.y + size * .70, p.z + size * .13, size * .24, size * .26, size * .24, seed + .8);
      add(ball, leaf, p.x + size * .17, p.y + size * .68, p.z - size * .11, size * .23, size * .26, size * .25, seed + 1.4);
    }
  }
  function building(p: Point, yaw: number, w: number, h: number, d: number, index: number, victorian = false, shopName?: string) {
    const palette = victorian ? ['#c8d9c3', '#d5b3a5', '#dbc79f', '#b6cbce', '#cdb9ce', '#f0dac0'] : ['#cbc8b5', '#bac6bd', '#d5bda7', '#c4d0c6'];
    const wall = material(palette[index % palette.length]);
    const local = (x: number, y: number, z: number): Point => ({ x: p.x + x * Math.cos(yaw) + z * Math.sin(yaw), y: p.y + y, z: p.z - x * Math.sin(yaw) + z * Math.cos(yaw) });
    const part = (m: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number) => {
      const q = local(x, y, z); box(m, q.x, q.y, q.z, width, height, depth, yaw);
    };
    part(wall, 0, h / 2, 0, w, h, d);
    part(cream, 0, h - .4, 0, w + .5, .5, d + .45);
    part(dark, 0, h + .04, 0, w + .2, .35, d + .2);
    part(cream, 0, 3.2, d / 2 + .13, w + .25, .38, .5);
    const cols = Math.max(2, Math.round(w / 3.2));
    for (let y = 5; y < h - 1.5; y += 3.3) {
      for (let col = 0; col < cols; col++) {
        const x = (col + .5) * w / cols - w / 2;
        const bay = victorian && col === Math.floor(cols / 2) ? .9 : 0;
        if (bay) part(wall, x, y, d / 2 + bay / 2, 2.6, 3.3, bay);
        part(cream, x, y, d / 2 + bay + .04, 2.15, 2.30, .12);
        part(glass, x, y, d / 2 + bay + .12, 1.84, 2.05, .09);
        part(cream, x, y, d / 2 + bay + .18, .09, 2.05, .10);
        part(cream, x, y - 1.15, d / 2 + bay + .24, 2.35, .18, .48);
      }
      // Visible returns retain windows at corners rather than bare boxes.
      for (const side of [-1, 1]) for (let z = -d / 2 + 2; z < d / 2 - 1; z += 4) part(glass, side * (w / 2 + .05), y, z, .09, 1.9, 1.7);
    }
    for (const side of [-1, 1]) part(glass, side * w * .25, 1.55, d / 2 + .07, w * .37, 2.55, .12);
    part(dark, 0, 1.35, d / 2 + .15, 1.15, 2.7, .2);
    if (victorian) {
      const pediment = new THREE.ConeGeometry(w * .50, 3.3, 4); pediment.rotateY(Math.PI / 4);
      add(pediment, wall, p.x, p.y + h + 1.55, p.z, 1, 1, .42, yaw); pediment.dispose();
      part(cream, 0, .3, d / 2 + 1, w * .45, .6, 2);
      for (const side of [-1, 1]) part(cream, side * w * .46, h / 2, d / 2 + .12, .28, h, .32);
    }
    if (shopName) {
      part(accent, 0, 3.4, d / 2 + 1, w + .35, .28, 2.1);
      label(shopName, local(0, 4, d / 2 + .22), w * .90, .85, yaw, course.accent);
      if (/mollusk/i.test(shopName)) {
        for (let i = 0; i < 3; i++) {
          const q = local(w * .38 + i * .65, 1.7, d / 2 + .45);
          add(ball, i % 2 ? cream : accent, q.x, q.y, q.z, .29, 1.7, .11, yaw);
        }
      }
      if (/cafe|réveille|reveille|fish/i.test(shopName)) {
        for (const side of [-1, 1]) {
          const q = local(side * w * .34, 0, d / 2 + 3.5);
          pole(dark, q.x, q.y + .44, q.z, .07, .88); pole(cream, q.x, q.y + .9, q.z, .75, .1);
          pole(dark, q.x, q.y + 1.7, q.z, .05, 3.4);
          add(cone, accent, q.x, q.y + 3.4, q.z, 2.2, .55, 2.2);
          for (const seat of [-1, 1]) box(stone, q.x + seat * 1.1, q.y + .52, q.z, .65, .12, .65);
        }
      }
    }
  }

  // Repeated elements are merged in spatial cells so distant blocks are culled.
  // Checking every leg of the path protects the insides of the South Park and
  // Alamo Square laps from a building belonging to the neighbouring street.
  let sceneryIndex = 0;
  const urban = course.theme === 'city' || course.theme === 'victorian';
  for (let s = 22; s < length - 12; s += urban ? 25 : 21) {
    if (s > bridgeStart - 15 && s < bridgeEnd + 15) continue;
    const yaw = route.routeYaw(s);
    for (const side of [-1, 1]) {
      const seed = sceneryIndex++;
      const p = route.routePoint(s, side * (urban ? 25 : 20 + seed % 3 * 7));
      const landmarkClose = course.landmarks.some(l => Math.abs(l.at * length - s) < 35 && l.side === side);
      if (urban && !landmarkClose && clearOfRoad(p.x, p.z, 13)) {
        building(p, yaw - side * Math.PI / 2, 18 + seed % 3, course.theme === 'victorian' ? 10 + seed % 3 * 3.3 : 15 + seed % 5 * 7, 18, seed, course.theme === 'victorian');
      } else if (!landmarkClose && clearOfRoad(p.x, p.z, 4)) tree(p, urban ? 7.5 : 11 + seed % 5, course.theme === 'presidio' || course.theme === 'bridge', seed);
      if (!urban && seed % 2 === 0) {
        const far = route.routePoint(s, side * (45 + seed % 4 * 8));
        if (clearOfRoad(far.x, far.z, 6)) tree(far, 13 + seed % 6, course.theme !== 'park', seed * .8);
      }
    }
  }
  // Street lamps, benches and occasional junction stripes establish car scale.
  for (let s = 24, i = 0; s < length; s += 49, i++) {
    if (s > bridgeStart && s < bridgeEnd) continue;
    for (const side of [-1, 1]) {
      const p = route.routePoint(s, side * 10.4);
      pole(dark, p.x, p.y + 3.5, p.z, .075, 7);
      add(ball, cream, p.x, p.y + 7.12, p.z, .28, .37, .28);
      if (i % 3 === 0 && !urban) {
        const b = route.routePoint(s + 5, side * 10.2);
        box(bark, b.x, b.y + .65, b.z, 1, .15, 2.5, route.routeYaw(s));
        box(bark, b.x + Math.cos(route.routeYaw(s)) * side * .4, b.y + 1.12, b.z - Math.sin(route.routeYaw(s)) * side * .4, .1, .8, 2.5, route.routeYaw(s));
      }
    }
    if (urban && i % 3 === 1) for (let x = -6; x <= 6; x += 1.5) roadBox(cream, s, x, .65, .02, 3);
  }

  function landmarkPosition(at: number, side: number, radius: number) {
    let p = route.routePoint(at * length, side * (roadWidth + radius + 9));
    for (let offset = roadWidth + radius + 9; offset <= 100; offset += 9) {
      p = route.routePoint(at * length, side * offset);
      if (clearOfRoad(p.x, p.z, radius)) break;
    }
    return p;
  }
  function park(p: Point, radius: number, name: string, yaw: number) {
    pole(grass, p.x, p.y + .1, p.z, radius, .25);
    pole(stone, p.x, p.y + .25, p.z, 4, .15);
    pole(cream, p.x, p.y + 1.3, p.z, 1.4, 2.2);
    add(ball, glass, p.x, p.y + 2.5, p.z, 1.7, .25, 1.7);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const q = { x: p.x + Math.cos(angle) * radius * .73, y: p.y, z: p.z + Math.sin(angle) * radius * .73 };
      if (clearOfRoad(q.x, q.z, 3)) tree(q, 8 + i % 3, false, angle);
    }
    const front = { x: p.x + Math.sin(yaw) * (radius - 1), y: p.y + 2.2, z: p.z + Math.cos(yaw) * (radius - 1) };
    label(name, front, Math.min(12, radius * .9), 1.25, yaw);
    for (const side of [-1, 1]) pole(dark, front.x + Math.cos(yaw) * side * 5.1, p.y + 1.35, front.z - Math.sin(yaw) * side * 5.1, .09, 2.7);
  }
  function tower(p: Point, name: string) {
    if (/young/i.test(name)) {
      const copper = material('#967750', .71, .16);
      box(copper, p.x, p.y + 6, p.z, 40, 12, 28);
      for (let floor = 0; floor < 13; floor++) {
        const yaw = floor * .035;
        box(copper, p.x, p.y + 13 + floor * 2.4, p.z, 12 + floor * .42, 2.15, 14 + floor * .18, yaw);
        box(glass, p.x, p.y + 13.9 + floor * 2.4, p.z, 12.1 + floor * .42, .45, 14.1 + floor * .18, yaw);
      }
      return;
    }
    const blue = material('#8cafb5', .3, .25), silver = material('#d7e0d5', .45, .3);
    for (let floor = 0; floor < 43; floor++) {
      const radius = 17 * (1 - .26 * (floor / 43) ** 2);
      pole(blue, p.x, p.y + floor * 3.5 + 1.6, p.z, radius, 3.3);
      pole(silver, p.x, p.y + floor * 3.5 + 3.3, p.z, radius + .1, .16);
    }
    add(ball, silver, p.x, p.y + 151, p.z, 12.6, 7, 12.6);
    for (let i = 0; i < 18; i++) {
      const angle = i * Math.PI / 9;
      beam(silver, { x: p.x + Math.sin(angle) * 17, y: p.y, z: p.z + Math.cos(angle) * 17 },
        { x: p.x + Math.sin(angle) * 12.6, y: p.y + 149, z: p.z + Math.cos(angle) * 12.6 }, .12);
    }
  }
  function windmill(p: Point, yaw: number) {
    const wall = material('#ddd0ac');
    const body = new THREE.CylinderGeometry(3.1, 5.3, 14, 10);
    add(body, wall, p.x, p.y + 7, p.z, 1, 1, 1); body.dispose();
    add(cone, dark, p.x, p.y + 15.5, p.z, 4.4, 5, 4.4);
    const rotor = new THREE.Group(); rotor.position.set(p.x + Math.sin(yaw) * 4.1, p.y + 12, p.z + Math.cos(yaw) * 4.1); rotor.rotation.y = yaw;
    const blades = new THREE.Group(); rotor.add(blades); group.add(rotor); animatedRotors.push(blades);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Group(); blade.rotation.z = i * Math.PI / 2;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(.24, 10, .24), bark); spar.position.y = 5; blade.add(spar);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.75, 6.5, .11), cream); sail.position.set(.83, 6.2, .08); blade.add(sail);
      for (let j = 0; j < 7; j++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(1.95, .11, .18), bark); rib.position.set(.82, 3.1 + j, .17); blade.add(rib);
      }
      blades.add(blade);
    }
  }
  for (const [index, landmark] of course.landmarks.entries()) {
    if (landmark.kind === 'bridge') continue;
    const yaw = route.routeYaw(landmark.at * length) - landmark.side * Math.PI / 2;
    const radius = landmark.kind === 'tower' ? 20 : landmark.kind === 'park' ? 22 : landmark.kind === 'cliff' ? 17 : 13;
    const p = landmarkPosition(landmark.at, landmark.side, radius);
    if (landmark.kind === 'tower') tower(p, landmark.name);
    else if (landmark.kind === 'park') {
      park(p, radius, landmark.name, yaw);
      if (/conservatory/i.test(landmark.name)) {
        // White ribs and translucent-looking blue glazing identify the park's
        // glasshouse without borrowing the downtown tower silhouette.
        box(cream, p.x, p.y + 2.2, p.z, 34, 4.4, 12, yaw);
        box(glass, p.x, p.y + 4.6, p.z, 32, 2.8, 10.5, yaw);
        add(ball, cream, p.x, p.y + 8.8, p.z, 5.5, 5.5, 5.5);
        pole(cream, p.x, p.y + 14.5, p.z, .18, 3.5);
        for (let rib = -7; rib <= 7; rib++) {
          const q = { x: p.x + Math.cos(yaw) * rib * 2.1, y: p.y + 5, z: p.z - Math.sin(yaw) * rib * 2.1 };
          box(cream, q.x, q.y, q.z, .2, 5.5, 11, yaw);
        }
      }
    }
    else if (landmark.kind === 'windmill') windmill(p, yaw);
    else if (landmark.kind === 'cafe' || landmark.kind === 'shop') building(p, yaw, 21, 8, 17, index, false, landmark.name);
    else if (landmark.kind === 'houses') {
      // A compact Painted Ladies row has different pastel colours and bay roofs.
      for (let i = -2; i <= 2; i++) {
        const q = { x: p.x + Math.cos(yaw) * i * 10.2, y: p.y, z: p.z - Math.sin(yaw) * i * 10.2 };
        if (clearOfRoad(q.x, q.z, 10)) building(q, yaw, 9.7, 12 + Math.abs(i) * .7, 14, i + 2, true);
      }
    } else if (landmark.kind === 'bunker') {
      box(stone, p.x, p.y + 2.6, p.z, 21, 5.2, 15, yaw);
      box(grass, p.x, p.y + 5.3, p.z, 22, .8, 16, yaw);
      const face = { x: p.x + Math.sin(yaw) * 7.6, y: p.y + 2.4, z: p.z + Math.cos(yaw) * 7.6 };
      box(dark, face.x, face.y, face.z, 14, 1.1, .16, yaw);
      label(landmark.name, { ...face, y: p.y + 4.1 }, 14, .8, yaw);
    } else if (landmark.kind === 'cliff') {
      for (let i = 0; i < 5; i++) add(ball, material(i % 2 ? '#a7a08b' : '#898f81'), p.x + Math.cos(yaw) * (i - 2) * 9,
        p.y - 6 + i % 2 * 3, p.z - Math.sin(yaw) * (i - 2) * 9, 12, 16 + i % 3 * 4, 12, i);
    } else if (landmark.kind === 'view') {
      if (/legion/i.test(landmark.name)) {
        box(cream, p.x, p.y + 1, p.z, 39, 2, 23, yaw);
        box(cream, p.x, p.y + 5, p.z, 35, 7, 13, yaw);
        for (let column = -5; column <= 5; column++) {
          const x = p.x + Math.cos(yaw) * column * 3 + Math.sin(yaw) * 10;
          const z = p.z - Math.sin(yaw) * column * 3 + Math.cos(yaw) * 10;
          pole(cream, x, p.y + 6, z, .5, 8);
          pole(stone, x, p.y + 9.7, z, .78, .65);
        }
        box(cream, p.x, p.y + 10.1, p.z, 38, 1.5, 23, yaw);
      } else if (/sutro/i.test(landmark.name)) {
        const pool = material('#81aaa3', .26, .15);
        for (let row = 0; row < 3; row++) {
          const q = { x: p.x + Math.cos(yaw) * (row - 1) * 9, y: p.y, z: p.z - Math.sin(yaw) * (row - 1) * 9 };
          box(stone, q.x, q.y + .3, q.z, 8.5, .6, 29, yaw);
          box(pool, q.x, q.y + .62, q.z, 7, .04, 27, yaw);
          for (const side of [-1, 1]) box(stone, q.x + Math.sin(yaw) * side * 14, q.y + 1.1, q.z + Math.cos(yaw) * side * 14, 8, 1.6, 1, yaw);
        }
      } else {
        pole(stone, p.x, p.y + .3, p.z, 12, .7);
        pole(dark, p.x, p.y + 1.1, p.z, .15, 1.8);
        const telescope = new THREE.CylinderGeometry(.3, .38, 1.5, 12); telescope.rotateX(Math.PI / 2);
        add(telescope, dark, p.x, p.y + 2.1, p.z, 1, 1, 1, yaw); telescope.dispose();
      }
    }
    if (!['park', 'cafe', 'shop', 'bunker'].includes(landmark.kind)) {
      const q = route.routePoint(landmark.at * length - 4, landmark.side * 10.7);
      pole(dark, q.x, q.y + 2.2, q.z, .075, 4.4);
      label(landmark.name, { ...q, y: q.y + 3.8 }, 8.3, .85, route.routeYaw(landmark.at * length) + Math.PI);
    }
  }

  if (course.theme === 'presidio') {
    for (let s = length * .32, i = 0; s < length * .60; s += 75, i++) {
      const p = landmarkPosition(s / length, -1, 21), yaw = route.routeYaw(s) + Math.PI / 2;
      building(p, yaw, 36, 9, 18, i, false);
      const roof = new THREE.ConeGeometry(22, 5, 4); roof.rotateY(Math.PI / 4);
      add(roof, material('#b36749'), p.x, p.y + 11, p.z, 1, 1, .55, yaw); roof.dispose();
    }
  }

  if (course.theme === 'bridge') {
    const start = bridgeStart, end = bridgeEnd, span = end - start;
    // Two portal towers and a continuous pair of sagging main cables read from
    // the driver's seat, from the map flyover and through the fog challenge.
    const towerDistances = [station(/south tower/i, start + span * .25), station(/north tower/i, start + span * .75)];
    ribbon(-11.8, 11.8, -1.2, orange, 'Golden Gate structural deck', start, end);
    for (let s = start; s <= end; s += 10) {
      for (const side of [-1, 1]) {
        const p = route.routePoint(s, side * 9.5);
        pole(orange, p.x, p.y + 1, p.z, .10, 2);
        const q = route.routePoint(Math.min(s + 10, end), side * 9.5);
        beam(orange, { ...p, y: p.y + 1.8 }, { ...q, y: q.y + 1.8 }, .11);
      }
    }
    for (const s of towerDistances) {
      const yaw = route.routeYaw(s), center = route.sampleRoute(s);
      for (const side of [-1, 1]) {
        const p = route.routePoint(s, side * 11.3);
        box(orange, p.x, p.y + 33, p.z, 3, 74, 5.7, yaw);
        box(stone, p.x, p.y - 5, p.z, 7, 8, 9, yaw);
        for (let y = 12; y < 69; y += 11) box(orange, p.x, p.y + y, p.z, 3.8, .8, 6.2, yaw);
      }
      for (const y of [14, 38, 65]) box(orange, center.x, center.y + y, center.z, 25, 2.5, 4.2, yaw);
      box(orange, center.x, center.y + 70, center.z, 26, 1.3, 5.5, yaw);
    }
    const anchors = [start, ...towerDistances, end];
    for (let segment = 0; segment < anchors.length - 1; segment++) {
      const a = anchors[segment], b = anchors[segment + 1];
      const heightA = segment === 0 ? 5 : 70, heightB = segment === 2 ? 5 : 70;
      const cableHeight = (t: number) => heightA + (heightB - heightA) * t - (segment === 1 ? 44 : 12) * 4 * t * (1 - t);
      const steps = Math.ceil((b - a) / 12);
      for (const side of [-1, 1]) for (let i = 0; i < steps; i++) {
        const u = i / steps, v = (i + 1) / steps;
        const p = route.routePoint(a + (b - a) * u, side * 11.3), q = route.routePoint(a + (b - a) * v, side * 11.3);
        beam(orange, { ...p, y: p.y + cableHeight(u) }, { ...q, y: q.y + cableHeight(v) }, .32);
        beam(orange, { ...p, y: p.y + 1 }, { ...p, y: p.y + cableHeight(u) }, .085);
      }
    }
    if (fogRange) {
      const fogMaterial = new THREE.MeshBasicMaterial({ color: '#dbe5e0', transparent: true, opacity: .10, depthWrite: false });
      for (let i = 0; i < 13; i++) {
        const p = route.sampleRoute(fogRange.start + (fogRange.end - fogRange.start) * i / 12);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), fogMaterial);
        mesh.scale.set(33 + i % 3 * 14, 4.5 + i % 4, 17 + i % 4 * 6); mesh.renderOrder = 3;
        mesh.position.set(p.x, p.y + 3 + i % 4 * 3, p.z); group.add(mesh);
        clouds.push({ mesh, origin: { x: p.x, y: mesh.position.y, z: p.z }, phase: i * 1.9 });
      }
    }
  }

  if (['coast', 'park', 'bridge', 'presidio'].includes(course.theme)) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), material('#719da3', .35, .18));
    water.rotation.x = -Math.PI / 2; water.position.set((bounds.min.x + bounds.max.x) / 2 - 1200, -8, (bounds.min.z + bounds.max.z) / 2);
    water.name = 'Pacific and bay water'; group.add(water);
    if (course.theme === 'park') {
      // The coastal finish opens onto sand and the ocean, after the surf shops.
      const p = route.sampleRoute(length), yaw = route.routeYaw(length);
      box(material('#d7c79f'), p.x, p.y - 1, p.z, 160, 1.5, 120, yaw);
    }
    const foam = material('#c6dad5');
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, .03, 380), foam);
      mesh.position.set(bounds.min.x - 95 - i * 24, -7.93, (bounds.min.z + bounds.max.z) / 2 + (i % 3 - 1) * 100);
      mesh.rotation.y = .025; mesh.userData.waveX = mesh.position.x; group.add(mesh); oceanLines.push(mesh);
    }
  }

  const checkpointDistances = [...route.CHECKPOINTS];
  if (!checkpointDistances.some(s => Math.abs(s - length) < 1)) checkpointDistances.push(length);
  for (const [index, s] of checkpointDistances.entries()) {
    const finish = Math.abs(s - length) < 1, p = route.sampleRoute(s), yaw = route.routeYaw(s);
    for (const side of [-1, 1]) {
      const q = route.routePoint(s, side * 9);
      pole(dark, q.x, q.y + 3.7, q.z, .11, 7.4);
      box(accent, q.x, q.y + 4.8, q.z, .4, 3.5, .4, yaw);
    }
    box(dark, p.x, p.y + 7.25, p.z, 18.5, .9, .28, yaw);
    const face = route.sampleRoute(s - .18);
    label(finish ? `${course.name} / FINISH` : `${String(index + 1).padStart(2, '0')} / CHECKPOINT`, { ...face, y: p.y + 7.25 }, 17.5, .7, yaw + Math.PI);
    for (let row = 0; row < (finish ? 4 : 1); row++) for (let column = 0; column < 20; column++) {
      roadBox((row + column) % 2 ? dark : cream, s + row * .65, -roadWidth + (column + .5) * roadWidth / 10, roadWidth / 10, .02, .65, .23);
    }
  }

  for (const [key, batch] of batches) {
    const geometry = mergeGeometries(batch.geometries, false);
    batch.geometries.forEach(piece => piece.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, batch.mat); mesh.name = `Course scenery / ${key.split('/')[0]}`;
    mesh.castShadow = batch.mat !== grass && batch.mat !== stone; mesh.receiveShadow = true; group.add(mesh);
  }
  batches.clear(); templates.forEach(geometry => geometry.dispose());
  let disposed = false;
  return {
    group,
    update(time: number, progress: number) {
      for (const rotor of animatedRotors) rotor.rotation.z = time * .14;
      for (const cloud of clouds) {
        cloud.mesh.visible = !fogRange || progress > fogRange.start - 200 && progress < fogRange.end + 200;
        cloud.mesh.position.x = cloud.origin.x + Math.sin(time * .055 + cloud.phase) * 28;
        cloud.mesh.position.z = cloud.origin.z + Math.cos(time * .035 + cloud.phase) * 8;
      }
      for (let i = 0; i < oceanLines.length; i++) oceanLines[i].position.x = oceanLines[i].userData.waveX + Math.sin(time * .18 + i * .8) * 5;
    },
    dispose() {
      if (disposed) return; disposed = true;
      const geometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          ownedMaterials.add(mat);
          for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      for (const mat of materials.values()) ownedMaterials.add(mat);
      textures.forEach(texture => texture.dispose()); geometries.forEach(geometry => geometry.dispose()); ownedMaterials.forEach(mat => mat.dispose());
      group.removeFromParent(); group.clear();
    },
  };
}

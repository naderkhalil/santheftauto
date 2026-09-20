import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleRoute } from './route';

// Original architectural interpretations. Dimensions and terrain are composed for
// a closed Powell Street race course, rather than a survey of the real buildings.
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
type Instance = { matrix: THREE.Matrix4; color?: THREE.Color };
type Batch = { name: string; geometry: THREE.BufferGeometry; material: THREE.Material; instances: Instance[]; shadow: boolean };

function randomSource(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function texture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d')!);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
}

function lettering(text: string, sub = '', background = '#172722', foreground = '#d7c69f') {
  return texture(1024, 256, ctx => {
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = foreground; ctx.lineWidth = 2; ctx.strokeRect(14, 14, 996, 228);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = foreground;
    ctx.font = '52px Georgia'; ctx.fillText(text, 512, sub ? 101 : 130, 960);
    if (sub) { ctx.font = '19px Georgia'; ctx.fillText(sub, 512, 174, 960); }
  });
}

function archedShape(inset = 0) {
  const shape = new THREE.Shape(), r = .5 - inset;
  shape.moveTo(-r, inset); shape.lineTo(r, inset); shape.lineTo(r, .55);
  shape.absarc(0, .55, r, 0, Math.PI, false); shape.lineTo(-r, inset);
  return shape;
}

function taperedCurve(curve: THREE.Curve<THREE.Vector3>, bottom: number, top: number, segments = 20, sides = 9) {
  const frames = curve.computeFrenetFrames(segments, false), positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = curve.getPoint(t), radius = THREE.MathUtils.lerp(bottom, top, t);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius);
      positions.push(p.x + n.x, p.y + n.y, p.z + n.z);
      if (i < segments && j < sides) {
        const s = i * (sides + 1) + j;
        indices.push(s, s + sides + 1, s + 1, s + 1, s + sides + 1, s + sides + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

export function createLandmarks(scene: THREE.Scene) {
  const group = new THREE.Group(); group.name = 'San Francisco · Union Square and historic Powell landmarks'; scene.add(group);
  const random = randomSource(2087), batches = new Map<string, Batch>();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphereGeo = new THREE.SphereGeometry(1, 12, 8), planeGeo = new THREE.PlaneGeometry(1, 1);
  const archGlassGeo = new THREE.ShapeGeometry(archedShape(.05), 16);
  const arch = archedShape(); arch.holes.push(new THREE.Path(archedShape(.075).getPoints(20)));
  const archTrimGeo = new THREE.ExtrudeGeometry(arch, { depth: .075, bevelEnabled: false, curveSegments: 18 });
  const standard = (color: THREE.ColorRepresentation, roughness = .78, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const stoneGrain = texture(256, 256, ctx => {
    ctx.fillStyle = '#eeeeea'; ctx.fillRect(0, 0, 256, 256); const grain = randomSource(775);
    for (let i = 0; i < 19000; i++) {
      ctx.fillStyle = `rgba(104,99,87,${.025 + grain() * .075})`;
      ctx.fillRect(grain() * 256, grain() * 256, 1 + grain(), 1 + grain());
    }
  });
  stoneGrain.wrapS = stoneGrain.wrapT = THREE.RepeatWrapping; stoneGrain.repeat.set(3, 8);
  const stone = (color: THREE.ColorRepresentation) => { const mat = standard(color); mat.map = stoneGrain; return mat; };
  const mats = {
    westin: stone('#ffbf65'), westinShadow: stone('#d98b46'), limestone: stone('#fff0c7'),
    terracotta: stone('#f68583'), flood: stone('#e79560'), floodLight: stone('#ffe0a1'),
    glass: standard('#8ab4bb', .18, .37), frame: standard('#505f61', .49, .34), bronze: standard('#426553', .4, .6),
    darkStone: stone('#739fc6'), granite: stone('#c4d8dd'), whiteGranite: stone('#fff1d4'),
    warm: new THREE.MeshStandardMaterial({ color: '#d9bb80', emissive: '#ffd58f', emissiveIntensity: .12, roughness: .42 }),
    paleGlass: standard('#91c3ce', .21, .4), black: standard('#233038'), green: standard('#216f58'),
    hedge: standard('#3b793e'), leaf: new THREE.MeshStandardMaterial({ color: '#7ca344', roughness: .80, side: THREE.DoubleSide, emissive: '#3c5a24', emissiveIntensity: .06 }),
    leafDark: new THREE.MeshStandardMaterial({ color: '#47783b', roughness: .87, side: THREE.DoubleSide, emissive: '#2d4928', emissiveIntensity: .04 }),
    bark: standard('#987957'), soil: standard('#615240'), metal: standard('#365d51', .49, .46),
    awning: standard('#009b8d'), gold: standard('#d8b576', .35, .65),
    light: new THREE.MeshBasicMaterial({ color: '#f8d8aa', toneMapped: false }),
  };
  // Sky and opposite-façade reflections keep the landmark windows blue and
  // dimensional in daylight instead of reading as a repeated black grid.
  mats.glass.map = texture(128, 256, ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#b2d9e3'); gradient.addColorStop(.40, '#719cad');
    gradient.addColorStop(.75, '#376c84'); gradient.addColorStop(1, '#85aeb2');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = 'rgba(221,206,163,.13)'; ctx.beginPath(); ctx.moveTo(14, 84); ctx.lineTo(49, 71); ctx.lineTo(69, 256); ctx.lineTo(28, 256); ctx.fill();
    ctx.fillStyle = 'rgba(242,241,218,.17)'; ctx.fillRect(104, 0, 3, 256);
    ctx.fillStyle = 'rgba(34,83,106,.11)'; ctx.fillRect(0, 171, 128, 12);
  });
  mats.glass.envMapIntensity = .65;
  const masonryNormal = new THREE.TextureLoader().load('/assets/plaster-normal.jpg');
  masonryNormal.wrapS = masonryNormal.wrapT = THREE.RepeatWrapping;
  masonryNormal.repeat.set(3, 8); masonryNormal.anisotropy = 4;
  for (const material of [mats.westin, mats.westinShadow, mats.terracotta, mats.flood, mats.floodLight]) {
    material.normalMap = masonryNormal; material.normalScale.set(.10, .10);
  }
  function instance(key: string, material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation?: THREE.Euler | THREE.Quaternion, shadow = false, color?: THREE.Color) {
    // Different architectural roles can share one GPU draw when their geometry,
    // material and shadow policy agree (sills, lintels and pilasters, for example).
    shadow ||= /cornice|pilaster|sill|lintel|hood|marquee|awning|arch-frame|planter-base|clipped-hedge|parapet|capital|pedestal|bench|silver-roof|olive-crown|umbrella/.test(key);
    const batchKey = `${geometry.uuid}:${material.uuid}:${shadow}`;
    let batch = batches.get(batchKey);
    if (!batch) { batch = { name: key, geometry, material, instances: [], shadow }; batches.set(batchKey, batch); }
    const q = rotation instanceof THREE.Quaternion ? rotation : new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler());
    batch.instances.push({ matrix: new THREE.Matrix4().compose(V(x, y, z), q, V(sx, sy, sz)), color });
  }
  const box = (key: string, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rotation?: THREE.Euler, shadow = false) => instance(key, mat, boxGeo, x, y, z, w, h, d, rotation, shadow);
  const cylinder = (key: string, mat: THREE.Material, x: number, y: number, z: number, r: number, h: number) => instance(key, mat, cylinderGeo, x, y, z, r, h, r);
  const sphere = (key: string, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => instance(key, mat, sphereGeo, x, y, z, sx, sy, sz);
  function segment(key: string, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const delta = b.clone().sub(a), midpoint = a.clone().add(b).multiplyScalar(.5);
    instance(key, mat, cylinderGeo, midpoint.x, midpoint.y, midpoint.z, radius, delta.length(), radius, new THREE.Quaternion().setFromUnitVectors(Y, delta.normalize()));
  }
  function textPlane(name: string, map: THREE.Texture, x: number, y: number, z: number, w: number, h: number, yaw: number) {
    const material = new THREE.MeshStandardMaterial({ map, roughness: .64, emissiveMap: map, emissive: '#f2ca94', emissiveIntensity: .16, side: THREE.DoubleSide });
    instance(name, material, planeGeo, x, y, z, w, h, 1, new THREE.Euler(0, yaw, 0));
  }
  const details = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function custom(geometry: THREE.BufferGeometry, mat: THREE.Material, position?: THREE.Vector3) {
    if (position) geometry.translate(position.x, position.y, position.z);
    geometry.deleteAttribute('uv');
    if (geometry.index) geometry = geometry.toNonIndexed();
    let list = details.get(mat); if (!list) { list = []; details.set(mat, list); } list.push(geometry);
  }

  // One correctly scaled window is repeated, with actual trim depth and individual
  // panes. Architectural fenestration stays crisp from the chase camera.
  function windowBay(key: string, x: number, y: number, z: number, normal: number, width = 1.65, height = 2.55, ornate = false, frameMat: THREE.Material = mats.limestone) {
    const lit = random() < .19, front = x + normal * .17;
    box('window-dark-recess', mats.frame, x + normal * .015, y, z, .13, height + .27, width + .25);
    box(lit ? 'window-warm-pane' : 'window-reflecting-pane', lit ? mats.warm : mats.glass, front, y, z, .055, height, width);
    for (const s of [-1, 1]) box(`${key}-jamb`, frameMat, x + normal * .24, y, z + s * (width / 2 + .11), .24, height + .34, .19);
    box(`${key}-lintel`, frameMat, x + normal * .27, y + height / 2 + .13, z, .32, .22, width + .58);
    box(`${key}-sill`, frameMat, x + normal * .35, y - height / 2 - .13, z, .51, .2, width + .62);
    box('window-mullion', mats.frame, x + normal * .21, y, z, .075, height, .075);
    box('window-transom', mats.frame, x + normal * .22, y + height * .12, z, .075, .065, width);
    if (lit && random() > .45) box('window-curtain', mats.limestone, front + normal * .04, y, z + width * .29, .015, height - .09, width * .25);
    if (ornate) {
      box(`${key}-hood`, frameMat, x + normal * .34, y + height / 2 + .39, z, .54, .14, width + .85);
      for (const s of [-1, 1]) box(`${key}-corbel`, frameMat, x + normal * .29, y - height / 2 - .35, z + s * width * .36, .27, .3, .17);
    }
  }
  function archDoor(key: string, x: number, y: number, z: number, width: number, height: number, normal: number, mat = mats.limestone) {
    const q = new THREE.Euler(0, normal * Math.PI / 2, 0);
    instance('arched-dark-glass', mats.glass, archGlassGeo, x + normal * .04, y, z, width, height / 1.05, 1, q);
    instance(`${key}-arch-frame`, mat, archTrimGeo, x + normal * .19, y, z, width + .3, height / 1.05, 3.5, q);
    box('arched-shop-door', mats.warm, x + normal * .11, y + height * .31, z, .025, height * .57, width * .70);
    for (const s of [-1, 0, 1]) box('arched-shop-mullion', mats.frame, x + normal * .15, y + height * .34, z + s * width * .28, .05, height * .61, .075);
    box('arched-shop-mullion', mats.frame, x + normal * .16, y + height * .6, z, .045, .07, width * .78);
    box('arched-door-kickplate', mats.bronze, x + normal * .17, y + .3, z, .06, .5, width * .74);
  }

  // THE WESTIN ST. FRANCIS — the historic three-wing hotel facing Union Square.
  // The deeper modern slabs sit behind it to the west, where they belong.
  const wx = -15.2, wz = 815, wy = Math.min(sampleRoute(745).y, sampleRoute(885).y) - .5, wh = 48.5;
  box('westin-mass', mats.westin, wx - 24, wy + wh / 2, wz, 48, wh, 185, undefined, true);
  for (const wingZ of [745, 815, 885]) {
    box('westin-mass', mats.westin, wx - 9.5, wy + wh / 2, wingZ, 22, wh, 43, undefined, true);
    const front = wx + 1.5;
    // Pale stone base, articulated with alternating courses of rusticated masonry.
    box('westin-base', mats.limestone, front - .35, wy + 6.3, wingZ, .9, 12.6, 43);
    for (let row = .35; row < 12.7; row += .66) {
      box('westin-base-course', mats.westinShadow, front + .12, wy + row, wingZ, .05, .035, 43);
      for (let zz = -20 + (Math.floor(row / .66) % 2) * 1.1; zz < 21; zz += 2.2) box('westin-base-joint', mats.westinShadow, front + .14, wy + row + .3, wingZ + zz, .05, .56, .023);
    }
    for (let z = wingZ - 18; z <= wingZ + 18; z += 4.5) {
      archDoor('westin', front + .15, sampleRoute(z).y + .28, z, 3.25, 4.30, 1);
      windowBay('westin', front + .15, wy + 9.1, z, 1, 2.0, 3.0, true);
      for (let floor = 0; floor < 9; floor++) windowBay('westin', front, wy + 15.1 + floor * 3.46, z, 1, 1.95, floor > 6 ? 2.15 : 2.45, floor === 0 || floor === 6);
    }
    for (const level of [12.4, 13.1, 36.1, 43.1, 46.5, 47.3, 48.0]) box('westin-cornice', mats.limestone, front + .23, wy + level, wingZ, level > 46 ? 1.8 : 1.0, level > 46 ? .32 : .23, 44.4);
    for (let z = wingZ - 20; z <= wingZ + 20; z += 1.25) box('westin-cornice-dentils', mats.limestone, front + .50, wy + 46.95, z, .45, .37, .38);
    for (const z of [wingZ - 20.5, wingZ + 20.5]) {
      box('westin-pilasters', mats.limestone, front + .15, wy + 29.5, z, .43, 32.8, .7);
      for (let yy = 14; yy < 44; yy += 3.45) box('westin-corner-block', mats.limestone, front + .24, wy + yy, z, .65, .82, 1.0);
    }
    box('westin-roof-edge', mats.westinShadow, wx - 9.5, wy + 48.8, wingZ, 23.4, .55, 44.2);
    box('westin-parapet', mats.limestone, front - .1, wy + 49.65, wingZ, .8, 1.6, 43.8);
  }
  // The two courtyards break the long façade and reveal its characteristic plan.
  for (const courtZ of [780, 850]) {
    for (let z = courtZ - 9; z < courtZ + 10; z += 4.2) {
      for (let floor = 0; floor < 11; floor++) windowBay('westin', wx, wy + 6.6 + floor * 3.62, z, 1, 1.7, 2.5, floor === 2);
    }
    for (const h of [12.5, 36.1, 46.7, 48.0]) box('westin-cornice', mats.limestone, wx + .28, wy + h, courtZ, 1.2, .28, 28);
  }
  // North-facing end: a complete windowed return greets the downhill approach.
  for (let xx = wx - 42; xx < wx - 1; xx += 4.2) {
    for (let floor = 0; floor < 11; floor++) {
      box('westin-return-recess', mats.frame, xx, wy + 7 + floor * 3.62, 722.45, 2.25, 2.6, .12);
      const lit = random() < .2;
      box(lit ? 'westin-return-lit' : 'westin-return-glass', lit ? mats.warm : mats.glass, xx, wy + 7 + floor * 3.62, 722.35, 1.86, 2.36, .10);
      for (const side of [-1, 1]) box('westin-return-trim', mats.limestone, xx + side * 1.08, wy + 7 + floor * 3.62, 722.25, .2, 2.7, .3);
      box('westin-return-trim', mats.limestone, xx, wy + 5.6 + floor * 3.62, 722.1, 2.5, .2, .5);
    }
  }
  for (const h of [12.5, 13.1, 36.1, 46.5, 47.3, 48]) box('westin-return-cornice', mats.limestone, wx - 23, wy + h, 722.0, 49.8, .26, 1.5);
  // Marquees, gilded letters, revolving-door entry and small brass lanterns.
  for (const entryZ of [745, 815, 885]) {
    const entryY = sampleRoute(entryZ).y;
    box('westin-marquee', mats.awning, wx + 3.05, entryY + 4.65, entryZ, 4.1, .18, 15.5, new THREE.Euler(0, 0, -.10));
    box('westin-marquee-valance', mats.awning, wx + 5.05, entryY + 4.42, entryZ, .16, .55, 15.5);
    textPlane(`westin-sign-${entryZ}`, lettering('THE WESTIN ST. FRANCIS', 'UNION SQUARE · SAN FRANCISCO'), wx + 5.15, entryY + 4.40, entryZ, 14.2, 1.22, Math.PI / 2);
    for (const offset of [-6.9, 6.9]) {
      cylinder('westin-canopy-poles', mats.bronze, wx + 4.65, entryY + 2.2, entryZ + offset, .09, 4.4);
      cylinder('westin-entrance-lamps', mats.gold, wx + 2.2, entryY + 3.5, entryZ + offset, .22, .75);
      sphere('westin-lantern-glow', mats.light, wx + 2.2, entryY + 3.55, entryZ + offset, .12, .29, .12);
    }
  }
  for (const [tx, tz, th, width, depth] of [[-72, 771, 108, 26, 55], [-99, 858, 115, 25, 67]]) {
    box('westin-tower-mass', mats.darkStone, tx, wy + th / 2, tz, width, th, depth, undefined, true);
    for (const side of [-1, 1]) {
      const front = tx + side * (width / 2 + .02);
      for (let z = tz - depth / 2 + 2; z < tz + depth / 2; z += 2.55) {
        box('westin-tower-vertical-glass', mats.glass, front, wy + th / 2 + .7, z, .06, th - 3, 1.61);
        box('westin-tower-vertical-fins', mats.granite, front + side * .16, wy + th / 2, z + 1.01, .39, th, .26);
      }
    }
    for (const end of [-1, 1]) for (let x = tx - width / 2 + 2; x < tx + width / 2; x += 2.55) {
      box('westin-tower-end-glass', mats.glass, x, wy + th / 2 + .7, tz + end * (depth / 2 + .025), 1.65, th - 3, .05);
      box('westin-tower-end-fins', mats.granite, x + 1.05, wy + th / 2, tz + end * (depth / 2 + .12), .27, th, .34);
    }
    for (let floor = 1; floor < th / 3.24; floor++) {
      box('westin-tower-spandrel', mats.darkStone, tx, wy + floor * 3.24, tz, width + .07, .51, depth + .07);
    }
    box('westin-tower-crown', mats.granite, tx, wy + th + .15, tz, width + .5, .6, depth + .5);
  }

  // UNION SQUARE — granite terraces open on the east side of Powell. The paving
  // follows the route terrain; no level slab can intrude into the race surface.
  function squareHeight(z: number) { return sampleRoute(z).y + .32; }
  const squarePositions: number[] = [], squareIndices: number[] = [], squareUvs: number[] = [];
  for (let i = 0; i <= 45; i++) {
    const z = 722 + i * 4.4;
    squarePositions.push(11.7, squareHeight(z), z, 116, squareHeight(z), z);
    squareUvs.push(11.7 / 8, z / 8, 116 / 8, z / 8);
    if (i < 45) { const j = i * 2; squareIndices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const squareGeometry = new THREE.BufferGeometry(); squareGeometry.setAttribute('position', new THREE.Float32BufferAttribute(squarePositions, 3));
  squareGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(squareUvs, 2)); squareGeometry.setIndex(squareIndices); squareGeometry.computeVertexNormals();
  // Put joints into one filtered surface. Separate near-coplanar seam boxes would
  // intersect this sloped plaza and sparkle like dark stripes while driving past.
  const pavingMap = texture(1024, 1024, ctx => {
    const grain = randomSource(907); ctx.fillStyle = '#96998f'; ctx.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const shade = Math.floor(162 + grain() * 12);
      ctx.fillStyle = `rgb(${shade + 2},${shade + 2},${shade - 7})`;
      ctx.fillRect(col * 256 + 1.5, row * 256 + 1.5, 253, 253);
      ctx.strokeStyle = 'rgba(228,222,202,.14)'; ctx.lineWidth = 1; ctx.strokeRect(col * 256 + 3, row * 256 + 3, 250, 250);
    }
    for (let i = 0; i < 75000; i++) {
      ctx.fillStyle = grain() > .6 ? 'rgba(225,222,204,.12)' : 'rgba(70,74,63,.10)';
      ctx.fillRect(grain() * 1024, grain() * 1024, 1 + grain() * 2, 1 + grain() * 2);
    }
  });
  pavingMap.wrapS = pavingMap.wrapT = THREE.RepeatWrapping; pavingMap.anisotropy = 8;
  const pavingNormal = masonryNormal.clone(); pavingNormal.repeat.set(4, 4);
  const squareMaterial = new THREE.MeshStandardMaterial({ color: '#d0cec1', map: pavingMap, roughness: .95, normalMap: pavingNormal, normalScale: new THREE.Vector2(.13, .13), envMapIntensity: .12 });
  const squareMesh = new THREE.Mesh(squareGeometry, squareMaterial); squareMesh.name = 'Union Square · continuous granite paving'; squareMesh.receiveShadow = true; group.add(squareMesh);
  // A strong, broad west entrance with real risers, access ramps and handrails.
  for (const stairZ of [757, 875]) {
    for (let i = 0; i < 7; i++) {
      const x = 12.1 + i * .75;
      box('square-stair-treads', mats.whiteGranite, x + .4, squareHeight(stairZ) + .085 + i * .15, stairZ, .82, .17, 20);
    }
    for (const zz of [-10.4, 10.4]) {
      segment('square-handrail', mats.metal, V(12.2, squareHeight(stairZ) + .95, stairZ + zz), V(18, squareHeight(stairZ) + 2.05, stairZ + zz), .032);
      for (let i = 0; i < 4; i++) segment('square-handrail', mats.metal, V(12.7 + i * 1.6, squareHeight(stairZ) + i * .25, stairZ + zz), V(12.7 + i * 1.6, squareHeight(stairZ) + .99 + i * .25, stairZ + zz), .033);
    }
  }
  // Raised garden rooms frame the central monument and its view from Powell.
  const newLeaf = standard('#83a743', .84), flowerMaterial = standard('#ffffff', .78);
  const flowerGeometry = new THREE.IcosahedronGeometry(1, 0);
  const bougainvilleaColors = [new THREE.Color('#d83983'), new THREE.Color('#ef668f'), new THREE.Color('#b92b6d')];
  const goldenColors = [new THREE.Color('#e6af2e'), new THREE.Color('#f2ca55'), new THREE.Color('#e89b28')];
  function flowerSpray(x: number, y: number, z: number, size: number, gold = false) {
    // Flowering branches sit on the edges of living foliage, rather than a
    // uniform ball of confetti. A few large patches read from the moving car.
    sphere('garden-new-leaf-cluster', newLeaf, x, y - .14, z, size, size * .52, size * .87);
    const colors = gold ? goldenColors : bougainvilleaColors;
    for (let i = 0; i < 15; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * size;
      instance('garden-flower-bracts', flowerMaterial, flowerGeometry, x + Math.cos(a) * r, y + Math.sqrt(Math.max(0, size * size - r * r)) * .35, z + Math.sin(a) * r * .82,
        .19 + random() * .15, .12 + random() * .10, .18 + random() * .12, new THREE.Euler(random(), random(), random()), false, colors[i % colors.length]);
    }
  }
  for (const [x, z, w, d] of [[29, 749, 22, 26], [30, 891, 22, 27], [95, 751, 26, 26], [98, 887, 30, 30], [101, 815, 25, 49]]) {
    const y = squareHeight(z);
    box('square-planter-base', mats.whiteGranite, x, y + .50, z, w, 1, d);
    box('square-planter-soil', mats.soil, x, y + 1.03, z, w - .65, .08, d - .65);
    for (const s of [-1, 1]) {
      box('square-planter-cap', mats.granite, x + s * (w / 2 - .12), y + 1.05, z, .65, .15, d + .15);
      box('square-planter-cap', mats.granite, x, y + 1.05, z + s * (d / 2 - .12), w + .15, .15, .65);
    }
    box('square-clipped-hedge', mats.hedge, x, y + 1.6, z, w - 2.7, 1.15, d - 2.7);
    // Low clipped shrubs have small overlapping irregular crowns, not giant spheres.
    for (let xx = -w / 2 + 2; xx < w / 2 - 1; xx += 2.3) {
      for (const zz of [-d / 2 + 2, d / 2 - 2]) sphere('square-hedge-crowns', mats.hedge, x + xx, y + 2.05, z + zz, 1.4, .34, 1.15);
    }
    // Fresh lime tips and a flowing ribbon of planting soften the rigid granite
    // rectangle. Keep the central monument approach and sight lines clear.
    for (let i = 0; i < 8; i++) {
      const xx = x - w / 2 + 2.0 + i * (w - 4) / 7, zz = z - d / 2 + 1.7 + Math.sin(i * .65) * .6;
      sphere('garden-new-leaf-cluster', newLeaf, xx, y + 2.07, zz, 1.12, .43, .93);
    }
    const westEdge = x - w / 2 + 1.1;
    for (let i = 0; i < 5; i++) flowerSpray(westEdge + .4 * Math.sin(i), y + 1.85, z - d * .28 + i * d * .14, .81, x > 70);
    flowerSpray(x + w * .26, y + 2.01, z - d * .35, 1.45, x < 70);
  }
  // Low ceramic pots mark the café terrace with bougainvillea spilling down the
  // sides, a restrained magenta accent against the golden stone and palms.
  const ceramic = standard('#b96849', .83);
  const potGeometry = new THREE.CylinderGeometry(.79, .54, 1.10, 16);
  for (const [x, z] of [[40, 774], [40, 844], [85, 779], [84, 865]]) {
    const y = squareHeight(z);
    instance('cafe-terracotta-flower-pot', ceramic, potGeometry, x, y + .55, z, 1, 1, 1, undefined, true);
    cylinder('flower-pot-rim', ceramic, x, y + 1.12, z, .84, .16);
    cylinder('flower-pot-soil', mats.soil, x, y + 1.19, z, .70, .04);
    sphere('bougainvillea-foliage', mats.hedge, x, y + 1.55, z, .97, .70, .89);
    flowerSpray(x, y + 1.95, z, 1.10);
    flowerSpray(x - .73, y + 1.3, z + .15, .57);
  }
  // Curved tapering trunks and hundreds of narrow pinnate leaflets give date
  // palms their characteristic silhouette, with clear sky between the fronds.
  const palmCrownGeometry: THREE.BufferGeometry[] = [], palmDarkGeometry: THREE.BufferGeometry[] = [];
  const palmScarGeo = new THREE.TorusGeometry(.32, .035, 4, 10);
  function palm(x: number, z: number, height: number, seed: number) {
    const rand = randomSource(seed), y = squareHeight(z) + .13;
    const driftX = (rand() - .5) * 2.1, driftZ = (rand() - .5) * 1.7;
    const trunkCurve = new THREE.CatmullRomCurve3([V(x, y, z), V(x + driftX * .15, y + height * .38, z + driftZ * .1), V(x + driftX * .7, y + height * .76, z + driftZ * .55), V(x + driftX, y + height, z + driftZ)]);
    custom(taperedCurve(trunkCurve, .38, .24, 28, 10), mats.bark);
    // Ring scars catch the light on the trunk without expensive displacement.
    for (let i = 1; i < height * 2; i++) {
      const p = trunkCurve.getPoint(i / (height * 2));
      const radius = THREE.MathUtils.lerp(.38, .24, i / (height * 2));
      instance('palm-trunk-scars', mats.bark, palmScarGeo, p.x, p.y, p.z, radius / .32, radius / .32, .70, new THREE.Euler(Math.PI / 2, 0, 0));
    }
    const top = trunkCurve.getPoint(1);
    sphere('palm-crown-heart', mats.bark, top.x, top.y - .16, top.z, .44, .92, .44);
    for (let f = 0; f < 32; f++) {
      // The golden-angle distribution layers upright young leaves, long lateral
      // leaves, and a lower skirt; a single flat radial fan reads as bare sticks.
      const angle = f * 2.399963 + rand() * .15, tier = f % 4;
      const radius = tier === 0 ? 3.1 + rand() * 1.6 : tier === 3 ? 4.7 + rand() * 1.3 : 5.4 + rand() * 1.6;
      const rise = tier === 0 ? 4.2 : tier === 3 ? 1.0 : 2.7;
      const droop = tier === 0 ? -.7 : tier === 3 ? 3.8 : 1.5;
      const direction = V(Math.cos(angle), 0, Math.sin(angle)), tangent = V(-Math.sin(angle), 0, Math.cos(angle));
      const p0 = top.clone(), p1 = top.clone().addScaledVector(direction, radius * .20).add(V(0, rise, 0));
      const p2 = top.clone().addScaledVector(direction, radius * .68).add(V(0, rise * .65, 0));
      const p3 = top.clone().addScaledVector(direction, radius).add(V(0, -droop, 0));
      const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
      custom(taperedCurve(curve, .07, .018, 12, 4), mats.leafDark);
      const positions: number[] = [];
      for (let l = 1; l <= 38; l++) {
        const t = l / 39, start = curve.getPoint(t), length = Math.sin(Math.PI * t) * (1.36 + rand() * .36) + .12;
        for (const side of [-1, 1]) {
          const leafTip = start.clone().addScaledVector(tangent, side * length).addScaledVector(direction, -.15 - length * .16).add(V(0, -.13 - length * .36, 0));
          const mid = start.clone().lerp(leafTip, .44).add(V(0, .085, 0));
          // The widths remain readable through browser antialiasing at 30–100 m.
          const across = direction.clone().multiplyScalar(.068 + Math.sin(Math.PI * t) * .057);
          const a = mid.clone().add(across), b = mid.clone().sub(across);
          for (const p of [start, a, leafTip, start, leafTip, b]) positions.push(p.x, p.y, p.z);
        }
      }
      const leaves = new THREE.BufferGeometry(); leaves.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); leaves.computeVertexNormals();
      (f % 3 ? palmCrownGeometry : palmDarkGeometry).push(leaves);
    }
    cylinder('palm-tree-ring', mats.darkStone, x, y + .025, z, 1.05, .05);
  }
  for (const [i, spec] of [[18, 730, 17], [42, 733, 18], [75, 732, 17], [107, 733, 19], [23, 783, 18], [99, 781, 20], [24, 844, 19], [108, 852, 18], [19, 913, 18], [53, 912, 17], [80, 912, 19], [107, 911, 18]].entries()) palm(spec[0], spec[1], spec[2], 80 + i * 117);
  if (palmCrownGeometry.length) custom(mergeGeometries(palmCrownGeometry), mats.leaf);
  if (palmDarkGeometry.length) custom(mergeGeometries(palmDarkGeometry), mats.leafDark);

  // Dewey Monument: stepped granite plinth, fluted shaft, Corinthian capital,
  // and a bronze Victory holding a wreath and trident above the square.
  const mx = 64, mz = 815, my = squareHeight(mz);
  for (let i = 0; i < 5; i++) box('monument-plinth-steps', mats.whiteGranite, mx, my + .16 + i * .31, mz, 11.0 - i * 1.05, .34, 11.0 - i * 1.05);
  box('monument-pedestal', mats.whiteGranite, mx, my + 3.0, mz, 4.65, 3.2, 4.65);
  for (const h of [1.5, 1.7, 4.5, 4.76]) box('monument-pedestal-moulding', mats.limestone, mx, my + h, mz, h < 2 ? 5.6 : 5.15, .18, h < 2 ? 5.6 : 5.15);
  const bronzePanel = texture(512, 512, ctx => {
    ctx.fillStyle = '#465044'; ctx.fillRect(0, 0, 512, 512); ctx.strokeStyle = '#9b9b75'; ctx.lineWidth = 4; ctx.strokeRect(20, 20, 472, 472);
    ctx.fillStyle = '#b1ac82'; ctx.textAlign = 'center'; ctx.font = '34px Georgia'; ctx.fillText('DEWEY', 256, 141); ctx.font = '20px Georgia';
    for (const [i, line] of ['TO COMMEMORATE', 'THE VICTORY', 'AT MANILA BAY', 'MAY FIRST · MDCCCXCVIII'].entries()) ctx.fillText(line, 256, 213 + i * 41);
  });
  textPlane('dewey-dedication', bronzePanel, mx - 2.336, my + 3.02, mz, 2.3, 2.25, -Math.PI / 2);
  for (const [h, r, d] of [[4.9, 2.0, .22], [5.15, 1.70, .24], [5.44, 1.48, .28], [5.68, 1.33, .20]]) cylinder('monument-shaft-base', mats.whiteGranite, mx, my + h, mz, r, d);
  const shaft = new THREE.CylinderGeometry(.92, 1.26, 19.3, 48);
  custom(shaft, mats.whiteGranite, V(mx, my + 15.42, mz));
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const curve = new THREE.LineCurve3(V(mx + Math.cos(a) * 1.24, my + 6.0, mz + Math.sin(a) * 1.24), V(mx + Math.cos(a) * .92, my + 24.95, mz + Math.sin(a) * .92));
    custom(taperedCurve(curve, .034, .027, 1, 4), mats.granite);
  }
  cylinder('monument-capital-ring', mats.whiteGranite, mx, my + 25.3, mz, 1.2, .3);
  cylinder('monument-capital-ring', mats.whiteGranite, mx, my + 26.05, mz, 1.68, .24);
  box('monument-capital-abacus', mats.whiteGranite, mx, my + 26.3, mz, 3.55, .34, 3.55);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, d = V(Math.cos(a), 0, Math.sin(a));
    const curve = new THREE.CubicBezierCurve3(V(mx, my + 24.75, mz).addScaledVector(d, .97), V(mx, my + 25.8, mz).addScaledVector(d, 1.1), V(mx, my + 26.1, mz).addScaledVector(d, 1.9), V(mx, my + 25.55, mz).addScaledVector(d, 1.65));
    custom(taperedCurve(curve, .12, .09, 12, 6), mats.whiteGranite);
  }
  cylinder('victory-base', mats.bronze, mx, my + 26.58, mz, .88, .2);
  const robePoints = [V(.58, 0, 0), V(.49, .35, 0), V(.38, .85, 0), V(.24, 1.32, 0), V(.33, 1.73, 0), V(.31, 2.02, 0)].map(p => new THREE.Vector2(p.x, p.y));
  custom(new THREE.LatheGeometry(robePoints, 18), mats.bronze, V(mx, my + 26.69, mz));
  sphere('victory-shoulders', mats.bronze, mx, my + 28.65, mz, .43, .27, .22);
  cylinder('victory-neck', mats.bronze, mx, my + 28.97, mz, .13, .22);
  sphere('victory-head', mats.bronze, mx, my + 29.28, mz, .22, .32, .23);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    segment('victory-robe-folds', mats.bronze, V(mx + Math.cos(a) * .53, my + 26.73, mz + Math.sin(a) * .53), V(mx + Math.cos(a) * .26, my + 28.36, mz + Math.sin(a) * .26), .026);
  }
  // Her outstretched arms and attributes remain readable at street distance.
  segment('victory-arms', mats.bronze, V(mx - .35, my + 28.71, mz), V(mx - .84, my + 28.65, mz - .16), .105);
  segment('victory-arms', mats.bronze, V(mx - .84, my + 28.65, mz - .16), V(mx - 1.30, my + 28.95, mz - .10), .082);
  segment('victory-arms', mats.bronze, V(mx + .35, my + 28.71, mz), V(mx + .85, my + 28.96, mz + .05), .105);
  segment('victory-arms', mats.bronze, V(mx + .85, my + 28.96, mz + .05), V(mx + 1.05, my + 29.44, mz + .01), .082);
  const wreath = new THREE.TorusGeometry(.38, .065, 6, 24); wreath.rotateY(Math.PI / 2); custom(wreath, mats.bronze, V(mx - 1.45, my + 28.95, mz));
  segment('victory-trident', mats.bronze, V(mx + 1.08, my + 26.85, mz), V(mx + 1.08, my + 30.7, mz), .035);
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([V(mx + 1.08, my + 29.87, mz), V(mx + 1.08 + s * .22, my + 30.02, mz), V(mx + 1.08 + s * .24, my + 30.58, mz)]);
    custom(taperedCurve(curve, .035, .013, 8, 5), mats.bronze);
  }
  for (const side of [-1, 1]) {
    for (let f = 0; f < 7; f++) {
      const a = V(mx + side * .25, my + 28.58 - f * .06, mz + .17);
      const b = V(mx + side * (.8 + f * .07), my + 29.25 - f * .17, mz + .60 + f * .04);
      custom(taperedCurve(new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, .5).add(V(0, .28, .1)), b), .10, .014, 8, 5), mats.bronze);
    }
  }

  // Movable café furniture and benches make the open square feel inhabited.
  const chairBack = new THREE.TorusGeometry(.36, .023, 5, 12, Math.PI);
  chairBack.rotateX(Math.PI / 2);
  const parasolLinen = new THREE.MeshStandardMaterial({ color: '#f1d4a0', roughness: .91, side: THREE.DoubleSide });
  const parasolRust = new THREE.MeshStandardMaterial({ color: '#fb6950', roughness: .88, side: THREE.DoubleSide });
  function parasol(x: number, y: number, z: number, rust: boolean) {
    const positions: number[] = [], fabric = rust ? parasolRust : parasolLinen;
    const point = (r: number, a: number, height: number) => V(x + Math.cos(a) * r, y + height, z + Math.sin(a) * r);
    for (let sector = 0; sector < 8; sector++) {
      const a = sector / 8 * Math.PI * 2, b = (sector + 1) / 8 * Math.PI * 2, mid = (a + b) / 2;
      const top = V(x, y + 3.57, z), left = point(2.0, a, 2.87), right = point(2.0, b, 2.87), center = point(2.1, mid, 2.80);
      const ridgeL = point(1.03, a, 3.28), ridgeR = point(1.03, b, 3.28), ridgeCenter = point(1.18, mid, 3.23);
      for (const p of [top, ridgeL, ridgeCenter, top, ridgeCenter, ridgeR, ridgeL, left, center, ridgeL, center, ridgeCenter, ridgeCenter, center, right, ridgeCenter, right, ridgeR]) positions.push(p.x, p.y, p.z);
      const lowerL = left.clone().add(V(0, -.16, 0)), lowerR = right.clone().add(V(0, -.16, 0)), scallop = center.clone().add(V(0, -.23, 0));
      for (const p of [left, lowerL, scallop, left, scallop, center, center, scallop, lowerR, center, lowerR, right]) positions.push(p.x, p.y, p.z);
      segment('umbrella-rib', mats.limestone, V(x, y + 3.43, z), left, .018);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); custom(geometry, fabric);
    cylinder('umbrella-pole', mats.limestone, x, y + 1.7, z, .045, 3.4);
    cylinder('umbrella-foot', mats.darkStone, x, y + .11, z, .30, .18);
    sphere('umbrella-finial', mats.limestone, x, y + 3.61, z, .075, .15, .075);
  }
  for (let i = 0; i < 20; i++) {
    const x = 45 + (i % 5) * 7.5, z = 771 + Math.floor(i / 5) * 26.5, y = squareHeight(z);
    if (Math.abs(x - mx) < 10 && Math.abs(z - mz) < 15) continue;
    cylinder('cafe-table-top', mats.metal, x, y + .76, z, .70, .055);
    cylinder('cafe-table-leg', mats.metal, x, y + .37, z, .045, .74);
    // A small, asymmetric family of parasols creates a café destination rather
    // than carpeting the whole square or blocking the monument's lower plinth.
    if ([0, 1, 3, 5, 8, 15, 17, 19].includes(i)) parasol(x, y, z, i % 3 === 0);
    for (let foot = 0; foot < 3; foot++) {
      const a = foot / 3 * Math.PI * 2;
      segment('cafe-furniture-tube', mats.metal, V(x, y + .10, z), V(x + Math.cos(a) * .42, y + .035, z + Math.sin(a) * .42), .028);
    }
    for (let c = 0; c < 3; c++) {
      const a = c / 3 * Math.PI * 2 + i * .2, cx = x + Math.cos(a) * 1.15, cz = z + Math.sin(a) * 1.15;
      cylinder('cafe-chair-seat', mats.green, cx, y + .43, cz, .34, .055);
      instance('cafe-chair-curved-back', mats.green, chairBack, cx, y + .80, cz, 1, 1, 1, new THREE.Euler(0, -a, 0));
      for (const s of [-1, 1]) {
        const sx = cx + Math.cos(a + Math.PI / 2) * s * .26, sz = cz + Math.sin(a + Math.PI / 2) * s * .26;
        segment('cafe-furniture-tube', mats.green, V(sx, y + .045, sz), V(sx, y + .82, sz), .025);
      }
    }
  }
  for (const [x, z] of [[17, 779], [17, 850], [39, 737], [78, 902], [87, 764], [85, 877]]) {
    const y = squareHeight(z);
    for (let slat = 0; slat < 5; slat++) box('square-bench-slats', mats.darkStone, x + slat * .16, y + .51, z, .13, .09, 3.1);
    for (const s of [-1, 1]) box('square-bench-foot', mats.metal, x + .33, y + .25, z + s * 1.10, .57, .5, .09);
  }
  for (const z of [735, 796, 857, 907]) {
    const x = 13, y = squareHeight(z);
    cylinder('square-lamp-pole', mats.metal, x, y + 2.2, z, .065, 4.4);
    cylinder('square-lamp-base', mats.metal, x, y + .20, z, .17, .40);
    sphere('square-lamp-globe', mats.light, x, y + 4.5, z, .24);
    cylinder('square-lamp-cap', mats.metal, x, y + 4.7, z, .25, .10);
  }
  textPlane('union-square-marker', lettering('UNION SQUARE', 'SAN FRANCISCO'), 13.0, squareHeight(731) + 1.2, 731, 3.5, 1.0, -Math.PI / 2);
  box('union-square-sign-stone', mats.darkStone, 13.13, squareHeight(731) + .78, 731, .35, 1.65, 3.8);

  // Across Stockton: the unmistakably low, transparent Apple Union Square
  // pavilion replaces a generic high-rise wall with glass, silver roof edges,
  // maple display tables and the planted outdoor forum. This uses the clear
  // x126–162 strip; the procedural background begins farther east at x166+.
  const silver = standard('#aab5b4', .26, .82), maple = standard('#b99a69', .65);
  const pavilionGlass = new THREE.MeshPhysicalMaterial({ color: '#9db1ac', roughness: .12, metalness: .12, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: .65 });
  const ax = 128, az = 767, ay = sampleRoute(767).y + .85;
  // A narrow, terrain-following Stockton Street keeps the opposite block
  // separate from the square and leaves its gardens and palms unobstructed.
  const stocktonPositions: number[] = [], stocktonIndices: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const z = 722 + i * 4.1, y = sampleRoute(z).y + .02;
    stocktonPositions.push(116.15, y, z, 124.5, y, z);
    if (i < 48) { const j = i * 2; stocktonIndices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const stocktonGeo = new THREE.BufferGeometry(); stocktonGeo.setAttribute('position', new THREE.Float32BufferAttribute(stocktonPositions, 3)); stocktonGeo.setIndex(stocktonIndices); stocktonGeo.computeVertexNormals();
  custom(stocktonGeo, mats.black);
  box('apple-plinth', mats.granite, 144.5, ay - .55, az, 37.0, 1.25, 60);
  box('apple-pavilion-floor', mats.whiteGranite, 144.5, ay + .08, az, 37.0, .17, 60);
  box('apple-back-wall', mats.limestone, 161.9, ay + 6.65, az, .65, 13.4, 60, undefined, true);
  box('apple-side-wall', mats.limestone, 145.2, ay + 6.65, az - 29.6, 33.0, 13.4, .60, undefined, true);
  box('apple-silver-roof', silver, 144.0, ay + 14.06, az, 37.8, .40, 61.5);
  box('apple-roof-dark-reveal', mats.frame, 143.9, ay + 13.72, az, 37.7, .20, 61.3);
  box('apple-soffit', mats.limestone, 144.0, ay + 13.50, az, 37.6, .18, 61.1);
  // The thin horizontal upper gallery shows through the two enormous sliding
  // glass door openings. Large clear spans distinguish this from office glazing.
  box('apple-mezzanine-floor', mats.whiteGranite, 156.4, ay + 6.80, az + 2.3, 11, .32, 54.1);
  box('apple-mezzanine-edge', silver, 150.86, ay + 6.78, az + 2.3, .09, .40, 54.1);
  instance('apple-upper-glass-balustrade', pavilionGlass, planeGeo, 150.77, ay + 7.42, az + 2.3, 54.1, 1.2, 1, new THREE.Euler(0, -Math.PI / 2, 0));
  for (let z = az - 25; z <= az + 25; z += 10) {
    // Open middle doors, with two full-height movable glass panels at the ends.
    if (Math.abs(z - az) > 5) instance('apple-full-height-glass', pavilionGlass, planeGeo, ax, ay + 6.78, z, 9.93, 13.4, 1, new THREE.Euler(0, -Math.PI / 2, 0));
    box('apple-glass-fin', silver, ax + .10, ay + 6.8, z + 5, .13, 13.5, .085);
    box('apple-glass-panel-foot', silver, ax + .04, ay + .23, z, .16, .23, 9.94);
    box('apple-ceiling-light', mats.light, 146, ay + 13.37, z, 21, .028, .12);
  }
  for (const z of [az - 29.8, az + 29.8]) box('apple-end-jamb', silver, ax - .04, ay + 6.86, z, .30, 13.6, .26);
  // Maple trestle tables and dark demo screens read through the clear frontage.
  for (const x of [135.8, 144.1, 155.9]) for (let z = az - 22; z <= az + 22; z += 11) {
    box('apple-maple-display-top', maple, x, ay + 1.10, z, 2.1, .16, 5.4);
    for (const side of [-1, 1]) box('apple-maple-display-leg', maple, x, ay + .57, z + side * 2.0, 1.7, 1.0, .19);
    for (const offset of [-1.6, 0, 1.6]) {
      box('apple-display-device', mats.black, x + .08, ay + 1.44, z + offset, .055, .59, .8, new THREE.Euler(0, 0, .13));
      box('apple-display-device-base', silver, x - .03, ay + 1.20, z + offset, .40, .05, .42);
    }
  }
  // White Apple silhouette above the open central entrance, built as original
  // vector geometry rather than a billboard or an invented sponsor mark.
  const appleShape = new THREE.Shape();
  appleShape.moveTo(0, .66); appleShape.bezierCurveTo(-.47, .98, -.93, .82, -1.05, .30);
  appleShape.bezierCurveTo(-1.19, -.22, -.73, -1.15, -.36, -1.20);
  appleShape.bezierCurveTo(-.13, -1.24, -.05, -1.08, .14, -1.12);
  appleShape.bezierCurveTo(.36, -1.19, .44, -1.22, .57, -1.07);
  appleShape.bezierCurveTo(.76, -.88, .91, -.53, .94, -.35);
  appleShape.bezierCurveTo(.46, -.25, .36, .24, .88, .56);
  appleShape.bezierCurveTo(.62, .89, .21, .96, 0, .66);
  const appleLogoGeo = new THREE.ShapeGeometry(appleShape, 28); appleLogoGeo.scale(1.45, 1.45, 1); appleLogoGeo.rotateY(-Math.PI / 2);
  custom(appleLogoGeo, mats.light, V(ax - .23, ay + 10.52, az));
  const appleLeaf = new THREE.Shape(); appleLeaf.moveTo(-.06, 0); appleLeaf.bezierCurveTo(.01, .45, .35, .62, .56, .61); appleLeaf.bezierCurveTo(.61, .32, .27, -.05, -.06, 0);
  const appleLeafGeo = new THREE.ShapeGeometry(appleLeaf, 18); appleLeafGeo.scale(1.45, 1.45, 1); appleLeafGeo.rotateY(-Math.PI / 2);
  custom(appleLeafGeo, mats.light, V(ax - .24, ay + 11.63, az));
  // Outdoor forum, low stone seating and layered olive crowns at its southern end.
  const gardenZ = 808, gardenY = squareHeight(gardenZ);
  box('apple-garden-paving', mats.granite, 144, gardenY + .02, gardenZ, 36, .15, 20.5);
  box('apple-living-wall', mats.hedge, 161.5, gardenY + 4.0, gardenZ, .7, 8, 20.5);
  for (const [x, z] of [[133, 802], [153, 803], [143, 813]]) {
    cylinder('apple-olive-planter', mats.whiteGranite, x, gardenY + .38, z, 1.6, .74);
    cylinder('apple-olive-soil', mats.soil, x, gardenY + .78, z, 1.42, .06);
    segment('apple-olive-trunk', mats.bark, V(x, gardenY + .7, z), V(x + .18, gardenY + 4.8, z + .3), .12);
    for (let branch = 0; branch < 9; branch++) {
      const a = branch * 2.39996, tx = x + Math.cos(a) * (1.2 + random() * .7), tz = z + Math.sin(a) * (1.2 + random() * .7), ty = gardenY + 4.5 + random() * 1.7;
      segment('apple-olive-branches', mats.bark, V(x + .14, gardenY + 3.7, z + .19), V(tx, ty, tz), .055);
      sphere('apple-olive-crown', mats.hedge, tx, ty, tz, .85, .65, .82);
    }
    for (const s of [-1, 1]) box('apple-garden-bench', mats.whiteGranite, x + s * 2.35, gardenY + .5, z, .9, 1, 3.5);
  }

  // The southeast Stockton frontage has the taller, tightly articulated stone
  // rhythm of Union Square's historic department stores. Grouped windows, deep
  // pilasters, a dark retail base and stepped parapets interrupt the distant grid.
  const sx = 128.2, sz = 866, sy = Math.min(sampleRoute(826).y, sampleRoute(906).y) - .8, sh = 38.6;
  box('stockton-stone-body', mats.limestone, 145.3, sy + sh / 2, sz, 33.8, sh, 79.5, undefined, true);
  box('stockton-recessed-base', mats.darkStone, sx - .01, sy + 4.1, sz, .13, 8.2, 79.6);
  for (let bay = -32; bay <= 32; bay += 8.0) {
    for (const offset of [-2.2, 0, 2.2]) {
      const z = sz + bay + offset;
      box('stockton-shop-glass', mats.glass, sx - .10, sy + 4.05, z, .08, 6.3, 1.90);
      for (let floor = 0; floor < 7; floor++) {
        const y = sy + 10.45 + floor * 3.55;
        box('stockton-grouped-window', mats.glass, sx - .10, y, z, .08, 2.72, 1.55);
        box('stockton-grouped-sill', mats.floodLight, sx - .33, y - 1.49, z, .42, .17, 1.85);
        box('stockton-grouped-transom', mats.frame, sx - .17, y + .20, z, .075, .067, 1.55);
      }
    }
    for (const offset of [-3.53, 3.53]) {
      box('stockton-limestone-pilaster', mats.limestone, sx - .37, sy + 22.1, sz + bay + offset, .75, 28.6, .63);
      box('stockton-pilaster-capital', mats.floodLight, sx - .49, sy + 36.2, sz + bay + offset, 1.05, .50, .96);
      for (let flute = -1; flute <= 1; flute++) box('stockton-deco-flute', mats.darkStone, sx - .77, sy + 22.05, sz + bay + offset + flute * .17, .023, 27.3, .023);
    }
    for (let step = 0; step < 3; step++) box('stockton-stepped-parapet', mats.limestone, sx - .25, sy + sh + .24 + step * .51, sz + bay, .8, .55, 5.2 - step * 1.2);
  }
  for (const h of [7.85, 8.25, 34.7, 37.55, 38.25]) box('stockton-sculpted-cornice', mats.floodLight, sx - .43, sy + h, sz, h > 34 ? 1.18 : .83, .24, 80.4);
  // Upper windowed north return remains visible behind the low glass pavilion.
  for (let x = 130.5; x < 161; x += 3.2) for (let f = 0; f < 8; f++) {
    box('stockton-end-window', mats.glass, x, sy + 8.5 + f * 3.5, sz - 39.84, 1.8, 2.58, .07);
    box('stockton-end-sill', mats.floodLight, x, sy + 7.08 + f * 3.5, sz - 39.99, 2.04, .16, .39);
  }
  for (const z of [sz - 28, sz, sz + 28]) {
    box('stockton-dark-awning', mats.awning, sx - 1.35, sy + 5.9, z, 2.6, .16, 12.1, new THREE.Euler(0, 0, .10));
    box('stockton-awning-valance', mats.awning, sx - 2.62, sy + 5.64, z, .13, .47, 12.1);
  }

  // BEACON GRAND (formerly Sir Francis Drake): the slim 1920s hotel at Sutter.
  const bx = 15.4, bz = 607, by = Math.min(sampleRoute(547).y, sampleRoute(667).y) - .6;
  box('beacon-podium', mats.terracotta, bx + 20, by + 10, bz, 40, 20, 120, undefined, true);
  box('beacon-tower', mats.terracotta, bx + 19, by + 41, bz, 33, 82, 55, undefined, true);
  for (let floor = 0; floor < 21; floor++) {
    const yy = by + 5.7 + floor * 3.65;
    for (let zz = -23; zz <= 23; zz += 4.3) windowBay('beacon', floor < 4 ? bx : bx + 2.5, yy, bz + zz, -1, 1.7, 2.4, floor === 3 || floor === 18, mats.limestone);
    if (floor < 4) for (const section of [-1, 1]) for (let zz = 33; zz <= 55; zz += 4.4) windowBay('beacon', bx, yy, bz + section * zz, -1, 1.7, 2.65, floor === 3, mats.limestone);
  }
  // The tower's north return is visible from the long downhill approach.
  for (let floor = 0; floor < 21; floor++) for (let x = bx + 5.5; x <= bx + 33; x += 4.0) {
    const front = bz - (floor < 4 ? 60 : 27.5);
    box('beacon-return-glass', mats.glass, x, by + 5.7 + floor * 3.65, front - .08, 1.65, 2.4, .07);
    box('beacon-return-lintel', mats.limestone, x, by + 7.05 + floor * 3.65, front - .26, 2.16, .21, .44);
    box('beacon-return-lintel', mats.limestone, x, by + 4.34 + floor * 3.65, front - .32, 2.16, .17, .52);
  }
  for (const h of [19.8, 72.5, 78.5, 81.7]) box('beacon-cornice', mats.limestone, bx + 19, by + h, bz, 34.5, .45, 56.5);
  for (let i = 0; i < 4; i++) {
    box('beacon-stepped-crown', mats.terracotta, bx + 19, by + 84 + i * 2.65, bz, 26 - i * 5.0, 3.1, 42 - i * 8, undefined, true);
    box('beacon-crown-cap', mats.limestone, bx + 19, by + 85.7 + i * 2.65, bz, 27 - i * 5.0, .31, 43 - i * 8);
  }
  for (const z of [bz - 25.9, bz + 25.9]) for (const x of [bx + 3.0, bx + 35]) {
    box('beacon-corner-finials', mats.limestone, x, by + 83.1, z, 1.05, 3, 1.05);
    sphere('beacon-finial-caps', mats.limestone, x, by + 84.9, z, .59);
  }
  cylinder('beacon-flagpole', mats.metal, bx + 19, by + 98.0, bz, .05, 11);
  const flagMap = texture(384, 192, ctx => {
    ctx.fillStyle = '#e8dfcd'; ctx.fillRect(0, 0, 384, 192);
    for (let i = 0; i < 13; i += 2) { ctx.fillStyle = '#a14f48'; ctx.fillRect(0, i * 192 / 13, 384, 192 / 13); }
    ctx.fillStyle = '#394b6b'; ctx.fillRect(0, 0, 160, 105); ctx.fillStyle = '#f2eadd';
    for (let y = 9; y < 103; y += 17) for (let x = 10; x < 156; x += 22) ctx.fillRect(x, y, 3, 3);
  });
  const flagGeo = new THREE.PlaneGeometry(5.5, 2.8, 16, 4), flagMat = new THREE.MeshStandardMaterial({ map: flagMap, side: THREE.DoubleSide, roughness: .7 });
  const flag = new THREE.Mesh(flagGeo, flagMat); flag.position.set(bx + 21.8, by + 101.5, bz); group.add(flag);
  const flagBase = Float32Array.from(flagGeo.getAttribute('position').array);
  const bladeMap = texture(256, 1536, ctx => {
    ctx.fillStyle = '#233e35'; ctx.fillRect(0, 0, 256, 1536); ctx.strokeStyle = '#d6c19a'; ctx.lineWidth = 5; ctx.strokeRect(11, 11, 234, 1514);
    ctx.fillStyle = '#e3cda1'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 95px Georgia';
    [...'BEACON'].forEach((letter, i) => ctx.fillText(letter, 128, 113 + i * 146));
    ctx.font = '45px Georgia'; ctx.fillText('GRAND', 128, 1110, 228); ctx.font = '25px Georgia'; ctx.fillText('HOTEL', 128, 1200);
    ctx.strokeStyle = '#d6c19a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(55, 1030); ctx.lineTo(201, 1030); ctx.stroke();
    ctx.font = '60px Georgia'; ctx.fillText('✦', 128, 1365);
  });
  box('beacon-blade-body', mats.awning, bx - 1.9, by + 32, bz - 29, 3.2, 23, .65);
  textPlane('beacon-blade-north', bladeMap, bx - 1.9, by + 32, bz - 29.36, 3.2, 23, Math.PI);
  textPlane('beacon-blade-south', bladeMap, bx - 1.9, by + 32, bz - 28.64, 3.2, 23, 0);
  const beaconGround = sampleRoute(bz - 4).y;
  box('beacon-entry-awning', mats.awning, bx - 1.5, beaconGround + 5, bz - 4, 3.5, .20, 13);
  textPlane('beacon-entry-lettering', lettering('BEACON GRAND', 'A SAN FRANCISCO HOTEL'), bx - 3.3, beaconGround + 4.68, bz - 4, 12.5, 1.3, -Math.PI / 2);
  for (let z = bz - 9; z <= bz + 1; z += 5) archDoor('beacon', bx - .06, sampleRoute(z).y + .25, z, 3.7, 5.0, -1);

  // The Flood Building closes the Powell corridor at Market with sandstone,
  // Beaux-Arts arches and a genuinely rounded corner, rather than a plain box.
  const fx = -13.2, fy = Math.min(sampleRoute(1200).y, sampleRoute(1380).y) - .7, fz = 1290, fh = 44.5;
  box('flood-main-mass', mats.flood, fx - 22, fy + fh / 2, fz, 44, fh, 183, undefined, true);
  box('flood-side-mass', mats.flood, fx - 42, fy + fh / 2, 1370, 52, fh, 44, undefined, true);
  for (let z = 1204; z < 1366; z += 4.9) {
    archDoor('flood', fx + .08, sampleRoute(z).y + .3, z, 3.6, 6.0, 1, mats.floodLight);
    for (let floor = 0; floor < 10; floor++) windowBay('flood', fx, fy + 9.0 + floor * 3.35, z, 1, 2.02, 2.48, floor === 0 || floor === 7, mats.floodLight);
  }
  for (const h of [6.8, 7.3, 33.4, 41.8, 43.6, 44.2]) box('flood-cornice', mats.floodLight, fx + .16, fy + h, fz - 4, h > 41 ? 1.35 : .8, .26, 176);
  for (let z = 1202; z < 1375; z += 1.25) box('flood-cornice-dentils', mats.floodLight, fx + .4, fy + 43.05, z, .40, .35, .39);
  // Quarter-circle corner on the Market end, with radial windows and cornices.
  const cornerX = fx - 13, cornerZ = 1375;
  const cornerBody = new THREE.CylinderGeometry(13, 13, fh, 24, 1, false, 0, Math.PI / 2);
  custom(cornerBody, mats.flood, V(cornerX, fy + fh / 2, cornerZ));
  for (let a = .12; a < Math.PI / 2; a += .25) {
    for (let floor = 0; floor < 11; floor++) {
      const r = 13.04, x = cornerX + Math.sin(a) * r, z = cornerZ + Math.cos(a) * r, yy = fy + 5.65 + floor * 3.35;
      box('flood-rounded-glass', mats.glass, x, yy, z, 1.95, 2.55, .09, new THREE.Euler(0, a, 0));
      box('flood-rounded-lintel', mats.floodLight, cornerX + Math.sin(a) * 13.25, yy + 1.42, cornerZ + Math.cos(a) * 13.25, 2.4, .19, .5, new THREE.Euler(0, a, 0));
      box('flood-rounded-lintel', mats.floodLight, cornerX + Math.sin(a) * 13.25, yy - 1.43, cornerZ + Math.cos(a) * 13.25, 2.4, .19, .5, new THREE.Euler(0, a, 0));
    }
  }
  for (const h of [7.1, 33.4, 41.8, 43.6, 44.2]) {
    const curve = new THREE.EllipseCurve(0, 0, 13.4, 13.4, 0, Math.PI / 2, false, 0);
    const points = curve.getPoints(36).map(p => V(cornerX + p.x, fy + h, cornerZ + p.y));
    custom(taperedCurve(new THREE.CatmullRomCurve3(points), .20, .20, 36, 6), mats.floodLight);
  }
  textPlane('flood-building-entry', lettering('FLOOD BUILDING', '870 MARKET STREET'), fx + .44, fy + 6.58, 1301, 11.6, 1.06, Math.PI / 2);

  // Static architecture is batched by geometry/material; substantial projecting
  // details and foliage cast shadows, so the sunny façades retain genuine depth.
  const shadowMeshes: THREE.Mesh[] = [];
  for (const batch of batches.values()) {
    const key = batch.name;
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.instances.length); mesh.name = key;
    batch.instances.forEach((part, i) => { mesh.setMatrixAt(i, part.matrix); if (part.color) mesh.setColorAt(i, part.color); });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = batch.shadow; mesh.receiveShadow = !key.includes('glass') && !key.includes('pane');
    mesh.computeBoundingSphere(); group.add(mesh); if (batch.shadow) shadowMeshes.push(mesh);
  }
  for (const [material, geometries] of details) {
    const geometry = mergeGeometries(geometries, false); if (!geometry) continue;
    geometry.computeBoundingSphere(); const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
    mesh.castShadow = [mats.limestone, mats.whiteGranite, mats.bark, mats.bronze, mats.leaf, mats.leafDark, parasolLinen, parasolRust].includes(material as THREE.MeshStandardMaterial);
    group.add(mesh); if (mesh.castShadow) shadowMeshes.push(mesh);
    for (const source of geometries) source.dispose();
  }
  return {
    update(time: number, _progress: number) {
      const position = flagGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const x = flagBase[i * 3], weight = (x + 2.75) / 5.5;
        position.setZ(i, Math.sin(x * 1.5 + time * 2.9) * .43 * weight + Math.sin(x * 3.2 + time * 3.7) * .1 * weight);
      }
      position.needsUpdate = true;
    },
    setQuality(low: boolean) { for (const mesh of shadowMeshes) mesh.castShadow = !low; },
  };
}

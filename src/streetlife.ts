import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleRoute, routeSlope, routeYaw, type Obstacle } from './route';

type Section = [z: number, halfWidth: number, centerY: number, halfHeight: number];
type Label = { slot: number };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Original, hand-built street assets. One merged draw per material, including the sign atlas. */
export function createStreetLife(scene: THREE.Scene): {
  obstacles: Obstacle[];
  tourObstacles?: Obstacle[];
  update: (time: number, progress: number) => void;
  setQuality: (low: boolean) => void;
} {
  const group = new THREE.Group();
  group.name = 'San Francisco — cable cars, coachwork & street life';
  scene.add(group);
  const obstacles: Obstacle[] = [];
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let frame = new THREE.Matrix4();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const unitSphere = new THREE.SphereGeometry(1, 14, 8);
  const standard = (color: string, roughness = .65, metalness = .1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mats = {
    iron: standard('#293c43', .48, .32), rubber: standard('#192329', .94),
    chrome: standard('#e2e4da', .21, .72), brass: standard('#efbb53', .29, .50),
    glass: new THREE.MeshPhysicalMaterial({ color: '#397e98', roughness: .12, metalness: .26, clearcoat: 1, envMapIntensity: .65 }),
    wood: standard('#aa6438', .61), darkWood: standard('#663821', .74),
    cream: standard('#f4e1ae', .48, .06), burgundy: standard('#b52733', .34, .18),
    muniRed: standard('#df3530', .39, .13),
    yellow: standard('#efba36', .57), green: standard('#267b54', .65), blue: standard('#287eae', .62),
    white: standard('#f4eee0', .51), orange: standard('#e97c34', .70), foliage: standard('#4e7946', .9),
    red: new THREE.MeshStandardMaterial({ color: '#dd3b32', emissive: '#d62218', emissiveIntensity: .4, roughness: .33 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff0bc', emissive: '#ffca7b', emissiveIntensity: .7, roughness: .3 }),
    amber: new THREE.MeshStandardMaterial({ color: '#e7ac44', emissive: '#ff972d', emissiveIntensity: .22, roughness: .45 }),
  };
  const paints = ['#246db6', '#efddb5', '#dca645', '#208d83', '#c84938', '#679bc5'].map(color =>
    new THREE.MeshPhysicalMaterial({ color, metalness: .29, roughness: .23, clearcoat: 1, clearcoatRoughness: .16, envMapIntensity: .8 }));
  for (const [name, material] of Object.entries(mats)) material.name = `Street / ${name}`;
  paints.forEach((material, i) => { material.name = `Street / coachwork ${i}`; });

  // Signs share an atlas: legible street plates, car plates and cable-car typography
  // cost the same single material, with no per-object canvas textures.
  const atlas = document.createElement('canvas'); atlas.width = 2048; atlas.height = 2048;
  const ctx = atlas.getContext('2d')!;
  ctx.fillStyle = '#192321'; ctx.fillRect(0, 0, 2048, 2048);
  let labelCount = 0;
  function label(text: string, bg = '#294b41', fg = '#f3ead2', sub = '', serif = false): Label {
    const slot = labelCount++, x = slot % 4 * 512, y = Math.floor(slot / 4) * 128;
    ctx.fillStyle = bg; ctx.fillRect(x, y, 512, 128);
    ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.strokeRect(x + 8, y + 8, 496, 112);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${serif ? '' : 'bold '}${sub ? 48 : 54}px ${serif ? 'Georgia' : 'Arial'}`;
    ctx.fillText(text, x + 256, y + (sub ? 51 : 67), 476);
    if (sub) { ctx.font = '21px Arial'; ctx.fillText(sub, x + 256, y + 97, 475); }
    return { slot };
  }
  const labels = {
    powell: label('POWELL', '#096342', '#fff5d5', 'STREET'),
    california: label('CALIFORNIA', '#096342', '#fff5d5', 'STREET'),
    pine: label('PINE', '#096342', '#fff5d5', 'STREET'),
    bush: label('BUSH', '#096342', '#fff5d5', 'STREET'),
    sutter: label('SUTTER', '#096342', '#fff5d5', 'STREET'),
    post: label('POST', '#096342', '#fff5d5', 'STREET'),
    geary: label('GEARY', '#096342', '#fff5d5', 'STREET'),
    ellis: label('ELLIS', '#096342', '#fff5d5', 'STREET'),
    market: label('MARKET', '#096342', '#fff5d5', 'STREET'),
    route: label('POWELL & HYDE', '#174c36', '#ffe2a0', '', true),
    sideRoute: label('SAN FRANCISCO', '#ae202e', '#ffe7a4', 'MUNICIPAL RAILWAY', true),
    number28: label('28', '#ae202e', '#ffe7a4', '', true),
    number15: label('15', '#ae202e', '#ffe7a4', '', true),
    cable: label('CABLE CAR', '#263c30', '#efd9ad', 'POWELL • HYDE', true),
    cableStop: label('CABLE CAR', '#f1dba6', '#473b27', 'STOP HERE'),
    license: label('7SF 415', '#e4e3db', '#344862', 'California'),
    chronicle: label('CHRONICLE', '#244d66', '#eee8cf', 'SAN FRANCISCO', true),
    examiner: label('EXAMINER', '#a33435', '#f6e7cc', 'SAN FRANCISCO', true),
    recycling: label('RECYCLE', '#276b86', '#f1eee3'),
    compost: label('COMPOST', '#2c6858', '#f1eee3'),
    bus: label('30 STOCKTON', '#1c2925', '#f8c75b'),
    muni: label('MUNI', '#fae5b2', '#db2925', 'SAN FRANCISCO'),
    walk: label('18', '#151a1d', '#fc7039'),
    bay: label('THE CITY', '#194f4b', '#e9cfa5', 'SAN FRANCISCO'),
    parking: label('PAY HERE', '#354346', '#e7eee4', 'P'),
    turnaround: label('POWELL & MARKET', '#284a39', '#f2dec0', 'CABLE CAR TURNAROUND', true),
    hallidie: label('HALLIDIE PLAZA', '#294839', '#eadabd', 'SAN FRANCISCO', true),
    marketFront: label('MARKET STREET', '#3f4943', '#e8d5b0', 'SAN FRANCISCO', true),
  };
  const atlasTexture = new THREE.CanvasTexture(atlas); atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.anisotropy = 8;
  const labelMaterial = new THREE.MeshStandardMaterial({ map: atlasTexture, roughness: .60, emissiveMap: atlasTexture, emissive: '#ffffff', emissiveIntensity: .075, side: THREE.DoubleSide });
  labelMaterial.name = 'Street / sign atlas';

  function emit(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0,
    scale: THREE.Vector3 = V(1, 1, 1), rotation = new THREE.Euler()) {
    const transform = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(rotation), scale);
    const baked = geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(frame, transform));
    if (!baked.getAttribute('normal')) baked.computeVertexNormals();
    if (!baked.getAttribute('uv')) baked.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(baked.getAttribute('position').count * 2), 2));
    // Every source is flattened before merging, so boxes, lofts and tube sweeps
    // can share the same draw even though their index layouts differ.
    const flat = baked.index ? baked.toNonIndexed() : baked;
    if (flat !== baked) baked.dispose();
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material)!.push(flat);
  }
  function box(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rotation = new THREE.Euler()) {
    emit(unitBox, mat, x, y, z, V(w, h, d), rotation);
  }
  function cylinder(mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, rotation = new THREE.Euler()) {
    emit(unitCylinder, mat, x, y, z, V(r, h, r), rotation);
  }
  function sphere(mat: THREE.Material, x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    emit(unitSphere, mat, x, y, z, V(rx, ry, rz));
  }
  function rod(mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r = .035) {
    const mid = a.clone().add(b).multiplyScalar(.5);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    cylinder(mat, mid.x, mid.y, mid.z, r, a.distanceTo(b), new THREE.Euler().setFromQuaternion(q));
  }
  function quad(mat: THREE.Material, corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(p => p.toArray()), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); emit(geo, mat); geo.dispose();
  }
  function plate(l: Label, x: number, y: number, z: number, w: number, h: number, ry = Math.PI) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.getAttribute('uv');
    const sx = l.slot % 4, sy = Math.floor(l.slot / 4);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (sx + .008 + uv.getX(i) * .984) / 4, 1 - (sy + .03 + (1 - uv.getY(i)) * .94) / 16);
    emit(geo, labelMaterial, x, y, z, V(1, 1, 1), new THREE.Euler(0, ry, 0)); geo.dispose();
  }
  function at(progress: number, lateral: number, fn: () => void, yaw = 0, slope = true) {
    const p = sampleRoute(progress), saved = frame;
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan(slope ? routeSlope(progress) : 0), routeYaw(progress), 0, 'YXZ'));
    orientation.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw));
    frame = new THREE.Matrix4().compose(V(p.x + lateral, p.y + .025, progress), orientation, V(1, 1, 1));
    fn(); frame = saved;
  }
  function loft(sections: Section[], mat: THREE.Material, sides = 24, squareness = 1) {
    const verts: number[] = [], ids: number[] = [];
    const curve = (n: number) => Math.sign(n) * Math.abs(n) ** squareness;
    for (const [z, w, y, h] of sections) for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      verts.push(curve(Math.cos(a)) * w, y + curve(Math.sin(a)) * h, z);
    }
    for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1; ids.push(a, a + 1, b, b, a + 1, b + 1);
    }
    for (const [index, flip] of [[0, true], [sections.length - 1, false]] as const) {
      const c = verts.length / 3; verts.push(0, sections[index][2], sections[index][0]);
      for (let j = 0; j < sides; j++) { const a = index * (sides + 1) + j; ids.push(c, flip ? a + 1 : a, flip ? a : a + 1); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(ids); geo.computeVertexNormals(); emit(geo, mat); geo.dispose();
  }
  function wheel(x: number, z: number, radius = .36, y = .37) {
    const side = Math.sign(x);
    cylinder(mats.rubber, x, y, z, radius, .22, new THREE.Euler(0, 0, Math.PI / 2));
    cylinder(mats.iron, x + side * .117, y, z, radius * .74, .025, new THREE.Euler(0, 0, Math.PI / 2));
    cylinder(mats.chrome, x + side * .134, y, z, radius * .26, .022, new THREE.Euler(0, 0, Math.PI / 2));
    for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5;
      rod(mats.chrome, V(x + side * .136, y + Math.sin(a) * radius * .17, z + Math.cos(a) * radius * .17),
        V(x + side * .136, y + Math.sin(a + .12) * radius * .65, z + Math.cos(a + .12) * radius * .65), .025);
    }
  }

  function parkedCar(progress: number, lateral: number, paintIndex: number, variant: number) {
    const paint = paints[paintIndex % paints.length], roofHeight = variant === 2 ? 1.55 : variant === 1 ? 1.34 : 1.43;
    at(progress, lateral, () => {
      loft([[-2.21, .63, .59, .16], [-2.08, .86, .59, .25], [-1.71, .94, .60, .29],
        [-1.35, .96, .63, .32], [-.78, .90, .61, .29], [0, .89, .61, .28],
        [.72, .92, .60, .31], [1.35, .97, .59, .33], [1.73, .91, .55, .28], [2.10, .76, .51, .22], [2.21, .59, .51, .14]], paint, 24, .65);
      box(mats.iron, 0, .31, 0, 1.72, .12, 3.91);
      const rear = variant === 2 ? -1.64 : -1.13, roofRear = variant === 2 ? -.91 : -.64;
      loft([[rear, .77, .87, .04], [roofRear - .15, .74, 1.08, roofHeight - 1.08 - .04],
        [roofRear, .70, 1.11, roofHeight - 1.11], [.35, .67, 1.09, roofHeight - 1.09],
        [.82, .73, .94, .15], [1.06, .76, .86, .025]], mats.glass, 24, .70);
      // A shaped roof skin follows the canopy; slim pillars leave generous glass.
      const roofPoints: number[] = [], roofIndices: number[] = [];
      for (let j = 0; j <= 4; j++) {
        const z = roofRear + (.35 - roofRear) * j / 4;
        for (let k = 0; k <= 8; k++) {
          const x = (k / 8 - .5) * 1.13;
          roofPoints.push(x, roofHeight + .022 - Math.pow(Math.abs(x) / .70, 3) * .12 - Math.sin(j / 4 * Math.PI) * .003, z);
          if (j < 4 && k < 8) { const a = j * 9 + k; roofIndices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10); }
        }
      }
      const roof = new THREE.BufferGeometry(); roof.setAttribute('position', new THREE.Float32BufferAttribute(roofPoints, 3)); roof.setIndex(roofIndices); roof.computeVertexNormals(); emit(roof, paint); roof.dispose();
      for (const side of [-1, 1]) {
        rod(paint, V(side * .79, .9, rear), V(side * .60, roofHeight - .07, roofRear), .056);
        rod(paint, V(side * .76, .9, 1.04), V(side * .59, roofHeight - .08, .35), .054);
        rod(mats.iron, V(side * .83, .92, -.14), V(side * .64, roofHeight - .055, -.20), .052);
        rod(mats.chrome, V(side * .84, .91, rear + .1), V(side * .83, .91, .97), .014);
        box(mats.iron, side * .903, .76, -.50, .012, .015, 1.63);
        box(mats.chrome, side * .914, .84, -.37, .028, .034, .22);
        if (variant !== 1) box(mats.chrome, side * .91, .83, -1.16, .028, .034, .19);
        rod(mats.iron, V(side * .77, 1.02, .60), V(side * 1.025, 1.02, .56), .036);
        sphere(paint, side * 1.047, 1.045, .55, .13, .075, .17);
        box(mats.glass, side * 1.05, 1.05, .401, .20, .09, .012);
        wheel(side * .94, -1.40); wheel(side * .94, 1.38);
        box(mats.iron, side * .65, .68, -2.095, .45, .19, .05);
        box(mats.red, side * .65, .70, -2.13, .405, .12, .024);
        box(mats.white, side * .50, .66, -2.143, .105, .055, .025);
        box(mats.iron, side * .61, .62, 2.07, .48, .20, .05);
        box(mats.lamp, side * .61, .65, 2.10, .415, .094, .035);
        box(mats.amber, side * .80, .63, 2.09, .047, .105, .04);
        cylinder(mats.chrome, side * .55, .36, -2.08, .063, .11, new THREE.Euler(Math.PI / 2, 0, 0));
      }
      box(mats.iron, 0, .49, 2.157, .67, .13, .03);
      for (let j = -2; j <= 2; j++) box(mats.chrome, j * .1, .49, 2.18, .018, .08, .012);
      plate(labels.license, 0, .58, -2.205, .40, .16);
      plate(labels.license, 0, .39, 2.19, .40, .16, 0);
    }, lateral > 0 ? Math.PI : 0);
    obstacles.push({ progress, lateral, width: 2.03, length: 4.48, kind: 'car' });
  }
  const parked: [number, number][] = [[148, -5.7], [191, 5.7], [372, -5.7], [420, 5.7], [477, -5.7], [585, 5.7], [630, -5.7], [972, 5.7], [1000, -5.7], [1111, -5.7], [1218, 5.7], [1265, -5.7]];
  parked.forEach(([z, lateral], i) => parkedCar(z, lateral, i, i % 3));

  function cableCar(progress: number, lateral: number, number: Label, collision = true, yaw = 0, lift = 0) {
    at(progress, lateral, () => {
      if (lift) frame.multiply(new THREE.Matrix4().makeTranslation(0, lift, 0));
      // A real open grip-car silhouette: long running boards, enclosed rear
      // saloon, open front benches, barrel roof and raised clerestory.
      box(mats.iron, 0, .37, 0, 1.65, .37, 6.9);
      box(mats.darkWood, 0, .58, 0, 2.40, .22, 8.55);
      for (let x = -1.12; x <= 1.13; x += .15) box(mats.wood, x, .703, 0, .125, .031, 8.36);
      for (const side of [-1, 1]) {
        box(mats.darkWood, side * 1.29, .43, 0, .40, .13, 8.70);
        box(mats.brass, side * 1.47, .49, 0, .025, .025, 8.65);
        for (const z of [-2.68, 2.68]) {
          wheel(side * .94, z, .41, .42);
          box(mats.iron, side * .95, .58, z, .16, .15, 1.28);
          for (let spring = 0; spring < 3; spring++) box(mats.iron, side * 1.07, .46 + spring * .045, z, .10, .025, .86 - spring * .15);
        }
        // Rear saloon: burgundy tongue-and-groove lower panels, ivory rails,
        // deep individual windows, wood mullions and drop-window transoms.
        box(mats.burgundy, side * 1.16, 1.12, -1.83, .12, .80, 4.28);
        for (let z = -3.78; z < .18; z += .22) box(mats.darkWood, side * 1.224, 1.10, z, .018, .64, .013);
        box(mats.cream, side * 1.20, 1.57, -1.83, .12, .10, 4.42);
        box(mats.cream, side * 1.19, 2.95, -1.83, .17, .31, 4.42);
        // Gilded coach lines catch the afternoon sun and make the historical
        // red/ivory livery readable well before the driver reaches the car.
        for (const y of [.77, 1.48]) box(mats.brass, side * 1.231, y, -1.83, .022, .028, 4.31);
        for (let z = -3.60; z < .13; z += .83) {
          box(mats.glass, side * 1.17, 2.20, z, .045, 1.06, .64);
          box(mats.wood, side * 1.21, 2.23, z - .375, .13, 1.25, .085);
          box(mats.wood, side * 1.215, 2.58, z, .09, .045, .73);
          box(mats.brass, side * 1.235, 1.73, z, .025, .023, .16);
          box(mats.darkWood, side * 1.24, 1.10, z, .022, .45, .55);
          box(mats.burgundy, side * 1.256, 1.10, z, .017, .36, .46);
          for (const edge of [-1, 1]) {
            box(mats.brass, side * 1.272, 1.10, z + edge * .237, .016, .39, .018);
            box(mats.brass, side * 1.272, 1.10 + edge * .193, z, .016, .019, .49);
          }
        }
        plate(labels.sideRoute, side * 1.258, 1.34, -1.7, 3.68, .23, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        // Open front benches, slatted backrests and armrest ends.
        for (let slat = 0; slat < 5; slat++) box(mats.wood, side * (.38 + slat * .13), 1.13, 1.84, .10, .065, 2.60);
        for (let slat = 0; slat < 5; slat++) box(mats.wood, side * .34, 1.30 + slat * .115, 1.84, .06, .085, 2.63);
        for (const z of [.58, 3.03]) {
          box(mats.iron, side * .58, .92, z, .09, .39, .09);
          rod(mats.brass, V(side * .94, 1.30, z), V(side * .34, 1.45, z), .026);
        }
        for (const z of [.32, 1.73, 3.22, 4.02]) {
          cylinder(mats.brass, side * 1.10, 1.99, z, .033, 2.56);
          sphere(mats.brass, side * 1.10, 1.17, z, .065, .09, .065);
          box(mats.wood, side * 1.08, 3.00, z, .115, .42, .12);
        }
        rod(mats.brass, V(side * 1.12, 2.77, .38), V(side * 1.12, 2.77, 4.10), .031);
      }
      // Enclosed rear end and its arched glazing; front platform has a low,
      // curved panel so the grip mechanism and brass handrails remain visible.
      loft([[-4.23, 1.0, 1.08, .38], [-4.11, 1.17, 1.08, .39], [-3.96, 1.20, 1.08, .39]], mats.burgundy, 24, .36);
      box(mats.cream, 0, 2.86, -4.09, 2.32, .35, .13);
      box(mats.darkWood, 0, 2.14, -4.075, 2.22, 1.13, .13);
      for (const side of [-1, 1]) {
        box(mats.glass, side * .56, 2.17, -4.155, .94, .91, .022);
        box(mats.wood, side * .56, 2.18, -4.18, .055, .95, .023);
        box(mats.cream, side * 1.135, 2.16, -4.15, .09, 1.20, .11);
      }
      box(mats.wood, 0, 2.14, -4.18, .11, 1.24, .11);
      loft([[3.98, 1.20, 1.08, .35], [4.18, 1.16, 1.08, .35], [4.27, 1.0, 1.08, .31]], mats.burgundy, 24, .36);
      for (const end of [-1, 1]) {
        box(mats.brass, 0, 1.48, end * 4.13, 2.19, .065, .08);
        cylinder(mats.iron, 0, .88, end * 4.35, .14, .11, new THREE.Euler(Math.PI / 2, 0, 0));
        cylinder(mats.lamp, 0, .89, end * 4.415, .105, .023, new THREE.Euler(Math.PI / 2, 0, 0));
        plate(number, 0, 1.24, end * 4.29, .45, .25, end < 0 ? Math.PI : 0);
        plate(labels.route, 0, 2.98, end * 4.39, 2.41, .23, end < 0 ? Math.PI : 0);
        box(mats.iron, 0, .36, end * 4.32, .58, .16, .33);
      }
      // Real plank barrel roof, with rounded eaves and a raised monitor.
      const roofVertices: number[] = [], roofIds: number[] = [];
      for (let row = 0; row <= 4; row++) for (let j = 0; j <= 20; j++) {
        const x = (j / 20 - .5) * 2.82, z = (row / 4 - .5) * 9.05;
        roofVertices.push(x, 3.16 + .25 * (1 - (x / 1.41) ** 2) - .06 * (Math.abs(z) / 4.525) ** 8, z);
        if (row < 4 && j < 20) { const a = row * 21 + j; roofIds.push(a, a + 21, a + 1, a + 1, a + 21, a + 22); }
      }
      const roof = new THREE.BufferGeometry(); roof.setAttribute('position', new THREE.Float32BufferAttribute(roofVertices, 3)); roof.setIndex(roofIds); roof.computeVertexNormals(); emit(roof, mats.darkWood); roof.dispose();
      for (const side of [-1, 1]) {
        box(mats.cream, side * 1.39, 3.15, 0, .07, .13, 8.89);
        box(mats.wood, side * .65, 3.43, -.2, .095, .32, 6.80);
        for (let z = -3.28; z < 3.11; z += .42) box(mats.amber, side * .705, 3.45, z, .02, .15, .28);
      }
      loft([[-3.70, .58, 3.58, .035], [-3.49, .79, 3.58, .085], [3.10, .79, 3.58, .085], [3.36, .57, 3.58, .035]], mats.darkWood, 20, .7);
      box(mats.cream, 0, 3.29, 4.21, 2.13, .11, .13);
      rod(mats.brass, V(0, .75, 3.18), V(0, 1.65, 3.62), .053);
      rod(mats.brass, V(-.34, 1.65, 3.62), V(.34, 1.65, 3.62), .040);
      cylinder(mats.brass, .34, 2.92, 3.39, .16, .13);
      sphere(mats.brass, .34, 2.99, 3.39, .12, .11, .12);
      rod(mats.darkWood, V(.35, 2.87, 3.39), V(.35, 1.77, 3.33), .010);
      // Small interior ceiling lamps, no extra dynamic lights or fake motion.
      for (const z of [-2.9, -.9, 1.0, 2.7]) sphere(mats.lamp, 0, 3.12, z, .14, .055, .14);
    }, yaw);
    if (collision) obstacles.push({ progress, lateral, width: 2.91, length: 9.08, kind: 'cablecar' });
  }
  cableCar(260, 3.1, labels.number28, true, Math.PI);
  cableCar(1050, -3.1, labels.number15);
  cableCar(1357, 2.2, labels.number28, false, .20, .125);

  // Powell–Market's manually turned wooden deck makes the last cable car a
  // destination. The compact turntable fits between existing curbs and lamps.
  // Every terminal object is beyond the race finish; collision rules are intact.
  at(1357, 2.2, () => {
    const rim = new THREE.CylinderGeometry(4.86, 4.86, .072, 64);
    emit(rim, mats.iron, 0, .018, 0); rim.dispose();
    const bed = new THREE.CylinderGeometry(4.75, 4.75, .053, 64);
    emit(bed, mats.darkWood, 0, .049, 0); bed.dispose();
    const saved = frame;
    frame = frame.clone().multiply(new THREE.Matrix4().makeRotationY(.20));
    // Individually cut planks stop exactly at the round edge.
    for (let z = -4.58, i = 0; z < 4.6; z += .23, i++) {
      const width = Math.sqrt(Math.max(.01, 4.69 ** 2 - (Math.abs(z) + .11) ** 2)) * 2;
      box(i % 4 === 0 ? mats.darkWood : mats.wood, 0, .087, z, width, .038, .215);
      for (const side of [-1, 1]) {
        cylinder(mats.iron, side * (width / 2 - .09), .11, z, .017, .008);
      }
    }
    for (const side of [-1, 1]) {
      box(mats.chrome, side * .72, .121, 0, .065, .026, 9.20);
      box(mats.iron, side * .76, .116, 0, .026, .022, 9.24);
    }
    box(mats.iron, 0, .121, 0, .11, .021, 9.2);
    frame = saved;
    const ring = new THREE.TorusGeometry(4.80, .034, 6, 96);
    emit(ring, mats.chrome, 0, .096, 0, V(1, 1, 1), new THREE.Euler(Math.PI / 2, 0, 0)); ring.dispose();
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2;
      cylinder(mats.brass, Math.cos(a) * 4.78, .12, Math.sin(a) * 4.78, .023, .013);
    }
  });
  // A short, gently converging approach ties the turntable to the right track.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 14; i++) {
      const z1 = 1336 + i * 1.12, z2 = z1 + 1.12;
      const u1 = i / 14, u2 = (i + 1) / 14;
      const p1 = sampleRoute(z1), p2 = sampleRoute(z2);
      rod(mats.chrome, V(p1.x + 3.1 - .9 * u1 * u1 + side * .72, p1.y + .065, z1),
        V(p2.x + 3.1 - .9 * u2 * u2 + side * .72, p2.y + .065, z2), .024);
    }
  }
  for (const side of [-1, 1]) for (let z = 1335; z <= 1380; z += 3.2) {
    at(z, side * 8.75, () => {
      cylinder(mats.iron, 0, .54, 0, .075, .77);
      cylinder(mats.iron, 0, .20, 0, .13, .07);
      sphere(mats.brass, 0, .945, 0, .081, .075, .081);
      cylinder(mats.brass, 0, .82, 0, .079, .045);
    }, 0, false);
  }
  at(1345, -9.0, () => {
    cylinder(mats.iron, 0, 1.98, 0, .055, 3.58);
    box(mats.iron, 0, 3.6, 0, 2.73, .80, .09);
    plate(labels.turnaround, 0, 3.6, -.057, 2.69, .74);
    plate(labels.turnaround, 0, 3.6, .057, 2.69, .74, 0);
    box(mats.iron, 0, 2.95, 0, 1.59, .30, .08);
    plate(labels.hallidie, 0, 2.95, -.052, 1.56, .27);
  }, 0, false);

  // Market cuts diagonally across the Powell grid. Its broad transitway and
  // paired rails turn the end of the street into a coherent urban intersection.
  at(1405, 0, () => {
    box(mats.rubber, 0, -.035, 0, 134, .11, 20.2);
    for (const side of [-1, 1]) {
      box(mats.cream, 0, .10, side * 10.45, 134, .23, .25);
      for (const rail of [-.72, .72]) box(mats.chrome, 0, .050, side * 2.3 + rail, 134, .04, .055);
      box(mats.iron, 0, .052, side * 2.3, 134, .035, .10);
      for (let x = -63; x < 64; x += 5.2) box(mats.white, x, .04, side * 6.55, 2.7, .018, .075);
    }
    // Transverse pedestrian crossings and a few centerline reflector studs.
    for (const x of [-12, 12]) for (let z = -8.4; z <= 8.4; z += 1.4) box(mats.white, x, .045, z, 3.15, .019, .64);
    for (let x = -61; x < 64; x += 9.4) box(mats.yellow, x, .058, 0, .11, .025, .075);
  }, .44, false);

  // A modest building across Market closes the central sightline left open by
  // the distant skyline. Its physical window bays match the foreground scale.
  // The 28m frontage sits beyond Flood's rounded Market corner, at z1435.
  at(1435, 0, () => {
    box(mats.cream, 0, 13.45, 6.4, 28, 26.9, 12.8);
    box(mats.darkWood, 0, .83, -.03, 28.2, 1.66, .22);
    for (const y of [1.75, 6.35, 6.77, 23.8, 25.8, 26.7]) box(mats.white, 0, y, -.15, 28.5, .22, .42);
    for (let x = -12; x <= 12; x += 4) {
      box(mats.glass, x, 3.91, -.08, 2.87, 3.55, .08);
      for (const side of [-1, 1]) box(mats.cream, x + side * 1.50, 3.90, -.21, .28, 4.25, .38);
      box(mats.brass, x, 3.91, -.14, .065, 3.50, .04);
      box(mats.brass, x, 4.79, -.14, 2.85, .075, .04);
      for (let floor = 0; floor < 5; floor++) {
        const y = 8.50 + floor * 3.18;
        box(mats.darkWood, x, y, -.096, 2.01, 2.41, .12);
        box(mats.glass, x, y, -.176, 1.80, 2.23, .032);
        box(mats.cream, x, y, -.202, .064, 2.30, .06);
        box(mats.cream, x, y + .29, -.202, 1.84, .075, .06);
        box(mats.white, x, y - 1.27, -.28, 2.26, .16, .40);
        box(mats.white, x, y + 1.28, -.22, 2.18, .14, .26);
      }
    }
    for (let x = -13.8; x <= 14; x += 4.6) box(mats.white, x, 16.25, -.23, .26, 19.0, .31);
    for (let x = -13.5; x < 14; x += .57) box(mats.white, x, 25.39, -.31, .18, .25, .37);
    box(mats.darkWood, 0, 27.10, 6.4, 28.5, .24, 13.2);
    box(mats.cream, 0, 28.50, 8.1, 18.4, 2.7, 8.2);
    box(mats.white, 0, 29.89, 8.1, 19, .20, 8.8);
    plate(labels.marketFront, 0, 6.30, -.405, 7.7, .80);
    for (const side of [-1, 1]) {
      cylinder(mats.iron, side * 11.2, 3.9, -2.4, .071, 7.45);
      rod(mats.iron, V(side * 11.2, 7.5, -2.4), V(side * 9.9, 7.6, -2.4), .05);
      sphere(mats.lamp, side * 9.9, 7.43, -2.4, .19, .20, .19);
    }
  }, 0, false);

  function hydrant() {
    cylinder(mats.iron, 0, .24, 0, .23, .12);
    cylinder(mats.yellow, 0, .57, 0, .16, .62);
    sphere(mats.yellow, 0, .9, 0, .175, .16, .175);
    cylinder(mats.yellow, 0, 1.035, 0, .068, .07);
    for (const side of [-1, 1]) {
      cylinder(mats.yellow, side * .20, .64, 0, .098, .21, new THREE.Euler(0, 0, Math.PI / 2));
      cylinder(mats.brass, side * .31, .64, 0, .091, .055, new THREE.Euler(0, 0, Math.PI / 2));
      rod(mats.iron, V(side * .31, .56, 0), V(side * .16, .43, -.01), .013);
    }
  }
  function newspaper(which: Label, color: THREE.Material) {
    box(mats.iron, 0, .34, 0, .32, .55, .30);
    box(mats.iron, 0, .16, 0, .56, .08, .50);
    box(color, 0, .87, 0, .58, .63, .46);
    box(color, 0, 1.22, 0, .62, .10, .51);
    box(mats.white, 0, .82, -.244, .42, .39, .023);
    plate(which, 0, 1.06, -.26, .50, .125);
    for (let j = 0; j < 6; j++) box(mats.iron, -.015, .90 - j * .045, -.261, .31, .009, .012);
    box(mats.iron, .21, .74, -.275, .025, .10, .023);
    box(mats.chrome, .16, 1.09, -.28, .056, .073, .025);
  }
  function bin(mat: THREE.Material, l: Label) {
    box(mat, 0, .72, 0, .57, 1.06, .64);
    box(mats.iron, 0, 1.29, 0, .63, .12, .70);
    box(mats.iron, 0, 1.2, .32, .42, .08, .1);
    for (const side of [-1, 1]) cylinder(mats.rubber, side * .26, .25, .26, .10, .06, new THREE.Euler(0, 0, Math.PI / 2));
    plate(l, 0, .88, -.331, .44, .14);
    for (const x of [-.18, .18]) box(mat, x, .71, -.336, .035, .70, .02);
  }
  function meter() {
    cylinder(mats.iron, 0, .96, 0, .045, 1.58);
    cylinder(mats.iron, 0, .21, 0, .075, .16);
    sphere(mats.iron, 0, 1.75, 0, .16, .23, .12);
    box(mats.iron, 0, 1.62, 0, .31, .25, .21);
    box(mats.glass, 0, 1.76, -.118, .19, .105, .020);
    box(mats.chrome, 0, 1.62, -.118, .14, .013, .020);
    box(mats.chrome, .07, 1.54, -.119, .04, .04, .020);
  }
  function signal() {
    cylinder(mats.iron, 0, 2.9, 0, .075, 5.50);
    cylinder(mats.iron, 0, .34, 0, .15, .35);
    rod(mats.iron, V(0, 4.73, 0), V(-1.1, 4.73, 0), .057);
    box(mats.yellow, -1.03, 4.44, 0, .42, 1.21, .25);
    box(mats.iron, -1.03, 4.44, -.149, .32, 1.11, .095);
    for (let j = 0; j < 3; j++) {
      cylinder(j === 0 ? mats.red : mats.glass, -1.03, 4.78 - j * .34, -.208, .107, .022, new THREE.Euler(Math.PI / 2, 0, 0));
      // The cylindrical hoods are open, exposing the lenses from below.
      const hood = new THREE.CylinderGeometry(.126, .126, .20, 12, 1, true, 0, Math.PI * 1.4);
      emit(hood, mats.iron, -1.03, 4.80 - j * .34, -.29, V(1, 1, 1), new THREE.Euler(Math.PI / 2, 0, Math.PI * .8)); hood.dispose();
    }
    box(mats.iron, .28, 2.95, -.08, .43, .51, .19);
    plate(labels.walk, .28, 2.97, -.184, .34, .29);
    box(mats.yellow, 0, 1.24, -.09, .12, .21, .10);
    cylinder(mats.chrome, 0, 1.26, -.152, .035, .02, new THREE.Euler(Math.PI / 2, 0, 0));
  }
  const crosses: [number, Label][] = [[95, labels.pine], [315, labels.bush], [550, labels.sutter], [710, labels.post], [920, labels.geary], [1180, labels.ellis], [1312, labels.market]];
  crosses.forEach(([z, cross], i) => {
    for (const side of [-1, 1]) at(z + (side > 0 ? 11 : -11), side * 8.12, () => {
      signal();
      box(mats.iron, .05, 5.68, 0, 2.32, .49, .07);
      plate(cross, .05, 5.68, -.049, 2.29, .44);
      plate(cross, .05, 5.68, .049, 2.29, .44, 0);
      box(mats.iron, 0, 5.15, .1, .07, .43, 2.04);
      plate(labels.powell, -.047, 5.15, .1, 2.02, .40, -Math.PI / 2);
      plate(labels.powell, .047, 5.15, .1, 2.02, .40, Math.PI / 2);
      if (i % 2 === 0) plate(labels.cableStop, 0, 3.73, .09, .45, .62, 0);
    }, side > 0 ? Math.PI : 0, false);
  });

  // Street details sit entirely on the narrow sidewalks, clear of landmark
  // footprints and the Union Square plaza. They are intentionally human scale.
  for (const [z, side] of [[172, -1], [391, 1], [462, -1], [602, -1], [979, 1], [1136, 1], [1244, 1]]) {
    at(z, side * 7.95, hydrant, 0, false);
  }
  for (const [z, side] of [[150, -1], [193, 1], [374, -1], [422, 1], [479, -1], [587, 1], [632, -1], [974, 1], [1002, -1], [1113, -1], [1220, 1], [1267, -1]]) {
    at(z + 2.9, side * 7.95, meter, side > 0 ? Math.PI / 2 : -Math.PI / 2, false);
  }
  for (const [z, side] of [[120, -1], [341, 1], [517, -1], [954, 1], [1145, -1]]) {
    at(z, side * 9.1, () => newspaper(labels.chronicle, mats.blue), side > 0 ? Math.PI / 2 : -Math.PI / 2, false);
    at(z + .80, side * 9.1, () => newspaper(labels.examiner, mats.burgundy), side > 0 ? Math.PI / 2 : -Math.PI / 2, false);
    at(z + 3.10, side * 9.15, () => bin(mats.blue, labels.recycling), side > 0 ? Math.PI / 2 : -Math.PI / 2, false);
    at(z + 3.87, side * 9.15, () => bin(mats.green, labels.compost), side > 0 ? Math.PI / 2 : -Math.PI / 2, false);
  }
  for (const [z, side] of [[300, -1], [537, 1], [1170, 1]]) {
    for (let i = 0; i < 5; i++) at(z - i * 1.9, side * 7.65, () => {
      cylinder(mats.iron, 0, .19, 0, .11, .05);
      cylinder(mats.orange, 0, .61, 0, .045, .85);
      for (const y of [.72, .88]) cylinder(mats.white, 0, y, 0, .049, .06);
    });
  }
  for (const [z, side] of [[186, -1], [405, 1], [596, -1], [992, 1], [1152, -1]]) {
    at(z, side * 8.45, () => {
      cylinder(mats.iron, 0, 3.55, 0, .052, 6.8);
      rod(mats.iron, V(-.03, 6.64, 0), V(.97, 6.64, 0), .026);
      plate(labels.bay, .51, 5.48, -.01, .91, 2.22);
      rod(mats.iron, V(-.03, 4.29, 0), V(.97, 4.29, 0), .026);
    }, side < 0 ? .15 : -.15, false);
  }

  function cafe() {
    cylinder(mats.darkWood, 0, .76, 0, .49, .07);
    cylinder(mats.iron, 0, .48, 0, .047, .53);
    for (let j = 0; j < 3; j++) {
      const a = j * Math.PI * 2 / 3;
      rod(mats.iron, V(0, .48, 0), V(Math.cos(a) * .34, .20, Math.sin(a) * .34), .027);
    }
    for (const side of [-1, 1]) {
      const z = side * .83;
      cylinder(mats.wood, 0, .61, z, .28, .048);
      for (const dx of [-.20, .20]) for (const dz of [-.16, .16]) rod(mats.iron, V(dx, .60, z + dz), V(dx * 1.2, .18, z + dz * 1.3), .025);
      for (const dx of [-.24, .24]) rod(mats.iron, V(dx, .61, z + side * .16), V(dx, 1.14, z + side * .24), .026);
      for (const yy of [.89, 1.03, 1.13]) box(mats.wood, 0, yy, z + side * .24, .48, .07, .042);
    }
    cylinder(mats.cream, .16, .827, .09, .035, .085);
    cylinder(mats.cream, -.18, .827, -.10, .035, .085);
  }
  for (const [z, side] of [[351, -1], [356, -1], [445, 1], [450, 1], [1029, 1], [1034, 1]]) {
    at(z, side * 9.77, cafe, 0, false);
  }

  // A Muni bus glimpsed across Sutter, with a rounded coach body, wraparound
  // glazing and unmistakable red/ivory livery. It stays out of the racing lane.
  at(550, 23, () => {
    loft([[-5.15, .9, 1.52, 1.03], [-4.95, 1.21, 1.52, 1.06], [4.38, 1.21, 1.52, 1.06], [4.93, 1.1, 1.53, 1.01], [5.1, .95, 1.53, .95]], mats.cream, 28, .22);
    box(mats.muniRed, 0, .91, 0, 2.445, .58, 9.9);
    box(mats.iron, 0, .48, 0, 2.25, .17, 9.88);
    for (const side of [-1, 1]) {
      box(mats.muniRed, side * 1.223, 2.495, 0, .034, .16, 9.77);
      for (let z = -4.36; z < 3.8; z += .94) {
        box(mats.iron, side * 1.225, 1.96, z, .025, 1.00, .86);
        box(mats.glass, side * 1.241, 1.98, z, .013, .87, .78);
        box(mats.chrome, side * 1.25, 2.16, z, .016, .024, .78);
      }
      for (const z of [-3.20, 3.20]) wheel(side * 1.14, z, .48, .49);
      plate(labels.muni, side * 1.24, 1.04, -.80, 1.8, .39, side > 0 ? Math.PI / 2 : -Math.PI / 2);
      for (const z of [-4.65, 4.65]) sphere(mats.amber, side * 1.22, .94, z, .025, .05, .08);
    }
    box(mats.glass, 0, 2.0, 5.019, 1.93, .75, .038);
    box(mats.iron, 0, 2.012, 5.049, .055, .79, .024);
    plate(labels.bus, 0, 2.47, 5.04, 1.95, .23, 0);
    plate(labels.bus, 1.255, 2.38, 3.86, 1.45, .19, Math.PI / 2);
    for (const side of [-1, 1]) {
      box(mats.iron, side * .77, 1.16, 5.04, .33, .29, .04);
      for (const dx of [-.078, .078]) cylinder(mats.lamp, side * .77 + dx, 1.17, 5.069, .057, .02, new THREE.Euler(Math.PI / 2, 0, 0));
      cylinder(mats.red, side * .86, 1.06, -5.122, .09, .025, new THREE.Euler(Math.PI / 2, 0, 0));
      rod(mats.iron, V(side * 1.1, 2.28, 4.77), V(side * 1.51, 2.26, 4.96), .032);
      box(mats.iron, side * 1.53, 2.18, 4.96, .12, .29, .11);
    }
    box(mats.white, 0, 2.76, -1.25, 1.64, .32, 3.5);
    for (let z = -2.50; z < .40; z += .21) box(mats.iron, .83, 2.75, z, .02, .16, .04);
    box(mats.iron, 0, .68, 5.03, 1.9, .15, .15);
  }, -Math.PI / 2, false);

  for (const [material, geometries] of parts) {
    const geometry = mergeGeometries(geometries, false)!;
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name || 'Street / detail';
    mesh.receiveShadow = true;
    mesh.castShadow = material !== labelMaterial && material !== mats.lamp && material !== mats.red && material !== mats.amber;
    group.add(mesh); geometries.forEach(g => g.dispose());
  }
  unitBox.dispose(); unitCylinder.dispose(); unitSphere.dispose();
  return {
    obstacles,
    tourObstacles: [{ progress: 1357, lateral: 2.2, width: 4.7, length: 9.5, kind: 'cablecar' }],
    update(_time: number, _progress: number) { /* Parked vehicles and their wheels remain stationary. */ },
    setQuality(low: boolean) { group.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = !low && object.material !== labelMaterial; }); },
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type CarState = { speed: number; steer: number; braking: boolean; boosting: boolean; time: number };
type Section = [z: number, width: number, center: number, height: number];

/** A small, original coachbuilt coupe. All geometry is local; +Z is forward. */
export function createCar(): { group: THREE.Group; update: (dt: number, state: CarState) => void } {
  const group = new THREE.Group();
  group.name = 'Scarlet coupe';
  const body = new THREE.Group();
  group.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf12c18, metalness: .18, roughness: .25, clearcoat: .7, clearcoatRoughness: .20 });
  const roofPaint = paint;
  const dark = new THREE.MeshStandardMaterial({ color: 0x11131b, roughness: .6, metalness: .3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xaab1bd, metalness: .85, roughness: .24 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x184762, metalness: .48, roughness: .16, clearcoat: 1 });
  const redLight = new THREE.MeshStandardMaterial({ color: 0xff2338, emissive: 0xff1630, emissiveIntensity: .55, roughness: .25 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xfff5d2, emissive: 0xffedc2, emissiveIntensity: .7 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffb345, emissive: 0xff8f27, emissiveIntensity: .7 });

  function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = body) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) {
    const m = mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), mat);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }
  function loft(sections: Section[], mat: THREE.Material) {
    const verts: number[] = [], indices: number[] = [], sides = 24;
    for (const [z, width, center, height] of sections) {
      for (let j = 0; j <= sides; j++) {
        const t = j / sides * Math.PI * 2;
        verts.push(Math.cos(t) * width, center + Math.sin(t) * height, z);
      }
    }
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    // Close both ends, including a smoothly tapered nose and tail.
    for (const [index, flip] of [[0, true], [sections.length - 1, false]] as const) {
      const center = verts.length / 3;
      verts.push(0, sections[index][2], sections[index][0]);
      for (let j = 0; j < sides; j++) {
        const a = index * (sides + 1) + j;
        indices.push(center, flip ? a + 1 : a, flip ? a : a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return mesh(geo, mat);
  }

  loft([
    [-2.08, .69, .52, .14], [-1.96, .86, .54, .21], [-1.65, .94, .57, .25],
    [-1.22, .96, .58, .30], [-.72, .9, .58, .25], [0, .86, .55, .25],
    [.7, .9, .54, .25], [1.2, .94, .54, .30], [1.65, .89, .51, .26],
    [1.94, .76, .46, .17], [2.08, .58, .44, .10],
  ], paint);
  // Deep sill and splitter separate the red bodywork from the street.
  box(1.57, .105, 3.55, dark, 0, .285, 0);
  box(1.68, .09, .21, dark, 0, .285, 1.83);
  box(1.56, .105, .2, dark, 0, .32, -1.92);
  const cabinSections: Section[] = [
    [-1.04, .7, .77, .04], [-.74, .71, .87, .19], [-.45, .65, .98, .32],
    [-.18, .65, 1, .32], [.26, .62, .98, .31], [.57, .7, .87, .17], [.86, .74, .77, .02],
  ];
  loft(cabinSections, glass);

  // Rounded sheet-metal roof, left and right gutters, and narrow window pillars.
  const roofVerts: number[] = [], roofIndices: number[] = [];
  for (let row = 0; row <= 5; row++) {
    const z = -.45 + row / 5 * .71;
    const nextIndex = cabinSections.findIndex(section => section[0] >= z);
    const end = cabinSections[nextIndex], start = cabinSections[Math.max(0, nextIndex - 1)];
    const fraction = (z - start[0]) / (end[0] - start[0]);
    const width = THREE.MathUtils.lerp(start[1], end[1], fraction);
    const center = THREE.MathUtils.lerp(start[2], end[2], fraction);
    const height = THREE.MathUtils.lerp(start[3], end[3], fraction);
    for (let col = 0; col <= 12; col++) {
      const t = (col / 12 - .5) * 1.48;
      const x = Math.sin(t) * .67;
      // Follow the glass loft with positive clearance; a flat cap intersects it.
      roofVerts.push(x, center + height * Math.sqrt(1 - (x / width) ** 2) + .017, z);
    }
  }
  for (let r = 0; r < 5; r++) for (let c = 0; c < 12; c++) {
    const a = r * 13 + c;
    roofIndices.push(a, a + 13, a + 1, a + 1, a + 13, a + 14);
  }
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofVerts, 3));
  roofGeo.setIndex(roofIndices);
  roofGeo.computeVertexNormals();
  mesh(roofGeo, roofPaint);
  for (const side of [-1, 1]) {
    rod(new THREE.Vector3(side * .45, 1.21, .26), new THREE.Vector3(side * .76, .78, .86), .033, paint);
    rod(new THREE.Vector3(side * .45, 1.23, -.45), new THREE.Vector3(side * .75, .78, -1.04), .053, paint);
    rod(new THREE.Vector3(side * .62, 1.085, -.22), new THREE.Vector3(side * .78, .77, -.22), .024, dark);
    rod(new THREE.Vector3(side * .75, .79, -1), new THREE.Vector3(side * .75, .79, .78), .022, paint);
    box(.026, .026, .19, metal, side * .855, .68, -.19);
    box(.13, .045, .085, dark, side * .88, .81, .53);
    const mirror = mesh(new THREE.SphereGeometry(1, 12, 8), paint, side * .995, .835, .5);
    mirror.scale.set(.145, .075, .12);
    box(.2, .07, .012, metal, side * .995, .836, .398);
  }

  // Flat rear light bar, recessed rear panel, six engine cooling slots.
  box(1.55, .205, .08, dark, 0, .585, -2.022);
  box(1.45, .054, .09, redLight, 0, .62, -2.073);
  box(.19, .092, .08, redLight, -.66, .60, -2.075);
  box(.19, .092, .08, redLight, .66, .60, -2.075);
  for (let i = 0; i < 6; i++) box(1.0 - Math.abs(i - 2.5) * .055, .012, .036, dark, 0, .81 - i * .006, -1.2 - i * .095);
  const ducktail = box(1.63, .064, .18, paint, 0, .778, -1.91);
  ducktail.rotation.x = -.14;
  for (const x of [-.60, .60]) {
    const exhaust = mesh(new THREE.CylinderGeometry(.065, .065, .18, 12, 1, true), metal, x, .29, -1.99);
    exhaust.rotation.x = Math.PI / 2;
    const inside = mesh(new THREE.CircleGeometry(.05, 12), dark, x, .29, -2.085);
    inside.rotation.y = Math.PI;
  }
  // Small original rear plate reads cleanly from the chase camera.
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 512; plateCanvas.height = 160;
  const pc = plateCanvas.getContext('2d');
  if (pc) {
    pc.fillStyle = '#e7e6dc'; pc.fillRect(0, 0, 512, 160);
    pc.strokeStyle = '#74808b'; pc.lineWidth = 10; pc.strokeRect(6, 6, 500, 148);
    pc.fillStyle = '#233247'; pc.textAlign = 'center'; pc.font = 'bold 63px monospace'; pc.fillText('CITY RUN', 256, 109);
    const map = new THREE.CanvasTexture(plateCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const plate = mesh(new THREE.PlaneGeometry(.46, .144), new THREE.MeshStandardMaterial({ map, roughness: .5 }), 0, .415, -2.101);
    plate.rotation.y = Math.PI;
  }

  for (const x of [-.64, .64]) {
    const bezel = mesh(new THREE.TorusGeometry(.16, .024, 8, 24), metal, x, .664, 1.823);
    bezel.rotation.x = -.44;
    const lens = mesh(new THREE.CircleGeometry(.145, 24), headlight, x, .67, 1.84);
    lens.rotation.x = -.44;
    box(.20, .04, .024, amber, x, .398, 1.991);
  }
  box(.93, .13, .027, dark, 0, .395, 2.032);
  for (let i = -3; i <= 3; i++) box(.018, .11, .034, metal, i * .11, .396, 2.048);

  const wheelSpin: THREE.Group[] = [], wheelSteer: THREE.Group[] = [];
  const tireGeo = new THREE.TorusGeometry(.267, .077, 10, 24);
  tireGeo.rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(.218, .218, .08, 24);
  rimGeo.rotateZ(Math.PI / 2);
  const sidewallGeo = new THREE.CylinderGeometry(.302, .302, .16, 24);
  sidewallGeo.rotateZ(Math.PI / 2);
  for (const z of [-1.23, 1.22]) for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * .915, .345, z); group.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin); wheelSpin.push(spin);
    if (z > 0) wheelSteer.push(pivot);
    mesh(sidewallGeo, rubber, 0, 0, 0, spin);
    mesh(tireGeo, rubber, side * .018, 0, 0, spin);
    mesh(rimGeo, dark, side * .074, 0, 0, spin);
    const ring = mesh(new THREE.TorusGeometry(.207, .018, 6, 24), metal, side * .119, 0, 0, spin);
    ring.rotation.y = Math.PI / 2;
    for (let spoke = 0; spoke < 5; spoke++) {
      const t = spoke / 5 * Math.PI * 2;
      const s = box(.028, .19, .043, metal, side * .122, Math.cos(t) * .095, Math.sin(t) * .095, spin);
      s.rotation.x = t;
    }
    const hub = mesh(new THREE.CylinderGeometry(.051, .051, .035, 12), metal, side * .133, 0, 0, spin);
    hub.rotation.z = Math.PI / 2;
  }

  // Bake only pieces that are rigid relative to the same parent. The body
  // keeps its suspension motion, every wheel keeps its spin/steering pivots,
  // and the moving wheels keep their independent steering and spin.
  const sourceGeometries = new Set<THREE.BufferGeometry>();
  function mergeRigidParts(parent: THREE.Group, name: string) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.material.transparent) continue;
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material)!.push(child);
    }
    for (const [material, pieces] of batches) {
      if (pieces.length === 1) continue;
      const geometries = pieces.map(piece => {
        piece.updateMatrix();
        const geometry = piece.geometry.clone().applyMatrix4(piece.matrix);
        // Lofted panels have no UVs; untextured zero UVs let them share paint
        // with primitives without modifying the original vertex normals.
        if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        if (flat !== geometry) geometry.dispose();
        sourceGeometries.add(piece.geometry);
        return flat;
      });
      const geometry = mergeGeometries(geometries, false)!;
      geometry.computeBoundingSphere(); geometry.computeBoundingBox();
      const merged = new THREE.Mesh(geometry, material);
      merged.name = `Scarlet coupe / ${name} / ${material.type}`;
      merged.castShadow = pieces[0].castShadow; merged.receiveShadow = pieces[0].receiveShadow;
      for (const piece of pieces) parent.remove(piece);
      parent.add(merged);
      geometries.forEach(part => part.dispose());
    }
  }
  mergeRigidParts(body, 'body');
  wheelSpin.forEach((wheel, i) => mergeRigidParts(wheel, `wheel ${i + 1}`));
  // Some tire primitives are shared by all four wheels. Dispose them only
  // after every wheel has been baked, and keep any unmerged geometry alive.
  group.traverse(object => { if (object instanceof THREE.Mesh) sourceGeometries.delete(object.geometry); });
  sourceGeometries.forEach(geometry => geometry.dispose());

  return {
    group,
    update(dt, state) {
      for (const wheel of wheelSpin) wheel.rotation.x += state.speed * dt / .345;
      for (const front of wheelSteer) front.rotation.y = state.steer * .43;
      body.position.y = Math.sin(state.time * 26) * Math.min(Math.abs(state.speed) / 100, .016);
      redLight.emissiveIntensity = state.braking ? 2.5 : .55;
      paint.emissive.setHex(state.boosting ? 0x26050a : 0x000000);
    },
  };
}

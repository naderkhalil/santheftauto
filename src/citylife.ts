import * as THREE from 'three';
import { sampleRoute } from './route';

type Batch = { geometry: THREE.BufferGeometry; records: { matrix: THREE.Matrix4; color: THREE.Color }[]; mesh?: THREE.InstancedMesh };
type Person = {
  x: number; z: number; yaw: number; height: number; phase: number; sidewalk: boolean;
  walking: boolean; pose: 'rest' | 'phone' | 'wave'; coat: boolean; backpack: boolean; umbrella: boolean;
  jacket: string; trousers: string; skin: string; hair: string;
  slots: Map<string, number[]>;
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Low-cost, original articulated people and gulls. All people stay off the course. */
export function createCityLife(scene: THREE.Scene): {
  update: (time: number, progress: number) => void;
  setQuality: (low: boolean) => void;
} {
  const group = new THREE.Group(); group.name = 'City life / residents, spectators and bay gulls'; scene.add(group);
  const cloth = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .88, metalness: .015 });
  const wingMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85, side: THREE.DoubleSide });
  const batches = new Map<string, Batch>();
  const sphere = new THREE.SphereGeometry(1, 10, 6);
  const capsule = new THREE.CapsuleGeometry(.5, 1, 2, 8);
  const hair = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, 1.82);
  const shoe = new THREE.BoxGeometry(1, 1, 1);
  function torsoGeometry() {
    const positions: number[] = [], indices: number[] = [];
    const rings = [[0, .155, .103], [.08, .172, .113], [.34, .188, .12], [.52, .218, .126], [.60, .13, .083]];
    for (const [y, w, d] of rings) for (let j = 0; j <= 12; j++) {
      const a = j / 12 * Math.PI * 2;
      positions.push(Math.cos(a) * w, y, Math.sin(a) * d);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 12; j++) {
      const a = i * 13 + j; indices.push(a, a + 13, a + 1, a + 1, a + 13, a + 14);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
  }
  function umbrellaGeometry() {
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let row = 0; row <= 4; row++) for (let j = 0; j <= 24; j++) {
      const a = j / 24 * Math.PI * 2, r = row / 4 * .67;
      positions.push(Math.cos(a) * r, .24 * (1 - (r / .67) ** 2) - (row === 4 && j % 2 ? .022 : 0), Math.sin(a) * r);
      const shade = j % 4 < 2 ? 1 : .81; colors.push(shade, shade, shade);
      if (row < 4 && j < 24) { const n = row * 25 + j; indices.push(n, n + 1, n + 25, n + 1, n + 26, n + 25); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
  }
  function gullWingGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .08, .29, 0, .12, .64, 0, -.02, .85, 0, -.26, .66, 0, -.23, .27, 0, -.12, 0, 0, -.09], 3));
    geo.setIndex([0, 1, 5, 0, 5, 6, 1, 2, 5, 2, 4, 5, 2, 3, 4]); geo.computeVertexNormals(); return geo;
  }
  const geometryCatalog: Record<string, THREE.BufferGeometry> = {
    silhouette: torsoGeometry(), limbs: capsule, rounded: sphere, hair, accessories: shoe,
    umbrellas: umbrellaGeometry(), wings: gullWingGeometry(),
  };
  for (const [name, geometry] of Object.entries(geometryCatalog)) batches.set(name, { geometry, records: [] });
  const umbrellaMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .82, vertexColors: true, side: THREE.DoubleSide });

  let constructing = true;
  const touched = new Set<THREE.InstancedMesh>();
  const identityScale = V(1, 1, 1);
  function part(person: Person, cursors: Map<string, number>, root: THREE.Matrix4, name: string, color: string,
    position: THREE.Vector3, scale: THREE.Vector3, rotation = new THREE.Quaternion()) {
    const batch = batches.get(name)!;
    const matrix = new THREE.Matrix4().compose(position, rotation, scale).premultiply(root);
    const cursor = cursors.get(name) ?? 0; cursors.set(name, cursor + 1);
    if (constructing) {
      if (!person.slots.has(name)) person.slots.set(name, []);
      person.slots.get(name)!.push(batch.records.length);
      batch.records.push({ matrix, color: new THREE.Color(color) });
    } else {
      const mesh = batch.mesh!, index = person.slots.get(name)![cursor];
      mesh.setMatrixAt(index, matrix); touched.add(mesh);
    }
  }
  function drawPerson(person: Person, time: number) {
    const t = time * .135 + person.phase;
    const walkZ = person.walking ? Math.sin(t) * 3.1 : 0;
    const walkX = person.walking ? Math.cos(t) * .22 : 0;
    const z = person.z + walkZ;
    const yaw = person.walking ? Math.atan2(-Math.sin(t) * .22, Math.cos(t) * 3.1) : person.yaw;
    const p = sampleRoute(z), y = p.y + (person.sidewalk ? .20 : .34);
    const x = person.x + (person.sidewalk ? p.x : 0) + walkX;
    const size = person.height / 1.82;
    const root = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(size, size, size));
    const cursor = new Map<string, number>();
    const add = (name: string, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation?: THREE.Quaternion) =>
      part(person, cursor, root, name, color, V(x, y, z), V(sx, sy, sz), rotation);
    const bone = (color: string, a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const center = a.clone().add(b).multiplyScalar(.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      part(person, cursor, root, 'limbs', color, center, V(radius * 2, a.distanceTo(b) / 2, radius * 2), q);
    };
    const cadence = person.walking ? Math.sin(time * 3.3 + person.phase) * Math.abs(Math.cos(t)) : 0;
    const bob = person.walking ? Math.abs(cadence) * .012 : 0;
    add('silhouette', person.jacket, 0, .85 + bob - (person.coat ? .15 : 0), 0, person.coat ? 1.07 : 1, person.coat ? 1.26 : 1, 1.02);
    add('rounded', person.trousers, 0, .875 + bob, -.013, .163, .14, .11);
    bone(person.skin, V(0, 1.43 + bob, 0), V(0, 1.56 + bob, .003), .05);
    add('rounded', person.skin, 0, 1.652 + bob, .007, .116, .151, .115);
    add('hair', person.hair, 0, 1.68 + bob, -.009, .12, .142, .118);
    add('rounded', person.skin, 0, 1.645 + bob, .118, .025, .029, .029);
    for (const side of [-1, 1]) {
      add('rounded', person.skin, side * .114, 1.646 + bob, .005, .023, .038, .019);
      const stride = cadence * side * .20;
      const ankleLift = person.walking ? Math.max(0, cadence * side) * .055 : 0;
      const hip = V(side * .104, .865 + bob, -.005), knee = V(side * .112, .46 + ankleLift * .55, .016 + stride * .42);
      const ankle = V(side * .12, .10 + ankleLift, stride);
      bone(person.trousers, hip, knee, .077); bone(person.trousers, knee, ankle, .058);
      add('rounded', '#272a2b', side * .12, .054 + ankleLift, stride + .055, .067, .053, .137);
      const shoulder = V(side * .205, 1.365 + bob, 0);
      let elbow = V(side * .25, 1.11 + bob, .026 - stride * .50);
      let wrist = V(side * .252, .922 + bob, .09 - stride);
      if (person.pose === 'phone') {
        elbow = V(side * .23, 1.145 + bob, .19); wrist = V(side * .065, 1.355 + bob, .345);
      } else if (person.pose === 'wave' && side === 1) {
        elbow = V(.32, 1.64, .045); wrist = V(.33, 1.91, .09);
      }
      if (person.umbrella && side === 1) { elbow = V(.28, 1.15 + bob, .10); wrist = V(.20, 1.42 + bob, .17); }
      bone(person.jacket, shoulder, elbow, .074); bone(person.jacket, elbow, wrist, .057);
      add('rounded', person.skin, wrist.x, wrist.y, wrist.z, .043, .066, .036);
    }
    if (person.pose === 'phone') add('accessories', '#262b2c', 0, 1.395 + bob, .366, .069, .135, .013);
    if (person.coat) {
      // A lapel and scarf break up the upper body and distinguish coat silhouettes.
      bone('#aaa18a', V(-.061, 1.40, .092), V(.052, 1.14, .142), .036);
    }
    if (person.backpack) {
      add('rounded', '#3e4644', 0, 1.175 + bob, -.163, .147, .207, .094);
      for (const side of [-1, 1]) bone('#3a4140', V(side * .133, 1.415, .047), V(side * .139, 1.052, .10), .022);
    }
    if (person.umbrella) {
      add('umbrellas', person.jacket, .20, 2.02 + bob, .17, 1, 1, 1);
      bone('#898b82', V(.20, 1.39, .17), V(.20, 2.26 + bob, .17), .013);
      add('rounded', '#303634', .20, 2.276 + bob, .17, .023, .048, .023);
    }
  }

  const coats = ['#596064', '#8a7c65', '#344247', '#586457', '#6c4a44', '#52526a', '#ada38e', '#30373e'];
  const trousers = ['#303943', '#424648', '#4f5351', '#455368', '#3a3432'];
  const skins = ['#bd886a', '#d0a080', '#8e5d45', '#684936', '#b17c58', '#d5ad90'];
  const hairs = ['#34302b', '#242725', '#6a5946', '#40352c', '#86837b'];
  const people: Person[] = [];
  function person(x: number, z: number, sidewalk = true, options: Partial<Person> = {}) {
    const i = people.length;
    people.push({
      x, z, sidewalk, yaw: sidewalk ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : (i * 1.84) % (Math.PI * 2),
      height: 1.65 + (i * 17 % 23) / 100, phase: i * 1.731,
      jacket: coats[i % coats.length], trousers: trousers[i % trousers.length], skin: skins[i % skins.length], hair: hairs[i % hairs.length],
      walking: false, pose: i % 7 === 0 ? 'phone' : 'rest', coat: i % 4 === 1, backpack: i % 5 === 2, umbrella: i % 11 === 4,
      slots: new Map(), ...options,
    });
  }
  // Sparse pairs leave room to read the storefronts. Watchers face the race;
  // walkers follow short, smooth loops contained within the sidewalk width.
  for (const [x, z] of [[-9.1, 80], [-9.3, 82], [9.1, 132], [9.1, 134.4], [-9.2, 236],
    [9.2, 351], [9.3, 353], [-9.1, 444], [-9.2, 447], [9.1, 598], [9.35, 601],
    [-9.1, 673], [-9.3, 675], [9.15, 785], [9.15, 787.2], [-9.0, 846], [-9.3, 848],
    [9.1, 960], [9.3, 962], [-9.2, 1130], [9.3, 1234], [9.1, 1236.3]]) person(x, z);
  person(-9.3, 180, true, { walking: true, pose: 'rest', umbrella: false });
  person(9.3, 455, true, { walking: true, pose: 'rest', backpack: true, umbrella: false });
  person(-9.25, 1008, true, { walking: true, pose: 'rest', umbrella: false });
  person(9.25, 1160, true, { walking: true, pose: 'rest', umbrella: false });
  // The square uses absolute X coordinates. Positions avoid the two entrance
  // staircases, raised planted rooms, monument steps, palm rings and café seats.
  for (const [x, z] of [[44, 747], [46, 748.4], [52, 751], [72, 753], [73.2, 754.5],
    [33, 777], [35, 778], [25, 805], [26.4, 806], [41, 829], [42.3, 830],
    [78, 842], [80, 843], [52, 872], [53.4, 873.5], [71, 894]]) person(x, z, false, { umbrella: false });
  person(21, 821, false, { walking: true, pose: 'rest', umbrella: false });
  person(45, 856, false, { walking: true, pose: 'rest', umbrella: false });
  people[14].pose = 'wave'; people[18].pose = 'phone';
  people.forEach(p => drawPerson(p, 0));

  // Small articulated gulls fly above the plaza, not near the driver's view.
  // Their white bodies and tapered wings use the same instance-color strategy.
  const gulls = [0, 1, 2].map(i => ({
    x: 0, z: 0, sidewalk: false, yaw: 0, height: 1, phase: i * 2.3,
    walking: false, pose: 'rest' as const, coat: false, backpack: false, umbrella: false,
    jacket: '', trousers: '', skin: '', hair: '', slots: new Map<string, number[]>(),
  }));
  function drawGull(gull: Person, i: number, time: number) {
    const a = time * (.065 + i * .006) + gull.phase;
    const x = 59 + Math.cos(a) * (28 + i * 4), z = 813 + Math.sin(a) * (48 + i * 7);
    const y = sampleRoute(z).y + 28 + i * 4 + Math.sin(a * 2) * 1.4;
    const yaw = Math.atan2(-Math.sin(a) * (28 + i * 4), Math.cos(a) * (48 + i * 7));
    const root = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -.13)), identityScale);
    const cursor = new Map<string, number>();
    part(gull, cursor, root, 'rounded', '#dadcd6', V(0, 0, 0), V(.10, .115, .31));
    part(gull, cursor, root, 'rounded', '#ebece4', V(0, .08, .25), V(.081, .076, .10));
    part(gull, cursor, root, 'rounded', '#b6a269', V(0, .063, .359), V(.022, .019, .061));
    const flap = Math.sin(time * 3.35 + i) * .22 + .10;
    for (const side of [-1, 1]) {
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), side < 0 ? Math.PI - flap : flap);
      part(gull, cursor, root, 'wings', '#cdd2d0', V(side * .04, .033, -.015), identityScale, q);
    }
  }
  gulls.forEach((gull, i) => drawGull(gull, i, 0));
  for (const [name, batch] of batches) {
    if (!batch.records.length) continue;
    const material = name === 'umbrellas' ? umbrellaMaterial : name === 'wings' ? wingMaterial : cloth;
    const mesh = new THREE.InstancedMesh(batch.geometry, material, batch.records.length);
    mesh.name = `City life / ${name}`;
    batch.records.forEach(({ matrix, color }, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color); });
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = name !== 'wings'; mesh.receiveShadow = true;
    // All actors live within these fixed bounds, including short walking loops
    // and the gull orbit, so movement never needs to rebuild a bounding sphere.
    mesh.boundingBox = new THREE.Box3(V(-22, 0, 30), V(122, 145, 1280));
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    batch.mesh = mesh; group.add(mesh);
  }
  constructing = false;
  let lowQuality = false, lastFrame = -1;
  return {
    update(time, _progress) {
      // Ambient motion does not need the driving simulation's full frame rate.
      const frame = Math.floor(time * (lowQuality ? 12 : 24));
      if (frame === lastFrame) return;
      lastFrame = frame;
      for (const p of people) if (p.walking) drawPerson(p, time);
      gulls.forEach((gull, i) => drawGull(gull, i, time));
      touched.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; }); touched.clear();
    },
    setQuality(low) {
      lowQuality = low;
      for (const batch of batches.values()) if (batch.mesh) batch.mesh.castShadow = !low && batch.mesh.name !== 'City life / wings';
    },
  };
}

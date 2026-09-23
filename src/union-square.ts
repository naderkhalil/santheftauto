import * as THREE from 'three';
import { createWestin } from './westin';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPlazaAssets } from './plaza-assets';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Union Square's four real street frontages, compressed into a drivable block.
 * East is +x, north is +z. All entrances face the square, at street level 22.
 */
export function createUnionSquare(scene: THREE.Scene) {
  const group = new THREE.Group(); group.name = 'Union Square · plaza, Dewey Monument, Westin, Macy’s and Apple'; scene.add(group);
  let batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const ground = 22;
  const material = (name: string, color: string, roughness = .78, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); m.name = `Union Square / ${name}`; return m;
  };
  const m = {
    granite: material('silver granite', '#d8d6c9'), light: material('sunlit pale granite', '#f3ecda'),
    seam: material('paving joints', '#a7aea7'), riser: material('granite stair risers', '#b2b7ae'),
    soil: material('planter soil', '#725b45'), lawn: material('trimmed square lawns', '#559948'), hedge: material('clipped green hedges', '#337b3d'),
    leaf: material('palm leaf sun', '#709d40'), leafShade: material('palm leaf shade', '#387849'), bark: material('palm trunks', '#9e8059'),
    red: material('café parasol red', '#e84e45'), cream: material('canvas parasol ribs', '#ffdfbf'),
    metal: material('park iron', '#304c4b', .5, .45), bronze: material('Dewey Monument bronze', '#688169', .53, .4),
    gold: material('architectural bronze', '#b89559', .48, .5), timber: material('warm wood', '#b77841'),
    sandstone: material('Westin sandstone', '#d8be99'), stoneShadow: material('masonry reveals', '#ab967b'),
    limestone: material('carved limestone', '#f1dcc0'), tower: material('Westin tower concrete', '#a4aa9e'),
    glass: material('cool sky reflections', '#528190', .23, .3), dark: material('window and storefront recesses', '#263e45', .62),
    display: material('warm shop interiors', '#dab985', .7), white: material('Apple pale stone', '#f1f0e6', .62),
    brick: material('Post Street warm brick', '#c57c60'), awning: material('deep green awnings', '#215f4c'),
  };
  m.leaf.side = m.leafShade.side = THREE.DoubleSide;
  function texture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    paint(canvas.getContext('2d')!); const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; return map;
  }
  // Reflections and stone grain retain detail without adding meshes per floor.
  const glassMap = texture(128, 256, ctx => {
    const sky = ctx.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, '#deebdd'); sky.addColorStop(.4, '#91bfcd'); sky.addColorStop(.8, '#376879'); sky.addColorStop(1, '#adc0b5');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 128, 256); ctx.fillStyle = 'rgba(249,234,195,.14)'; ctx.fillRect(14, 0, 9, 256); ctx.fillRect(70, 85, 30, 170);
  });
  m.glass.map = glassMap; m.glass.color.set('#c9e0dd');
  const grain = texture(256, 256, ctx => {
    ctx.fillStyle = '#f1f0e9'; ctx.fillRect(0, 0, 256, 256);
    let seed = 1283;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < 11000; i++) { ctx.fillStyle = `rgba(87,76,62,${random() * .12})`; ctx.fillRect(random() * 256, random() * 256, 1, 1); }
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  for (const mat of [m.granite, m.light, m.sandstone, m.limestone, m.white]) mat.map = grain;

  function add(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, yaw = 0, rotation?: THREE.Euler) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler(0, yaw, 0)), V(1, 1, 1)));
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geometry !== normalized) geometry.dispose();
    // Custom foliage and standard solids can share the same draw material.
    if (!normalized.getAttribute('uv')) normalized.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(normalized.getAttribute('position').count * 2), 2));
    if (!batches.has(mat)) batches.set(mat, []); batches.get(mat)!.push(normalized);
  }
  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, yaw = 0) { add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, yaw); }
  function cylinder(r: number, h: number, mat: THREE.Material, x: number, y: number, z: number, top = r, segments = 12) { add(new THREE.CylinderGeometry(top, r, h, segments), mat, x, y, z); }
  function sphere(rx: number, ry: number, rz: number, mat: THREE.Material, x: number, y: number, z: number) {
    const geometry = new THREE.SphereGeometry(1, 10, 7); geometry.scale(rx, ry, rz); add(geometry, mat, x, y, z);
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
    const dir = b.clone().sub(a), p = a.clone().add(b).multiplyScalar(.5);
    add(new THREE.CylinderGeometry(r, r, dir.length(), 6), mat, p.x, p.y, p.z, 0, new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize())));
  }
  function sign(text: string, sub: string, w: number, h: number, x: number, y: number, z: number, yaw: number, background = '#263e36', foreground = '#f6e8cb', serif = true) {
    const map = texture(2048, 256, ctx => {
      ctx.fillStyle = background; ctx.fillRect(0, 0, 2048, 256); ctx.fillStyle = foreground; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${serif ? 'normal' : '500'} ${sub ? 112 : 153}px ${serif ? 'Georgia' : 'Arial'}`;
      ctx.fillText(text, 1024, sub ? 102 : 135, 1960);
      if (sub) { ctx.font = '37px Arial'; ctx.fillText(sub, 1024, 208, 1960); }
    });
    const mat = new THREE.MeshStandardMaterial({ map, roughness: .8 }); mat.name = `Union Square sign / ${text}`;
    add(new THREE.PlaneGeometry(w, h), mat, x, y, z, yaw);
  }

  // Sandblasted granite slabs have consistent real-world dimensions. Their
  // narrow joints and gently worn edges remain legible from Powell's sidewalk.
  const pavingColor = texture(1024, 1024, ctx => {
    ctx.fillStyle = '#a6a397'; ctx.fillRect(0, 0, 1024, 1024);
    let seed = 31903;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      const shade = 74 + random() * 7;
      ctx.fillStyle = `hsl(${39 + random() * 7} 9% ${shade}%)`; ctx.fillRect(col * 256 + 1.3, row * 128 + 1.3, 253.4, 125.4);
      for (let grain = 0; grain < 1200; grain++) {
        const alpha = random() * .16; ctx.fillStyle = random() > .5 ? `rgba(255,254,236,${alpha})` : `rgba(63,67,64,${alpha})`;
        ctx.fillRect(col * 256 + random() * 252 + 2, row * 128 + random() * 124 + 2, 1 + random(), 1 + random());
      }
    }
  });
  const pavingRelief = texture(1024, 1024, ctx => {
    ctx.fillStyle = '#444'; ctx.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      ctx.fillStyle = '#999'; ctx.fillRect(col * 256 + 1.5, row * 128 + 1.5, 253, 125);
      ctx.fillStyle = '#aaa'; ctx.fillRect(col * 256 + 3, row * 128 + 3, 250, 122);
    }
  });
  pavingRelief.colorSpace = THREE.NoColorSpace;
  const paving = (width: number, depth: number) => {
    const map = pavingColor.clone(), bumpMap = pavingRelief.clone();
    for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(width / 7.2, depth / 7.2); t.anisotropy = 12; t.needsUpdate = true; }
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map, bumpMap, bumpScale: .022, roughness: .81, envMapIntensity: .36 });
    mat.name = 'Union Square / dressed rectangular granite pavers'; return mat;
  };

  // Low modern terraces, the enormous pale paved center and four lawn panels
  // are the square's silhouette. The park is open enough to see across at speed.
  box(120, .34, 100, m.riser, 0, ground + .17, 0);
  box(118.5, .12, 98.5, paving(118.5, 98.5), 0, ground + .40, 0);
  box(84, .8, 67, m.riser, 0, ground + .77, 0);
  box(83.6, .12, 66.6, paving(83.6, 66.6), 0, ground + 1.23, 0);
  // Broad, shallow steps on all four sides: visually and physically gentle.
  for (let step = 0; step < 5; step++) {
    const h = .16 * (5 - step), d = .74;
    for (const side of [-1, 1]) {
      box(80, h, d, m.light, 0, ground + .45 + h / 2, side * (33.8 + step * d));
      box(d, h, 47, m.light, side * (42.4 + step * d), ground + .45 + h / 2, 0);
    }
  }
  // The square's darker granite bands run through a field of light pavers.
  for (const z of [-28, 28]) box(82, .014, .34, m.seam, 0, ground + 1.305, z);
  for (const x of [-34, 34]) box(.34, .014, 66, m.seam, x, ground + 1.305, 0);
  for (const z of [-8, 8]) box(82, .014, .15, m.granite, 0, ground + 1.307, z);
  const stainless = material('brushed stainless handrails', '#b9c5c0', .34, .82);
  // Paired slender rails follow the stairs down, including rounded end returns.
  for (const sign of [-1, 1]) for (const x of [-14, 14]) {
    const top = V(x, ground + 2.30, sign * 33.2), bottom = V(x, ground + 1.49, sign * 37.5);
    rod(top, bottom, .045, stainless);
    for (const t of [0, .5, 1]) {
      const p = top.clone().lerp(bottom, t); rod(p, p.clone().add(V(0, -.95, 0)), .037, stainless);
      cylinder(.12, .045, stainless, p.x, p.y - .945, p.z, .12, 12);
    }
    rod(top.clone().add(V(0, 0, -sign * .36)), top, .045, stainless);
    rod(bottom, bottom.clone().add(V(0, 0, sign * .36)), .045, stainless);
  }
  for (const sign of [-1, 1]) for (const z of [-9, 9]) {
    const top = V(sign * 41.6, ground + 2.30, z), bottom = V(sign * 46.1, ground + 1.49, z);
    rod(top, bottom, .045, stainless);
    for (const t of [0, .5, 1]) { const p = top.clone().lerp(bottom, t); rod(p, p.clone().add(V(0, -.95, 0)), .037, stainless); }
  }
  // Flat lawn beds sit within raised granite retaining edges; corner paths and
  // café terraces remain clear, as in the real public square.
  for (const x of [-50.6, 50.6]) for (const z of [-21, 21]) {
    box(13.8, .92, 20, m.riser, x, ground + .86, z);
    box(14.2, .20, 20.4, m.light, x, ground + 1.40, z);
    box(12.7, .10, 18.9, m.lawn, x, ground + 1.54, z);
    box(12, .30, 1.3, m.hedge, x, ground + 1.73, z + Math.sign(z) * 8.4);
  }
  // Terrace retaining walls double as seating, with actual wood slats.
  for (const x of [-29, 29]) for (const z of [-40, 40]) {
    box(17.2, .56, 1.6, m.granite, x, ground + .76, z);
    for (let slat = 0; slat < 5; slat++) box(16.9, .09, .21, m.timber, x, ground + 1.08, z - .54 + slat * .27);
  }
  for (const side of [-1, 1]) {
    box(11, 1.35, .85, m.riser, side * 43, ground + 1.12, side * 46.6);
    sign('UNION SQUARE', 'SAN FRANCISCO', 10.4, 1.24, side * 43, ground + 1.24, side * 47.04, side === 1 ? 0 : Math.PI, '#676e61', '#fff5df');
  }

  // Separately batched development fallbacks are retired only after GLBs load.
  const architectureBatches = batches;
  const monumentFallback = new THREE.Group(); monumentFallback.name = 'Dewey / procedural fallback'; group.add(monumentFallback);
  const palmFallback = new THREE.Group(); palmFallback.name = 'Date palms / procedural fallback'; group.add(palmFallback);
  const finishFallback = (target: THREE.Group) => {
    for (const [mat, geometries] of batches) {
      const geometry = mergeGeometries(geometries, false)!; geometries.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; target.add(mesh);
    }
  };
  batches = new Map();
  // Dewey Monument: tall granite shaft, Corinthian capital and the small
  // bronze Victory holding a wreath and trident, above a layered square plinth.
  const plaza = ground + 1.30;
  for (let tier = 0; tier < 4; tier++) box(9.5 - tier * 1.25, .32, 9.5 - tier * 1.25, tier % 2 ? m.light : m.granite, 0, plaza + .16 + tier * .32, 0);
  box(4.2, 2.25, 4.2, m.light, 0, plaza + 2.35, 0);
  for (const s of [-1, 1]) { box(2.6, 1.0, .03, m.bronze, 0, plaza + 2.2, s * 2.12); box(.03, 1.0, 2.6, m.bronze, s * 2.12, plaza + 2.2, 0); }
  cylinder(2.1, .4, m.light, 0, plaza + 3.65, 0, 2.1, 24);
  cylinder(1.55, .45, m.granite, 0, plaza + 4.05, 0, 1.35, 24);
  cylinder(1.18, 20.8, m.light, 0, plaza + 14.67, 0, .88, 28);
  cylinder(1.03, .28, m.granite, 0, plaza + 25.2, 0, 1.03, 24);
  cylinder(1.35, .58, m.light, 0, plaza + 25.60, 0, 1.63, 20);
  box(3.4, .42, 3.4, m.light, 0, plaza + 26.08, 0);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    sphere(.22, .39, .22, m.light, Math.sin(a) * 1.22, plaza + 25.63, Math.cos(a) * 1.22);
  }
  const statueY = plaza + 26.35;
  cylinder(.64, .18, m.bronze, 0, statueY, 0);
  add(new THREE.CylinderGeometry(.31, .71, 2.4, 11), m.bronze, 0, statueY + 1.30, 0);
  sphere(.36, .63, .25, m.bronze, 0, statueY + 2.61, 0);
  sphere(.29, .37, .29, m.bronze, 0, statueY + 3.39, 0);
  rod(V(-.18, statueY + 2.9, 0), V(-.90, statueY + 3.13, .08), .14, m.bronze);
  rod(V(-.90, statueY + 3.13, .08), V(-1.22, statueY + 3.94, .06), .11, m.bronze);
  add(new THREE.TorusGeometry(.47, .10, 6, 20), m.bronze, -1.33, statueY + 4.35, .07);
  rod(V(.2, statueY + 2.87, 0), V(.83, statueY + 2.26, .06), .14, m.bronze);
  rod(V(.83, statueY + 2.26, .06), V(1.23, statueY + 2.58, .1), .10, m.bronze);
  rod(V(1.25, statueY + .28, .11), V(1.25, statueY + 4.48, .11), .047, m.gold);
  for (const dx of [-.23, 0, .23]) rod(V(1.25, statueY + 4.06, .11), V(1.25 + dx, statueY + 4.70 - Math.abs(dx) * .7, .11), .046, m.gold);

  finishFallback(monumentFallback);
  batches = new Map();

  function palm(x: number, z: number, height: number, phase: number) {
    const y = ground + 1.53, top = y + height;
    cylinder(.39, height, m.bark, x, y + height / 2, z, .24, 9);
    for (let ring = 0; ring < height; ring += .46) cylinder(.40 - ring / height * .13, .09, m.stoneShadow, x, y + ring, z, .40 - ring / height * .13, 9);
    sphere(.68, .93, .68, m.leafShade, x, top, z);
    for (let f = 0; f < 14; f++) {
      const angle = phase + f / 14 * Math.PI * 2, length = 5.18 + (f % 3) * .53;
      const direction = V(Math.sin(angle), 0, Math.cos(angle)), side = V(direction.z, 0, -direction.x);
      const positions: number[] = [];
      const center = (t: number) => V(x, top + Math.sin(t * Math.PI * .9) * 2.3 - t * 1.55, z).addScaledVector(direction, t * length);
      const pts = Array.from({ length: 10 }, (_, i) => center(i / 9));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 9, .027, 3, false), m.leafShade, 0, 0, 0);
      for (let leaf = 1; leaf < 11; leaf++) {
        const t = leaf / 12, p = center(t), tipLength = Math.sin(t * Math.PI) * 1.26;
        for (const s of [-1, 1]) {
          const a = p.clone().addScaledVector(direction, -.13), b = p.clone().addScaledVector(direction, .14);
          const tip = p.clone().addScaledVector(side, s * tipLength).addScaledVector(direction, .24); tip.y -= .32;
          positions.push(...a.toArray(), ...b.toArray(), ...tip.toArray());
        }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.computeVertexNormals();
      add(geo, f % 3 ? m.leaf : m.leafShade, 0, 0, 0);
    }
  }
  for (const x of [-50.6, 50.6]) for (const z of [-28, -13, 13, 28]) palm(x, z, 12.5 + (Math.abs(z) === 28 ? 2.0 : 0), x * .04 + z * .03);
  for (const x of [-29, 29]) for (const z of [-42.4, 42.4]) palm(x, z, 13.2, x * .05);

  finishFallback(palmFallback);
  batches = architectureBatches;
  const plazaArt = createPlazaAssets(group, monumentFallback, palmFallback);
  const plazaReady = plazaArt.ready;

  // The corner hearts are sculptural objects, with a painted SF palette.
  const heartMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .08 }); heartMat.name = 'Union Square / painted heart sculptures';
  for (const [index, [x, z]] of [[-53, -42], [53, -42], [-53, 42], [53, 42]].entries()) {
    box(2.45, .85, 2.45, m.light, x, ground + .87, z);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(-.28, .49, -1.35, 1.05, -1.35, 1.97); shape.bezierCurveTo(-1.35, 2.77, -.38, 2.88, 0, 2.14); shape.bezierCurveTo(.38, 2.88, 1.35, 2.77, 1.35, 1.97); shape.bezierCurveTo(1.35, 1.05, .28, .49, 0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .62, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .19, bevelThickness: .20, curveSegments: 15 });
    geometry.translate(0, 0, -.31); const colors: number[] = [], position = geometry.getAttribute('position');
    const palette = ['#ee4b53', '#e89737', '#46ada2', '#386bab', '#ee7186'];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const band = Math.floor((position.getX(vertex) * .75 + position.getY(vertex) * 1.6 + 12 + index) % palette.length);
      const color = new THREE.Color(palette[band]); colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    add(geometry, heartMat, x, ground + 1.32, z, Math.atan2(x, z));
  }

  function cafeTable(x: number, z: number, parasol: boolean) {
    const y = ground + 1.32;
    cylinder(.10, .80, m.metal, x, y + .4, z); cylinder(.85, .10, m.timber, x, y + .85, z, .85, 16);
    for (let chair = 0; chair < 3; chair++) {
      const angle = chair * Math.PI * 2 / 3, xx = x + Math.sin(angle) * 1.33, zz = z + Math.cos(angle) * 1.33;
      box(.65, .10, .65, m.timber, xx, y + .43, zz, angle);
      box(.67, .60, .09, m.timber, xx + Math.sin(angle) * .25, y + .74, zz + Math.cos(angle) * .25, angle);
      for (const side of [-1, 1]) rod(V(xx + Math.cos(angle) * side * .24, y + .41, zz - Math.sin(angle) * side * .24), V(xx + Math.cos(angle) * side * .28, y + .02, zz - Math.sin(angle) * side * .28), .034, m.metal);
    }
    if (!parasol) return;
    cylinder(.052, 2.9, m.metal, x, y + 1.45, z);
    add(new THREE.ConeGeometry(2.15, .65, 10, 1, true), m.red, x, y + 2.76, z);
    cylinder(2.15, .17, m.red, x, y + 2.37, z, 2.15, 10);
    for (let rib = 0; rib < 10; rib++) { const angle = rib * Math.PI / 5; rod(V(x, y + 3.08, z), V(x + Math.sin(angle) * 2.13, y + 2.42, z + Math.cos(angle) * 2.13), .021, m.cream); }
  }
  for (const x of [-29, -22, 22, 29]) for (const z of [-23, 23]) cafeTable(x, z, true);
  for (const x of [-21, -14, 14, 21]) cafeTable(x, -16, false);
  // Low café kiosks along the north edge, not tall obstructions across the park.
  for (const x of [-19, 19]) {
    box(11, 2.75, 6, m.granite, x, ground + 1.83, 44.6);
    box(11.5, .24, 6.7, m.light, x, ground + 3.35, 44.6);
    box(8.4, 1.65, .10, m.dark, x, ground + 1.88, 41.55);
    box(9.5, .11, 1.1, m.timber, x, ground + 1.3, 41.20);
  }

  // Fluted park litter bins and small ground uplights set a human scale.
  for (const x of [-38.8, 38.8]) for (const z of [-40.3, 40.3]) {
    cylinder(.39, 1.03, m.dark, x, ground + .99, z, .39, 16);
    for (let rib = 0; rib < 18; rib++) { const a = rib * Math.PI / 9; box(.04, .89, .06, m.metal, x + Math.cos(a) * .395, ground + .99, z + Math.sin(a) * .395, -a); }
    cylinder(.445, .07, m.metal, x, ground + 1.55, z, .445, 24);
    cylinder(.29, .016, m.dark, x, ground + 1.590, z, .29, 20);
  }
  for (const x of [-50.6, 50.6]) for (const z of [-28, -13, 13, 28]) {
    cylinder(.18, .034, stainless, x + .95, ground + 1.605, z, .18, 16);
    cylinder(.145, .012, m.dark, x + .95, ground + 1.628, z, .145, 16);
  }

  // A facade's local x runs left-to-right, local +z faces the street.
  function facade(originX: number, originZ: number, yaw: number) {
    const position = (x: number, y: number, z: number) => V(originX + Math.cos(yaw) * x + Math.sin(yaw) * z, ground + y, originZ - Math.sin(yaw) * x + Math.cos(yaw) * z);
    const b = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => { const p = position(x, y, z); box(w, h, d, mat, p.x, p.y, p.z, yaw); };
    const lettering = (text: string, sub: string, w: number, h: number, x: number, y: number, z: number, bg?: string, fg?: string, serif = true) => { const p = position(x, y, z); sign(text, sub, w, h, p.x, p.y, p.z, yaw, bg, fg, serif); };
    const window = (x: number, y: number, w: number, h: number, z = .1, ornate = false) => {
      b(w + .26, h + .24, .14, m.dark, x, y, z); b(w, h, .08, m.glass, x, y, z + .10);
      for (const side of [-1, 1]) b(.14, h + .33, .23, m.limestone, x + side * (w / 2 + .12), y, z + .13);
      b(w + .52, .16, .41, m.limestone, x, y - h / 2 - .13, z + .16);
      b(w + .44, .17, .25, m.limestone, x, y + h / 2 + .11, z + .15);
      b(.07, h, .08, m.dark, x, y, z + .17); b(w, .08, .09, m.dark, x, y + h * .08, z + .18);
      if (ornate) b(w + .76, .15, .55, m.limestone, x, y + h / 2 + .4, z + .2);
    };
    const arch = (x: number, y: number, w: number, h: number, z: number) => {
      const radius = w / 2, spring = h - radius, shape = new THREE.Shape(); shape.moveTo(-radius, 0); shape.lineTo(radius, 0); shape.lineTo(radius, spring); shape.absarc(0, spring, radius, 0, Math.PI, false); shape.closePath();
      const p = position(x, y, z); add(new THREE.ShapeGeometry(shape, 14), m.dark, p.x, p.y, p.z, yaw);
      const q = position(x, y + spring, z + .08); add(new THREE.TorusGeometry(radius + .10, .16, 5, 20, Math.PI), m.limestone, q.x, q.y, q.z, yaw);
      for (const side of [-1, 1]) b(.30, spring, .33, m.limestone, x + side * (radius + .10), y + spring / 2, z + .05);
      b(w * .78, h * .57, .06, m.display, x, y + h * .30, z + .06);
      for (const side of [-1, 0, 1]) b(.075, h * .57, .09, m.gold, x + side * w * .26, y + h * .30, z + .11);
    };
    return { b, lettering, window, arch };
  }

  // WESTIN ST. FRANCIS, on Powell. Three projecting historic wings leave two
  // recessed courts; its contemporary concrete towers sit behind the old hotel.
  const westinBatchStarts = new Map([...batches].map(([mat, geometries]) => [mat, geometries.length]));
  const westin = facade(-93, -1.5, Math.PI / 2);
  westin.b(91, 42, 28, m.sandstone, 0, 21, -19);
  for (const wing of [-32, 0, 32]) {
    westin.b(24, 42, 12, m.sandstone, wing, 21, -6);
    westin.b(24, 8.5, .38, m.limestone, wing, 4.25, .14);
    for (let course = .8; course < 8.4; course += .60) westin.b(24, .03, .04, m.stoneShadow, wing, course, .36);
    for (let bay = -9; bay <= 9; bay += 4.5) {
      westin.arch(wing + bay, .18, 2.85, 4.6, .38);
      westin.window(wing + bay, 6.8, 1.72, 2.2, .37, true);
      for (let floor = 0; floor < 9; floor++) westin.window(wing + bay, 10.8 + floor * 3.47, 1.64, floor > 6 ? 2.05 : 2.30, .05, floor === 0 || floor === 6);
    }
    for (const level of [8.6, 9.1, 32.6, 39.2, 40.0, 41.2, 42.0]) westin.b(24.8, level > 39 ? .29 : .20, level > 39 ? 1.05 : .57, m.limestone, wing, level, .25);
    for (const side of [-1, 1]) westin.b(.62, 32.0, .38, m.limestone, wing + side * 11.25, 25, .21);
    for (let tooth = -11; tooth <= 11; tooth += 1.1) westin.b(.33, .35, .36, m.limestone, wing + tooth, 40.57, .59);
    westin.b(24, .55, 12, m.stoneShadow, wing, 42.45, -5.5);
  }
  for (const court of [-16, 16]) {
    for (let floor = 0; floor < 11; floor++) for (const bay of [-2.3, 2.3]) westin.window(court + bay, 3.8 + floor * 3.48, 1.6, 2.3, -4.82);
    for (const level of [8.6, 32.6, 40, 42]) westin.b(8, .28, .6, m.limestone, court, level, -4.6);
  }
  // Dark, gilded entrance canopy is contained within the hotel setback.
  westin.b(18, .28, 1.30, m.awning, 0, 4.28, .72); westin.b(18, .53, .13, m.awning, 0, 4.09, 1.42);
  westin.lettering('THE WESTIN ST. FRANCIS', '', 17.4, .78, 0, 4.12, 1.50, '#215446', '#f4dab0');
  for (const side of [-1, 1]) westin.b(.12, 3.85, .12, m.gold, side * 8.3, 1.98, 1.20);
  for (const [x, z, height, width, depth] of [[-143, -22, 84, 29, 38], [-143, 23, 91, 29, 36]]) {
    box(width, height, depth, m.tower, x, ground + height / 2, z);
    for (const side of [-1, 1]) {
      for (let zz = z - depth / 2 + 1.8; zz < z + depth / 2 - 1; zz += 2.55) {
        box(.07, height - 2.1, 1.55, m.glass, x + side * (width / 2 + .04), ground + height / 2, zz);
        box(.37, height, .23, m.limestone, x + side * (width / 2 + .17), ground + height / 2, zz + 1.1);
      }
      for (let xx = x - width / 2 + 1.5; xx < x + width / 2 - 1; xx += 2.6) box(1.65, height - 2.1, .07, m.glass, xx, ground + height / 2, z + side * (depth / 2 + .04));
    }
    for (let floor = 0; floor < height; floor += 3.4) box(width + .48, .17, depth + .15, m.tower, x, ground + floor, z);
    box(width + .7, .70, depth + .7, m.limestone, x, ground + height, z);
  }
  // North/south returns prevent the hotel becoming a blank wall on the lap.
  for (const side of [-1, 1]) {
    const end = facade(-109.5, side === 1 ? 44 : -47, side === 1 ? 0 : Math.PI);
    for (let bay = -12; bay <= 12; bay += 4) for (let floor = 0; floor < 11; floor++) end.window(bay, 4.2 + floor * 3.45, 1.75, 2.4, .08);
    for (const y of [8.5, 32.5, 39.2, 41.5]) end.b(33, .27, .60, m.limestone, 0, y, .15);
  }

  const westinFallback = new THREE.Group();westinFallback.name='Westin / procedural fallback';group.add(westinFallback);
  for (const [mat, geometries] of batches) {
    const parts=geometries.splice(westinBatchStarts.get(mat)??0);
    if(!parts.length)continue;
    const merged=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());
    const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=true;mesh.receiveShadow=true;westinFallback.add(mesh);
  }
  const westinAsset=createWestin(group,westinFallback);

  // MACY'S south across Geary: broad light masonry, huge display windows,
  // red star wordmark and deep horizontal shadow lines, never a fake tower.
  const macys = facade(0, -83, 0);
  macys.b(118, 31, 53, m.limestone, 0, 15.5, -26.5);
  macys.b(118, 6.1, .45, m.stoneShadow, 0, 3.05, .12);
  for (let x = -53; x <= 53; x += 8.15) {
    macys.b(6.5, 4.4, .17, m.dark, x, 2.8, .41); macys.b(5.95, 3.86, .10, m.display, x, 2.9, .53);
    for (const side of [-1, 1]) macys.b(.12, 4.4, .15, m.gold, x + side * 2.15, 2.8, .59);
    for (const y of [10.1, 15.8, 21.5, 27.1]) macys.window(x, y, 4.0, 3.45, .11);
    macys.b(.62, 24.5, .70, m.light, x - 3.7, 18.2, .36);
  }
  for (const y of [6.4, 7.0, 12.9, 18.6, 24.3, 30.6, 31.1]) macys.b(119, .29, .90, m.light, 0, y, .27);
  macys.b(118, .78, 54, m.stoneShadow, 0, 31.8, -26.1);
  macys.lettering('★ macy’s', '', 21.5, 4.15, 0, 27.0, .76, '#eedfc9', '#b52636', false);
  for (const x of [-39, 39]) macys.lettering('macy’s', '', 12.5, 2.05, x, 6.6, .88, '#ead6b9', '#a62131', false);
  for (const side of [-1, 1]) {
    const end = facade(side * 59.08, -108, side * Math.PI / 2);
    for (let x = -19; x <= 19; x += 8) for (const y of [10.1, 15.8, 21.5, 27.1]) end.window(x, y, 3.8, 3.45);
  }

  // Apple Union Square's exceptionally clear two-story glass box on Post.
  // The visible timber tables, planted back wall and thin pale roof identify it.
  const appleGlass = new THREE.MeshPhysicalMaterial({ color: '#a9d5d6', transparent: true, opacity: .24, roughness: .12, metalness: .12, side: THREE.DoubleSide, depthWrite: false }); appleGlass.name = 'Union Square / Apple structural glass';
  box(52, .55, 31.5, m.white, 33.5, ground + .27, 98.6);
  box(52, .78, 31.8, m.white, 33.5, ground + 11.8, 98.6);
  box(52, 10.9, .25, m.hedge, 33.5, ground + 5.95, 114.1);
  box(51.4, 10.8, .12, appleGlass, 33.5, ground + 5.96, 82.88);
  for (const x of [7.7, 59.3]) box(.12, 10.8, 30.4, appleGlass, x, ground + 5.96, 98.3);
  box(50, .37, 15.0, m.white, 33.5, ground + 5.8, 106.2);
  for (let x = 8; x <= 59; x += 6.4) box(.095, 11.1, .17, m.white, x, ground + 6.1, 82.76);
  box(51.7, .12, .18, m.white, 33.5, ground + 6.0, 82.72);
  for (const x of [17, 29, 41, 53]) for (const z of [89.5, 101]) {
    box(5.0, .18, 2.6, m.timber, x, ground + 1.35, z);
    for (const side of [-1, 1]) box(.25, 1.0, 2.2, m.timber, x + side * 1.8, ground + .8, z);
    for (const dx of [-1.5, 0, 1.5]) box(.46, .07, .32, m.dark, x + dx, ground + 1.48, z);
  }
  for (const x of [12.5, 54.5]) {
    cylinder(1.15, 1.1, m.white, x, ground + .95, 109.5);
    rod(V(x, ground + 1.2, 109.5), V(x, ground + 4.7, 109.5), .15, m.bark);
    sphere(2.1, 2.2, 1.8, m.leafShade, x, ground + 5.15, 109.5);
  }
  const appleMark = texture(256, 320, ctx => {
    ctx.clearRect(0, 0, 256, 320); ctx.fillStyle = '#fffdfa';
    ctx.beginPath(); ctx.moveTo(128, 112); ctx.bezierCurveTo(100, 83, 39, 96, 37, 159); ctx.bezierCurveTo(30, 209, 64, 283, 94, 274); ctx.bezierCurveTo(112, 261, 130, 261, 147, 274); ctx.bezierCurveTo(176, 289, 205, 235, 215, 212); ctx.bezierCurveTo(171, 195, 171, 148, 209, 128); ctx.bezierCurveTo(187, 96, 155, 92, 128, 112); ctx.fill();
    ctx.beginPath(); ctx.moveTo(128, 93); ctx.bezierCurveTo(122, 61, 144, 31, 170, 28); ctx.bezierCurveTo(174, 53, 154, 89, 128, 93); ctx.fill();
  });
  const logoMaterial = new THREE.MeshStandardMaterial({ map: appleMark, transparent: true, roughness: .50, emissive: '#fff3d7', emissiveIntensity: .25 }); logoMaterial.name = 'Union Square / Apple pavilion mark';
  add(new THREE.PlaneGeometry(2.5, 3.13), logoMaterial, 33.5, ground + 8.8, 82.68, Math.PI);

  // Other real-scale street walls complete the recognizable four-sided room.
  const post = facade(-30, 83.4, Math.PI);
  post.b(58, 24, 30, m.brick, 0, 12, -15);
  post.b(58, 5.8, .34, m.limestone, 0, 2.9, .15);
  for (let x = -24; x <= 24; x += 6) {
    post.arch(x, .20, 4.1, 4.9, .4);
    for (const y of [8.6, 13.5, 18.4]) post.window(x, y, 2.2, 3.1, .12, true);
  }
  for (const y of [5.9, 6.45, 21.4, 22.5, 23.2, 24.1]) post.b(58.7, .35, .74, m.limestone, 0, y, .22);
  post.lettering('SAKS FIFTH AVENUE', '', 22, 1.25, 0, 5.9, .70, '#d6c3a7', '#38413c');
  for (const x of [-18, 18]) { post.b(10, .20, 1.2, m.awning, x, 4.6, .75); post.b(10, .4, .10, m.awning, x, 4.35, 1.33); }
  const stockton = facade(94, 0, -Math.PI / 2);
  stockton.b(96, 29.5, 35, m.limestone, 0, 14.75, -17.5);
  stockton.b(96, 6, .42, m.sandstone, 0, 3, .14);
  for (let x = -42; x <= 42; x += 7) {
    stockton.arch(x, .2, 4.8, 5.1, .4);
    for (const y of [9.4, 14.7, 20, 25.3]) stockton.window(x, y, 3.0, 3.8, .12, true);
    stockton.b(.56, 23, .54, m.light, x - 3.25, 17.6, .23);
  }
  for (const y of [6.15, 7, 27.8, 28.8, 29.5]) stockton.b(96.7, .35, .82, m.light, 0, y, .25);
  stockton.lettering('NEIMAN MARCUS', '', 24, 1.45, -22, 6.4, .78, '#eee0c7', '#34423c');
  // Full north/south returns matter from the aerial menu and both turning
  // approaches. Carry the same coursing and fenestration around the corners.
  for (const side of [-1, 1]) {
    const end = facade(111.5, side * 48.10, side === 1 ? 0 : Math.PI);
    end.b(35, 6.0, .26, m.sandstone, 0, 3.0, .12);
    for (let bay = -12; bay <= 12; bay += 6) {
      end.arch(bay, .2, 3.9, 5.1, .30);
      for (const y of [9.4, 14.7, 20, 25.3]) end.window(bay, y, 3.0, 3.8, .12, true);
    }
    for (const x of [-16.5, 16.5]) end.b(.58, 23.0, .55, m.light, x, 17.6, .24);
    for (const y of [6.15, 7, 12.1, 17.4, 22.7, 27.8, 28.8, 29.5]) end.b(35.7, .30, .83, m.light, 0, y, .25);
    end.b(19, .18, 1.0, m.awning, 0, 4.5, .5);
    end.b(19, .38, .08, m.awning, 0, 4.25, .98);
  }
  // The Stockton back is also articulated, so orbital views never expose a
  // featureless extrusion. It remains inside the x=130 building boundary.
  const stocktonBack = facade(129.1, 0, Math.PI / 2);
  for (let bay = -41; bay <= 41; bay += 7) for (const y of [9.4, 14.7, 20, 25.3]) stocktonBack.window(bay, y, 2.5, 3.8, .08);
  for (const y of [6.15, 27.8, 29.5]) stocktonBack.b(96.6, .3, .70, m.light, 0, y, .22);
  // Post Street's historic block has occupied side and rear elevations too.
  for (const side of [-1, 1]) {
    const end = facade(side === 1 ? -.90 : -59.10, 98.4, side * Math.PI / 2);
    for (const bay of [-10, -5, 0, 5, 10]) {
      end.arch(bay, .2, 3.4, 4.9, .22);
      for (const y of [8.6, 13.5, 18.4]) end.window(bay, y, 2.1, 3.1, .09, true);
    }
    for (const y of [5.9, 6.45, 21.4, 22.5, 23.2, 24.1]) end.b(30.5, .3, .62, m.limestone, 0, y, .17);
  }
  const postBack = facade(-30, 113.45, 0);
  for (let bay = -24; bay <= 24; bay += 6) for (const y of [3.0, 8.6, 13.5, 18.4]) postBack.window(bay, y, 2.2, 3.1, .1, y === 18.4);
  for (const y of [5.9, 6.45, 21.4, 22.5, 23.2, 24.1]) postBack.b(58.6, .32, .72, m.limestone, 0, y, .2);
  // Apple’s planted living wall has a slender structural grid, rather than a
  // green box back. Pale edge trims preserve its lightweight pavilion form.
  for (let x = 8.5; x <= 59; x += 6.2) box(.12, 10.8, .2, m.white, x, ground + 5.95, 114.31);
  for (const y of [.7, 6.0, 11.2]) box(51.5, .14, .2, m.white, 33.5, ground + y, 114.34);

  // Static detail is merged by material; no individual window/tree/table draws.
  let triangles = 0;
  for (const [mat, geometries] of batches) {
    if(!geometries.length)continue;
    const merged = mergeGeometries(geometries, false)!; geometries.forEach(geometry => geometry.dispose());
    merged.computeBoundingSphere(); triangles += merged.getAttribute('position').count / 3;
    const mesh = new THREE.Mesh(merged, mat); mesh.name = mat.name; mesh.castShadow = mat !== appleGlass && mat !== logoMaterial; mesh.receiveShadow = true; group.add(mesh);
  }
  group.userData.drawCalls = group.children.length; group.userData.triangles = triangles;
  return {
    group,
    ready:Promise.all([westinAsset.ready, plazaReady]),
    update(_time: number, _progress: number, camera?:THREE.Camera) { if(camera)westinAsset.update(camera); },
    setQuality(low: boolean) {
      westinAsset.setQuality(low);
      plazaArt.setQuality(low);
      for(const fallback of [monumentFallback, palmFallback]) fallback.traverse(child => { if(child instanceof THREE.Mesh) child.castShadow = !low; });
      westinFallback.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=!low;});
      for (const child of group.children) if (child instanceof THREE.Mesh) child.castShadow = !low && child.material !== appleGlass && child.material !== logoMaterial;
    },
  };
}

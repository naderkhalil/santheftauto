import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './route';

/** Grant Avenue's narrow masonry shopfronts, Dragon Gate, and California corners. */
export function createChinatown(scene: THREE.Object3D) {
  const group = new THREE.Group(); group.name = 'Grant Avenue · Chinatown'; scene.add(group);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const canvasMap = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    paint(canvas.getContext('2d')!);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
  };
  let seed = 17339;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const grain = canvasMap(256, 256, ctx => {
    ctx.fillStyle = '#f7f0e6'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 13000; i++) {
      ctx.fillStyle = `rgba(83,70,53,${random() * .12})`;
      ctx.fillRect(random() * 256, random() * 256, 1.1, 1.1);
    }
    // Gentle rain streaks, kept subtle enough for sunlit painted plaster.
    for (let i = 0; i < 35; i++) {
      const x = random() * 256, gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, 'rgba(55,51,43,.04)'); gradient.addColorStop(1, 'rgba(55,51,43,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x, 0, 1 + random() * 4, 256);
    }
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const material = (name: string, color: string, roughness = .8, metalness = 0) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness }); mat.name = `Chinatown / ${name}`; return mat;
  };
  const plaster = (name: string, color: string) => { const mat = material(name, color); mat.map = grain; return mat; };
  const facades = [plaster('warm ivory plaster', '#f0d8ad'), plaster('aged terracotta', '#d58267'), plaster('ochre masonry', '#e2b85c'), plaster('jade painted plaster', '#85b3a5'), plaster('pale sandstone', '#d5c4ad'), plaster('dusty rose masonry', '#bf8177')];
  const stone = plaster('Dragon Gate granite', '#b9b6a2'), cream = plaster('stone cornices and window trim', '#f6e4bd');
  const red = material('vermillion woodwork', '#aa342a'), jade = material('jade woodwork', '#206a55');
  const iron = material('painted wrought iron', '#3a4947', .6, .35), dark = material('recessed shop shadows', '#253b3c');
  const gold = material('aged gilded lettering and details', '#d6b168', .45, .55), copper = material('old copper gutters', '#568177', .57, .42);
  const roof = material('aged green ceramic roof tile', '#417562', .48, .12), roofEdge = material('ceramic ridge caps', '#78926a', .52, .1);
  roof.side = THREE.DoubleSide;
  roof.map = canvasMap(512, 512, ctx => {
    ctx.fillStyle = '#b6c6a7'; ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 16; row++) for (let col = 0; col < 20; col++) {
      const x = col * 26, y = row * 32;
      ctx.fillStyle = `rgba(35,72,60,${.08 + random() * .19})`; ctx.fillRect(x + 1, y + 1, 24, 30);
      ctx.strokeStyle = 'rgba(20,48,34,.35)'; ctx.lineWidth = 1.3; ctx.strokeRect(x + 1, y + 1, 24, 30);
      ctx.fillStyle = 'rgba(235,229,183,.16)'; ctx.fillRect(x + 4, y + 4, 4, 23);
    }
  });
  roof.map.wrapS = roof.map.wrapT = THREE.RepeatWrapping;
  const glass = material('blue reflected window glass', '#94b4b2', .24, .28);
  glass.map = canvasMap(128, 256, ctx => {
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#d2e5e3'); sky.addColorStop(.44, '#759ea9'); sky.addColorStop(.80, '#426675'); sky.addColorStop(1, '#a1b5aa');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = 'rgba(236,217,179,.22)'; ctx.beginPath(); ctx.moveTo(17, 26); ctx.lineTo(43, 42); ctx.lineTo(69, 256); ctx.lineTo(30, 256); ctx.fill();
  });
  const shopGlass = material('warm shop windows', '#719588', .3, .2);
  const awnings = [material('red canvas awnings', '#b62d26'), material('green canvas awnings', '#34765a'), material('gold canvas awnings', '#dbac52')];
  const lanternRed = material('red paper lanterns', '#ed4727', .76);
  lanternRed.emissive.set('#ff5522'); lanternRed.emissiveIntensity = .05;
  const lanternGold = material('lantern ribs and tassels', '#dda249', .8);
  const roofMeshes: THREE.Mesh[] = [];

  function add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotation = new THREE.Euler()) {
    geo.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(rotation), V(1, 1, 1)));
    const normalized = geo.index ? geo.toNonIndexed() : geo;
    if (normalized !== geo) geo.dispose();
    if (!normalized.getAttribute('uv')) normalized.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(normalized.getAttribute('position').count * 2), 2));
    if (!batches.has(mat)) batches.set(mat, []); batches.get(mat)!.push(normalized);
  }
  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rotation?: THREE.Euler) { add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rotation); }
  function sphere(rx: number, ry: number, rz: number, mat: THREE.Material, x: number, y: number, z: number, detail = 10) {
    const geo = new THREE.SphereGeometry(1, detail, 8); geo.scale(rx, ry, rz); add(geo, mat, x, y, z);
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) {
    const delta = b.clone().sub(a), midpoint = a.clone().add(b).multiplyScalar(.5);
    if (delta.lengthSq() < .000001) return;
    add(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), mat, midpoint.x, midpoint.y, midpoint.z,
      new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), delta.normalize())));
  }
  function curve(points: THREE.Vector3[], mat: THREE.Material, radius = .07, segments = 28) {
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false), mat, 0, 0, 0);
  }

  // One atlas preserves bilingual signs without adding a draw for each shop.
  const signs = [
    ['天下為公', '', '#244f40', '#ead7a1'],
    ['唐人街', 'CHINATOWN · GRANT AVENUE', '#a12e26', '#fff0c5'],
    ['廣東商場', 'CANTON BAZAAR', '#b13324', '#ffe3a4'],
    ['清香茶莊', 'GRANT TEA HOUSE', '#235844', '#f8e5b6'],
    ['金龍餅家', 'GOLDEN DRAGON BAKERY', '#b23429', '#ffeac4'],
    ['古玩', 'JADE & ANTIQUES', '#e0c38c', '#304d40'],
    ['鮮果', 'FRESH FRUIT MARKET', '#256b55', '#fff1c9'],
    ['茶', 'TEA', '#ac3026', '#ffe9b8'],
    ['點心', 'DIM SUM', '#dfba63', '#692c27'],
    ['新昌', 'SING CHONG', '#ad3529', '#ffdf9b'],
    ['新發', 'SING FAT', '#325e46', '#ffe8b6'],
    ['美味', 'GRANT NOODLE HOUSE', '#304f44', '#fff1ca'],
    ['書店', 'BOOKS · PRINTS', '#c0a16e', '#3e4139'],
    ['錦繡', 'SILKS & GIFTS', '#973f37', '#fceac2'],
    ['GRANT AVE', 'CHINATOWN', '#255548', '#f7e9bb'],
    ['CALIFORNIA ST', 'GRANT AVENUE', '#255548', '#f7e9bb'],
  ];
  const cellW = 1024, cellH = 256, atlasW = 2048, atlasH = 2048;
  const signMap = canvasMap(atlasW, atlasH, ctx => {
    signs.forEach(([chinese, english, bg, fg], i) => {
      const x = i % 2 * cellW, y = Math.floor(i / 2) * cellH;
      ctx.fillStyle = bg; ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(x + 13, y + 13, cellW - 26, cellH - 26);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg;
      const chineseFonts = '"Songti SC", "Noto Serif CJK SC", "Hiragino Mincho ProN", serif';
      if (i === 7 || i === 8) {
        // These cells go onto tall projecting signs; compensate for their atlas
        // aspect ratio so the individual Chinese characters remain square.
        ctx.save(); ctx.translate(x + cellW / 2, y); ctx.scale(8, 1);
        ctx.font = `${i === 7 ? 103 : 77}px ${chineseFonts}`;
        if (i === 7) ctx.fillText(chinese, 0, 132);
        else { ctx.fillText(chinese[0], 0, 81); ctx.fillText(chinese[1], 0, 175); }
        ctx.restore();
      } else {
        ctx.font = `${i === 0 ? 128 : 97}px ${chineseFonts}`;
        if (i > 13) ctx.font = 'bold 74px Arial';
        ctx.fillText(chinese, x + cellW / 2, y + (english ? 99 : 139), cellW - 75);
        if (english) { ctx.font = `${i > 13 ? 35 : 32}px Georgia`; ctx.fillText(english, x + cellW / 2, y + 198, cellW - 65); }
      }
      // Small edge chips give shop lettering a painted rather than neon finish.
      for (let j = 0; j < 28; j++) { ctx.fillStyle = 'rgba(219,199,157,.12)'; ctx.fillRect(x + random() * cellW, y + random() * cellH, 2, 1); }
    });
  });
  const signMat = material('painted bilingual shop signs', '#ffffff', .8); signMat.map = signMap; signMat.side = THREE.DoubleSide;
  function sign(index: number, x: number, y: number, z: number, w: number, h: number, yaw: number) {
    const geo = new THREE.PlaneGeometry(w, h), uv = geo.getAttribute('uv');
    const col = index % 2, row = Math.floor(index / 2), inset = .002;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + inset + (1 - uv.getX(i)) * (1 - inset * 2)) / 2, 1 - (row + 1 - inset - uv.getY(i) * (1 - inset * 2)) / 8);
    add(geo, signMat, x, y, z, new THREE.Euler(0, yaw, 0));
  }

  function ceramicRoof(w: number, d: number, h: number, x: number, y: number, z: number) {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [], nx = 20, nz = 12;
    function roofY(xx: number, zz: number) {
      const ax = Math.abs(xx) / (w / 2), az = Math.abs(zz) / (d / 2), t = Math.max(Math.max(0, (ax - .5) * 2), az);
      return y + h * Math.pow(1 - Math.min(1, t), 1.55) + .46 * Math.pow(ax, 8) * Math.pow(az, 4) + .13 * Math.pow(t, 12);
    }
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const xx = (ix / nx - .5) * w, zz = (iz / nz - .5) * d;
      positions.push(x + xx, roofY(xx, zz), z + zz); uvs.push(ix / nx * w / 12, iz / nz * d / 8);
      if (ix < nx && iz < nz) { const k = iz * (nx + 1) + ix; indices.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals(); add(geo, roof, 0, 0, 0);
    for (const side of [-1, 1]) {
      curve(Array.from({ length: 13 }, (_, i) => { const xx = (i / 12 - .5) * w; return V(x + xx, roofY(xx, side * d / 2), z + side * d / 2); }), roofEdge, .13);
      for (let xx = -w / 2 + .23; xx <= w / 2; xx += .43) {
        add(new THREE.CylinderGeometry(.14, .14, .18, 7), roofEdge, x + xx, roofY(xx, side * d / 2) - .07, z + side * (d / 2 + .04), new THREE.Euler(Math.PI / 2, 0, 0));
      }
    }
    rod(V(x - w * .255, y + h + .10, z), V(x + w * .255, y + h + .10, z), .18, roofEdge);
    for (const side of [-1, 1]) curve([V(x + side * w * .25, y + h + .1, z), V(x + side * w * .29, y + h + .15, z), V(x + side * w * .31, y + h + .52, z)], roofEdge, .15);
  }

  // DRAGON GATE: stone pillars and green tiled roofs, rather than a red torii.
  const gateX = 175, gateZ = 340, gateY = groundHeight(gateX, gateZ) + .16;
  for (const side of [-1, 1]) {
    for (const offset of [10.25, 15.45]) {
      const x = gateX + side * offset, height = offset < 11 ? 13.2 : 8.6;
      box(2.0, .45, 2.25, stone, x, gateY + .225, gateZ);
      box(1.4, height, 1.7, stone, x, gateY + height / 2, gateZ);
      box(1.95, .52, 2.12, cream, x, gateY + height - .22, gateZ);
      box(1.67, .35, 1.94, stone, x, gateY + 1.2, gateZ);
      // Recessed, elongated ornamental panels in the entrance stones.
      box(.7, height * .43, .045, jade, x, gateY + height * .49, gateZ - .872);
      for (let yy = 3; yy < height - 1.6; yy += 1.5) box(.10, .7, .08, gold, x, gateY + yy, gateZ - .906);
    }
    const sx = gateX + side * 12.85;
    box(5.1, 1.0, 1.75, stone, sx, gateY + 8.3, gateZ);
    ceramicRoof(6.3, 4.3, 1.85, sx, gateY + 8.8, gateZ);
    // Repeated wooden brackets below the secondary eaves.
    for (const xx of [-1.5, 0, 1.5]) { box(.25, .65, 2.4, jade, sx + xx, gateY + 8.3, gateZ); box(.7, .25, 2.9, jade, sx + xx, gateY + 8.53, gateZ); }
    // The guardians sit outside the driving lane on squared granite pedestals.
    const lionX = gateX + side * 12.25, lionZ = gateZ - 4.1;
    box(1.85, .55, 2.45, stone, lionX, gateY + .28, lionZ);
    box(1.56, .62, 2.07, cream, lionX, gateY + .78, lionZ);
    sphere(.57, .78, .82, stone, lionX, gateY + 1.74, lionZ + .05);
    sphere(.52, .56, .51, stone, lionX, gateY + 2.45, lionZ - .37);
    sphere(.30, .25, .40, stone, lionX, gateY + 2.32, lionZ - .75);
    for (const sx of [-1, 1]) {
      rod(V(lionX + sx * .38, gateY + 1.6, lionZ - .33), V(lionX + sx * .44, gateY + 1.12, lionZ - .78), .17, stone);
      sphere(.21, .14, .36, stone, lionX + sx * .44, gateY + 1.13, lionZ - .77);
      sphere(.16, .19, .15, stone, lionX + sx * .4, gateY + 2.77, lionZ - .3);
      sphere(.055, .06, .05, dark, lionX + sx * .22, gateY + 2.50, lionZ - .825);
    }
    for (let i = 0; i < 10; i++) { const angle = i / 10 * Math.PI * 2; sphere(.15, .16, .15, stone, lionX + Math.sin(angle) * .47, gateY + 2.40 + Math.cos(angle) * .48, lionZ - .24, 6); }
    sphere(.27, .27, .27, stone, lionX + side * .5, gateY + 1.28, lionZ - 1.01);
    curve([V(lionX, gateY + 1.6, lionZ + .65), V(lionX + .35, gateY + 1.95, lionZ + .95), V(lionX + .48, gateY + 2.30, lionZ + .67)], stone, .12);
  }
  box(20.5, 1.35, 2.2, stone, gateX, gateY + 12.95, gateZ);
  box(21.6, .32, 2.9, cream, gateX, gateY + 13.8, gateZ);
  ceramicRoof(23.2, 5.6, 2.45, gateX, gateY + 14.05, gateZ);
  for (let x = gateX - 9; x <= gateX + 9; x += 1.8) {
    box(.28, .62, 3, jade, x, gateY + 13.55, gateZ); box(.86, .22, 3.65, jade, x, gateY + 13.85, gateZ);
  }
  box(10.4, 2.0, .22, jade, gateX, gateY + 13.15, gateZ - 1.24);
  sign(0, gateX, gateY + 13.17, gateZ - 1.366, 9.9, 1.65, Math.PI);
  sign(1, gateX, gateY + 13.17, gateZ + 1.366, 9.9, 1.65, 0);

  function window(front: number, y: number, z: number, normal: number, w = 1.65, h = 2.48, trim: THREE.Material = cream) {
    box(.16, h + .31, w + .27, dark, front + normal * .035, y, z);
    box(.08, h, w, glass, front + normal * .13, y, z);
    for (const side of [-1, 1]) box(.24, h + .34, .14, trim, front + normal * .25, y, z + side * (w / 2 + .09));
    box(.30, .16, w + .47, trim, front + normal * .25, y + h / 2 + .1, z);
    box(.46, .17, w + .54, trim, front + normal * .34, y - h / 2 - .1, z);
    box(.07, h, .075, iron, front + normal * .20, y, z);
    box(.08, .07, w, iron, front + normal * .20, y + .2, z);
    if (random() > .75) box(.045, h * .87, w * .24, cream, front + normal * .18, y - .05, z + w * .34);
  }
  function balcony(front: number, y: number, z: number, normal: number, width: number, ornate = false) {
    const out = front + normal * 1.13, mat = ornate ? red : iron;
    box(1.42, .17, width, mat, front + normal * .67, y, z);
    for (let zz = -width / 2; zz <= width / 2; zz += .53) box(.08, .94, .075, mat, out, y + .57, z + zz);
    box(.12, .10, width + .15, mat, out, y + 1.06, z); box(.1, .08, width + .1, mat, out, y + .20, z);
    for (const side of [-1, 1]) {
      box(1.38, .1, .11, mat, front + normal * .64, y + 1.06, z + side * width / 2);
      rod(V(front + normal * .16, y - 1.03, z + side * (width / 2 - .25)), V(out, y - .12, z + side * (width / 2 - .25)), .085, mat);
    }
    if (ornate) for (let zz = -width / 2 + .6; zz < width / 2; zz += 1.1) {
      box(.075, .15, .65, gold, out + normal * .01, y + .65, z + zz);
      box(.075, .42, .10, gold, out + normal * .02, y + .62, z + zz);
    }
  }

  const shopPalette = [2, 3, 4, 5, 6, 11, 12, 13];
  function building(side: number, z: number, width: number, index: number, pagoda = false) {
    const normal = -side, front = 175 + side * 13, depth = pagoda ? 22 : 18 + index % 3 * 2;
    const floors = pagoda ? 4 : 3 + (index % 3), height = 5.4 + floors * 3.45;
    const base = Math.min(groundHeight(front, z - width / 2), groundHeight(front, z + width / 2)) - .30;
    // The upper storeys stay level while the shop thresholds step up the hill.
    // Using the uphill grade also keeps every canopy above the tall end of its parcel.
    const floorY = Math.max(groundHeight(front, z - width / 2), groundHeight(front, z + width / 2)) + .20;
    const wall = pagoda ? facades[2] : facades[index % facades.length], trim = pagoda ? red : cream;
    box(depth, height + floorY - base, width, wall, front + side * depth / 2, base + (height + floorY - base) / 2, z);
    box(.30, 1.16, width + .05, dark, front + normal * .025, floorY + .5, z);
    box(.39, .38, width + .50, trim, front + normal * .15, floorY + 5.5, z);
    for (const edge of [-1, 1]) box(.38, height - 5.7, .51, trim, front + normal * .12, floorY + (height + 5.7) / 2, z + edge * (width / 2 - .28));
    const count = Math.max(3, Math.round(width / 3.7)), step = (width - 2.2) / count;
    for (let i = 0; i < count; i++) {
      const wz = z - (count - 1) * step / 2 + i * step, ground = groundHeight(front, wz) + .20;
      // Tall, individually recessed storefront windows with narrow timber mullions.
      box(.14, 3.3, step - .39, dark, front + normal * .035, ground + 1.95, wz);
      box(.035, 2.92, step - .70, shopGlass, front + normal * .135, ground + 1.9, wz);
      for (const edge of [-1, 1]) box(.25, 3.62, .19, pagoda ? red : jade, front + normal * .23, ground + 2.0, wz + edge * (step / 2 - .19));
      box(.21, .15, step - .5, gold, front + normal * .22, ground + 2.62, wz);
      box(.18, 3.0, .10, pagoda ? red : jade, front + normal * .20, ground + 1.95, wz);
      for (let floor = 0; floor < floors; floor++) window(front, floorY + 7.05 + floor * 3.45, wz, normal, pagoda ? 1.78 : 1.61, 2.40, trim);
      // Crates, paper boxes, and hanging menu cards belong inside the shop reveal.
      if ((index + i) % 3 === 0) {
        box(.12, .58, .65, cream, front + normal * .24, ground + 1.82, wz + .47);
        for (let j = 0; j < 3; j++) box(.25, .23, .45, gold, front + normal * .15, ground + .53 + j * .28, wz - .53);
      }
      // Each canvas shade follows its shop's threshold on the climbing street.
      box(1.53, .09, step - .35, awnings[index % 3], front + normal * .85, ground + 3.71, wz, new THREE.Euler(0, 0, -normal * .17));
      box(.075, .30, step - .35, awnings[index % 3], front + normal * 1.61, ground + 3.47, wz);
      for (let stripe = -step / 2 + .4; stripe < step / 2 - .15; stripe += .72) box(.075, .30, .11, cream, front + normal * 1.65, ground + 3.47, wz + stripe);
    }
    const signIndex = pagoda ? (side < 0 ? 9 : 10) : shopPalette[index % shopPalette.length];
    box(.25, 1.38, width - .78, pagoda ? red : awnings[index % 3], front + normal * .29, floorY + 4.5, z);
    sign(signIndex, front + normal * .43, floorY + 4.52, z, width - 1.12, 1.13, normal * Math.PI / 2);
    for (const [level, depthExtra, thick] of [[height - .55, .65, .30], [height, 1.0, .28], [height + .40, .7, .28]]) {
      box(depth + depthExtra, thick, width + depthExtra, trim, front + side * depth / 2, floorY + level, z);
    }
    box(depth - .7, .17, width - .6, dark, front + side * depth / 2, floorY + height + .6, z);
    box(.7, .95, width + .35, wall, front + normal * .16, floorY + height + .76, z);
    box(1.0, .21, width + .6, trim, front + normal * .22, floorY + height + 1.25, z);
    for (let zz = -width / 2 + 1; zz < width / 2; zz += .75) box(.52, .25, .22, trim, front + normal * .39, floorY + height - .88, z + zz);
    // A real downpipe and jointed drain offset break up the plaster at party walls.
    const drainZ = z + width / 2 - .68;
    rod(V(front + normal * .35, floorY + .3, drainZ), V(front + normal * .35, floorY + height - .75, drainZ), .075, copper);
    for (let y = 2; y < height; y += 4.2) box(.15, .09, .32, iron, front + normal * .31, floorY + y, drainZ);
    if (pagoda) {
      for (let floor = 1; floor <= 3; floor++) balcony(front, floorY + 5.56 + floor * 3.45, z, normal, width - 1.0, true);
      ceramicRoof(depth + 2.3, width + 2.6, 2.3, front + side * depth / 2, floorY + height + 1.38, z);
      const towerX = front + side * 4.4, towerZ = z + (z < 500 ? 1 : -1) * (width / 2 - 4.2), towerBase = floorY + height + 2.0;
      box(6.3, 4.0, 6.3, facades[2], towerX, towerBase + 2, towerZ);
      for (const zz of [-1.9, 0, 1.9]) window(towerX + normal * 3.21, towerBase + 2.1, towerZ + zz, normal, 1.3, 2.1, red);
      ceramicRoof(8.8, 8.8, 2.1, towerX, towerBase + 4.2, towerZ);
      box(3.6, 2.65, 3.6, red, towerX, towerBase + 6.15, towerZ);
      ceramicRoof(6.2, 6.2, 1.8, towerX, towerBase + 7.5, towerZ);
      rod(V(towerX, towerBase + 9.0, towerZ), V(towerX, towerBase + 10.75, towerZ), .11, gold);
      sphere(.28, .4, .28, gold, towerX, towerBase + 10.1, towerZ);
    } else if (index % 3 !== 1) {
      const escapeZ = z + width * .22;
      for (let floor = 0; floor < floors - 1; floor++) {
        const fy = floorY + 5.65 + floor * 3.45;
        balcony(front, fy, escapeZ, normal, 3.55);
        const startZ = escapeZ + (floor % 2 ? 1.2 : -1.2), endZ = escapeZ + (floor % 2 ? -1.2 : 1.2);
        for (const offset of [.43, .99]) rod(V(front + normal * offset, fy + .1, startZ), V(front + normal * offset, fy + 3.45, endZ), .055, iron);
        for (let step = 0; step < 12; step++) box(.60, .055, .24, iron, front + normal * .71, fy + step * 3.45 / 12, THREE.MathUtils.lerp(startZ, endZ, step / 12));
      }
    }
    // Projecting wooden signs can be read while driving north on Grant.
    if (index % 2 === 0 && !pagoda) {
      const sx = front + normal * 1.13, sz = z - width / 2 + 1.45;
      rod(V(front, floorY + 8.85, sz), V(sx + normal * .53, floorY + 8.85, sz), .075, iron);
      box(1.4, 3.05, .22, awnings[index % 3], sx, floorY + 7.05, sz);
      sign(index % 4 === 0 ? 7 : 8, sx, floorY + 7.05, sz - .13, 1.27, 2.84, Math.PI);
    }
    // Small rooftop service structures make believable roof silhouettes in flight.
    if (!pagoda) {
      box(2.8, 2.15, 3.2, facades[(index + 2) % facades.length], front + side * (depth - 3.5), floorY + height + 1.45, z + width * .20);
      box(3.2, .17, 3.6, dark, front + side * (depth - 3.5), floorY + height + 2.62, z + width * .20);
      for (const offset of [-1, 1]) add(new THREE.CylinderGeometry(.19, .26, 1.2, 7), copper, front + side * 5.5, floorY + height + 1.17, z + offset * 3);
    }
  }

  // Parcels stay contiguous along Grant; California remains a full cross street.
  for (const side of [-1, 1]) {
    const parcels = [[372, 17], [390.5, 19], [410, 19], [429, 18], [448, 19], [473, 22], [527, 22], [551, 23], [574, 22], [596, 21], [618, 22], [640.5, 22], [659, 14]];
    parcels.forEach(([z, w], index) => building(side, z, w, index + (side > 0 ? 2 : 0), z === (side < 0 ? 473 : 527)));
  }

  // Red silk globes stay below the glide corridor and span a gently sagging wire.
  const lantern = (x: number, y: number, z: number, radius: number) => {
    sphere(radius, radius * 1.2, radius, lanternRed, x, y, z, 14);
    for (const dy of [-.78, .78]) add(new THREE.CylinderGeometry(radius * .40, radius * .40, .13, 10), lanternGold, x, y + dy * radius, z);
    for (let rib = 0; rib < 8; rib++) {
      const a = rib / 8 * Math.PI * 2;
      curve([-1, -.5, 0, .5, 1].map(t => { const r = Math.sqrt(1 - t * t * .68) * radius * 1.005; return V(x + Math.cos(a) * r, y + t * radius, z + Math.sin(a) * r); }), lanternGold, .015, 8);
    }
    rod(V(x, y - radius * 1.08, z), V(x, y - radius * 1.80, z), .035, lanternGold);
    add(new THREE.ConeGeometry(.09, .29, 6), lanternGold, x, y - radius * 1.72, z);
  };
  for (const [index, z] of [397, 442, 557, 608, 651].entries()) {
    const base = Math.max(groundHeight(162, z), groundHeight(188, z)) + 12.3;
    const wire = (u: number) => V(161.4 + u * 27.2, base - Math.sin(Math.PI * u) * 1.55, z + Math.sin(Math.PI * u) * .15);
    curve(Array.from({ length: 10 }, (_, i) => wire(i / 9)), iron, .035);
    for (let j = 1; j <= 7; j++) {
      const p = wire(j / 8), size = j % 2 ? .46 : .58;
      rod(p, p.clone().add(V(0, -.51, 0)), .018, iron); lantern(p.x, p.y - .92, p.z, size);
    }
    if (index === 1 || index === 3) {
      for (const side of [-1, 1]) { const x = 175 + side * 11.5; lantern(x, groundHeight(x, z) + 4.35, z - 6, .49); }
    }
  }
  // Sidewalk fixtures stay clear of the 14.8 m road and of California's crossing.
  for (const z of [363, 417, 469, 535, 590, 657]) for (const side of [-1, 1]) {
    const x = 175 + side * 9.3, y = groundHeight(x, z) + .23;
    box(.38, .25, .38, iron, x, y + .12, z); rod(V(x, y, z), V(x, y + 5.9, z), .10, jade);
    box(.7, .19, .7, gold, x, y + 5.87, z); sphere(.32, .4, .32, cream, x, y + 6.30, z);
    ceramicRoof(1.18, 1.18, .36, x, y + 6.61, z);
    // Practical curbside bollards are small enough to preserve an open sidewalk.
    add(new THREE.CylinderGeometry(.19, .24, .85, 7), iron, x, y + .43, z + 2.7);
  }
  sign(14, 185.5, groundHeight(185.5, 345) + 3.1, 345, 3.8, .82, Math.PI);
  sign(15, 184.5, groundHeight(184.5, 485) + 3.8, 485, 4.4, .90, Math.PI);

  for (const [mat, geometries] of batches) {
    const geometry = mergeGeometries(geometries)!; geometries.forEach(geo => geo.dispose()); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = mat.name; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    if (mat === roof || mat === roofEdge) roofMeshes.push(mesh);
  }
  return {
    group,
    update(time: number, _progress: number) { lanternRed.emissiveIntensity = .055 + Math.sin(time * .68) * .007; },
    setQuality(low: boolean) {
      for (const mesh of roofMeshes) mesh.castShadow = !low;
      grain.anisotropy = low ? 1 : 4; signMap.anisotropy = low ? 1 : 4;
    },
  };
}

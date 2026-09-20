import * as THREE from 'three';
import { CHECKPOINTS, ROAD_HALF_WIDTH, TRACK_LENGTH, sampleRoute, routeSlope, type Obstacle } from './route';

// Original procedural architecture, with CC0 scanned masonry surface materials.
type Part = { position: THREE.Vector3; scale: THREE.Vector3; rotation: THREE.Euler; atlasVariant: number; color?: THREE.Color };
type Batch = { name: string; chunk: number; casts: boolean; horizon: boolean; geometry: THREE.BufferGeometry; material: THREE.Material; parts: Part[] };
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// Painted Edwardian / Beaux-Arts streetfronts: seafoam, salmon, ochre,
// warm brick, periwinkle and buttercream, all with a deliberate warm/cool balance.
const stoneColors = ['#54a99a', '#dc8974', '#d4a041', '#b85c41', '#8da5ce', '#e8d2a0'];
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!; paint(context);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}
// A single 3.25-metre storey, never an entire building stretched onto a wall.
function facadeTexture(style: number) {
  const random = rng(82 + style * 717);
  return canvasTexture(1024, 256, ctx => {
    const colors = ['#78bbaa', '#e8a18a', '#e8b962', '#b9694b', '#a8b8e1', '#f3dfb8'];
    ctx.fillStyle = colors[style % colors.length]; ctx.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 18000; i++) {
      ctx.fillStyle = random() > .5 ? 'rgba(30,22,17,.038)' : 'rgba(255,243,215,.06)';
      ctx.fillRect(random() * 1024, random() * 256, 1 + random() * 3, 1 + random() * 2);
    }
    const brick = style === 3;
    const row = brick ? 12 : 42, width = brick ? 43 : 130;
    ctx.strokeStyle = brick ? 'rgba(213,200,177,.28)' : 'rgba(49,43,36,.16)'; ctx.lineWidth = brick ? 1.4 : 1;
    for (let y = 0, r = 0; y < 256; y += row, r++) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
      for (let x = -width + (r % 2) * width / 2; x < 1024; x += width) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + row); ctx.stroke();
      }
    }
    // Subtle rain streaks and soot collect beneath ledges.
    for (let i = 0; i < 65; i++) {
      const x = random() * 1024, g = ctx.createLinearGradient(0, 0, 0, 80 + random() * 170);
      g.addColorStop(0, 'rgba(29,29,26,.045)'); g.addColorStop(1, 'rgba(29,29,26,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + random() * 9, 240);
    }
  });
}
function windowTexture(variant: number, emissive = false) {
  const random = rng(550 + variant);
  return canvasTexture(128, 256, ctx => {
    const lit = variant < 2;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, lit ? (emissive ? '#ffe0a3' : '#c7a16c') : (emissive ? '#010203' : '#5086a4'));
    g.addColorStop(.45, lit ? (emissive ? '#af7640' : '#957650') : (emissive ? '#020305' : '#356479'));
    g.addColorStop(1, lit ? (emissive ? '#291c15' : '#494238') : (emissive ? '#000000' : '#254857'));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
    // Recessed rooms, curtain folds and half-drawn blinds, not solid luminous squares.
    ctx.fillStyle = lit ? '#61523e' : '#23343b';
    if (variant % 2 === 0) {
      ctx.fillRect(0, 0, 21, 256); ctx.fillRect(106, 0, 22, 256);
      ctx.fillStyle = lit ? '#c3af80' : '#43545a';
      for (let x = 2; x < 22; x += 5) ctx.fillRect(x, 0, 2, 256);
      for (let x = 108; x < 128; x += 5) ctx.fillRect(x, 0, 2, 256);
    } else {
      for (let y = 0; y < 60 + variant * 9; y += 9) {
        ctx.fillStyle = lit ? '#b9ab8c' : '#3d4b50'; ctx.fillRect(0, y, 128, 6);
      }
    }
    if (lit) {
      ctx.fillStyle = '#3d352c'; ctx.fillRect(30, 203, 77, 53);
      ctx.fillRect(87, 153, 4, 57); ctx.fillStyle = '#d6b77b';
      ctx.beginPath(); ctx.moveTo(70, 156); ctx.lineTo(107, 156); ctx.lineTo(98, 138); ctx.lineTo(79, 138); ctx.fill();
    }
    ctx.fillStyle = emissive ? '#11100f' : '#2a3233';
    ctx.fillRect(60, 0, 6, 256); ctx.fillRect(0, 124, 128, 7);
    ctx.fillStyle = 'rgba(163,185,191,.14)';
    for (let i = 0; i < 3; i++) ctx.fillRect(10 + random() * 100, 0, 2 + random() * 8, 256);
  });
}
function labelTexture(text: string, color = '#f1d5b1', bg = '#233246', sub?: string) {
  return canvasTexture(1024, 160, ctx => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 160);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(10, 10, 1004, 140);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${sub ? 55 : 64}px ${text.endsWith(' ST') ? 'sans-serif' : 'Georgia'}`; ctx.fillText(text, 512, sub ? 60 : 82, 970);
    if (sub) { ctx.font = '19px sans-serif'; ctx.fillText(sub, 512, 118, 940); }
  });
}

export function createWorld(scene: THREE.Scene) {
  const world = new THREE.Group(); world.name = 'Powell Street · architectural streetscape'; scene.add(world);
  const random = rng(2137), batches = new Map<string, Batch>(), obstacles: Obstacle[] = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const sphereGeometry = new THREE.SphereGeometry(1, 8, 6);
  const standard = (color: THREE.ColorRepresentation, roughness = .8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const materials = {
    stone: standard('#d4b994'), trim: standard('#f2dfb8'), darkTrim: standard('#344853'),
    sidewalk: standard('#b7b4a3'), curb: standard('#d9d4c3'), asphalt: standard('#121b2a', .65, .06),
    roadLine: standard('#b4a07c', .6), rail: standard('#687888', .2, .85), metal: standard('#253449', .6, .7),
    foliage: standard('#2d7051'), trunk: standard('#6a5149'), grass: standard('#203b42'),
    warm: new THREE.MeshBasicMaterial({ color: '#ffcc8b' }), pale: new THREE.MeshBasicMaterial({ color: '#c3dedb' }),
    cyan: new THREE.MeshBasicMaterial({ color: '#80a978' }), red: new THREE.MeshBasicMaterial({ color: '#ff665b' }),
    black: standard('#171f2c'), glass: standard('#294259', .17, .65), gold: standard('#ceac76', .36, .7),
  };
  const sharedSurfaceMaterials = new Map<string, THREE.MeshStandardMaterial>();
  function part(key: string, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = new THREE.Euler(), geometry: THREE.BufferGeometry = boxGeometry) {
    // Per-instance colors let cream cornices, green sash frames and brown
    // stone share identical physical shaders without flattening the palette.
    let instanceColor: THREE.Color | undefined;
    if (material instanceof THREE.MeshStandardMaterial && material !== materials.asphalt &&
        !material.userData.windowAtlas && !material.transparent && material.emissive.getHex() === 0) {
      const surfaceKey = [material.roughness, material.metalness, material.side, material.map?.uuid ?? '',
        material.normalMap?.uuid ?? '', material.normalScale.x, material.normalScale.y,
        material.roughnessMap?.uuid ?? '', material.envMap?.uuid ?? '', material.envMapIntensity].join(':');
      instanceColor = material.color.clone();
      if (!sharedSurfaceMaterials.has(surfaceKey)) {
        const shared = material.clone(); shared.color.set('#ffffff');
        sharedSurfaceMaterials.set(surfaceKey, shared);
      }
      material = sharedSurfaceMaterials.get(surfaceKey)!;
    }
    const chunk = Math.floor(z / 320);
    const casts = /building-|angled-bay|roof-|facade-belt|cornice-|corner-quoins|projecting-window-sills|window-lintel|window-jamb|awning|fire-escape|escape-stair|balconette|bay-corner|gable-|turret-|mansard-|dormer|victorian-/.test(key);
    // Architectural pieces sharing a material share a draw, even if they have
    // different semantic names. Split only by city block for effective culling.
    const horizon = /^(distant-skyline|skyline-)/.test(key);
    const batchKey = `${geometry.uuid}:${material.uuid}:${chunk}:${casts ? 1 : 0}:${horizon ? 'h' : 'c'}`;
    if (!batches.has(batchKey)) batches.set(batchKey, { name: key, chunk, casts, horizon, geometry, material, parts: [] });
    const batch = batches.get(batchKey)!;
    const atlasVariant = material.userData.windowAtlas ? Number(key.match(/-(\d+)$/)?.[1] ?? 0) % 8 : 0;
    batch.parts.push({ position: v(x, y, z), scale: v(sx, sy, sz), rotation, atlasVariant, color: instanceColor });
  }
  const box = (key: string, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation?: THREE.Euler) => part(key, material, x, y, z, sx, sy, sz, rotation);
  const pole = (key: string, mat: THREE.Material, x: number, y: number, z: number, radius: number, height: number) => part(key, mat, x, y, z, radius, height, radius, new THREE.Euler(), cylinderGeometry);
  function plane(key: string, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, rotation: THREE.Euler) {
    part(key, material, x, y, z, w, h, 1, rotation, planeGeometry);
  }
  function segment(key: string, material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const mid = a.clone().add(b).multiplyScalar(.5), dir = b.clone().sub(a);
    const quat = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), dir.clone().normalize());
    part(key, material, mid.x, mid.y, mid.z, radius, dir.length(), radius, new THREE.Euler().setFromQuaternion(quat), cylinderGeometry);
  }
  function strip(material: THREE.Material, x1: number, x2: number, from = -100, to = 1490, lift = 0, step = 3) {
    if (x1 > x2) [x1, x2] = [x2, x1];
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const count = Math.ceil((to - from) / step);
    for (let i = 0; i <= count; i++) {
      const z = from + (to - from) * i / count, p = sampleRoute(z);
      positions.push(p.x + x1, p.y + lift, z, p.x + x2, p.y + lift, z);
      uvs.push(0, z / 12, (x2 - x1) / 12, z / 12);
      if (i < count) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; world.add(mesh); return mesh;
  }

  // Fine road grain remains beneath the scanned, sunlit surface material.
  const asphaltTexture = canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#7c8594'; ctx.fillRect(0, 0, 256, 256);
    const r = rng(193);
    for (let i = 0; i < 20000; i++) { const c = 72 + r() * 105; ctx.fillStyle = `rgba(${c},${c},${c},.22)`; ctx.fillRect(r() * 256, r() * 256, 1, 1); }
    ctx.strokeStyle = '#646e81'; ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(26, 65); ctx.lineTo(18, 124); ctx.lineTo(36, 194); ctx.stroke();
  });
  asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping; materials.asphalt.map = asphaltTexture;
  materials.asphalt.envMapIntensity = .10;
  strip(materials.asphalt, -ROAD_HALF_WIDTH, ROAD_HALF_WIDTH).name = 'powell-asphalt';
  strip(standard('#73858b'), -310, 310, -170, 1610, -.23, 8);
  const intersections = [95, 315, 550, 710, 920, 1180];
  for (const side of [-1, 1]) {
    let from = -100;
    for (const stop of [...intersections, 1500]) {
      const to = stop - 9;
      strip(materials.sidewalk, side * (ROAD_HALF_WIDTH + .12), side * 11.65, from, to, .17);
      strip(materials.curb, side * ROAD_HALF_WIDTH, side * (ROAD_HALF_WIDTH + .17), from, to, .19);
      strip(materials.darkTrim, side * (ROAD_HALF_WIDTH - .25), side * (ROAD_HALF_WIDTH - .1), from, to, .015);
      from = stop + 9;
    }
  }
  // Two complete cable-car tracks and the center slots.
  for (const track of [-3.1, 3.1]) {
    for (const offset of [-.72, .72]) strip(materials.rail, track + offset - .045, track + offset + .045, -100, 1490, .044);
    strip(materials.black, track - .065, track + .065, -100, 1490, .041);
  }
  for (const offset of [-.15, .15]) strip(materials.roadLine, offset - .038, offset + .038, -100, 1310, .04);
  for (let z = 0; z < 1400; z += 13) {
    const p = sampleRoute(z), rot = new THREE.Euler(-Math.PI / 2 - Math.atan(routeSlope(z)), 0, 0);
    for (const side of [-1, 1]) plane('edge-mark', materials.roadLine, p.x + side * (ROAD_HALF_WIDTH - .55), p.y + .026, z, .10, 4.5, rot);
    if (z % 26 === 0) for (const side of [-1, 1]) box('pavement-joint', materials.darkTrim, p.x + side * 9.55, p.y + .183, z, 4.0, .008, .025);
  }
  const streetNames = ['PINE ST', 'BUSH ST', 'SUTTER ST', 'POST ST', 'GEARY ST', 'ELLIS ST'];
  for (let n = 0; n < intersections.length; n++) {
    const z = intersections[n], p = sampleRoute(z);
    // Cross streets stop at the main road; a level slab here would cut through a hill.
    for (const side of [-1, 1]) box('crossroads', materials.asphalt, p.x + side * (ROAD_HALF_WIDTH + 45), p.y - .12, z, 90, .22, 17);
    for (const zz of [-10.5, 10.5]) for (let x = -6.4; x <= 6.4; x += 1.28) {
      const pp = sampleRoute(z + zz);
      box('crosswalk', materials.curb, pp.x + x, pp.y + .025, z + zz, .62, .026, 3.1, new THREE.Euler(-Math.atan(routeSlope(z + zz)), 0, 0));
    }
    const signMat = new THREE.MeshBasicMaterial({ map: labelTexture(streetNames[n], '#d5e3d5', '#234e4d'), side: THREE.DoubleSide });
    pole('traffic-pole', materials.metal, p.x - 8.15, p.y + 3.7, z - 12, .09, 7.4);
    box('street-sign-back', materials.metal, p.x - 8.1, p.y + 5.5, z - 12, 3.1, .62, .1);
    plane(`street-sign-${n}`, signMat, p.x - 8.1, p.y + 5.5, z - 12.07, 3.1, .62, new THREE.Euler(0, Math.PI, 0));
    box('traffic-head', materials.metal, p.x - 6.9, p.y + 4.3, z - 12, .45, 1.18, .45);
    part('traffic-green', materials.cyan, p.x - 6.9, p.y + 4.01, z - 12.24, .105, .105, .05, new THREE.Euler(), sphereGeometry);
  }

  // Service details make the road read as a real working city at car height.
  const manholeTexture = canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#484b48'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#85877e'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(128,128,119,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#2b302d'; ctx.lineWidth = 3;
    for(let i = 24; i < 242; i += 15) {ctx.beginPath();ctx.moveTo(i,18);ctx.lineTo(i,238);ctx.stroke();ctx.beginPath();ctx.moveTo(18,i);ctx.lineTo(238,i);ctx.stroke();}
    ctx.fillStyle = '#5b5e55'; ctx.fillRect(47,91,162,68);
    ctx.fillStyle = '#a5a48f'; ctx.textAlign = 'center'; ctx.font = 'bold 23px serif'; ctx.fillText('S.F.W.D.',128,120); ctx.font='15px sans-serif';ctx.fillText('WATER',128,144);
  });
  const manholeMaterial = new THREE.MeshStandardMaterial({map:manholeTexture,roughness:.62,metalness:.55});
  const disc = new THREE.CircleGeometry(1, 32);
  const drainMaterial = standard('#242b28',.5,.6), patchMaterial = standard('#252b2c',.89);
  for(let z = 38; z < 1380; z += 57) {
    const p = sampleRoute(z), rotation = new THREE.Euler(-Math.PI/2 - Math.atan(routeSlope(z)),0,0);
    part('cast-iron-manhole',manholeMaterial,p.x + (z % 3 === 0 ? 1.5 : -1.35),p.y+.04,z,.48,.48,1,rotation,disc);
    for(const side of [-1,1]) {
      box('curb-drain-frame',materials.rail,p.x+side*(ROAD_HALF_WIDTH-.39),p.y+.027,z+4,.53,.025,.92);
      box('curb-drain',drainMaterial,p.x+side*(ROAD_HALF_WIDTH-.39),p.y+.042,z+4,.43,.018,.82);
      for(let bar=-.34;bar<=.34;bar+=.12) box('curb-drain-bars',materials.rail,p.x+side*(ROAD_HALF_WIDTH-.39),p.y+.056,z+4+bar,.43,.013,.035);
    }
    plane('asphalt-repair',patchMaterial,p.x+5.3,p.y+.019,z-8,1.18,2.25,rotation);
    // Small worn parking-bay ticks stay outside the cable-car tracks.
    for(const side of [-1,1]) plane('parking-bay-paint',materials.curb,p.x+side*(ROAD_HALF_WIDTH-1.2),p.y+.025,z-2,.065,1.25,rotation);
  }
  const sidewalkJoint = standard('#777b73');
  for(let z=-90;z<1440;z+=2.2) {
    if(intersections.some(cross=>Math.abs(cross-z)<10)) continue;
    const p=sampleRoute(z);
    for(const side of [-1,1]) {
      box('sidewalk-concrete-joint',sidewalkJoint,p.x+side*9.48,p.y+.179,z,3.65,.005,.014);
      box('sidewalk-concrete-joint',sidewalkJoint,p.x+side*9.50,p.y+.18,z,.012,.005,2.2);
    }
  }

  const facadeMaterials = stoneColors.map((_, i) => new THREE.MeshStandardMaterial({ map: facadeTexture(i), roughness: .91 }));
  const sideMaterials = stoneColors.map(c => standard(c));
  const victorianFacades = stoneColors.map((color, style) => new THREE.MeshStandardMaterial({
    map: canvasTexture(1024, 256, ctx => {
      ctx.fillStyle = ['#72bca6', '#eda08a', '#e8b962', '#b9694b', '#a7bae3', '#f3dfb8'][style]; ctx.fillRect(0,0,1024,256);
      // Actual narrow lap siding, with a bright top edge and shaded overlap.
      for(let y=0;y<256;y+=10) {ctx.fillStyle='rgba(31,54,60,.22)';ctx.fillRect(0,y,1024,1.1);ctx.fillStyle='rgba(255,246,211,.27)';ctx.fillRect(0,y+1.3,1024,.75);}
      void color;
    }), roughness: .78,
  }));

  // CC0 Poly Haven scans add surface microstructure at approximately two
  // metres per plaster tile (one metre for the brick scan). Front facades are exactly one storey high, so brick and
  // plaster detail never stretches vertically across an entire building.
  const textureLoader = new THREE.TextureLoader();
  const scannedTexture = (path: string, repeatX: number, repeatY: number, color = false) => {
    const texture = textureLoader.load(path);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY); texture.anisotropy = 8;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const plasterFloorNormal = scannedTexture('/assets/plaster-normal.jpg', 13, 1.625);
  const brickFloorNormal = scannedTexture('/assets/brick-normal.jpg', 26, 3.25);
  const brickFloorColor = scannedTexture('/assets/brick-color.jpg', 26, 3.25, true);
  const plasterBodyNormal = scannedTexture('/assets/plaster-normal.jpg', 12, 12);
  for (let style = 0; style < facadeMaterials.length; style++) {
    const material = facadeMaterials[style];
    material.normalMap = style === 3 ? brickFloorNormal : plasterFloorNormal;
    material.normalScale.set(.15, .15);
    if (style === 3) {
      material.map = brickFloorColor;
      material.color.set('#ffd5ab');
    }
    sideMaterials[style].normalMap = plasterBodyNormal;
    sideMaterials[style].normalScale.set(.12, .12);
  }

  // Eight interiors occupy one atlas; a per-instance tile attribute preserves
  // lit/dark rooms and curtains while removing seven window draws per block.
  const windowTileColors = Array.from({length: 8}, (_, i) => windowTexture(i));
  const windowTileEmission = Array.from({length: 8}, (_, i) => windowTexture(i, true));
  function windowAtlas(tiles: THREE.CanvasTexture[]) {
    return canvasTexture(512, 512, ctx => tiles.forEach((tile, i) => {
      ctx.drawImage(tile.image as HTMLCanvasElement, (i % 4) * 128, Math.floor(i / 4) * 256, 128, 256);
    }));
  }
  const windowAtlasMaterial = new THREE.MeshStandardMaterial({
    map: windowAtlas(windowTileColors), emissiveMap: windowAtlas(windowTileEmission), emissive: '#ffe1b2', emissiveIntensity: .24,
    roughness: .26, metalness: .17, envMapIntensity: .5,
  });
  windowAtlasMaterial.userData.windowAtlas = true;
  windowAtlasMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 instanceAtlasOffset;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vMapUv * vec2(0.25, 0.5) + instanceAtlasOffset;
        vEmissiveMapUv = vEmissiveMapUv * vec2(0.25, 0.5) + instanceAtlasOffset;
      `);
  };
  windowAtlasMaterial.customProgramCacheKey = () => 'sf-window-atlas-v1';
  const windowMaterials = Array.from({length: 8}, () => windowAtlasMaterial);
  const windowFrame = ['#ffedc6', '#285e60', '#fff1c7', '#edc796', '#2e547c', '#a05246'].map(c => standard(c));
  const paintedTrim = ['#e9e7bf', '#f9dab3', '#266175', '#e9cc92', '#f1deaf', '#48797a'].map(c => standard(c));
  const shopBases = ['#245c5e', '#843d42', '#245675', '#663e36', '#304e7e', '#a65e41'].map(c => standard(c));
  const roofSlate = standard('#345f76');
  const copperRoof = standard('#4b8b82', .67, .16);
  const storefrontGlass = [standard('#365e67', .19, .25), standard('#376d79', .12, .35), standard('#556d62', .2, .22)];
  const shopNames = ['POWELL STREET BOOKS', 'CAFÉ MARCEL', 'THE STRATFORD', 'GOLDEN GATE CAMERA', 'SAN FRANCISCO OPTICAL', 'BOTTEGA', 'CITY LIGHT FLORIST', 'SUTTER JEWELERS', 'UNION COFFEE', 'GRAND TAILORS', 'PACIFIC RECORDS', 'THE CABLE CAR BAKERY', 'RUE & ROSE', 'HOTEL VICTORIA', 'POST STREET GALLERY', 'CALIFORNIA WINES', 'PAPER & INK', 'FAR EAST ANTIQUES'];
  const shopMaterials = shopNames.map((name, i) => new THREE.MeshStandardMaterial({ map: labelTexture(name, i % 3 === 0 ? '#e0d3b2' : '#dfdfd0', ['#1d6869', '#9b403e', '#284f86', '#896323'][i % 4]), roughness: .75, emissive: '#d6bf93', emissiveIntensity: .045, side: THREE.DoubleSide }));
  const shopAwningMaterials = ['#087c80', '#b74334', '#d29b37', '#315f99', '#cb7757'].map(c => standard(c));
  const warmInterior = new THREE.MeshStandardMaterial({color: '#9d845d', roughness: .85, emissive: '#e8b772', emissiveIntensity: .17});
  const paper = standard('#f0e1bf'), pottery = standard('#b76d48'), redPaint = standard('#b9493e');
  // Half-octagonal bay shell. Angled cheeks and projecting sills give Victorian
  // facades their actual silhouette, rather than rectangular shelves.
  const archMoulding = new THREE.TorusGeometry(.82, .105, 6, 24, Math.PI);
  const archOpening = new THREE.CircleGeometry(.80, 24, 0, Math.PI);
  const bayShape = new THREE.Shape();
  bayShape.moveTo(-1.65, 0); bayShape.lineTo(-.82, .91); bayShape.lineTo(.82, .91); bayShape.lineTo(1.65, 0); bayShape.closePath();
  const bayGeometry = new THREE.ExtrudeGeometry(bayShape, {depth: 1, bevelEnabled: false});
  // Shape X -> world Z, shape Y -> world -X, extrusion Z -> world Y.
  const bayTransform = new THREE.Matrix4().set(0,-1,0,0, 0,0,1,0, -1,0,0,0, 0,0,0,1);
  bayGeometry.applyMatrix4(bayTransform); bayGeometry.computeVertexNormals();
  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-1, 0); pedimentShape.lineTo(1, 0); pedimentShape.lineTo(0, 1); pedimentShape.closePath();
  const pedimentGeometry = new THREE.ExtrudeGeometry(pedimentShape, {depth: 1, bevelEnabled: false});
  pedimentGeometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,0, 0,1,0,0, -1,0,0,0, 0,0,0,1));
  const mansardGeometry = new THREE.CylinderGeometry(1.02, Math.SQRT2, 1, 4);
  mansardGeometry.rotateY(Math.PI / 4);
  const turretRoofGeometry = new THREE.ConeGeometry(1, 1, 8);
  const bracketShape = new THREE.Shape();
  bracketShape.moveTo(0,0);bracketShape.lineTo(0,1);bracketShape.lineTo(.92,1);bracketShape.lineTo(.92,.75);bracketShape.bezierCurveTo(.47,.72,.31,.48,.17,.12);bracketShape.closePath();
  const victorianBracket = new THREE.ExtrudeGeometry(bracketShape,{depth:.22,bevelEnabled:false});
  const flowerMaterials = [standard('#d75c7e'), standard('#f3c354')];
  function facadeWindow(front: number, y: number, z: number, side: number, style: number, wi: number, width = 1.22, height = 1.93) {
    const orient = new THREE.Euler(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0), frame = windowFrame[style % 6];
    box('window-recesses', materials.darkTrim, front - side * .028, y, z, .075, height + .19, width + .23);
    plane(`window-room-${wi}`, windowMaterials[wi], front - side * .072, y, z, width, height, orient);
    for (const zz of [-1, 1]) box(`window-jamb-${style % 6}`, frame, front - side * .11, y, z + zz * (width / 2 + .09), .15, height + .3, .13);
    box(`window-lintel-${style % 6}`, frame, front - side * .115, y + height / 2 + .10, z, .21, .17, width + .44);
    box('projecting-window-sills', paintedTrim[style], front - side * .17, y - height / 2 - .11, z, .36, .15, width + .48);
    // The actual sash lies inside the stone reveal.
    box(`window-sash-${style % 6}`, frame, front - side * .099, y, z, .05, height, .052);
    box(`window-sash-${style % 6}`, frame, front - side * .10, y - .01, z, .051, .055, width);
    if (style === 0 || style === 4) box('limestone-keystone', materials.trim, front - side * .15, y + height / 2 + .18, z, .23, .29, .21);
  }
  function bay(front: number, y: number, z: number, side: number, style: number, wi: number) {
    const rotation = new THREE.Euler(0, side === 1 ? 0 : Math.PI, 0);
    part(`angled-bay-shell-${style}`, sideMaterials[style], front, y - 1.28, z, 1, 2.64, 1, rotation, bayGeometry);
    part('angled-bay-sill', paintedTrim[style], front - side * .035, y - 1.34, z, 1.12, .17, 1.1, rotation, bayGeometry);
    part('angled-bay-cap', paintedTrim[style], front - side * .035, y + 1.26, z, 1.12, .17, 1.1, rotation, bayGeometry);
    facadeWindow(front - side * .92, y + .02, z, side, style, wi, 1.29, 1.95);
    // Two diagonal glazed cheeks; their normal is tilted 45 degrees from front.
    for (const zz of [-1, 1]) {
      const centerX = front - side * .47, centerZ = z + zz * 1.245;
      const rot = new THREE.Euler(0, (side < 0 ? Math.PI / 2 : -Math.PI / 2) + zz * side * Math.PI / 4, 0);
      plane(`bay-cheek-glass-${wi}`, windowMaterials[wi], centerX - side * .02, y + .02, centerZ, 1.10, 1.94, rot);
      box(`bay-corner-mullion-${style % 6}`, windowFrame[style % 6], front - side * .92, y, z + zz * .825, .095, 2.5, .09);
      box(`bay-corner-mullion-${style % 6}`, windowFrame[style % 6], front - side * .025, y, z + zz * 1.65, .095, 2.5, .09);
    }
  }
  const reserved = (side: number, z: number, half = 0) =>
    (side === 1 && ((z + half > 690 && z - half < 940) || (z + half > 520 && z - half < 675))) ||
    (side === -1 && ((z + half > 710 && z - half < 930) || (z + half > 1190 && z - half < 1390)));
  let bidx = 0;
  for (const side of [-1, 1]) {
    for (let z = -74; z < 1390; z += 27.1) {
      const victorianHero = (side === -1 && ((z > 30 && z < 40) || (z > 138 && z < 148))) || (side === 1 && z > 57 && z < 67);
      const queenAnne = victorianHero && z < 50;
      const frontage = victorianHero ? (queenAnne ? 16.4 : 15.1) : 22.2 + random() * 4.1;
      if (intersections.some(cross => Math.abs(cross - z) < frontage / 2 + 9)) continue;
      if (reserved(side, z, frontage / 2)) continue;
      const p = sampleRoute(z), depth = 17 + random() * 10;
      const groundLow = Math.min(sampleRoute(z - frontage / 2).y, sampleRoute(z + frontage / 2).y);
      const groundHigh = Math.max(sampleRoute(z - frontage / 2).y, sampleRoute(z + frontage / 2).y);
      const base = groundLow - .45, storey = 3.25, upperBase = groundHigh + 4.25;
      const floors = victorianHero ? 3 : 3 + Math.floor(random() * (z < 570 ? 4 : 5));
      const height = upperBase - base + floors * storey + .8;
      const front = p.x + side * (11.72 + (bidx % 5 === 3 ? .68 : 0)), middle = front + side * depth / 2;
      const style = victorianHero ? (side === 1 ? 0 : queenAnne ? 1 : 4) : bidx % 6; bidx++;
      const frame = windowFrame[style % 6];
      box(`building-masonry-${style}`, sideMaterials[style], middle, base + height / 2, z, depth, height, frontage);
      const frontRotation = new THREE.Euler(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      box('stone-ground-floor', shopBases[style], front - side * .06, (base + upperBase) / 2, z, .20, upperBase - base, frontage);
      for (let yy = base + .38; yy < upperBase; yy += .48) box('rusticated-stone-joints', materials.darkTrim, front - side * .172, yy, z, .018, .017, frontage - .12);
      box('ground-floor-architrave', paintedTrim[style], front - side * .18, upperBase, z, .5, .31, frontage + .16);
      const columns = victorianHero ? 3 : bidx % 3 === 0 ? 7 : 8, pitch = frontage / columns;
      const hasBays = victorianHero || ((z < 560 || bidx % 3 === 0) && style !== 3);
      for (let f = 0; f < floors; f++) {
        const floorY = upperBase + f * storey;
        plane(`masonry-storey-${style}`, victorianHero ? victorianFacades[style] : facadeMaterials[style], front - side * .016, floorY + storey / 2, z, frontage, storey, frontRotation);
        // Return walls read as buildings at intersections, with real-size windows.
        for (const end of [-1, 1]) {
          plane(`masonry-storey-${style}`, victorianHero ? victorianFacades[style] : facadeMaterials[style], middle, floorY + storey / 2, z + end * (frontage / 2 + .013), depth, storey, new THREE.Euler(0, end < 0 ? Math.PI : 0, 0));
          for (let dx = 2; dx < depth - 1; dx += 3.15) {
            const wi = Math.floor(random() * 8), x = front + side * dx;
            plane(`window-return-${wi}`, windowMaterials[wi], x, floorY + 1.48, z + end * (frontage / 2 + .024), 1.2, 1.95, new THREE.Euler(0, end < 0 ? Math.PI : 0, 0));
            box('return-window-sills', materials.trim, x, floorY + .39, z + end * (frontage / 2 + .09), 1.54, .13, .20);
          }
        }
        for (let col = 0; col < columns; col++) {
          const zz = z - frontage / 2 + pitch * (col + .5), y = floorY + 1.48;
          const wi = Math.floor(random() * 8);
          if (queenAnne && col === 2) { /* Continuous octagonal corner bay is authored below. */ }
          else if (hasBays && (victorianHero ? col !== 1 : (col === 2 || col === 5))) bay(front, y, zz, side, style, wi);
          else facadeWindow(front, y, zz, side, style, wi);
          // Select small wrought-iron balconettes on French-window buildings.
          if (!hasBays && style === 0 && f % 2 === 1 && col % 3 === 1) {
            box('balconette-floor', materials.trim, front - side * .35, y - 1.03, zz, .66, .12, 1.85);
            for (let bar = -.75; bar <= .76; bar += .25) box('balconette-iron', materials.metal, front - side * .64, y - .67, zz + bar, .035, .71, .035);
            box('balconette-iron', materials.metal, front - side * .64, y - .3, zz, .04, .055, 1.8);
          }
        }
        if (f === 0 && (style === 0 || style === 4 || style === 5)) {
          for (const col of [1, 3, 6]) {
            if (col >= columns) continue;
            const zz = z - frontage / 2 + pitch * (col + .5);
            box('window-flower-box', shopBases[style], front - side * .32, floorY + .22, zz, .48, .31, 1.65);
            for (let flower = -1; flower <= 1; flower++) {
              part('window-box-foliage', materials.foliage, front - side * .38, floorY + .49, zz + flower * .48, .25, .22, .28, new THREE.Euler(), sphereGeometry);
              part('window-box-flowers', flowerMaterials[(style + flower + 1) % 2], front - side * .45, floorY + .66, zz + flower * .48, .12, .13, .18, new THREE.Euler(), sphereGeometry);
            }
          }
        }
        if (f === 0 || f === floors - 1 || style === 2) box('facade-belt-course', paintedTrim[style], front - side * .09, floorY + storey - .07, z, .3, .11, frontage);
      }
      // Thin corner quoins, not giant pillars: each floor keeps a human scale.
      for (const end of [-1, 1]) {
        for (let yy = upperBase + .3; yy < base + height - .3; yy += .67) box('corner-quoins', paintedTrim[style], front - side * .10, yy, z + end * (frontage / 2 - .34), .23, .48, yy % 2 > 1 ? .66 : .9);
      }
      const roofH = base + height;
      box('building-upper-frieze', sideMaterials[style], front - side * .19, roofH - .4, z, .4, .75, frontage + .2);
      box('building-cornice-lower', paintedTrim[style], middle, roofH - .02, z, depth + .5, .18, frontage + .55);
      box('building-cornice-upper', paintedTrim[style], middle - side * .08, roofH + .27, z, depth + .8, .18, frontage + .85);
      box('building-cornice-shadow', materials.darkTrim, front - side * .23, roofH + .09, z, .48, .09, frontage + .62);
      for (let zz = z - frontage / 2 + .3; zz < z + frontage / 2; zz += .72) box('cornice-dentils', paintedTrim[style], front - side * .2, roofH - .22, zz, .42, .23, .25);
      box('building-roof', materials.darkTrim, middle, roofH + .33, z, depth, .14, frontage);
      for (const end of [-1, 1]) box('roof-parapets', sideMaterials[style], middle, roofH + .78, z + end * (frontage / 2 - .16), depth, .9, .32);
      box('roof-parapets', sideMaterials[style], front, roofH + .73, z, .35, .8, frontage);
      // Distinct roof silhouettes prevent the descent reading as one long
      // extrusion: French mansards, Edwardian pediments and occasional turrets.
      if (!victorianHero && (style === 1 || style === 5)) {
        part('mansard-roof', style === 1 ? roofSlate : copperRoof, middle, roofH + 1.91, z, depth / 2 + .2, 3.2, frontage / 2 + .2, new THREE.Euler(), mansardGeometry);
        for (const zz of [-frontage * .28, 0, frontage * .28]) {
          box('dormer-cheeks', sideMaterials[style], front + side * .83, roofH + 1.48, z + zz, 2.1, 1.61, 2.0);
          plane(`window-room-${(bidx + Math.round(zz + 20)) % 8}`, windowMaterials[0], front - side * .235, roofH + 1.49, z + zz, 1.18, 1.25, frontRotation);
          for (const edge of [-1, 1]) box('dormer-jamb', paintedTrim[style], front - side * .27, roofH + 1.50, z + zz + edge * .72, .20, 1.62, .18);
          part('dormer-pediment', paintedTrim[style], front - side * .38, roofH + 2.22, z + zz, .38, .92, 1.27, new THREE.Euler(0, side === 1 ? 0 : Math.PI, 0), pedimentGeometry);
        }
      } else if (!victorianHero && style === 2) {
        // A warm Art Deco parapet with two blue-green reveals.
        for (let tier = 0; tier < 3; tier++) {
          const span = frontage * (.7 - tier * .19);
          box('roof-stepped-pediment', sideMaterials[style], front + side * .08, roofH + .9 + tier * .57, z, .48, 1.15 + tier * .6, span);
          box('roof-pediment-color-band', paintedTrim[style], front - side * .19, roofH + 1.48 + tier * .88, z, .16, .11, span + .16);
        }
      } else if (!victorianHero && style === 4) {
        for (const zz of [-frontage * .25, frontage * .25]) {
          part('gable-edwardian-crest', paintedTrim[style], front - side * .37, roofH + .65, z + zz, .55, 2.15, 3.6, new THREE.Euler(0, side === 1 ? 0 : Math.PI, 0), pedimentGeometry);
          part('gable-painted-inset', sideMaterials[style], front - side * .395, roofH + .90, z + zz, .045, 1.35, 2.52, new THREE.Euler(0, side === 1 ? 0 : Math.PI, 0), pedimentGeometry);
        }
      }
      if (!victorianHero && style === 0 && z < 680) {
        const turretZ = z - frontage / 2 + 2.03, radius = 1.69, towerHeight = roofH - upperBase + 1.1;
        pole('turret-bay-masonry', sideMaterials[style], front - side * .28, upperBase + towerHeight / 2, turretZ, radius, towerHeight);
        for (let f = 0; f < floors; f++) {
          const yy = upperBase + f * storey;
          pole('turret-floor-belt', paintedTrim[style], front - side * .28, yy + .15, turretZ, radius + .1, .18);
          for (const angle of [Math.PI * .7, Math.PI, Math.PI * 1.3]) {
            const x = front - side * .28 + side * Math.cos(angle) * (radius + .015), zz = turretZ + Math.sin(angle) * (radius + .015);
            const wi = (f + bidx) % 8;
            plane(`window-room-${wi}`, windowMaterials[wi], x, yy + 1.5, zz, .93, 1.95, new THREE.Euler(0, Math.atan2(side * Math.cos(angle), Math.sin(angle)), 0));
          }
        }
        pole('turret-cornice', paintedTrim[style], front - side * .28, roofH + 1.13, turretZ, radius + .21, .27);
        part('turret-copper-cap', copperRoof, front - side * .28, roofH + 2.65, turretZ, radius + .25, 2.9, radius + .25, new THREE.Euler(), turretRoofGeometry);
        pole('turret-finial', materials.gold, front - side * .28, roofH + 4.31, turretZ, .055, .65);
      }
      if (victorianHero) {
        const heroTrim = paintedTrim[style], accent = windowFrame[style], terrain = sampleRoute(z).y;
        // A deep painted wood cornice, carried on individually curved brackets.
        box('victorian-cornice-frieze', accent, front - side * .32, roofH - .48, z, .68, .63, frontage + .28);
        box('victorian-cornice-cap', heroTrim, front - side * .44, roofH + .30, z, 1.00, .22, frontage + 1.02);
        for (let zz = -frontage / 2 + .65; zz < frontage / 2; zz += 1.28) {
          part('victorian-carved-bracket', heroTrim, front - side * .12, roofH - 1.0, z + zz, 1, .87, 1, new THREE.Euler(0, side === 1 ? Math.PI : 0, 0), victorianBracket);
        }
        // Long upright casings make two-storey bay stacks read as millwork.
        for (const col of [0,2]) {
          if (queenAnne && col === 2) continue;
          const bayZ = z - frontage / 2 + pitch * (col + .5), bayBase = sampleRoute(bayZ).y;
          bay(front, bayBase + 2.45, bayZ, side, style, (col + bidx) % 8);
          for (const edge of [-1,1]) box('victorian-bay-upright', heroTrim, front - side * 1.00, upperBase + floors * storey / 2 - .15, bayZ + edge * .88, .15, floors * storey + .15, .16);
          // Each projecting bay has its own decorated triangular roof gable.
          part('victorian-gable-frame', heroTrim, front - side * 1.20, roofH + .41, bayZ, 2.35, 2.54, 2.19, new THREE.Euler(0, side === 1 ? 0 : Math.PI, 0), pedimentGeometry);
          part('victorian-gable-painted-field', sideMaterials[style], front - side * 1.23, roofH + .65, bayZ, .045, 1.93, 1.65, new THREE.Euler(0, side === 1 ? 0 : Math.PI, 0), pedimentGeometry);
          // A sunburst of contrasting gingerbread, visible as a graphic at speed.
          const fanBase = v(front - side * 1.30, roofH + .73, bayZ);
          for (let ray = -3; ray <= 3; ray++) {
            const endY = roofH + 2.23 - Math.abs(ray) * .32;
            segment('victorian-gable-sunburst', accent, fanBase, v(front - side * 1.30, endY, bayZ + ray * .43), .035);
          }
          box('victorian-gable-bottom-bar', accent, front - side * 1.30, roofH + .69, bayZ, .08, .12, 3.48);
          // Pair of carved knee braces below each projecting bay roof.
          for (const edge of [-1,1]) part('victorian-bay-cornice-bracket', accent, front - side * .85, roofH - .63, bayZ + edge * 1.34, .70, .86, 1, new THREE.Euler(0, side === 1 ? Math.PI : 0, 0), victorianBracket);
        }
        // The corner Queen Anne gets a continuous eight-sided bay, rather than
        // a square column with window stickers: its conical cap breaks the sky.
        if (queenAnne) {
          const turretZ = z + pitch, radius = 1.94, tx = front - side * .26;
          const towerBase = sampleRoute(turretZ).y + .82, towerTop = roofH + 1.45;
          pole('victorian-octagonal-bay', sideMaterials[style], tx, (towerBase + towerTop) / 2, turretZ, radius, towerTop - towerBase);
          for (let f = -1; f < floors; f++) {
            const yy = f < 0 ? sampleRoute(turretZ).y + 1.04 : upperBase + f * storey;
            pole('victorian-turret-belt', heroTrim, tx, yy + .12, turretZ, radius + .13, .23);
            for (const angle of [Math.PI * .65, Math.PI * .825, Math.PI, Math.PI * 1.175, Math.PI * 1.35]) {
              const wx = tx + side * Math.cos(angle) * (radius + .025), wz = turretZ + Math.sin(angle) * (radius + .025);
              const wi = (f + bidx + 8) % 8;
              plane(`window-room-${wi}`, windowMaterials[wi], wx, yy + 1.55, wz, .82, 1.99, new THREE.Euler(0, Math.atan2(side * Math.cos(angle), Math.sin(angle)), 0));
            }
          }
          for (const angle of [Math.PI*.55,Math.PI*.775,Math.PI,Math.PI*1.225,Math.PI*1.45]) {
            pole('victorian-turret-mullion', heroTrim, tx + side * Math.cos(angle) * (radius + .03), (towerBase + towerTop) / 2, turretZ + Math.sin(angle) * (radius + .03), .065, towerTop - towerBase);
          }
          pole('victorian-turret-cap', heroTrim, tx, towerTop + .12, turretZ, radius + .23, .25);
          part('victorian-turret-slate-roof', roofSlate, tx, towerTop + 1.84, turretZ, radius + .26, 3.22, radius + .26, new THREE.Euler(), turretRoofGeometry);
          pole('victorian-turret-finial', materials.gold, tx, towerTop + 3.77, turretZ, .055, .82);
          part('victorian-finial-ball', materials.gold, tx, towerTop + 4.04, turretZ, .13,.13,.13,new THREE.Euler(),sphereGeometry);
        }
        // Raised stoop, warm timber double doors and an arched fanlight. The
        // outermost tread stays >1.4m behind the curb; it never enters the road.
        for (let step=0; step<6; step++) {
          const rise=.18+step*.15;
          box('victorian-stoop-tread', materials.stone, front-side*(2.66-step*.34), terrain+rise/2, z, .45, rise, 2.75);
          box('victorian-stoop-nosing', heroTrim, front-side*(2.89-step*.34), terrain+rise+.026, z, .08,.052,2.86);
        }
        box('victorian-entry-landing', materials.stone, front-side*.56, terrain+.86,z,.94,.22,2.75);
        box('victorian-entry-door', shopBases[style], front-side*.29,terrain+2.26,z,.18,2.60,1.56);
        for(const edge of [-1,1]) {
          box('victorian-door-panel', accent, front-side*.40,terrain+1.76,z+edge*.38,.045,.89,.52);
          box('victorian-door-glass', storefrontGlass[1], front-side*.415,terrain+2.81,z+edge*.38,.023,.94,.46);
          box('victorian-door-casing',heroTrim,front-side*.45,terrain+2.26,z+edge*.91,.24,2.85,.21);
          box('victorian-door-handle',materials.gold,front-side*.49,terrain+2.18,z+edge*.13,.10,.33,.035);
          const sx=front-side*2.63,ex=front-side*.81,railZ=z+edge*1.31;
          segment('victorian-stoop-handrail',accent,v(sx,terrain+1.03,railZ),v(ex,terrain+1.80,railZ),.045);
          for(let post=0;post<5;post++) {
            const t=post/4,px=sx+(ex-sx)*t,py=terrain+.23+t*.68;
            pole('victorian-stoop-baluster',accent,px,py+.4,railZ,.034,.80);
          }
          pole('victorian-stoop-newel',heroTrim,sx,terrain+.63,railZ,.083,1.16);
          part('victorian-newel-finial',accent,sx,terrain+1.28,railZ,.12,.12,.12,new THREE.Euler(),sphereGeometry);
        }
        part('victorian-entry-fanlight', storefrontGlass[1], front-side*.405,terrain+3.51,z,1,1,1,frontRotation,archOpening);
        part('victorian-entry-arch',heroTrim,front-side*.47,terrain+3.51,z,1.12,1.12,1,frontRotation,archMoulding);
        for(const angle of [Math.PI*.2,Math.PI*.4,Math.PI*.6,Math.PI*.8]) segment('victorian-fanlight-bars',materials.gold,v(front-side*.45,terrain+3.51,z),v(front-side*.45,terrain+3.51+Math.sin(angle)*.77,z+Math.cos(angle)*.77),.022);
        // A quiet little number plaque belongs to a home, not a retail strip.
        const address = queenAnne ? '821' : side===1 ? '844' : '703';
        const numberMap = new THREE.MeshStandardMaterial({map:labelTexture(address,'#f5e4bd','#235a5c'),roughness:.8});
        plane('victorian-house-number',numberMap,front-side*.47,terrain+2.28,z+1.35,.52,.22,frontRotation);
      }
      // Five storefront bays step naturally down Powell's slope.
      const shop = (bidx * 7) % shopNames.length, awningIndex = bidx % shopAwningMaterials.length;
      for (let module = 0; module < (victorianHero ? 0 : 4); module++) {
        const zz = z - frontage / 2 + (module + .5) * frontage / 4, terrain = sampleRoute(zz).y, w = frontage / 4 - .72;
        box('shop-window-reveal', materials.darkTrim, front - side * .20, terrain + 1.69, zz, .24, 2.82, w + .12);
        box('shop-interior', warmInterior, front - side * .34, terrain + 1.73, zz, .16, 2.56, w -.12);
        box(`shop-glass-${bidx % 3}`, storefrontGlass[bidx % 3], front - side * .45, terrain + 1.63, zz, .018, 2.30, w -.22);
        // Displays are solid objects set in front of a deeper, shadowed shop.
        for (let item = 0; item < 3; item++) {
          const itemZ = zz - w * .32 + item * w * .30;
          if (shop % 3 === 0) {
            for (let shelf = 0; shelf < 2; shelf++) {
              box('bookshop-shelves', materials.trunk, front - side * .48, terrain + .72 + shelf * .58, itemZ, .16, .07, 1.3);
              for (let book = 0; book < 5; book++) box(`shop-books-${book % 2}`, book % 2 ? paper : redPaint, front - side * .5, terrain + .94 + shelf * .58, itemZ -.46 + book * .21, .095, .27 + random() * .13, .14);
            }
          } else if (shop % 3 === 1) {
            box('display-plinth', materials.trim, front - side * .5, terrain + .49, itemZ, .12, .28, .68);
            pole('display-vase', pottery, front - side * .51, terrain + .86, itemZ, .21, .50);
            part('display-leaves', materials.foliage, front - side * .51, terrain + 1.3, itemZ, .31, .42, .29, new THREE.Euler(), sphereGeometry);
          } else {
            box('shop-display-pedestal', paper, front - side * .5, terrain + .7, itemZ, .13, .65, .55);
            part('shop-display-object', materials.gold, front - side * .52, terrain + 1.18, itemZ, .13, .2, .19, new THREE.Euler(), sphereGeometry);
          }
        }
        for (const edge of [-1, 1]) box('shop-bronze-jamb', materials.gold, front - side * .56, terrain + 1.69, zz + edge * w / 2, .08, 2.86, .09);
        box('shop-bronze-transom', materials.gold, front - side * .56, terrain + 2.9, zz, .09, .06, w);
        box('shop-bronze-mullion', materials.gold, front - side * .56, terrain + 1.6, zz, .07, 2.55, .055);
        box('shop-stone-sill', materials.trim, front - side * .57, terrain + .28, zz, .48, .22, w + .32);
        if (bidx % 3 !== 1) {
          // Sloping canvas awnings, with individual striped valances.
          box(`awning-${awningIndex}`, shopAwningMaterials[awningIndex], front - side * .9, terrain + 3.2, zz, 1.8, .085, w + .25, new THREE.Euler(0, 0, side * .19));
          box(`awning-valance-${awningIndex}`, shopAwningMaterials[awningIndex], front - side * 1.79, terrain + 2.99, zz, .07, .27, w + .25);
          if (awningIndex % 2 === 0) for (let stripe = -w / 2; stripe < w / 2; stripe += .75) box('canvas-awning-stripe', paper, front - side * .90, terrain + 3.249, zz + stripe, 1.79, .016, .21, new THREE.Euler(0, 0, side * .19));
        }
        plane(`shop-name-${shop}`, shopMaterials[shop], front - side * .235, terrain + 3.67, zz, w + .36, .64, frontRotation);
        box('shop-warm-overdoor', materials.warm, front - side * .54, terrain + 2.99, zz, .065, .027, w * .76);
        if (module === 0 && (style === 0 || style === 4)) {
          // Arched hotel entry, recessed under its stone voussoirs.
          const entryZ = zz, entryY = terrain + 2.34;
          part('arched-door-reveal', materials.darkTrim, front - side * .62, entryY, entryZ, 1, 1, 1, frontRotation, archOpening);
          part('arched-stone-moulding', materials.trim, front - side * .64, entryY, entryZ, 1, 1, 1, frontRotation, archMoulding);
          box('arched-entry-glass', storefrontGlass[1], front - side * .61, terrain + 1.32, entryZ, .04, 2.10, 1.42);
          for (const edge of [-1,1]) {
            box('arched-entry-jamb', materials.trim, front - side * .64, terrain + 1.31, entryZ + edge * .82, .24, 2.18, .20);
            box('entry-door-handles', materials.gold, front - side * .69, terrain + 1.27, entryZ + edge * .17, .08, .42, .035);
          }
          box('entry-door-mullion', materials.gold, front - side * .65, terrain + 1.30, entryZ, .055, 2.1, .04);
          box('entry-arch-keystone', materials.trim, front - side * .69, terrain + 3.22, entryZ, .30, .33, .26);
        }
        // Granite thresholds and a little warm light down the pavement.
        box('shop-threshold', materials.trim, front - side * .69, terrain + .18, zz, .8, .12, w * .45);
      }
      // Roof-access fire escapes include landing rails, stringers and treads.
      if (!victorianHero && bidx % 4 === 0) {
        const escapeZ = z + 1.2;
        for (let f = 0; f < floors - 1; f++) {
          const y = upperBase + f * storey + .36;
          for (let gr = -1.65; gr < 1.7; gr += .2) box('fire-escape-grating', materials.metal, front - side * .85, y, escapeZ + gr, 1.63, .052, .053);
          for (const end of [-1,1]) {
            box('fire-escape-rail', materials.metal, front - side * .9, y + 1.0, escapeZ + end * 1.75, 1.8, .055, .055);
            segment('fire-escape-brace', materials.metal, v(front, y - .7, escapeZ + end * 1.6), v(front - side * 1.7, y, escapeZ + end * 1.6), .03);
          }
          box('fire-escape-rail', materials.metal, front - side * 1.71, y + 1.0, escapeZ, .055, .055, 3.5);
          for (let bar = -1.7; bar < 1.71; bar += .28) box('fire-escape-balusters', materials.metal, front - side * 1.71, y + .53, escapeZ + bar, .033, 1, .033);
          for (const rail of [-1,1]) segment('escape-stair-stringer', materials.metal, v(front - side * (1.15 + rail * .25), y, escapeZ - 1.5), v(front - side * (1.15 + rail * .25), y + storey, escapeZ + 1.5), .035);
          for (let step = 0; step < 12; step++) box('escape-stair-treads', materials.metal, front - side * 1.15, y + step / 12 * storey, escapeZ - 1.5 + step / 12 * 3, .58, .055, .23);
        }
      }
      if (bidx % 3 === 0) {
        box('rooftop-hvac', materials.darkTrim, middle + side * 2, roofH + .9, z + 2, 3, 1.5, 3.5);
        pole('roof-chimney', materials.stone, middle + side * 4, roofH + 1.4, z - 5, .38, 2.4);
        box('chimney-cap', materials.darkTrim, middle + side * 4, roofH + 2.64, z - 5, 1.15, .15, 1.15);
      }
      if (bidx % 8 === 0) {
        box(`building-setback-${style}`, sideMaterials[style], middle + side * 3, roofH + 1.5, z, depth * .60, 3, frontage * .64);
        box('building-setback-cap', materials.trim, middle + side * 3, roofH + 3.06, z, depth * .63, .18, frontage * .67);
      }
    }
  }

  // Tall blade signs create a readable, layered downtown silhouette.
  const bladeSpecs = [{ z: 145, side: 1, text: 'PACIFIC', color: '#ffc087' }, { z: 448, side: -1, text: 'HOTEL', color: '#ff9989' }, { z: 1090, side: -1, text: 'HOTEL', color: '#ead5a4' }, { z: 1014, side: 1, text: 'UNION', color: '#ffbbaa' }];
  for (let i = 0; i < bladeSpecs.length; i++) {
    const { z, side, text, color } = bladeSpecs[i], p = sampleRoute(z);
    const texture = canvasTexture(180, 1024, ctx => {
      ctx.fillStyle = '#273342'; ctx.fillRect(0, 0, 180, 1024); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 164, 1008);
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 105px sans-serif';
      [...text].forEach((letter, j) => ctx.fillText(letter, 90, 110 + j * (800 / (text.length - 1))));
    });
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    box('blade-sign-body', materials.darkTrim, p.x + side * 10.95, p.y + 15, z, 2.2, 12.8, .45);
    plane(`blade-sign-${i}`, mat, p.x + side * 10.95, p.y + 15, z - .24, 2.2, 12.8, new THREE.Euler(0, Math.PI, 0));
  }

  const glowTexture = canvasTexture(128, 128, ctx => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 63); g.addColorStop(0, 'rgba(255,219,167,.95)'); g.addColorStop(.1, 'rgba(255,203,141,.36)'); g.addColorStop(.45, 'rgba(255,169,111,.09)'); g.addColorStop(1, 'rgba(255,169,111,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: .005, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const wirePoints: number[] = [];
  function wire(a: THREE.Vector3, b: THREE.Vector3, sag = .5) {
    for (let i = 0; i < 12; i++) {
      const t1 = i / 12, t2 = (i + 1) / 12;
      for (const t of [t1, t2]) { const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; wirePoints.push(p.x, p.y, p.z); }
    }
  }
  for (let z = -28; z < 1450; z += 42) {
    const p = sampleRoute(z);
    for (const side of [-1, 1]) {
      const x = p.x + side * 8.2, h = 7.8;
      pole('lamp-pole', materials.metal, x, p.y + h / 2, z, .075, h);
      pole('lamp-base', materials.darkTrim, x, p.y + .5, z, .18, .8);
      segment('lamp-arm', materials.metal, v(x, p.y + h - .25, z), v(x - side * 1.9, p.y + h - .1, z), .065);
      box('lamp-hood', materials.metal, x - side * 1.7, p.y + h - .1, z, .7, .15, .8);
      box('lamp-bulb', materials.warm, x - side * 1.7, p.y + h - .2, z, .53, .07, .6);
      plane('lamp-glow', glowMat, x - side * 1.7, p.y + h - .2, z - .1, 3.5, 3.5, new THREE.Euler(0, Math.PI, 0));
      plane('lamp-road-pool', poolMat, x - side * 2, p.y + .068, z, 3.1, 11.0, new THREE.Euler(-Math.PI / 2 - Math.atan(routeSlope(z)), 0, 0));
      if (z > 0 && z < 1320) {
        box('parking-meter', materials.metal, x + side * .6, p.y + .75, z + 10, .09, 1.5, .09);
        box('parking-meter', materials.metal, x + side * .6, p.y + 1.6, z + 10, .23, .28, .17);
      }
    }
    wire(v(p.x - 8.2, p.y + 7.2, z), v(p.x + 8.2, p.y + 7.2, z), .6);
    const next = sampleRoute(z + 42);
    for (const side of [-1, 1]) wire(v(p.x + side * 3.1, p.y + 6.7, z), v(next.x + side * 3.1, next.y + 6.7, z + 42), .15);
  }
  // Human-scale curbside objects: SF hydrants, ribbed litter baskets, parking
  // signs and the occasional news rack. Keep the racing surface readable.
  const hydrantYellow = standard('#b9a160', .64, .3), municipalGreen = standard('#354a41', .77, .3);
  for (let z = 66, i = 0; z < 1340; z += 87, i++) {
    if (intersections.some(cross => Math.abs(cross-z) < 14)) continue;
    const side = i % 2 ? 1 : -1, p = sampleRoute(z), x = p.x + side * 8.25;
    pole('hydrant-body', hydrantYellow, x, p.y + .62, z, .155, .85);
    pole('hydrant-base', materials.darkTrim, x, p.y + .25, z, .25, .18);
    part('hydrant-dome', hydrantYellow, x, p.y + 1.05, z, .20, .19, .20, new THREE.Euler(), sphereGeometry);
    segment('hydrant-side-arm', hydrantYellow, v(x-.31,p.y+.75,z),v(x+.31,p.y+.75,z),.10);
    for(const end of [-1,1]) part('hydrant-cap', materials.trim,x+end*.31,p.y+.75,z,.14,.08,.14,new THREE.Euler(0,0,Math.PI/2),cylinderGeometry);
    const binZ=z+5.4, by=sampleRoute(binZ).y;
    pole('litter-bin', municipalGreen, x+side*.35,by+.68,binZ,.32,1.05);
    pole('litter-bin-rim', materials.metal,x+side*.35,by+1.22,binZ,.34,.09);
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8) box('litter-bin-ribs',materials.darkTrim,x+side*.35+Math.cos(angle)*.326,by+.68,binZ+Math.sin(angle)*.326,.026,.94,.026);
    if(i%3===0) {
      const nz=z+8.8, ny=sampleRoute(nz).y;
      box('news-rack', municipalGreen,x,ny+.73,nz,.53,1.12,.43);
      box('news-rack-base',materials.darkTrim,x,ny+.29,nz,.65,.20,.54);
      box('news-rack-window',paper,x,ny+.86,nz-.223,.39,.41,.018);
      box('news-rack-lettering',materials.darkTrim,x,ny+.91,nz-.234,.29,.04,.012);
      box('news-rack-lettering',materials.darkTrim,x,ny+.79,nz-.234,.29,.015,.012);
    }
    if(i%2===0) {
      const signZ=z-3, sy=sampleRoute(signZ).y;
      pole('parking-sign-pole',materials.metal,x,sy+1.70,signZ,.035,3.03);
      box('parking-regulation-sign',materials.trim,x,sy+2.99,signZ,.37,.55,.034);
      box('parking-sign-header',redPaint,x,sy+3.15,signZ-.02,.28,.06,.012);
      for(let line=0;line<3;line++) box('parking-sign-text',municipalGreen,x,sy+3.04-line*.07,signZ-.02,.25,.02,.012);
    }
  }
  const wireGeometry = new THREE.BufferGeometry(); wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wirePoints, 3));
  world.add(new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: '#394358', transparent: true, opacity: .78 })));

  const safetyOrange = standard('#d97936', .7);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 8);
  const chevronTexture = canvasTexture(512, 128, ctx => {
    ctx.fillStyle = '#273244'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#f2b66b';
    for (let x = -80; x < 580; x += 110) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 52, 0); ctx.lineTo(x + 125, 128); ctx.lineTo(x + 73, 128); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#eee3c4'; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 506, 122);
  });
  const chevrons = new THREE.MeshBasicMaterial({ map: chevronTexture, side: THREE.DoubleSide });
  for (const [progress, lateral, width] of [[390, -.5, 4.4], [612, -3.8, 4.0], [1021, 1.1, 4.4]]) {
    const p = sampleRoute(progress), x = p.x + lateral;
    box('roadwork-body', safetyOrange, x, p.y + .62, progress, width, .92, .8);
    box('roadwork-foot', materials.darkTrim, x, p.y + .12, progress, width + .15, .24, 1.3);
    plane('roadwork-chevrons', chevrons, x, p.y + .75, progress - .41, width - .1, .67, new THREE.Euler(0, Math.PI, 0));
    for (const side of [-1, 1]) {
      const cx = x + side * (width / 2 - .4);
      box('cone-base', materials.darkTrim, cx, p.y + .07, progress - 1.15, .57, .1, .57);
      part('safety-cones', safetyOrange, cx, p.y + .45, progress - 1.15, .25, .78, .25, new THREE.Euler(), coneGeometry);
      pole('cone-reflector', materials.curb, cx, p.y + .54, progress - 1.15, .105, .12);
      part('barrier-warning-light', materials.warm, cx, p.y + 1.2, progress, .10, .10, .10, new THREE.Euler(), sphereGeometry);
    }
    obstacles.push({ progress: progress - .2, lateral, width: width + .16, length: 2.4, kind: 'barrier' });
  }

  // Finish and checkpoint arches stay outside the driveable surface.
  CHECKPOINTS.forEach((progress, i) => {
    const p = sampleRoute(progress), finish = progress === TRACK_LENGTH;
    const col = finish ? materials.warm : new THREE.MeshBasicMaterial({color: '#cedf97'});
    for (const side of [-1, 1]) {
      box('checkpoint-foot', materials.darkTrim, p.x + side * (ROAD_HALF_WIDTH + .85), p.y + .35, progress, .95, .7, .95);
      box('checkpoint-frame', materials.metal, p.x + side * (ROAD_HALF_WIDTH + .85), p.y + 3.04, progress, .09, 5.5, .16);
      box(finish ? 'finish-glow' : 'checkpoint-glow', col, p.x + side * (ROAD_HALF_WIDTH + .77), p.y + 1.36, progress - .10, .065, 1.60, .035);
    }
    box('checkpoint-header', materials.darkTrim, p.x, p.y + 5.97, progress, (ROAD_HALF_WIDTH + .85) * 2, .58, .19);
    box(finish ? 'finish-glow' : 'checkpoint-glow', col, p.x, p.y + 5.64, progress - .105, (ROAD_HALF_WIDTH + .85) * 2, .035, .035);
    const label = finish ? 'MARKET STREET  /  FINISH' : `${String(i + 1).padStart(2,'0')}  /  ${i === 0 ? 'POWELL DESCENT' : i === 1 ? 'UNION SQUARE' : 'DOWNTOWN'}`;
    const mat = new THREE.MeshBasicMaterial({ map: labelTexture(label, finish ? '#efdfb3' : '#dfdfc5', '#3c413c'), side: THREE.DoubleSide });
    plane(`checkpoint-sign-${i}`, mat, p.x, p.y + 5.97, progress - .11, (ROAD_HALF_WIDTH + .4) * 2, .48, new THREE.Euler(0, Math.PI, 0));
    for (let row = 0; row < (finish ? 5 : 1); row++) for (let col = 0; col < 20; col++) {
      const zz = progress + row * .7, pp = sampleRoute(zz);
      box('checkpoint-paint', (row + col) % 2 === 0 ? materials.curb : materials.darkTrim, pp.x - ROAD_HALF_WIDTH + (col + .5) * ROAD_HALF_WIDTH / 10, pp.y + .027, zz, ROAD_HALF_WIDTH / 10, .025, .7);
    }
  });

  // The surrounding city is built in 13-metre, four-storey modules: skyline
  // windows retain the same physical scale as the foreground architecture.
  const skylineMat = standard('#8aa5b4');
  const secondaryMaterials = stoneColors.slice(0, 4).map((_, style) => {
    const map = canvasTexture(512, 512, ctx => {
      const masonry = facadeTexture(style).image as HTMLCanvasElement;
      for (let f = 0; f < 4; f++) ctx.drawImage(masonry, 0, f * 128, 512, 128);
      for (let f = 0; f < 4; f++) for (let col = 0; col < 4; col++) {
        const x = col * 128 + 40, y = f * 128 + 24;
        ctx.fillStyle = '#585750'; ctx.fillRect(x - 4, y - 3, 57, 81);
        ctx.drawImage(windowTileColors[(f * 3 + col + style) % 8].image as HTMLCanvasElement, x, y, 49, 74);
        ctx.fillStyle = '#c0b69f'; ctx.fillRect(x - 7, y + 75, 63, 5);
      }
    });
    return new THREE.MeshStandardMaterial({map, color: '#ffffff', roughness: .89, envMapIntensity: .13});
  });
  // A generated, orthographic material atlas can replace these fallback maps
  // asynchronously without changing any geometry or gameplay.
  function secondaryFace(key: string, x: number, base: number, z: number, width: number, height: number, orientation: number, style: number) {
    const cols = Math.max(1, Math.round(width / 12)), rows = Math.max(1, Math.round(height / 13));
    const w = width / cols, h = height / rows;
    for (let c = 0; c < cols; c++) for (let f = 0; f < rows; f++) {
      const along = -width / 2 + (c + .5) * w;
      plane(`${key}-${style}`, secondaryMaterials[style], x + Math.cos(orientation) * along, base + (f + .5) * h,
        z - Math.sin(orientation) * along, w, h, new THREE.Euler(0, orientation, 0));
    }
  }
  for (const side of [-1, 1]) {
    for (let layer = 0; layer < 2; layer++) {
      for (let z = -100 + layer * 19; z < 1510; z += 43) {
        const frontage = 32 + random() * 8;
        if (intersections.some(cross => Math.abs(z - cross) < frontage / 2 + 9)) continue;
        // Open Union Square to the east; give Westin and Beacon their own massing.
        if (layer === 0 && reserved(side, z, frontage / 2)) continue;
        if (side === 1 && layer === 1 && z > 680 && z < 950) continue;
        const p = sampleRoute(z), depth = 22 + random() * 15;
        const front = p.x + side * (layer === 0 ? 48 + random() * 7 : 106 + random() * 10);
        const x = front + side * depth / 2;
        const base = Math.min(sampleRoute(z - frontage / 2).y, sampleRoute(z + frontage / 2).y) - 2;
        const height = 13 * (2 + Math.floor(random() * (layer ? 4 : 3))), style = Math.floor(random() * 4);
        box(`secondary-city-body-${style}`, sideMaterials[style], x, base + height / 2, z, depth, height, frontage);
        secondaryFace('secondary-city-facade', front - side * .04, base, z, frontage, height, side < 0 ? Math.PI / 2 : -Math.PI / 2, style);
        secondaryFace('secondary-city-facade', x, base, z - frontage / 2 - .04, depth, height, Math.PI, style);
        secondaryFace('secondary-city-facade', x, base, z + frontage / 2 + .04, depth, height, 0, style);
        box('secondary-city-cornice', materials.trim, x, base + height, z, depth + .7, .38, frontage + .7);
        box('secondary-city-roof', materials.darkTrim, x, base + height + .25, z, depth, .14, frontage);
        if (random() > .65) {
          box('secondary-city-body', skylineMat, x + side * 3, base + height + 2, z, depth * .64, 4, frontage * .68);
          box('secondary-city-cornice', materials.trim, x + side * 3, base + height + 4, z, depth * .66, .3, frontage * .7);
        }
      }
    }
  }
  // Across the square, six independently composed rooflines replace the
  // repeated slab wall. These sit behind the authored Stockton storefronts;
  // the x126–162 Apple / department-store strip remains completely clear.
  const squareBackdrop = [
    {z: 690, front: 176, width: 32, depth: 29, height: 48, style: 2, roof: 0},
    {z: 737, front: 184, width: 41, depth: 33, height: 70, style: 0, roof: 1},
    {z: 781, front: 169, width: 29, depth: 26, height: 38, style: 3, roof: 2},
    {z: 827, front: 195, width: 43, depth: 32, height: 82, style: 1, roof: 0},
    {z: 877, front: 173, width: 35, depth: 27, height: 51, style: 2, roof: 2},
    {z: 925, front: 185, width: 38, depth: 30, height: 64, style: 0, roof: 1},
  ];
  squareBackdrop.forEach((spec, index) => {
    const {z, front, width, depth, height, style} = spec, y = sampleRoute(z).y - 2;
    const podium = index % 2 ? 16.25 : 19.5, inset = index % 2 ? 4.2 : 2.8;
    const upperWidth = width * (index % 2 ? .72 : .84), upperHeight = height - podium;
    const upperFront = front + inset, upperZ = z + (index % 2 ? 2.5 : -1.8);
    box('square-back-building-podium', sideMaterials[style], front + depth / 2, y + podium / 2, z, depth, podium, width);
    secondaryFace('square-back-podium-facade', front - .04, y, z, width, podium, -Math.PI / 2, style);
    secondaryFace('square-back-return-facade', front + depth / 2, y, z - width / 2 - .04, depth, podium, Math.PI, style);
    box('square-back-building-setback', sideMaterials[style], upperFront + (depth - inset) / 2, y + podium + upperHeight / 2, upperZ, depth - inset, upperHeight, upperWidth);
    secondaryFace('square-back-upper-facade', upperFront - .04, y + podium, upperZ, upperWidth, upperHeight, -Math.PI / 2, style);
    secondaryFace('square-back-return-facade', upperFront + (depth - inset) / 2, y + podium, upperZ - upperWidth / 2 - .04, depth - inset, upperHeight, Math.PI, style);
    // Tall piers group the repeated windows into clear architectural bays.
    for (const division of [-.47, -.17, .17, .47]) {
      box('square-back-building-pier', paintedTrim[style], upperFront - .29, y + podium + upperHeight / 2, upperZ + upperWidth * division, .58, upperHeight, .69);
      box('square-back-building-pier-cap', materials.trim, upperFront - .41, y + height - .8, upperZ + upperWidth * division, .79, .35, 1.08);
    }
    for (const level of [podium, podium + 1.05, height - .48, height + .08]) {
      const lower = level <= podium + 1.05, fx = lower ? front : upperFront, wz = lower ? width : upperWidth, centerZ = lower ? z : upperZ;
      box('square-back-building-cornice', paintedTrim[style], fx + (lower ? depth : depth - inset) / 2 - .18, y + level, centerZ, (lower ? depth : depth - inset) + .66, level === podium ? .45 : .22, wz + .72);
    }
    box('square-back-building-roof', roofSlate, upperFront + (depth - inset) / 2, y + height + .30, upperZ, depth - inset, .22, upperWidth);
    if (spec.roof === 0) {
      for (let tier = 0; tier < 3; tier++) {
        box('square-back-building-deco-crown', sideMaterials[style], upperFront + 1.1, y + height + 1.1 + tier * .80, upperZ, 2.6, 2.2 + tier * .75, upperWidth * (.75 - tier * .18));
        box('square-back-building-crown-stripe', paintedTrim[style], upperFront - .26, y + height + 2.2 + tier * 1.18, upperZ, .21, .17, upperWidth * (.75 - tier * .18) + .24);
      }
    } else if (spec.roof === 1) {
      part('mansard-square-roof', index % 2 ? copperRoof : roofSlate, upperFront + (depth - inset) / 2, y + height + 2.13, upperZ, (depth - inset) / 2 + .2, 3.7, upperWidth / 2 + .2, new THREE.Euler(), mansardGeometry);
      for (const zz of [-upperWidth * .28, 0, upperWidth * .28]) {
        box('dormer-square-body', materials.trim, upperFront + .75, y + height + 1.6, upperZ + zz, 2, 1.8, 2.1);
        plane(`window-room-${index}`, windowMaterials[index], upperFront - .265, y + height + 1.62, upperZ + zz, 1.25, 1.32, new THREE.Euler(0, -Math.PI / 2, 0));
      }
    } else {
      part('gable-square-pediment', materials.trim, upperFront - .37, y + height + .50, upperZ, .68, 3.3, upperWidth * .33, new THREE.Euler(), pedimentGeometry);
      part('gable-square-inset', sideMaterials[style], upperFront - .39, y + height + .82, upperZ, .12, 2.3, upperWidth * .24, new THREE.Euler(), pedimentGeometry);
      box('square-back-building-roofhouse', sideMaterials[style], upperFront + 11, y + height + 1.8, upperZ + upperWidth * .22, 6, 3.6, 6.1);
      box('square-back-building-roofhouse-cap', materials.trim, upperFront + 11, y + height + 3.66, upperZ + upperWidth * .22, 6.4, .17, 6.5);
    }
    if (index === 2 || index === 4) {
      // Small roof equipment and chimneys give the skyline lived-in scale.
      for (const zz of [-5.1, 4.6]) {
        box('roof-backdrop-brick-chimney', sideMaterials[3], upperFront + depth * .55, y + height + 1.2, upperZ + zz, 1.45, 2.4, 1.25);
        box('roof-backdrop-chimney-cap', materials.trim, upperFront + depth * .55, y + height + 2.47, upperZ + zz, 1.73, .18, 1.54);
      }
    }
  });
  // Dense, quieter silhouettes close the cross-street vistas.
  for (const side of [-1, 1]) for (let z = -60; z < 1530; z += 66) {
    if (side === 1 && z > 650 && z < 980) continue;
    const p = sampleRoute(z), x = p.x + side * (184 + random() * 27), h = 39 + Math.floor(random() * 5) * 13;
    const style = Math.floor(random() * 4);
    box('outer-city-body', skylineMat, x, p.y + h / 2 - 7, z, 36, h, 54);
    secondaryFace('outer-city-facade', x - side * 18.04, p.y - 7, z, 54, h, side < 0 ? Math.PI / 2 : -Math.PI / 2, style);
    secondaryFace('outer-city-facade', x, p.y - 7, z - 27.04, 36, h, Math.PI, style);
  }
  // South of Market is a varied office skyline; Transamerica is north-east of
  // this route and is intentionally absent from the downhill southern vista.
  for (let i = 0; i < 36; i++) {
    const x = (i < 18 ? -1 : 1) * (32 + random() * 230), z = 1440 + random() * 360, h = 26 + Math.floor(random() * 9) * 13;
    const width = 16 + random() * 21, depth = 18 + random() * 24, style = i % 4;
    box('distant-skyline', skylineMat, x, h / 2 - 18, z, width, h, depth);
    secondaryFace('skyline-facade', x, -18, z - depth / 2 - .04, width, h, Math.PI, style);
    if (i % 3 === 0) box('skyline-roof', materials.darkTrim, x, h - 17, z, width * .7, 2, depth * .7);
    if (i % 5 === 0) pole('skyline-roof-aerial', materials.metal, x, h - 13, z, .09, 8);
  }

  // One instanced draw per geometry/material family, including windows and props.
  const meshes: THREE.InstancedMesh[] = [], dummy = new THREE.Object3D();
  for (const batch of batches.values()) {
    const geometry = batch.material.userData.windowAtlas ? batch.geometry.clone() : batch.geometry;
    const atlasOffsets = batch.material.userData.windowAtlas ? new Float32Array(batch.parts.length * 2) : null;
    const mesh = new THREE.InstancedMesh(geometry, batch.material, batch.parts.length); mesh.name = `${batch.name} / block ${batch.chunk}`;
    mesh.userData.cityChunk = batch.chunk; mesh.userData.horizon = batch.horizon;
    batch.parts.forEach((p, i) => {
      dummy.position.copy(p.position); dummy.scale.copy(p.scale); dummy.rotation.copy(p.rotation); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      if (p.color) mesh.setColorAt(i, p.color);
      if (atlasOffsets) { atlasOffsets[i * 2] = (p.atlasVariant % 4) / 4; atlasOffsets[i * 2 + 1] = p.atlasVariant < 4 ? .5 : 0; }
    });
    if (atlasOffsets) geometry.setAttribute('instanceAtlasOffset', new THREE.InstancedBufferAttribute(atlasOffsets, 2));
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    mesh.receiveShadow = !batch.name.includes('glow');
    mesh.castShadow = batch.casts;
    world.add(mesh); meshes.push(mesh);
  }
  // Sparse moving pools of actual light illuminate the car as it passes lamps.
  const practicalLights = [0, 1].map(() => { const light = new THREE.PointLight('#ffd2a1', 1.5, 19, 2); world.add(light); return light; });
  let lowQuality = false;
  return {
    obstacles,
    get renderStats() { return { batchCount: meshes.length, visibleBatches: meshes.filter(mesh => mesh.visible).length, instances: meshes.reduce((sum, mesh) => sum + mesh.count, 0), materialCount: new Set(meshes.map(mesh => mesh.material)).size }; },
    update(_time: number, progress: number) {
      meshes.forEach(mesh => {
        const start = mesh.userData.cityChunk * 320;
        mesh.visible = (mesh.userData.horizon || (start + 320 > progress - 65 && start < progress + (lowQuality ? 650 : 850))) && !(lowQuality && mesh.name.includes('glow'));
      });
      practicalLights.forEach((light, i) => {
        const z = Math.floor((progress + 28) / 42) * 42 - 28 + i * 42;
        const p = sampleRoute(z); light.position.set(p.x + (i ? -1 : 1) * 9.2, p.y + 7.4, z);
      });
    },
    setQuality(low: boolean) {
      lowQuality = low;
      practicalLights.forEach(light => { light.visible = !low; });
      meshes.forEach(mesh => { if (mesh.name.includes('glow')) mesh.visible = !low; });
    },
  };
}

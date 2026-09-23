import * as THREE from 'three';
import { createWestin } from './westin';
import { createNorthSquare } from './north-square';
import { createSquareFrontages } from './square-frontages';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPlazaAssets } from './plaza-assets';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PLAZA_LEVELS, PLAZA_PALMS } from './plaza-layout';

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

  // Union Square is the roof of a garage on sloping city ground. It reads as
  // a sequence of outdoor rooms, not a lawn on a thin flat slab. The broad
  // southern stair rises to the event plaza; the planted Post Street terrace
  // sits another four risers above it. These compressed heights keep the road.
  const plaza = PLAZA_LEVELS.center;
  const perimeter = PLAZA_LEVELS.perimeter;
  const north = PLAZA_LEVELS.north;
  const darkPaving = material('flamed charcoal granite ribbons', '#78847d', .88);
  const flowerLeaf = material('perennial planting', '#4c7139', .87);
  const flowerCream = material('white flowering borders', '#e7e4bf', .89);
  const flowerLavender = material('violet salvias', '#8577ae', .85);
  const stainless = material('brushed stainless handrails', '#b9c5c0', .34, .82);
  const softBox = (w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,r=.026) =>
    add(new RoundedBoxGeometry(w,h,d,1,Math.min(r,h*.18)),mat,x,y,z);
  const pavement = (w:number,d:number,top:number,x:number,z:number) => {
    box(w,top-ground-.09,d,m.riser,x,(ground+top-.09)/2,z);
    softBox(w,.09,d,paving(w,d),x,top-.045,z,.018);
  };
  pavement(120,100,perimeter,0,0);
  // The ceremonial center remains genuinely open, as in the reference photo.
  pavement(89.4,52.4,plaza,0,-2.5);
  for(const z of [-25,-15,-5,5,15]) box(89.2,.012,3.2,darkPaving,0,plaza+.008,z);
  for(const x of [-42.7,42.7]) box(.22,.014,52.2,m.seam,x,plaza+.01,-2.5);
  for(const z of [-28.48,23.48]) box(89.2,.014,.24,m.seam,0,plaza+.01,z);

  // Real stair proportions and a small bevel catch the sunlight on each nosing.
  function stairs(width:number,count:number,rise:number,tread:number,x:number,z:number,base:number,direction:1|-1) {
    for(let i=0;i<count;i++) {
      const top=base+(i+1)*rise;
      const zz=z+direction*(i+.5)*tread;
      box(width,top-perimeter-.02,tread,m.riser,x,(top+perimeter-.02)/2,zz);
      softBox(width+.04,.07,tread+.035,m.light,x,top-.035,zz,.013);
      box(width-.08,.016,.035,m.seam,x,top+.009,zz-direction*(tread*.5-.12));
    }
  }
  stairs(90,12,(plaza-perimeter)/12,.69,0,-36.98,perimeter,1);
  stairs(89.4,4,(north-plaza)/4,.70,0,23.7,plaza,1);
  // Raised north gardens are separated by an actual entrance and landing.
  pavement(39.6,17.1,north,-29.8,35.05);
  pavement(39.6,17.1,north,29.8,35.05);
  pavement(20,8.8,north,0,30.9);
  stairs(19.8,16,(north-perimeter)/16,.52,0,43.62,perimeter,-1);
  for(const sx of [-1,1]) pavement(5.4,7.6,plaza,sx*52.3,26.2);

  // Continuous side ramps connect the street promenade to the upper paving.
  // A wedge, rather than tilted box sides, keeps every edge planted in ground.
  function ramp(x:number,z0:number,z1:number,width:number,y0:number,y1:number) {
    const geometry=new THREE.BoxGeometry(width,1,z1-z0);
    const position=geometry.getAttribute('position');
    for(let i=0;i<position.count;i++) {
      const zz=position.getZ(i)+(z0+z1)/2;
      const yy=position.getY(i)>0?THREE.MathUtils.lerp(y0,y1,(zz-z0)/(z1-z0)):ground+.10;
      position.setXYZ(i,position.getX(i)+x,yy,zz);
    }
    geometry.computeVertexNormals(); add(geometry,m.granite,0,0,0);
    for(let i=0;i<24;i++) {
      const t=(i+.5)/24, zz=THREE.MathUtils.lerp(z0,z1,t), yy=THREE.MathUtils.lerp(y0,y1,t);
      box(width-.06,.012,.04,m.seam,x,yy+.008,zz);
    }
  }
  for(const sx of [-1,1]) {
    if(sx<0)ramp(sx*56.5,-42,26,3.8,perimeter,plaza);
    ramp(sx*51.3,26,42,2.0,plaza,north);
    pavement(3.3,2.0,north,sx*50.6,42.65);
    // Slim continuous seatwalls frame the center, with breaks at both ends.
    if(sx<0)pavement(7.8,45,plaza,sx*48.6,-4);
    else { pavement(7.8,18,plaza,sx*48.6,-17); pavement(8.5,18,plaza,48.95,13); }
    const gardenZ=sx<0?[9]:[-17];
    for(const z of gardenZ) {
      softBox(7.6,.50,18,m.granite,sx*48.5,plaza+.25,z);
      softBox(7.9,.14,18.3,m.light,sx*48.5,plaza+.55,z);
      box(6.8,.06,17.2,m.soil,sx*48.5,PLAZA_LEVELS.sideSoil-.03,z);
      // Native-looking low groundcover leaves the palm trunks fully readable.
      for(let ix=0;ix<5;ix++)for(let iz=0;iz<11;iz++) {
        const xx=sx*48.5-2.7+ix*1.35,zz=z-7.6+iz*1.5;
        sphere(.59,.28,.62,flowerLeaf,xx,PLAZA_LEVELS.sideSoil+.17,zz);
        if((ix+iz)%4===0)sphere(.25,.13,.25,flowerLavender,xx+.08,PLAZA_LEVELS.sideSoil+.46,zz);
      }
    }
  }
  // The Stockton entrance is a longer flight, framed by cafe and garden,
  // rather than another copy of the broad Geary stair. Its seventeen risers
  // echo the mapped eastern flights while fitting this compressed game block.
  for(let i=0;i<17;i++){
    const top=perimeter+(i+1)*(plaza-perimeter)/17;
    const x=58.8-(i+.5)*.825;
    box(.825,top-perimeter-.02,11.4,m.riser,x,(top+perimeter-.02)/2,-2);
    softBox(.86,.065,11.44,m.light,x,top-.0325,-2,.012);
    box(.033,.014,11.36,m.seam,x+.28,top+.008,-2);
  }
  softBox(5.8,.50,4.1,m.granite,-48.5,plaza+.25,-25);
  softBox(6,.14,4.3,m.light,-48.5,plaza+.55,-25);
  box(5.15,.05,3.45,m.soil,-48.5,PLAZA_LEVELS.sideSoil-.025,-25);

  // Layered, low planting and long granite seatwalls fill the north terrace.
  for(const sx of [-1,1]) {
    softBox(37,.50,11.6,m.granite,sx*30,north+.25,36);
    softBox(37.4,.14,12,m.light,sx*30,north+.55,36);
    box(36,.06,10.8,m.soil,sx*30,PLAZA_LEVELS.northSoil-.03,36);
    for(let ix=0;ix<24;ix++)for(const zz of [31.15,40.8]) {
      const xx=sx*29-14.7+ix*1.28;
      sphere(.58,.39,.51,flowerLeaf,xx,north+.45,zz);
      if(ix%2===0) sphere(.38,.14,.34,flowerCream,xx,north+.83,zz-.07);
    }
    // Four south-facing timber benches sit on the upper plaza, not in mid-air.
    for(const xx of [sx*21,sx*37]) {
      softBox(9,.43,.94,m.granite,xx,north+.215,28.2);
      for(let slat=0;slat<4;slat++) softBox(8.88,.085,.18,m.timber,xx,north+.472,27.88+slat*.21,.014);
      for(const dx of [-3.6,3.6]) box(.07,.15,.82,stainless,xx+dx,north+.51,28.2);
    }
  }
  // Palm gardens on the southern promenade leave a generous diagonal route
  // from each street corner to the monumental stair and its center landing.
  for(const x of [-31]) {
    softBox(17,.52,5.1,m.granite,x,perimeter+.26,-44);
    softBox(17.2,.13,5.3,m.light,x,perimeter+.555,-44);
    box(16.2,.04,4.35,m.lawn,x,PLAZA_LEVELS.southSoil-.02,-44);
    for(let i=0;i<11;i++)sphere(.62,.25,.42,flowerLeaf,x-7.4+i*1.48,PLAZA_LEVELS.southSoil+.18,-45.65);
    for(let slat=0;slat<4;slat++)softBox(16.3,.09,.20,m.timber,x,perimeter+.66,-41.9+slat*.22,.014);
  }
  // A continuous upper and lower rail, slender posts and wall mounts make
  // the level changes convincing in the moving camera.
  function handrail(a:THREE.Vector3,b:THREE.Vector3,postCount=4) {
    rod(a.clone().add(V(0,.94,0)),b.clone().add(V(0,.94,0)),.042,stainless);
    rod(a.clone().add(V(0,.65,0)),b.clone().add(V(0,.65,0)),.03,stainless);
    for(let i=0;i<postCount;i++) {
      const p=a.clone().lerp(b,i/(postCount-1));
      rod(p,p.clone().add(V(0,.94,0)),.034,stainless);
      cylinder(.11,.035,stainless,p.x,p.y+.018,p.z,.11,10);
    }
  }
  for(const x of [-31,-11,11,31])handrail(V(x,perimeter,-37.3),V(x,plaza,-28.4),5);
  for(const x of [-7.0,7.0])handrail(V(x,perimeter,44),V(x,north,35.1),5);
  for(const x of [-16,16])handrail(V(x,plaza,23.4),V(x,north,26.6),3);
  for(const sx of [-1,1]) {
    if(sx<0)handrail(V(sx*58.3,perimeter,-42),V(sx*58.3,plaza,26),15);
    box(12.2,1.08,.68,m.riser,sx*43.2,perimeter+.54,sx*47);
    sign('UNION SQUARE','SAN FRANCISCO',11.7,.92,sx*43.2,perimeter+.58,sx*47.35,sx===1?0:Math.PI,'#656d62','#fff5df');
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

  function palm(x: number, z: number, height: number, phase: number, y: number) {
    const top = y + height;
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
  for (const p of PLAZA_PALMS) palm(p.x,p.z,13.2*p.scale,p.angle,p.y);

  finishFallback(palmFallback);
  batches = architectureBatches;
  const plazaArt = createPlazaAssets(group, monumentFallback, palmFallback);
  const plazaReady = plazaArt.ready;

  // The corner hearts are sculptural objects, with a painted SF palette.
  const heartMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .08 }); heartMat.name = 'Union Square / painted heart sculptures';
  for (const [index, [x, z]] of [[-53, -44], [53, -44], [-53, 46], [53, 46]].entries()) {
    softBox(2.45, .85, 2.45, m.light, x, perimeter + .425, z);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(-.28, .49, -1.35, 1.05, -1.35, 1.97); shape.bezierCurveTo(-1.35, 2.77, -.38, 2.88, 0, 2.14); shape.bezierCurveTo(.38, 2.88, 1.35, 2.77, 1.35, 1.97); shape.bezierCurveTo(1.35, 1.05, .28, .49, 0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .62, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .19, bevelThickness: .20, curveSegments: 15 });
    geometry.translate(0, 0, -.31); const colors: number[] = [], position = geometry.getAttribute('position');
    const palette = ['#ee4b53', '#e89737', '#46ada2', '#386bab', '#ee7186'];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const band = Math.floor((position.getX(vertex) * .75 + position.getY(vertex) * 1.6 + 12 + index) % palette.length);
      const color = new THREE.Color(palette[band]); colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    add(geometry, heartMat, x, perimeter + .93, z, Math.atan2(x, z));
  }

  function cafeTable(x: number, z: number, parasol: boolean) {
    const y = plaza;
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
  for (const x of [-35,-28,28,35]) cafeTable(x,18,true);
  for (const x of [-36,-29,29,36]) cafeTable(x,-20,false);
  // The real cafe pavilions belong to the east and west flanks. Separate
  // light roofs, glazing, marble counters and planted edges give each a small
  // but complete architecture, with no fictional row of kiosks across Post.
  function cafePavilion(x:number,z:number,depth:number,label:string){
    const facing=x<0?1:-1,front=x+facing*4.25;
    softBox(8.5,2.72,depth,m.granite,x,plaza+1.36,z);
    box(.09,1.95,depth-1.2,m.dark,front+facing*.02,plaza+1.50,z);
    box(.05,1.58,depth-1.4,m.glass,front+facing*.08,plaza+1.60,z);
    for(let zz=z-depth/2+.9;zz<z+depth/2;zz+=2.1)box(.13,2.13,.07,m.gold,front+facing*.13,plaza+1.54,zz);
    box(1.02,.12,depth-1.1,m.light,front+facing*.45,plaza+.98,z);
    softBox(10.2,.18,depth+1.4,m.light,x,plaza+2.85,z);
    softBox(9.9,.10,depth+1.1,m.dark,x,plaza+2.72,z);
    for(let slat=0;slat<22;slat++)box(9.5,.05,.095,m.timber,x,plaza+2.64,z-depth/2+(slat+.5)*depth/22);
    sign(label,'',depth-1.5,.43,front+facing*.17,plaza+2.48,z,facing*Math.PI/2,'#38584c','#f9e9c7',false);
    for(const side of [-1,1]){
      box(5.9,1.65,.055,m.dark,x,plaza+1.49,z+side*(depth/2+.03));
      for(const dx of [-2.8,0,2.8])box(.06,1.88,.13,m.gold,x+dx,plaza+1.53,z+side*(depth/2+.08));
    }
  }
  cafePavilion(48.95,13,12.4,'MILLER & LUX');
  cafePavilion(-48.6,-13,12.4,'UNION SQUARE BAKERY');
  for(const z of [-6.7,2.7])handrail(V(58.9,perimeter,z),V(44.7,plaza,z),6);

  // Union Square / Market Street station occupies the southeast apron by
  // Geary. Its mapped footprint runs east-west, with entry at the western end;
  // this low glass-and-stone volume also gives that corner a real purpose.
  const stationX=34, stationZ=-42, stationFloor=perimeter+.02;
  const stationSteel=material('subway stainless steel', '#98aaa9', .28, .72);
  const stationRubber=material('escalator black handrails', '#273433', .68);
  const stationGlass=material('station canopy glazed panels', '#9db6b0', .18, .26);
  // Recessed charcoal reveals separate the granite walls from their capstone.
  for(const side of [-1,1]){
    softBox(17.5,.42,.73,m.granite,stationX,stationFloor+.21,stationZ+side*4.75);
    box(17.15,2.38,.16,stationGlass,stationX,stationFloor+1.60,stationZ+side*4.68);
    box(17.6,.17,.79,m.light,stationX,stationFloor+2.85,stationZ+side*4.72);
    for(let bay=0;bay<8;bay++)box(.08,2.49,.22,stationSteel,25.5+bay*2.4,stationFloor+1.6,stationZ+side*4.77);
    box(17.0,.11,.11,stationSteel,stationX,stationFloor+1.45,stationZ+side*4.84);
  }
  softBox(.85,2.95,9.6,m.granite,42.75,stationFloor+1.475,stationZ);
  softBox(18.5,.16,10.65,stationSteel,stationX,stationFloor+3.07,stationZ);
  for(let bay=0;bay<7;bay++){
    box(2.51,.07,10.35,stationGlass,26.2+bay*2.60,stationFloor+3.185,stationZ);
    box(.075,.12,10.60,stationSteel,24.9+bay*2.60,stationFloor+3.205,stationZ);
  }
  // The west portal is open between two slim piers. The upper escalator treads
  // disappear behind a dark throat, avoiding a brightly lit fake subway room.
  for(const side of [-1,1]){
    box(.28,2.83,.19,stationSteel,25.15,stationFloor+1.415,stationZ+side*4.48);
    box(.46,.28,1.03,m.light,25.15,stationFloor+.14,stationZ+side*4.47);
  }
  box(.055,2.54,8.6,m.dark,29.4,stationFloor+1.29,stationZ);
  box(4.15,.028,8.53,m.dark,27.12,stationFloor+.016,stationZ);
  for(const lane of [-1,1]){
    const z=stationZ+lane*1.45;
    for(let tread=0;tread<11;tread++){
      const x=25.37+tread*.33,y=stationFloor+.035-tread*.043;
      box(.32,.075,2.2,stationSteel,x,y,z);
      box(.04,.025,2.05,m.gold,x-.125,y+.045,z);
      for(let rib=0;rib<17;rib++)box(.30,.014,.018,stationRubber,x,y+.046,z-.94+rib*.117);
    }
    for(const edge of [-1,1]){
      rod(V(25.0,stationFloor+.88,z+edge*1.16),V(29.1,stationFloor+.36,z+edge*1.16),.062,stationRubber);
      rod(V(25.0,stationFloor+.67,z+edge*1.16),V(29.1,stationFloor+.15,z+edge*1.16),.16,stationSteel);
    }
    cylinder(.14,.18,stationSteel,25.20,stationFloor+.64,z+lane*1.30,.14,16);
  }
  box(.13,.54,8.8,m.dark,25.02,stationFloor+2.77,stationZ);
  sign('UNION SQUARE / MARKET STREET','MUNI METRO · T THIRD',8.32,.46,24.94,stationFloor+2.77,stationZ,-Math.PI/2,'#253f42','#f6eee0',false);
  // The familiar Muni red blade is readable from the driving line on Geary.
  box(.80,4.55,.37,m.red,42.2,perimeter+2.275,-48.0);
  sign('T','MUNI',.68,1.05,42.2,perimeter+3.70,-48.21,Math.PI,'#af3445','#fff6df',false);
  sign('T','MUNI',.68,1.05,42.2,perimeter+3.70,-47.79,0,'#af3445','#fff6df',false);
  // A relocated palm bed keeps the station forecourt clear at the SE corner.
  softBox(6.2,.50,5.1,m.granite,49,perimeter+.25,-31);
  softBox(6.4,.14,5.3,m.light,49,perimeter+.55,-31);
  box(5.45,.05,4.45,m.soil,49,PLAZA_LEVELS.southSoil-.025,-31);
  for(const z of [-32.6,-29.4])for(let x=47;x<=51;x+=1)sphere(.52,.24,.38,flowerLeaf,x,PLAZA_LEVELS.southSoil+.18,z);

  // Fluted litter bins, square drains, small ground lights and a few flagpoles
  // keep the large civic paving from losing its pedestrian scale.
  for (const x of [-41,41]) for (const z of [-40,45]) {
    cylinder(.39,1.03,m.dark,x,perimeter+.515,z,.39,16);
    for(let rib=0;rib<18;rib++){const a=rib*Math.PI/9;box(.04,.89,.06,m.metal,x+Math.cos(a)*.395,perimeter+.515,z+Math.sin(a)*.395,-a);}
    cylinder(.445,.07,m.metal,x,perimeter+1.045,z,.445,24);
    cylinder(.29,.016,m.dark,x,perimeter+1.089,z,.29,20);
  }
  for(const p of PLAZA_PALMS){
    cylinder(.18,.034,stainless,p.x+.95,p.y+.012,p.z,.18,16);
    cylinder(.145,.012,m.dark,p.x+.95,p.y+.035,p.z,.145,16);
  }
  for(const x of [-41,41])for(const z of [-24,-4,16]){
    box(.45,.012,.45,m.dark,x,plaza+.009,z);
    for(let i=0;i<7;i++)box(.025,.013,.42,stainless,x-.18+i*.06,plaza+.018,z);
  }
  for(const x of [-11,11]){
    cylinder(.12,.12,m.granite,x,north+.06,31,.12,16);
    cylinder(.049,7.2,stainless,x,north+3.7,31,.027,12);
    sphere(.085,.085,.085,m.gold,x,north+7.33,31);
    for(let fold=0;fold<10;fold++)box(.17,2.4,.028,fold%3===0?m.gold:m.red,x+.1+fold*.15,north+5.55,31+Math.sin(fold*.62)*.17);
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

  // Keep correctly placed street walls while the compressed Blender assets load.
  // Fallbacks are independent, so a failed asset never erases another block.
  const makeBuildingFallback = (name: string, parcels: number[][]) => {
    const target = new THREE.Group(); target.name = name; group.add(target);
    for (const [x,z,w,d,h] of parcels) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m.limestone);
      base.position.set(x,ground+h/2,z);base.castShadow=true;base.receiveShadow=true;target.add(base);
    }
    return target;
  };
  const northFallback = makeBuildingFallback('Post Street / loading fallback', [
    [-40,105,52,49,27],[-2.5,105,23,49,42],[15,105,12,49,17],[45,97,36,32,15],
    [46.5,158.5,30,51,94],[-47.5,157.5,37,49,62],[-109,95.5,42,29,20],
    [-100,122.5,24,25,52],[-136,108,12,54,29],[109,106,40,50,27],
    [108,153.5,38,29,33],[-108,-110,40,54,27],[-157,-110,56,54,28],
  ]);
  const frontageFallback = makeBuildingFallback('Geary and Stockton / loading fallback', [
    [0,-109,120,52,34],[115,-105,42,44,28],[111.5,-27,35,42,25],[111.5,28,35,40,40],
  ]);
  const northAsset = createNorthSquare(group,northFallback);
  const frontageAsset = createSquareFrontages(group,frontageFallback);

  // Static detail is merged by material; no individual window/tree/table draws.
  let triangles = 0;
  for (const [mat, geometries] of batches) {
    if(!geometries.length)continue;
    const merged = mergeGeometries(geometries, false)!; geometries.forEach(geometry => geometry.dispose());
    merged.computeBoundingSphere(); triangles += merged.getAttribute('position').count / 3;
    const mesh = new THREE.Mesh(merged, mat); mesh.name = mat.name; mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; group.add(mesh);
  }
  group.userData.drawCalls = group.children.length; group.userData.triangles = triangles;
  return {
    group,
    ready:Promise.all([westinAsset.ready, plazaReady, northAsset.ready, frontageAsset.ready]),
    update(_time: number, _progress: number, camera?:THREE.Camera) { if(camera){westinAsset.update(camera);northAsset.update(camera);frontageAsset.update(camera);} },
    setQuality(low: boolean) {
      westinAsset.setQuality(low);
      northAsset.setQuality(low);
      frontageAsset.setQuality(low);
      plazaArt.setQuality(low);
      for(const fallback of [monumentFallback, palmFallback, northFallback, frontageFallback]) fallback.traverse(child => { if(child instanceof THREE.Mesh) child.castShadow = !low; });
      westinFallback.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=!low;});
      for (const child of group.children) if (child instanceof THREE.Mesh) child.castShadow = !low && !(child.material as THREE.Material).transparent;
    },
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CARS, DRIVERS, SPONSORS, type RacerProfile } from './racer-profile';

export type CarState = {
  speed: number;
  steer: number;
  braking: boolean;
  boosting: boolean;
  time: number;
  /** 0 = road wheels, 1 = horizontal hover fans. */
  glide?: number;
  airborne?: boolean;
  altitude?: number;
  landing?: number;
};
type Section = [z: number, width: number, center: number, height: number];

/** A small, original coachbuilt coupe. All geometry is local; +Z is forward. */
export function createLegacyCar(): { group: THREE.Group; update: (dt: number, state: CarState) => void; customize: (profile: RacerProfile) => void; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'Sundrop / transforming SF coupe';
  const body = new THREE.Group();
  group.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xff4429, metalness: .22, roughness: .21, clearcoat: 1, clearcoatRoughness: .15 });
  const roofPaint = new THREE.MeshPhysicalMaterial({ color: 0xffe4aa, metalness: .12, roughness: .27, clearcoat: .7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11131b, roughness: .6, metalness: .3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xaab1bd, metalness: .85, roughness: .24 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x184762, metalness: .48, roughness: .16, clearcoat: 1 });
  const redLight = new THREE.MeshStandardMaterial({ color: 0xff2338, emissive: 0xff1630, emissiveIntensity: .55, roughness: .25 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xfff5d2, emissive: 0xffedc2, emissiveIntensity: .7 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffb345, emissive: 0xff8f27, emissiveIntensity: .7 });
  const hoverGlow = new THREE.MeshStandardMaterial({ color: 0x16e8cf, emissive: 0x00ffe2, emissiveIntensity: .06, roughness: .24, metalness: .28 });
  const jetMaterial = new THREE.MeshBasicMaterial({ color: 0x1fffe0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x80fff4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

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
  // A warm ivory roof and fine sill stripe keep the candy body readable from above.
  box(1.57, .105, 3.55, dark, 0, .285, 0);
  box(1.68, .09, .21, dark, 0, .285, 1.83);
  box(1.56, .105, .2, dark, 0, .32, -1.92);
  const cabinSections: Section[] = [
    [-1.04, .7, .77, .04], [-.74, .71, .87, .19], [-.45, .65, .98, .32],
    [-.18, .65, 1, .32], [.26, .62, .98, .31], [.57, .7, .87, .17], [.86, .74, .77, .02],
  ];
  const cabin = loft(cabinSections, glass);

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
  const roof = mesh(roofGeo, roofPaint);
  roof.userData.customizable = cabin.userData.customizable = true;
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
    box(.032, .034, 1.67, roofPaint, side * .883, .401, -.025);
    box(.034, .016, 1.27, hoverGlow, side * .902, .367, -.06);
  }

  // An original little hill-climb roundel, shared by both doors.
  const roundelCanvas = document.createElement('canvas');
  roundelCanvas.width = roundelCanvas.height = 256;
  const rc = roundelCanvas.getContext('2d');
  if (rc) {
    rc.fillStyle = '#ffe5ae'; rc.beginPath(); rc.arc(128, 128, 117, 0, Math.PI * 2); rc.fill();
    rc.strokeStyle = '#f95030'; rc.lineWidth = 8; rc.beginPath(); rc.arc(128, 128, 105, 0, Math.PI * 2); rc.stroke();
    rc.fillStyle = '#203348'; rc.font = '900 108px sans-serif'; rc.textAlign = 'center'; rc.textBaseline = 'middle'; rc.fillText('01', 128, 129);
    const map = new THREE.CanvasTexture(roundelCanvas); map.colorSpace = THREE.SRGBColorSpace;map.repeat.x=-1;map.offset.x=1;
    const material = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: .25, roughness: .36, polygonOffset: true, polygonOffsetFactor: -1 });
    for (const side of [-1, 1]) {
      const roundel = mesh(new THREE.PlaneGeometry(.32, .32), material, side * .893, .615, -.20);
      roundel.rotation.y = side * Math.PI / 2;
    }
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
    pc.fillStyle = '#233247'; pc.textAlign = 'center'; pc.font = 'bold 63px monospace'; pc.fillText('SF HOP', 256, 109);
    const map = new THREE.CanvasTexture(plateCanvas);map.repeat.x=-1;map.offset.x=1;
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

  // Each wheel gets a suspension mount, an independent fold joint, a steering
  // joint and finally the axle. Axle spin cannot unwind the hover transformation.
  const wheelSpin: THREE.Group[] = [], wheelSteer: THREE.Group[] = [];
  const wheelMounts: { mount: THREE.Group; fold: THREE.Group; side: number }[] = [];
  const jets: THREE.Mesh[] = [], halos: THREE.Mesh[] = [];
  const tireGeo = new THREE.TorusGeometry(.267, .077, 10, 24);
  tireGeo.rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(.218, .218, .08, 24);
  rimGeo.rotateZ(Math.PI / 2);
  const sidewallGeo = new THREE.CylinderGeometry(.302, .302, .16, 24);
  sidewallGeo.rotateZ(Math.PI / 2);
  const hoverRingGeo = new THREE.TorusGeometry(.229, .022, 8, 32);
  hoverRingGeo.rotateY(Math.PI / 2);
  const hoverHubGeo = new THREE.CylinderGeometry(.093, .093, .026, 16);
  hoverHubGeo.rotateZ(Math.PI / 2);
  const jetGeo = new THREE.CylinderGeometry(.11, .35, .88, 20, 1, true);
  const haloGeo = new THREE.RingGeometry(.245, .32, 32);
  for (const z of [-1.23, 1.22]) for (const side of [-1, 1]) {
    const mount = new THREE.Group(); mount.position.set(side * .915, .345, z); group.add(mount);
    const fold = new THREE.Group(); fold.name = `${side < 0 ? 'left' : 'right'} ${z < 0 ? 'rear' : 'front'} hover joint`; mount.add(fold);
    wheelMounts.push({ mount, fold, side });
    const steer = new THREE.Group(); fold.add(steer);
    const spin = new THREE.Group(); steer.add(spin); wheelSpin.push(spin);
    if (z > 0) wheelSteer.push(steer);
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
    // Both faces light up, so the turbine reads from the chase camera as well
    // as from the underside of a jump. The original rubber stays visible.
    for (const face of [-1, 1]) {
      mesh(hoverRingGeo, hoverGlow, face * .133, 0, 0, spin);
      mesh(hoverHubGeo, hoverGlow, face * .143, 0, 0, spin);
      for (let blade = 0; blade < 6; blade++) {
        const t = blade / 6 * Math.PI * 2;
        const turbine = box(.018, .115, .034, roofPaint, face * .144, Math.cos(t) * .142, Math.sin(t) * .142, spin);
        turbine.rotation.x = t + .32;
      }
    }
    const jet = mesh(jetGeo, jetMaterial, side * .58, 0, 0, fold);
    jet.rotation.z = side * Math.PI / 2;
    jet.castShadow = false; jet.receiveShadow = false; jet.visible = false; jets.push(jet);
    const halo = mesh(haloGeo, haloMaterial, side * .173, 0, 0, fold);
    halo.rotation.y = Math.PI / 2;
    halo.castShadow = false; halo.receiveShadow = false; halo.visible = false; halos.push(halo);
  }

  // Compact aero fins unfurl from the rear quarters. Their warm tops retain
  // the coupe's silhouette while turquoise edges echo the four hover fans.
  const fins: { pivot: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * .78, .65, -1.32); body.add(pivot);
    const shape = new THREE.Shape();
    shape.moveTo(0, -.42); shape.lineTo(.88, -.61); shape.lineTo(1.15, -.35); shape.lineTo(.90, .02); shape.lineTo(0, .20); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: true, bevelThickness: .015, bevelSize: .025, bevelSegments: 1 });
    geometry.rotateX(-Math.PI / 2); geometry.scale(side, 1, 1);
    if (side < 0) {
      // A mirrored position transform reverses winding; keep outward normals.
      const index = geometry.index;
      if (index) for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a); }
      else {
        for (const name of Object.keys(geometry.attributes)) {
          const attr = geometry.getAttribute(name);
          for (let i = 0; i < attr.count; i += 3) for (let c = 0; c < attr.itemSize; c++) {
            const a = attr.getComponent(i, c); attr.setComponent(i, c, attr.getComponent(i + 2, c)); attr.setComponent(i + 2, c, a);
          }
        }
      }
      geometry.computeVertexNormals();
    }
    mesh(geometry, roofPaint, 0, 0, 0, pivot);
    const edge = box(.58, .038, .052, hoverGlow, side * .72, .025, .35, pivot);
    edge.rotation.y = side * -.25;
    pivot.scale.x = .05; pivot.visible = false;
    fins.push({ pivot, side });
  }

  // Bake only pieces that are rigid relative to the same parent. The body
  // keeps its suspension motion, every wheel keeps its spin/steering pivots,
  // and the moving wheels keep their independent steering and spin.
  const sourceGeometries = new Set<THREE.BufferGeometry>();
  function mergeRigidParts(parent: THREE.Group, name: string) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.material.transparent || child.userData.customizable) continue;
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
  fins.forEach(({ pivot }, i) => mergeRigidParts(pivot, `aero fin ${i + 1}`));
  // Some tire primitives are shared by all four wheels. Dispose them only
  // after every wheel has been baked, and keep any unmerged geometry alive.
  group.traverse(object => { if (object instanceof THREE.Mesh) sourceGeometries.delete(object.geometry); });
  sourceGeometries.forEach(geometry => geometry.dispose());

  let hover = 0;
  let wasAirborne = false;
  let landingBounce = 0;
  const sport = new THREE.Group(), roadster = new THREE.Group();body.add(sport, roadster);
  box(1.95,.10,.42,roofPaint,0,1.04,-1.65,sport);
  for(const side of [-1,1]) {
    box(.09,.45,.1,dark,side*.65,.8,-1.65,sport);
    box(.11,.025,.7,roofPaint,side*.20,.79,1.22,sport);
    const hoop=mesh(new THREE.TorusGeometry(.25,.045,8,18,Math.PI),metal,side*.4,1.02,-.4,roadster);
    hoop.rotation.y=Math.PI;
  }
  const helmetPaint=new THREE.MeshStandardMaterial({color:'#ba96ff',roughness:.38});
  const helmet=mesh(new THREE.SphereGeometry(.21,16,12),helmetPaint,-.34,1.15,-.07,roadster);
  box(.32,.095,.08,glass,-.34,1.17,.11,roadster);
  const decalCanvas=document.createElement('canvas');decalCanvas.width=512;decalCanvas.height=256;
  const decalMap=new THREE.CanvasTexture(decalCanvas);decalMap.colorSpace=THREE.SRGBColorSpace;decalMap.repeat.x=-1;decalMap.offset.x=1;
  const decalMaterial=new THREE.MeshStandardMaterial({map:decalMap,roughness:.5,transparent:true,polygonOffset:true,polygonOffsetFactor:-2});
  const decals=new THREE.Group();body.add(decals);
  const hood=mesh(new THREE.PlaneGeometry(1.05,.53),decalMaterial,0,.867,1.18,decals);hood.rotation.x=-Math.PI/2;
  for(const side of [-1,1]){const door=mesh(new THREE.PlaneGeometry(.78,.34),decalMaterial,side*.921,.60,.05,decals);door.rotation.y=side*Math.PI/2;}
  const driverCanvas=document.createElement('canvas');driverCanvas.width=256;driverCanvas.height=128;
  const driverMap=new THREE.CanvasTexture(driverCanvas);driverMap.colorSpace=THREE.SRGBColorSpace;driverMap.repeat.x=-1;driverMap.offset.x=1;
  const driverMaterial=new THREE.MeshStandardMaterial({map:driverMap,transparent:true,roughness:.5});
  const badge=mesh(new THREE.PlaneGeometry(.63,.31),driverMaterial,0,.899,-1.3);badge.rotation.x=-Math.PI/2;badge.visible=false;
  sport.visible=roadster.visible=decals.visible=false;
  let currentSponsor = '';
  let disposed = false;
  function customize(profile:RacerProfile){
    const style=CARS.find(c=>c.id===profile.car)??CARS[0],driver=DRIVERS.find(d=>d.id===profile.driver)??DRIVERS[0],sponsor=SPONSORS.find(s=>s.id===profile.sponsor)??SPONSORS[0];
    paint.color.set(style.color);roofPaint.color.set(style.roof);helmetPaint.color.set(driver.color);
    sport.visible=style.id==='comet';roadster.visible=style.id==='tide';roof.visible=cabin.visible=!roadster.visible;
    decals.visible=!!sponsor.mark;
    const ctx=decalCanvas.getContext('2d')!;ctx.clearRect(0,0,512,256);ctx.fillStyle=sponsor.background;ctx.fillRect(0,0,512,256);
    ctx.fillStyle=sponsor.color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 86px sans-serif';ctx.fillText(sponsor.mark,256,112,470);ctx.font='700 23px sans-serif';ctx.fillText('DEMO SPONSOR',256,203);decalMap.needsUpdate=true;
    currentSponsor=sponsor.id;
    if(sponsor.logo){const image=new Image();image.onload=()=>{if(disposed||currentSponsor!==sponsor.id)return;ctx.clearRect(0,0,512,256);ctx.drawImage(image,0,0,512,256);decalMap.needsUpdate=true;};image.src=sponsor.logo;}
    const dc=driverCanvas.getContext('2d')!;dc.fillStyle=driver.color;dc.fillRect(0,0,256,128);dc.fillStyle='#142d3f';dc.font='900 40px sans-serif';dc.textAlign='center';dc.textBaseline='middle';dc.fillText(driver.name.toUpperCase(),128,64);driverMap.needsUpdate=true;badge.visible=true;
    group.userData.profile={...profile};
  }
  function dispose(){
    disposed=true;
    const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),geometries=new Set<THREE.BufferGeometry>();
    group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const mat of Array.isArray(object.material)?object.material:[object.material]){materials.add(mat);for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);}}});
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();
  }
  return {
    customize, dispose,
    group,
    update(dt, state) {
      const step = Math.max(0, Math.min(dt, .1));
      const targetHover = THREE.MathUtils.clamp(state.glide ?? (state.airborne ? 1 : 0), 0, 1);
      hover = THREE.MathUtils.damp(hover, targetHover, targetHover > hover ? 9 : 13, step);
      if (Math.abs(hover - targetHover) < .001) hover = targetHover;
      for (const wheel of wheelSpin) wheel.rotation.x += (state.speed / .345 * (1 - hover) + hover * 22) * step;
      for (const front of wheelSteer) front.rotation.y = state.steer * .43 * (1 - hover);
      for (const { mount, fold, side } of wheelMounts) {
        mount.position.x = side * (.915 + hover * .30);
        mount.position.y = .345 + hover * .055;
        fold.rotation.z = -side * hover * Math.PI / 2;
      }
      const energy = THREE.MathUtils.smoothstep(hover, .25, .9);
      hoverGlow.emissiveIntensity = .055 + energy * (state.boosting ? 4.8 : 2.6);
      const pulse = .94 + Math.sin(state.time * 23) * .045 + Math.sin(state.time * 37) * .025;
      jetMaterial.opacity = energy * .15;
      haloMaterial.opacity = energy * .56;
      jets.forEach(jet => { jet.visible = energy > .005; jet.scale.y = pulse * (state.boosting ? 1.5 : 1); });
      halos.forEach(halo => { halo.visible = energy > .005; halo.scale.setScalar(pulse); });
      fins.forEach(({ pivot, side }) => {
        pivot.visible = hover > .025;
        pivot.scale.x = Math.max(.05, hover);
        pivot.rotation.z = side * (1 - hover) * -.38;
      });
      if (wasAirborne && !state.airborne) landingBounce = 1;
      landingBounce = Math.max(state.landing ?? 0, landingBounce * Math.exp(-step * 8));
      wasAirborne = state.airborne ?? false;
      body.position.y = Math.sin(state.time * 26) * Math.min(Math.abs(state.speed) / 100, .016) * (1 - hover)
        + Math.sin(state.time * 3.6) * .022 * hover - Math.sin(landingBounce * Math.PI) * .075;
      body.rotation.z = THREE.MathUtils.damp(body.rotation.z, -state.steer * .035 * (1 - hover), 8, step);
      redLight.emissiveIntensity = state.braking ? 2.5 : .55;
      paint.emissive.setHex(state.boosting ? 0x26050a : 0x000000);
      group.userData.hover = hover;
      group.userData.wheelFoldDegrees = hover * 90;
      group.userData.hoverAltitude = state.altitude ?? 0;
    },
  };
}

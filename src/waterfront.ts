import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A compressed Embarcadero postcard, facing the last stretch of Market Street. */
export function createWaterfront(scene: THREE.Object3D) {
  const group = new THREE.Group(); group.name = 'Embarcadero · Ferry Building and sparkling bay'; scene.add(group);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const material = (name: string, color: string, roughness = .74, metalness = .04) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: .5 }); mat.name = `Waterfront / ${name}`; return mat;
  };
  const stone = material('warm limestone', '#ffe3b4');
  const trim = material('ivory carved stone', '#fff4d6');
  const shade = material('sandstone reveals', '#d9a77a');
  const mint = material('patinated copper roof', '#259c9c', .45, .3);
  const roofLight = material('copper roof seams', '#78c3bd', .46, .25);
  const recess = material('deep arcade shadows', '#235065');
  const glass = material('blue arch glazing', '#5aacc4', .25, .22);
  const gold = material('clock gilt', '#eec263', .32, .56);
  const pavement = material('sunlit promenade', '#efd5b0', .95);
  const quay = material('granite seawall', '#a5b5b2', .86);
  const railing = material('dark green waterfront iron', '#205c65', .55, .4);
  const white = material('ferry white', '#fff3d9', .49);
  const navy = material('ferry hull', '#13658b', .40, .25);
  const orange = material('ferry safety orange', '#ff9661', .63);

  function add(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotation = new THREE.Euler()) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(rotation), V(1, 1, 1)));
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    if (!batches.has(mat)) batches.set(mat, []); batches.get(mat)!.push(normalized);
  }
  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) { add(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) {
    const direction = b.clone().sub(a), midpoint = a.clone().add(b).multiplyScalar(.5);
    add(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), mat, midpoint.x, midpoint.y, midpoint.z,
      new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), direction.normalize())));
  }
  function hipRoof(w: number, d: number, h: number, x: number, y: number, z: number) {
    const geometry = new THREE.CylinderGeometry(0, 1, h, 4, 1); geometry.rotateY(Math.PI / 4); geometry.scale(w / Math.SQRT2, 1, d / Math.SQRT2);
    add(geometry, mint, x, y, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(V(x + sx * w / 2, y - h / 2, z + sz * d / 2), V(x, y + h / 2, z), .13, roofLight);
  }
  function arch(width: number, height: number, x: number, y: number, z: number, glazed = false) {
    const r = width / 2, spring = height - r, shape = new THREE.Shape();
    shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, spring); shape.absarc(0, spring, r, 0, Math.PI, false); shape.lineTo(-r, 0);
    add(new THREE.ShapeGeometry(shape, 18), glazed ? glass : recess, x, y, z, new THREE.Euler(0, Math.PI, 0));
    box(.36, spring + .25, .48, trim, x - r - .18, y + spring / 2, z - .10);
    box(.36, spring + .25, .48, trim, x + r + .18, y + spring / 2, z - .10);
    add(new THREE.TorusGeometry(r + .18, .20, 5, 24, Math.PI), trim, x, y + spring, z - .14);
    box(.58, .77, .58, trim, x, y + height + .1, z - .15);
    if (glazed) { box(.15, height - .15, .14, gold, x, y + height / 2, z - .09); box(width, .12, .14, gold, x, y + spring, z - .09); }
  }
  function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; paint(canvas.getContext('2d')!);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; return map;
  }
  function lettering(text: string, w: number, h: number, x: number, y: number, z: number) {
    const map = canvasTexture(2048, 256, ctx => {
      ctx.fillStyle = '#ffebc8'; ctx.fillRect(0, 0, 2048, 256); ctx.fillStyle = '#376e73';
      ctx.font = 'bold 142px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 1024, 139, 1970);
      ctx.strokeStyle = '#c39961'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(20, 22); ctx.lineTo(2028, 22); ctx.moveTo(20, 234); ctx.lineTo(2028, 234); ctx.stroke();
    });
    const mat = new THREE.MeshStandardMaterial({ map, roughness: .8 });
    add(new THREE.PlaneGeometry(w, h), mat, x, y, z, new THREE.Euler(0, Math.PI, 0));
  }

  const center = 1585, base = 1.5, front = center - 18;
  // A real pier keeps the building on land, with water visible on both sides.
  box(198, 4.8, 112, quay, 0, base - 2.6, center + 8);
  box(200, .65, 114, pavement, 0, base + .05, center + 8);
  box(38, 3.1, 112, quay, 0, -.4, 1477); box(39, .42, 112, pavement, 0, 1.32, 1477);
  for (const side of [-1, 1]) {
    for (let z = 1438; z < 1532; z += 7) box(.23, 1.45, .23, railing, side * 18.6, 2.15, z);
    box(.17, .16, 98, railing, side * 18.6, 2.9, 1483);
    for (let z = 1545; z <= 1636; z += 10) { box(1.7, 4.6, 1.7, shade, side * 99.0, -.5, z); box(2.1, .28, 2.1, trim, side * 99.0, 1.85, z); }
  }
  // Long Beaux-Arts arcade wings with high clerestories and a copper roof.
  box(166, 18.3, 36, stone, 0, base + 9.15, center);
  box(170, 1.1, 38.5, trim, 0, base + 18.7, center);
  box(166.5, 2.4, 36.5, stone, 0, base + 20.1, center);
  box(171, .65, 39, trim, 0, base + 21.6, center);
  hipRoof(172, 41, 8, 0, base + 26, center);
  for (let x = -76; x <= 76; x += 9.5) {
    if (Math.abs(x) < 12) continue;
    arch(5.9, 10.4, x, base + .75, front - .025);
    arch(3.5, 4.0, x, base + 12.6, front - .04, true);
    box(.65, 17.5, .66, trim, x - 4.75, base + 9, front - .30);
    box(7.2, .38, 1.1, shade, x, base + 11.75, front - .3);
    // Recessed glazed entrance doors and their fine bronze crossbars.
    box(5.2, 5.2, .13, glass, x, base + 3.4, front - .07);
    for (const offset of [-1.8, 0, 1.8]) box(.12, 5.2, .19, gold, x + offset, base + 3.4, front - .17);
    box(5.2, .13, .19, gold, x, base + 5.3, front - .17);
  }
  for (const x of [-78, 78]) {
    box(14.5, 21, 39, stone, x, base + 10.5, center);
    box(16, 1, 41, trim, x, base + 21.2, center);
    hipRoof(16.5, 42, 6, x, base + 24.8, center);
    arch(7.4, 12.3, x, base + 1, front - 1.55, true);
    box(13.5, .5, 1, trim, x, base + 15, front - 1.7);
    for (const xx of [-4, 0, 4]) box(2, 2.9, .15, glass, x + xx, base + 18, front - 1.55);
  }
  // The clock tower is deliberately slender and taller than life: it is the
  // destination silhouette from the last hill, then fills the finish postcard.
  const towerFront = front - 4.2;
  box(22, 24, 23, stone, 0, base + 12, center - 9.0);
  arch(11, 15, 0, base + 1, towerFront - .40, true);
  box(24, 1.2, 25, trim, 0, base + 24, center - 9);
  box(16.8, 32, 18, stone, 0, base + 40.5, center - 9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(1.15, 32, 1.1, trim, sx * 7.9, base + 40.5, center - 9 + sz * 8.3);
  for (let y = 28; y < 53; y += 5) box(17.2, .2, 18.4, shade, 0, base + y, center - 9);
  for (const x of [-4.5, 4.5]) arch(2.8, 11, x, base + 30, center - 18.11, true);
  box(19, .85, 20, trim, 0, base + 53, center - 9);
  box(18.5, 13.7, 19.5, stone, 0, base + 60.2, center - 9);
  box(21, 1.2, 22, trim, 0, base + 67.3, center - 9);
  box(18.5, .4, 19.5, shade, 0, base + 68.25, center - 9);
  box(14.2, 9.8, 15.2, stone, 0, base + 73.5, center - 9);
  for (const x of [-4.2, 0, 4.2]) arch(2.35, 6.4, x, base + 69.9, center - 16.64);
  for (const side of [-1, 1]) { box(15.7, .48, 1.0, trim, 0, base + 69, center - 9 + side * 8); box(1.0, .48, 16, trim, side * 7.6, base + 69, center - 9); }
  box(17.7, 1.0, 18.7, trim, 0, base + 79.0, center - 9);
  hipRoof(19.6, 20.6, 9, 0, base + 84, center - 9);
  add(new THREE.SphereGeometry(.75, 12, 8), gold, 0, base + 89.2, center - 9);
  rod(V(0, base + 88.5, center - 9), V(0, base + 94.2, center - 9), .10, gold);
  box(49, 3.6, .75, trim, 0, base + 22, towerFront - .05);
  lettering('SAN FRANCISCO', 47, 2.85, 0, base + 22, towerFront - .46);
  lettering('FERRY BUILDING', 18, 2.0, 0, base + 18, towerFront - .58);

  const clockMap = canvasTexture(1024, 1024, ctx => {
    ctx.clearRect(0, 0, 1024, 1024); ctx.translate(512, 512);
    ctx.fillStyle = '#fff2c6'; ctx.beginPath(); ctx.arc(0, 0, 487, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#224b54'; ctx.lineWidth = 13; ctx.beginPath(); ctx.arc(0, 0, 464, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 334, 0, Math.PI * 2); ctx.stroke();
    for (let tick = 0; tick < 60; tick++) {
      const a = tick * Math.PI / 30; const radius = tick % 5 === 0 ? 429 : 440;
      ctx.lineWidth = tick % 5 === 0 ? 7 : 3; ctx.beginPath(); ctx.moveTo(Math.sin(a) * radius, -Math.cos(a) * radius); ctx.lineTo(Math.sin(a) * 451, -Math.cos(a) * 451); ctx.stroke();
    }
    ctx.fillStyle = '#214c58'; ctx.font = 'bold 69px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    numerals.forEach((n, index) => { const a = index * Math.PI / 6; ctx.fillText(n, Math.sin(a) * 386, -Math.cos(a) * 386); });
    const hand = (a: number, length: number, width: number) => { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-width, 45); ctx.lineTo(-width * .55, -length + 42); ctx.lineTo(0, -length); ctx.lineTo(width * .55, -length + 42); ctx.lineTo(width, 45); ctx.closePath(); ctx.fill(); ctx.restore(); };
    hand(Math.PI * 2 * (4 + 48 / 60) / 12, 266, 20); hand(Math.PI * 2 * 48 / 60, 340, 13);
    ctx.fillStyle = '#c2974d'; ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
  });
  const clockMat = new THREE.MeshStandardMaterial({ map: clockMap, roughness: .64, emissive: '#ffe2aa', emissiveIntensity: .10, transparent: true });
  for (let side = 0; side < 4; side++) {
    const angle = side * Math.PI / 2, direction = V(Math.sin(angle), 0, -Math.cos(angle));
    const pos = V(0, base + 60.25, center - 9).addScaledVector(direction, side % 2 ? 9.35 : 9.85);
    add(new THREE.CircleGeometry(5.10, 64), clockMat, pos.x, pos.y, pos.z, new THREE.Euler(0, Math.PI - angle, 0));
    add(new THREE.TorusGeometry(5.25, .29, 8, 64), gold, pos.x, pos.y, pos.z, new THREE.Euler(0, -angle, 0));
    add(new THREE.TorusGeometry(5.62, .22, 6, 64), trim, pos.x, pos.y, pos.z, new THREE.Euler(0, -angle, 0));
  }
  // Low promenade lamps and mooring bollards give the front of the pier scale.
  for (const x of [-91, -60, -31, 31, 60, 91]) {
    const z = center - 35;
    box(.5, 5.3, .5, railing, x, base + 2.75, z);
    add(new THREE.SphereGeometry(.8, 10, 8), white, x, base + 5.8, z);
    for (const dx of [-1.4, 1.4]) { rod(V(x, base + 4.65, z), V(x + dx, base + 5.15, z), .12, railing); add(new THREE.SphereGeometry(.52, 10, 8), white, x + dx, base + 5.3, z); }
    add(new THREE.CylinderGeometry(.8, .9, 1.0, 8), railing, x, base + .8, center - 46);
  }

  for (const [mat, geometries] of batches) {
    const merged = mergeGeometries(geometries)!; geometries.forEach(geo => geo.dispose()); merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat); mesh.name = mat.name || 'Ferry Building lettering and clock'; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }

  const waterUniforms = { time: { value: 0 }, lowQuality: { value: 0 }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms, fog: true,
    vertexShader: `varying vec3 vWorld; varying vec3 vView;
      #include <fog_pars_vertex>
      void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=vec3(position.x,-2.,3135.-position.y);vec4 mvPosition=viewMatrix*world;vView=-mvPosition.xyz;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time;uniform float lowQuality;varying vec3 vWorld;varying vec3 vView;
      #include <fog_pars_fragment>
      void main(){
        vec2 p=vWorld.xz;float offshore=smoothstep(1440.,2800.,p.y);
        vec3 shallow=vec3(.025,.57,.64),deep=vec3(.025,.28,.46);
        vec3 col=mix(shallow,deep,offshore*.78);
        float a=sin(p.x*.22+p.y*.11-time*.83),b=sin(p.y*.36-p.x*.055+time*.66),c=sin(p.x*.071+p.y*.24-time*.42);
        float wave=a*.42+b*.32+c*.26;
        float distant=1.-smoothstep(500.,2200.,length(vView));
        col+=wave*.025;
        float sheen=pow(max(0.,a*.45+b*.35+c*.2),11.)*(.26+.18*sin(p.y*.021));
        col+=vec3(.40,.63,.61)*sheen*(.5+.5*distant);
        float stripe=pow(max(0.,sin(p.y*.78+p.x*.026+sin(p.x*.15+time*.3)*.8-time)),22.);
        float glintMask=smoothstep(.70,.99,sin(p.x*.074+sin(p.y*.043))*sin(p.y*.022));
        col+=vec3(.64,.75,.64)*stripe*glintMask*distant*.52;
        // Soft broken reflections underneath the pale clock tower and its pier.
        float reflection=exp(-pow((p.x+sin(p.y*.28+time)*4.)/11.,2.))*smoothstep(1510.,1560.,p.y)*(1.-smoothstep(1630.,1840.,p.y));
        col=mix(col,vec3(.58,.71,.54),reflection*(.10+.12*stripe));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4300, 3400), waterMaterial); water.name = 'Animated turquoise San Francisco Bay'; water.rotation.x = -Math.PI / 2; water.position.set(0, -2, 3135); group.add(water);

  // Two ferries and white sails animate gently beyond the pier, leaving its
  // symmetrical silhouette unobstructed from Market Street.
  const boats: { group: THREE.Group; x: number; z: number; phase: number }[] = [];
  function vessel(x: number, z: number, yaw: number, scale = 1) {
    const boat = new THREE.Group(); boat.name = 'Blue and Gold bay ferry'; boat.position.set(x, -.6, z); boat.rotation.y = yaw; boat.scale.setScalar(scale); group.add(boat);
    const b = (w: number, h: number, d: number, mat: THREE.Material, xx: number, yy: number, zz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(xx, yy, zz); boat.add(m); };
    b(10, 2.5, 25, navy, 0, .3, 0); b(10.5, .65, 26, white, 0, 1.8, 0); b(8, 3.2, 19, white, 0, 3.65, -1); b(8.2, 1.9, 16, glass, 0, 4.05, -1.2); b(9.5, .45, 20.5, white, 0, 5.48, -1);
    b(6.1, 2.7, 7.4, white, 0, 6.98, -5.6); b(6.25, 1.1, 7.5, glass, 0, 7.35, -5.6); b(6.8, .42, 8.1, white, 0, 8.58, -5.6);
    for (const xx of [-3, 3]) { b(1.1, 3.6, 1.5, orange, xx, 7.1, 4.1); b(1.3, .7, 1.7, navy, xx, 8.55, 4.1); }
    b(.17, 4, .17, white, 0, 10.5, -5.6);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 3), navy); prow.rotation.set(Math.PI / 2, 0, Math.PI); prow.position.set(0, .3, -14.7); prow.scale.z = .5; boat.add(prow);
    boats.push({ group: boat, x, z, phase: boats.length * 2.5 });
  }
  vessel(-171, 1714, -.45, 1.15); vessel(241, 1830, 1.2, 1.3);
  for (const [x, z, size] of [[-298, 1840, 1], [155, 2010, 1.4], [-490, 2160, 1.1]]) {
    const boat = new THREE.Group(); boat.name = 'Bay sailboat'; boat.position.set(x, -.55, z); boat.rotation.y = .6; boat.scale.setScalar(size); group.add(boat);
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), white); hull.scale.set(2.4, 1.25, 7); boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.10, .14, 19, 6), railing); mast.position.set(0, 10, -.5); boat.add(mast);
    const sail = new THREE.Shape(); sail.moveTo(0, 2); sail.lineTo(0, 18.8); sail.lineTo(7.2, 3.1); sail.closePath();
    const sailMat = new THREE.MeshStandardMaterial({ color: '#fff4d5', roughness: .95, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sail), sailMat); mesh.rotation.y = .55; boat.add(mesh);
    const jib = new THREE.Shape(); jib.moveTo(-.4, 4); jib.lineTo(-.4, 17); jib.lineTo(-5.3, 4); jib.closePath();
    const fore = new THREE.Mesh(new THREE.ShapeGeometry(jib), sailMat); fore.rotation.y = .55; boat.add(fore);
    boats.push({ group: boat, x, z, phase: boats.length * 2.1 });
  }
  const wakeMat = new THREE.MeshBasicMaterial({ color: '#bdebe3', transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide });
  for (const boat of boats) {
    const path = new THREE.CatmullRomCurve3([V(-5, 0, 8), V(-9, 0, 20), V(-16, 0, 36), V(-25, 0, 48)]);
    for (const side of [-1, 1]) { const wake = new THREE.Mesh(new THREE.TubeGeometry(path, 24, .38, 3, false), wakeMat); wake.position.y = -1.05; wake.scale.x = side; boat.group.add(wake); }
  }
  // Each moving vessel keeps its own transform, but its rigid pieces share a
  // material draw. This keeps the animated harbor modest on mobile GPUs.
  for (const boat of boats) {
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...boat.group.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      child.updateMatrix(); const geometry = child.geometry.clone().applyMatrix4(child.matrix);
      const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
      if (normalized !== geometry) geometry.dispose();
      if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
      byMaterial.get(child.material)!.push(normalized); boat.group.remove(child); child.geometry.dispose();
    }
    for (const [mat, geometries] of byMaterial) {
      const geometry = mergeGeometries(geometries)!; geometries.forEach(source => source.dispose());
      const mesh = new THREE.Mesh(geometry, mat); mesh.name = 'Batched ferry or sailboat'; boat.group.add(mesh);
    }
  }
  return {
    update(time: number, _progress: number) {
      waterUniforms.time.value = time;
      for (const boat of boats) { boat.group.position.y = -.6 + Math.sin(time * .55 + boat.phase) * .17; boat.group.rotation.z = Math.sin(time * .43 + boat.phase) * .016; boat.group.position.x = boat.x + Math.sin(time * .022 + boat.phase) * 15; }
    },
    setQuality(low: boolean) { waterUniforms.lowQuality.value = low ? 1 : 0; },
  };
}

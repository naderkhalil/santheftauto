import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATERFRONT } from './waterfront-layout';

/** Moving water and vessels remain realtime; the quay and buildings are Blender assets. */
export function createHarborWater(scene: THREE.Object3D) {
  const group=new THREE.Group();group.name='Waterfront / moving bay water and ferries';scene.add(group);
  const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
  const material=(name:string,color:string,roughness=.7,metalness=.05)=>{
    const m=new THREE.MeshStandardMaterial({color,roughness,metalness});m.name=`Waterfront / ${name}`;return m;
  };
  const white=material('ferry white','#eee8d5',.49),navy=material('ferry hull','#176082',.43,.2);
  const glass=material('ferry glazing','#315867',.23,.38),orange=material('safety orange','#df7943');
  const railing=material('marine iron','#3c545b',.55,.45);
  const waterUniforms={time:{value:0},lowQuality:{value:0},...THREE.UniformsUtils.clone(THREE.UniformsLib.fog)};
  const waterMaterial=new THREE.ShaderMaterial({
    uniforms:waterUniforms,fog:true,
    vertexShader:`varying vec3 vWorld; varying vec3 vView;
      #include <fog_pars_vertex>
      void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;
        vec4 mvPosition=viewMatrix*world;vView=-mvPosition.xyz;gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`uniform float time;uniform float lowQuality;varying vec3 vWorld;varying vec3 vView;
      #include <fog_pars_fragment>
      void main(){
        vec2 p=vec2(vWorld.x,-vWorld.z);float offshore=smoothstep(690.,2900.,p.x);
        vec3 col=mix(vec3(.025,.49,.56),vec3(.026,.27,.43),offshore*.8);
        float a=sin(p.x*.22+p.y*.11-time*.83),b=sin(p.y*.36-p.x*.055+time*.66),c=sin(p.x*.071+p.y*.24-time*.42);
        float distant=1.-smoothstep(500.,2400.,length(vView));
        col+=(a*.42+b*.32+c*.26)*.023;
        float sheen=pow(max(0.,a*.45+b*.35+c*.2),11.);
        col+=vec3(.40,.63,.61)*sheen*(.20+.18*distant);
        float ripple=pow(max(0.,sin(p.y*.78+p.x*.026+sin(p.x*.15+time*.3)*.8-time)),22.);
        float glints=smoothstep(.70,.99,sin(p.x*.074+sin(p.y*.043))*sin(p.y*.022));
        col+=vec3(.64,.75,.64)*ripple*glints*distant*.45;
        // Subtle broken light beneath the ferry wharf; no opaque reflection card.
        float reflection=exp(-pow((p.y-250.+sin(p.x*.28+time)*3.)/14.,2.))*smoothstep(760.,795.,p.x)*(1.-smoothstep(820.,980.,p.x));
        col=mix(col,vec3(.49,.61,.53),reflection*(.11+.13*ripple));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water=new THREE.Mesh(new THREE.PlaneGeometry(3800,5100),waterMaterial);
  water.name='San Francisco Bay / ripples and reflected afternoon light';water.rotation.x=-Math.PI/2;
  water.position.set(WATERFRONT.promenadeWest+1900,WATERFRONT.seaLevel,-450);group.add(water);
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
  vessel(940, -420, Math.PI / 2, 1.15); vessel(1290, 50, -.4, 1.3);
  for (const [x, z, size] of [[1180, -650, 1], [1630, -950, 1.4], [1950, 350, 1.1]]) {
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
    group,
    update(time:number){
      waterUniforms.time.value=time;
      for(const boat of boats){boat.group.position.y=-.6+Math.sin(time*.55+boat.phase)*.17;boat.group.rotation.z=Math.sin(time*.43+boat.phase)*.016;boat.group.position.x=boat.x+Math.sin(time*.022+boat.phase)*15;}
    },
    setQuality(low:boolean){waterUniforms.lowQuality.value=low?1:0;},
  };
}

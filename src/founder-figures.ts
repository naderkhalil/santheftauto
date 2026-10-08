import * as THREE from 'three';

/** Original, deliberately toy-like parody figures. +Z faces the viewer. */
export function createFounder(id: string): THREE.Group {
  const figure=new THREE.Group();figure.name=`Parody driver / ${id}`;
  const skin=new THREE.MeshStandardMaterial({color:id==='jensen'?'#dbaa7c':id==='elon'?'#ecc1aa':'#e8b59d',roughness:.78});
  const hair=new THREE.MeshStandardMaterial({color:id==='jensen'?'#c5c9cf':id==='sam'?'#624334':'#292323',roughness:.87});
  const outfit=new THREE.MeshStandardMaterial({color:id==='sam'?'#ede5d1':id==='dario'?'#34364c':'#171b25',roughness:id==='jensen'?.27:.7,metalness:id==='jensen'?.22:0});
  const pants=new THREE.MeshStandardMaterial({color:id==='dario'?'#46546b':'#202632',roughness:.8});
  const dark=new THREE.MeshStandardMaterial({color:'#161d28',roughness:.65});
  const white=new THREE.MeshStandardMaterial({color:'#f2eee4',roughness:.66});
  const chrome=new THREE.MeshStandardMaterial({color:'#a6bac5',metalness:.6,roughness:.3});
  const green=new THREE.MeshStandardMaterial({color:'#c0f942',emissive:'#78ad16',emissiveIntensity:.25});
  function shape(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,scale?:[number,number,number]){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);if(scale)mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;figure.add(mesh);return mesh;}
  const sphere=(material:THREE.Material,x:number,y:number,z:number,sx:number,sy=sx,sz=sx)=>shape(new THREE.SphereGeometry(1,20,16),material,x,y,z,[sx,sy,sz]);
  const box=(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>shape(new THREE.BoxGeometry(w,h,d),material,x,y,z);
  function limb(material:THREE.Material,a:THREE.Vector3,b:THREE.Vector3,r:number){const mesh=shape(new THREE.CapsuleGeometry(r,Math.max(.01,a.distanceTo(b)-r*2),5,12),material,0,0,0);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return mesh;}
  const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
  const stance=id==='elon'?.24:.19;
  for(const side of [-1,1]){
    limb(pants,v(side*.19,.95,0),v(side*stance,.2,side===-1?.04:-.02),.145);
    sphere(id==='elon'?white:dark,side*stance,.14,.10,.20,.115,.31);
    box(white,side*stance,.075,.105,.35,.065,.50);
  }
  sphere(outfit,0,1.35,0,.49,.61,.29);
  // Slightly oversized face and expressive brows make silhouettes readable.
  const headY=2.19;sphere(skin,0,headY,0,.36,.44,.30);
  sphere(skin,0,1.87,.04,.15,.23,.15);
  for(const side of [-1,1])sphere(skin,side*.35,2.2,0,.075,.13,.08);
  sphere(skin,0,2.16,.30,.077,.105,.10);
  for(const side of [-1,1]){
    sphere(white,side*.125,2.28,.265,.078,.05,.027);
    sphere(dark,side*.12,2.278,.29,.025,.03,.014);
    const brow=box(hair,side*.126,2.365+(id==='elon'&&side===1?.035:0),.288,.15,.035,.035);brow.rotation.z=side*(id==='dario'?.09:-.10);
  }
  const smile=shape(new THREE.TorusGeometry(.105,.012,6,20,Math.PI*.72),id==='dario'?hair:dark,0,2.075,.294);smile.rotation.z=Math.PI*1.14;
  if(id==='dario'){
    // Dense curly hair, short beard, charcoal knit and orange eval clipboard.
    for(let i=0;i<22;i++){const angle=i*2.3999;const r=.25*Math.sqrt((i+.5)/22);sphere(hair,Math.cos(angle)*r,2.53+Math.cos(i)*.035,Math.sin(angle)*r,.12,.10,.12);}
    for(const side of [-1,1]){sphere(hair,side*.30,2.37,-.02,.10,.22,.18);sphere(hair,side*.18,2.025,.18,.14,.08,.12);}
    sphere(hair,0,1.975,.19,.19,.08,.12);
    limb(outfit,v(-.39,1.65,0),v(-.50,1.12,.15),.14);limb(outfit,v(.4,1.63,0),v(.39,1.22,.31),.14);
    const orange=new THREE.MeshStandardMaterial({color:'#fca571',roughness:.8});const clipboard=box(orange,-.15,1.35,.39,.48,.62,.055);clipboard.rotation.z=-.12;
    box(chrome,-.13,1.65,.44,.17,.06,.055);for(let i=0;i<3;i++)box(white,-.13,1.48-i*.11,.429,.29,.027,.014);
    sphere(skin,-.38,1.25,.44,.10);sphere(skin,.23,1.32,.40,.10);
  }else if(id==='sam'){
    sphere(hair,0,2.54,-.035,.35,.16,.28);for(let i=0;i<6;i++){const wave=sphere(hair,-.25+i*.095,2.55,.12,.12,.11,.19);wave.rotation.z=-.3;}
    const shirt=new THREE.MeshStandardMaterial({color:'#3c5566'});box(shirt,0,1.78,.22,.19,.15,.035);
    limb(outfit,v(-.39,1.6,0),v(-.39,1.04,.03),.14);sphere(skin,-.32,1.02,.23,.105);
    limb(outfit,v(.4,1.62,0),v(.59,1.43,.12),.14);limb(outfit,v(.59,1.43,.12),v(.67,1.7,.28),.115);sphere(skin,.67,1.78,.28,.12,.14,.10);
  }else if(id==='elon'){
    sphere(hair,0,2.55,-.05,.35,.16,.29);const sweep=sphere(hair,.075,2.6,.10,.30,.15,.20);sweep.rotation.z=.15;
    box(chrome,0,1.36,.294,.026,.67,.025);for(const side of [-1,1])box(dark,side*.24,1.30,.278,.22,.025,.03);
    limb(outfit,v(-.40,1.63,0),v(-.57,1.03,.10),.17);sphere(skin,-.57,.95,.13,.105);
    limb(outfit,v(.4,1.63,0),v(.57,1.15,.17),.17);sphere(skin,.57,1.10,.24,.11);
    shape(new THREE.CylinderGeometry(.10,.10,.54,16),chrome,.66,1.16,.33);shape(new THREE.ConeGeometry(.10,.22,16),chrome,.66,1.54,.33);
    for(const side of [-1,1])box(dark,.66+side*.10,.94,.33,.07,.20,.10);
  }else{
    sphere(hair,0,2.56,-.08,.34,.12,.26);sphere(hair,-.30,2.39,-.06,.06,.20,.20);sphere(hair,.30,2.39,-.06,.06,.20,.20);
    for(const side of [-1,1]){const rim=shape(new THREE.TorusGeometry(.10,.014,6,20),dark,side*.13,2.28,.306);rim.scale.y=.68;}
    box(dark,0,2.28,.32,.06,.017,.018);
    for(const side of [-1,1]){const lapel=box(outfit,side*.17,1.61,.26,.18,.41,.045);lapel.rotation.z=side*.32;}
    box(chrome,0,1.26,.29,.023,.59,.025);
    limb(outfit,v(-.4,1.6,0),v(-.48,1.08,.17),.15);limb(outfit,v(.4,1.6,0),v(.44,1.16,.26),.15);
    const gpu=box(dark,0,1.21,.43,.69,.31,.11);gpu.rotation.z=.09;
    for(const side of [-1,1]){shape(new THREE.CylinderGeometry(.11,.11,.025,20),green,side*.18,1.23,.50).rotation.x=Math.PI/2;}
    sphere(skin,-.39,1.15,.44,.10);sphere(skin,.36,1.24,.44,.10);
  }
  return figure;
}

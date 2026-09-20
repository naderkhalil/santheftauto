import * as THREE from 'three';

/** CC0 scanned surfaces; see public/assets/CREDITS.md. */
export async function upgradeRoadSurface(scene:THREE.Scene,renderer:THREE.WebGLRenderer){
  const loader=new THREE.TextureLoader();
  const [color,normal,roughness]=await Promise.all(['asphalt-color.jpg','asphalt-normal.jpg','asphalt-roughness.jpg'].map(path=>loader.loadAsync(`/assets/${path}`)));
  color.colorSpace=THREE.SRGBColorSpace;
  for(const texture of [color,normal,roughness]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);texture.anisotropy=Math.min(12,renderer.capabilities.getMaxAnisotropy());}
  const road=scene.getObjectByName('powell-asphalt') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|undefined;
  if(!road)return;
  const material=road.material;material.map?.dispose();material.map=color;material.normalMap=normal;material.normalScale.set(.25,.25);material.roughnessMap=roughness;
  material.color.set('#b2bbcb');material.roughness=.87;material.metalness=.02;material.envMapIntensity=.24;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('void main() {',`
      float sfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float sfNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sfHash(i),sfHash(i+vec2(1,0)),f.x),mix(sfHash(i+vec2(0,1)),sfHash(i+1.),f.x),f.y);}
      void main() {`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      float dampness=sfNoise(vMapUv*vec2(.19,.11))*.65+sfNoise(vMapUv*vec2(.73,.44))*.35;
      roughnessFactor=mix(.66,.94,smoothstep(.26,.67,dampness))*mix(.92,1.,roughnessFactor);
    `);
  };
  material.needsUpdate=true;
}

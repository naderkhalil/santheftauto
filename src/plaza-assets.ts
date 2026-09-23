import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAZA_LEVELS, PLAZA_PALMS, PLAZA_TREES } from './plaza-layout';

/** Original Blender-authored assets; geometry is in metres and exported Y-up.
 * The fallback remains visible until its replacement has loaded successfully.
 */
export function createPlazaAssets(parent: THREE.Group, monumentFallback: THREE.Group, palmFallback: THREE.Group) {
  const art = new THREE.Group(); art.name = 'Union Square / Blender plaza assets'; parent.add(art);
  let low = false;
  const loader = new GLTFLoader();
  const configure = (mesh: THREE.Mesh) => {
    mesh.castShadow = !low; mesh.receiveShadow = true;
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = .62;
        if (material.name.includes('fronds')) {
          material.side = THREE.DoubleSide;
          material.roughness = .68;
          // Subtle transmission on the back-lit side of solid, individually modeled pinnae.
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
              #include <dithering_fragment>
              gl_FragColor.rgb += diffuseColor.rgb * .055 * (1.0 - abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0))));
            `);
          };
          material.customProgramCacheKey = () => 'sf-date-palm-pinnae-v1';
        }
      }
    }
  };
  const monument = loader.loadAsync('/assets/plaza/dewey-monument.glb').then(gltf => {
    const model = gltf.scene; model.name = 'Dewey Monument / carved stone and bronze Victory';
    model.position.set(0, PLAZA_LEVELS.center, 0);
    // The sculpture faces east toward Stockton; its raised trident reads on Powell.
    model.rotation.y = Math.PI / 2;
    model.traverse(object => { if (object instanceof THREE.Mesh) configure(object); });
    art.add(model); monumentFallback.visible = false;
  }).catch(error => { console.warn('Dewey sculpture unavailable; retaining procedural monument.', error); });
  const palms = loader.loadAsync('/assets/plaza/date-palm.glb').then(gltf => {
    const model = gltf.scene; model.updateMatrixWorld(true);
    const placements = PLAZA_PALMS;
    const transform = new THREE.Object3D();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone(); geometry.applyMatrix4(object.matrixWorld);
      const mesh = new THREE.InstancedMesh(geometry, object.material, placements.length);
      mesh.name = object.name; configure(mesh);
      for (const [index, p] of placements.entries()) {
        transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, p.angle, 0); transform.scale.setScalar(p.scale); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      }
      mesh.computeBoundingSphere(); art.add(mesh);
    });
    palmFallback.visible = false;
  }).catch(error => { console.warn('Date palms unavailable; retaining procedural palms.', error); });
  // Four broad-leaved trees on the Post Street garden complete its real
  // silhouette. The licensed scanned asset is shared across all instances.
  const trees = loader.loadAsync('/assets/vegetation/jacaranda.glb').then(gltf => {
    const model=gltf.scene; model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model), height=bounds.max.y-bounds.min.y;
    const transform=new THREE.Object3D();
    model.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const geometry=object.geometry.clone(); geometry.applyMatrix4(object.matrixWorld);
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const mat of materials){
        if(!(mat instanceof THREE.MeshStandardMaterial))continue;
        mat.roughness=Math.max(.78,mat.roughness); mat.metalness=0; mat.envMapIntensity=.35;
        if(mat.name.includes('leaves')){
          mat.transparent=false; mat.alphaTest=.42; mat.alphaToCoverage=true;
          mat.side=mat.shadowSide=THREE.DoubleSide; mat.color.set('#b6cfa3');
          mat.emissiveMap=mat.map; mat.emissive.set('#5d7950'); mat.emissiveIntensity=.18;
          mat.normalScale.set(.45,.45);
        }
        for(const map of [mat.map,mat.normalMap,mat.roughnessMap])if(map)map.anisotropy=4;
      }
      const mesh=new THREE.InstancedMesh(geometry,object.material,PLAZA_TREES.length);
      mesh.name='Union Square / Post Street broad-leaved canopy';
      mesh.castShadow=!low; mesh.receiveShadow=true;
      for(const [i,p] of PLAZA_TREES.entries()){
        const scale=p.height/height;
        transform.position.set(p.x,p.y-bounds.min.y*scale,p.z);
        transform.rotation.set(0,p.angle,0); transform.scale.setScalar(scale); transform.updateMatrix();
        mesh.setMatrixAt(i,transform.matrix);
      }
      mesh.computeBoundingSphere();art.add(mesh);
    });
  }).catch(error=>console.warn('Plaza canopy unavailable; retaining the planted terrace.',error));
  const ready = Promise.all([monument, palms, trees]).then(() => {
    let triangles = 0, drawCalls = 0;
    art.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      drawCalls++; triangles += ((object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3) * (object instanceof THREE.InstancedMesh ? object.count : 1);
    });
    art.userData.triangles = triangles; art.userData.drawCalls = drawCalls; art.userData.loaded = !monumentFallback.visible && !palmFallback.visible;
  });
  return { ready, group: art, setQuality(value: boolean) { low = value; art.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = !low; }); } };
}

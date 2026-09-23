import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
    model.position.set(0, 23.30, 0);
    // The sculpture faces east toward Stockton; its raised trident reads on Powell.
    model.rotation.y = Math.PI / 2;
    model.traverse(object => { if (object instanceof THREE.Mesh) configure(object); });
    art.add(model); monumentFallback.visible = false;
  }).catch(error => { console.warn('Dewey sculpture unavailable; retaining procedural monument.', error); });
  const palms = loader.loadAsync('/assets/plaza/date-palm.glb').then(gltf => {
    const model = gltf.scene; model.updateMatrixWorld(true);
    const placements: { x: number; z: number; scale: number; angle: number }[] = [];
    for (const x of [-50.6, 50.6]) for (const z of [-28, -13, 13, 28]) placements.push({x, z, scale: Math.abs(z) === 28 ? 1.03 : .91, angle: x*.04+z*.03});
    for (const x of [-29, 29]) for (const z of [-42.4, 42.4]) placements.push({x, z, scale: .96, angle: x*.05+z*.11});
    const transform = new THREE.Object3D();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone(); geometry.applyMatrix4(object.matrixWorld);
      const mesh = new THREE.InstancedMesh(geometry, object.material, placements.length);
      mesh.name = object.name; configure(mesh);
      for (const [index, p] of placements.entries()) {
        transform.position.set(p.x, 23.53, p.z); transform.rotation.set(0, p.angle, 0); transform.scale.setScalar(p.scale); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      }
      mesh.computeBoundingSphere(); art.add(mesh);
    });
    palmFallback.visible = false;
  }).catch(error => { console.warn('Date palms unavailable; retaining procedural palms.', error); });
  const ready = Promise.all([monument, palms]).then(() => {
    let triangles = 0, drawCalls = 0;
    art.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      drawCalls++; triangles += ((object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3) * (object instanceof THREE.InstancedMesh ? object.count : 1);
    });
    art.userData.triangles = triangles; art.userData.drawCalls = drawCalls; art.userData.loaded = !monumentFallback.visible && !palmFallback.visible;
  });
  return { ready, group: art, setQuality(value: boolean) { low = value; art.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = !low; }); } };
}

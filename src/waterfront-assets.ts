import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATERFRONT } from './waterfront-layout';

type Section = { near?: THREE.Group; far?: THREE.Group; bounds: THREE.Box3 };

/** Actual Blender exports, in physical axes. Keep each pier/tower/wing in
 * its own spatial section, so offscreen masonry can leave the render pass. */
export function createWaterfrontAssets(parent: THREE.Object3D) {
  const group = new THREE.Group(); group.name = 'Waterfront / Blender architecture and historic piers'; parent.add(group);
  const loader = new GLTFLoader(), decoder = new DRACOLoader().setDecoderPath('/assets/draco/'); loader.setDRACOLoader(decoder);
  const shared = new Map<string, THREE.MeshStandardMaterial>(), sections = new Map<string, Section>();
  const shadows: THREE.Mesh[] = [];
  const palmGroups: { group: THREE.Group; bounds: THREE.Box3 }[] = [];
  let low = false;
  const eye = new THREE.Vector3();

  function prepare(source: THREE.Group, asset: string, distant: boolean, position: THREE.Vector3) {
    source.position.add(position); source.updateMatrixWorld(true);
    const batches = new Map<string, { section: string; material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const [index, original] of materials.entries()) {
        let material = original;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.name = `Waterfront / ${material.name.replace(/^Waterfront\s*\/\s*/, '')}`;
          const existing = shared.get(material.name);
          if (existing && existing !== material) {
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) if (material[key] && material[key] !== existing[key]) material[key]!.dispose();
            material.dispose(); material = existing;
          } else shared.set(material.name, material);
          const glass = /glass|glazing/i.test(material.name);
          material.envMapIntensity = glass ? .82 : .48;
          if (material.transparent) { material.depthWrite = false; material.forceSinglePass = true; }
          for (const map of [material.map, material.normalMap, material.roughnessMap]) if (map) map.anisotropy = 8;
        }
        const sourceGeometry = object.geometry as THREE.BufferGeometry;
        let geometry: THREE.BufferGeometry = sourceGeometry.clone();
        if (materials.length > 1) {
          // Preserve multi-material mesh faces without drawing the complete
          // source geometry once for every material slot.
          const expanded = geometry.index ? geometry.toNonIndexed() : geometry;
          if (expanded !== geometry) geometry.dispose();
          const ranges = sourceGeometry.groups.filter(g => g.materialIndex === index);
          const ids = ranges.flatMap(g => Array.from({ length: g.count }, (_, i) => g.start + i));
          if (!ids.length) { expanded.dispose(); continue; }
          geometry = new THREE.BufferGeometry();
          for (const [name, attr] of Object.entries(expanded.attributes)) {
            const values = new Float32Array(ids.length * attr.itemSize);
            ids.forEach((id, i) => { for (let c = 0; c < attr.itemSize; c++) values[i * attr.itemSize + c] = attr.getComponent(id, c); });
            geometry.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
          }
          expanded.dispose();
        }
        geometry.applyMatrix4(object.matrixWorld);
        // Matching close/distant sections are established by the generator.
        const sectionName = String(object.userData.asset_section || object.name.split(' / ')[0]).replace(/\s*\/\s*distant$/i, '');
        const section = `${asset}/${sectionName}`;
        const key = `${section}/${material.name}`;
        const batch = batches.get(key) ?? { section, material, geometries: [] as THREE.BufferGeometry[] };
        // glTF can supply indexed or nonindexed primitives; normalize once.
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        if (flat !== geometry) geometry.dispose();
        batches.set(key, batch); batch.geometries.push(flat);
      }
      object.geometry.dispose();
    });
    for (const [name, batch] of batches) {
      const geometry = mergeGeometries(batch.geometries, false); batch.geometries.forEach(g => g.dispose());
      if (!geometry) throw new Error(`Waterfront batch could not be assembled: ${name}`);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const section = sections.get(batch.section) ?? { bounds: new THREE.Box3() };
      if (!sections.has(batch.section)) sections.set(batch.section, section);
      const level = distant ? 'far' : 'near';
      if (!section[level]) { const child = new THREE.Group(); child.name = `${batch.section}/${level}`; child.visible = !distant; section[level] = child; group.add(child); }
      const mesh = new THREE.Mesh(geometry, batch.material); mesh.name = name; mesh.receiveShadow = true;
      const castsShadow = !name.startsWith('bay-bridge') && !batch.material.transparent && !/paving|pavement|pavers|bikeway|asphalt|deck surface/i.test(batch.material.name);
      mesh.userData.sfShadowEligible = castsShadow; mesh.castShadow = !low && castsShadow;
      if (castsShadow) shadows.push(mesh);
      section[level]!.add(mesh); section.bounds.union(geometry.boundingBox!);
    }
    group.userData.sections = sections.size;
  }

  async function loadAsset(name: string, hasDistant = true, position = new THREE.Vector3()) {
    const close = await loader.loadAsync(`/assets/waterfront/${name}.glb`);
    prepare(close.scene, name, false, position);
    if (hasDistant) {
      try { const distant = await loader.loadAsync(`/assets/waterfront/${name}-lod.glb`); prepare(distant.scene, name, true, position); }
      catch (error) { console.warn(`Waterfront distant model unavailable for ${name}; retaining the complete asset.`, error); }
    }
  }

  async function loadPalms() {
    const [source, response] = await Promise.all([loader.loadAsync('/assets/plaza/date-palm.glb'), fetch('/assets/waterfront/embarcadero.json')]);
    if (!response.ok) throw new Error('Waterfront planting layout unavailable');
    type PalmAnchor = { x: number; north: number; height: number };
    const layout = await response.json() as { palmAnchors: PalmAnchor[]; southernPalmAnchors?: PalmAnchor[] };
    const palmAnchors = [...layout.palmAnchors, ...(layout.southernPalmAnchors ?? [])];
    source.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source.scene), sourceHeight = bounds.max.y - bounds.min.y;
    const cells = new Map<number, typeof palmAnchors>();
    for (const anchor of palmAnchors) { const key = Math.floor(anchor.north / 170), list = cells.get(key) ?? []; list.push(anchor); cells.set(key, list); }
    const transform = new THREE.Object3D();
    const parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[] = [];
    source.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.name = `Waterfront / ${material.name}`;
        if (material instanceof THREE.MeshStandardMaterial) { material.envMapIntensity = .45; if (/fronds/i.test(material.name)) { material.side = THREE.DoubleSide; material.roughness = .7; } }
      }
      parts.push({ geometry: object.geometry.clone().applyMatrix4(object.matrixWorld), material: object.material });
      object.geometry.dispose();
    });
    for (const [cell, anchors] of cells) {
      const planting = new THREE.Group(); planting.name = `Waterfront / PortWalk palms ${cell}`; group.add(planting);
      for (const { geometry, material } of parts) {
        const mesh = new THREE.InstancedMesh(geometry, material, anchors.length); mesh.receiveShadow = true; mesh.castShadow = !low;
        mesh.name = 'Waterfront / instanced Blender date palms'; shadows.push(mesh);
        anchors.forEach((anchor, i) => {
          const scale = (14.5 + THREE.MathUtils.euclideanModulo(cell * 3 + i, 4) * .8) / sourceHeight;
          transform.position.set(anchor.x, anchor.height - bounds.min.y * scale, -anchor.north);
          transform.rotation.set(0, (cell + i) * 2.399, 0); transform.scale.setScalar(scale); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
        });
        mesh.computeBoundingSphere(); mesh.computeBoundingBox(); planting.add(mesh);
      }
      palmGroups.push({ group: planting, bounds: new THREE.Box3().setFromObject(planting) });
    }
    group.userData.palms = palmAnchors.length;
  }
  const ready = Promise.all([
    loadAsset('ferry-building', true, new THREE.Vector3(WATERFRONT.ferry.x, WATERFRONT.ferry.y, -WATERFRONT.ferry.z)),
    loadAsset('embarcadero'), loadAsset('bay-bridge', false), loadPalms(),
  ]).then(() => { group.userData.loaded = true; }).finally(() => decoder.dispose());

  return {
    group, ready,
    update(camera?: THREE.Camera) {
      if (!camera) return; camera.getWorldPosition(eye);
      for (const [name, section] of sections) {
        const distance = section.bounds.distanceToPoint(eye), far = !!section.far && (low || distance > 310);
        const visible = name.startsWith('bay-bridge') || distance < (low ? 1250 : 2100);
        if (section.near) section.near.visible = visible && !far;
        if (section.far) section.far.visible = visible && far;
      }
      for (const planting of palmGroups) {
        const distance = planting.bounds.distanceToPoint(eye); planting.group.visible = distance < (low ? 800 : 1400);
        for (const mesh of planting.group.children) if (mesh instanceof THREE.Mesh) mesh.castShadow = !low && distance < 320;
      }
    },
    setQuality(value: boolean) { low = value; for (const mesh of shadows) mesh.castShadow = !low; },
  };
}

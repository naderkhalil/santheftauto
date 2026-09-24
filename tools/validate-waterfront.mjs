import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const directory = new URL('../public/assets/waterfront/', import.meta.url);
const reports = [];
for (const name of ['ferry-building', 'ferry-building-lod', 'embarcadero', 'embarcadero-lod', 'bay-bridge']) {
  const bytes = fs.readFileSync(new URL(`${name}.glb`, directory));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryOffset = 20 + jsonLength, binaryLength = bytes.readUInt32LE(binaryOffset);
  assert.equal(binaryOffset + 8 + binaryLength, bytes.length);
  for (const view of doc.bufferViews ?? []) assert.ok((view.byteOffset ?? 0) + view.byteLength <= binaryLength);
  for (const accessor of doc.accessors ?? []) {
    assert.ok(Number.isInteger(accessor.count) && accessor.count > 0);
    for (const values of [accessor.min, accessor.max]) if (values) assert.ok(values.every(Number.isFinite));
  }
  for (const image of doc.images ?? []) assert.ok(image.bufferView !== undefined && !image.uri, 'images must be embedded for reliable local loading');
  const bounds = new THREE.Box3(), sections = new Set(); let triangles = 0, meshes = 0;
  function walk(id, parent, seen = new Set()) {
    assert.ok(!seen.has(id), 'scene graph is acyclic'); const next = new Set(seen).add(id), node = doc.nodes[id];
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]), new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]));
    assert.ok(local.determinant() > 0, `${name}: no reflected source transforms`);
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      assert.ok(node.extras?.asset_section, `${name}: each mesh keeps a spatial section`); sections.add(node.extras.asset_section); meshes++;
      for (const primitive of doc.meshes[node.mesh].primitives) {
        const position = doc.accessors[primitive.attributes.POSITION];
        assert.ok(position.min && position.max && position.type === 'VEC3');
        bounds.union(new THREE.Box3(new THREE.Vector3().fromArray(position.min), new THREE.Vector3().fromArray(position.max)).applyMatrix4(world));
        triangles += doc.accessors[primitive.indices]?.count / 3 || position.count / 3;
        assert.ok(primitive.material < doc.materials.length);
      }
    }
    for (const child of node.children ?? []) walk(child, world, next);
  }
  for (const root of doc.scenes[doc.scene ?? 0].nodes) walk(root, new THREE.Matrix4());
  assert.ok(!bounds.isEmpty() && triangles > 10000);
  if (name.startsWith('ferry')) {
    assert.ok(bounds.min.x > -32 && bounds.max.x < 70, 'Ferry stays on its quay');
    assert.ok(bounds.min.z > -100 && bounds.max.z < 100, 'Ferry long axis is north/south');
    assert.ok(bounds.max.y > 73 && bounds.max.y < 78, 'clock tower keeps its real height');
    assert.ok(bounds.min.y > -.08, 'simplified facade must not develop vertices below its foundation');
  } else if (name.startsWith('embarcadero')) {
    assert.ok(bounds.min.x >= 603 && bounds.max.x < 960, 'quay clears the Embarcadero race');
    assert.ok(bounds.min.z >= -1131 && bounds.min.z < -1129 && bounds.max.z <= 771 && bounds.max.z >= 769, 'PortWalk spans the northern piers and southern shoreline continuation');
  } else {
    assert.ok(bounds.min.x > 660 && bounds.max.z > 600, 'bridge begins south of Ferry and extends east');
  }
  reports.push({ name, bytes: bytes.length, triangles, meshes, materials: doc.materials.length, sections: [...sections], bounds: [bounds.min.toArray(), bounds.max.toArray()] });
}
for (const name of ['ferry-building', 'embarcadero']) {
  const close = reports.find(r => r.name === name), far = reports.find(r => r.name === `${name}-lod`);
  assert.deepEqual([...close.sections].sort(), [...far.sections].sort(), 'both detail levels preserve each physical section');
  assert.ok(far.triangles < close.triangles * .7, 'distant version reduces geometry');
}
console.log(JSON.stringify(reports.map(r => ({ ...r, sections: r.sections.length })), null, 2));

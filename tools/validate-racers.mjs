/** Validate the racer runtime contract and compare exported cost/transforms.
 * node tools/validate-racers.mjs [kit.glb] [--baseline report.json] [--report report.json] [--garage-sha256 hash]
 * Counts use glTF accessor metadata, including Draco-compressed primitives;
 * this validates structure/bounds, not the contents of the compressed stream.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let source = path.join(root, 'public/assets/models/racer-kit.glb'), baselinePath, reportPath, garageSha256;
let positional = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--baseline' || arg === '--report' || arg === '--garage-sha256') {
    assert.ok(args[index + 1] && !args[index + 1].startsWith('--'), `${arg} requires a path`);
    if (arg === '--baseline') baselinePath = path.resolve(args[++index]);
    else if (arg === '--report') reportPath = path.resolve(args[++index]);
    else { garageSha256 = args[++index]; assert.match(garageSha256, /^[a-f0-9]{64}$/, 'Garage SHA-256 is a lowercase hex digest'); }
  } else {
    assert.ok(!arg.startsWith('-') && !positional, `Unexpected argument: ${arg}`);
    source = path.resolve(arg); positional = true;
  }
}
const bytes = fs.readFileSync(source);
assert.ok(bytes.length >= 28, 'GLB contains its header and chunks');
assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
assert.equal(bytes.readUInt32LE(4), 2, 'glTF 2');
assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB declared length');
assert.ok(bytes.length <= 25 * 1024 * 1024, 'Asset fits the deployed static-asset size limit');
let gltf, binaryLength = 0;
for (let cursor = 12; cursor < bytes.length;) {
  assert.ok(cursor + 8 <= bytes.length, 'Chunk header fits');
  const length = bytes.readUInt32LE(cursor), type = bytes.readUInt32LE(cursor + 4);
  assert.ok(length % 4 === 0 && cursor + 8 + length <= bytes.length, 'Chunk is aligned and bounded');
  if (type === 0x4e4f534a) { assert.equal(gltf, undefined, 'One JSON chunk'); gltf = JSON.parse(bytes.subarray(cursor + 8, cursor + 8 + length).toString()); }
  else if (type === 0x004e4942) binaryLength += length;
  cursor += 8 + length;
}
assert.ok(gltf?.nodes?.length && gltf?.meshes?.length, 'Nodes and meshes exist');
const indexIn = (index, list, label) => assert.ok(Number.isInteger(index) && index >= 0 && index < list.length, `${label} references a valid index`);
for (const buffer of gltf.buffers ?? []) {
  assert.ok(!buffer.uri && buffer.byteLength <= binaryLength, 'Buffers are embedded and bounded');
}
for (const view of gltf.bufferViews ?? []) {
  indexIn(view.buffer, gltf.buffers, 'Buffer view');
  assert.ok(Number.isInteger(view.byteLength) && view.byteLength > 0 && (view.byteOffset ?? 0) >= 0 && (view.byteOffset ?? 0) + view.byteLength <= gltf.buffers[view.buffer].byteLength, 'Buffer view fits its buffer');
}
for (const accessor of gltf.accessors ?? []) {
  assert.ok(Number.isInteger(accessor.count) && accessor.count > 0, 'Accessor has elements');
  for (const limits of [accessor.min, accessor.max]) if (limits) assert.ok(limits.every(Number.isFinite), 'Accessor bounds are finite');
  if (accessor.bufferView !== undefined) indexIn(accessor.bufferView, gltf.bufferViews, 'Accessor');
}
for (const image of gltf.images ?? []) {
  assert.ok(image.bufferView !== undefined && !image.uri, 'Images are embedded, not dependent on local files');
  indexIn(image.bufferView, gltf.bufferViews, 'Image');
  assert.ok(['image/png', 'image/jpeg', 'image/webp', 'image/ktx2'].includes(image.mimeType), 'Image has a known MIME type');
}
for (const texture of gltf.textures ?? []) if (texture.source !== undefined) indexIn(texture.source, gltf.images ?? [], 'Texture');
for (const material of gltf.materials ?? []) {
  const pbr = material.pbrMetallicRoughness ?? {};
  for (const value of [pbr.metallicFactor ?? 1, pbr.roughnessFactor ?? 1, ...(pbr.baseColorFactor ?? [1, 1, 1, 1])]) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${material.name}: valid PBR factors`);
  for (const slot of [material.normalTexture, material.occlusionTexture, material.emissiveTexture, pbr.baseColorTexture, pbr.metallicRoughnessTexture]) if (slot) indexIn(slot.index, gltf.textures ?? [], 'Material texture');
}

const matrices = gltf.nodes.map(node => {
  const arrays = node.matrix ? [node.matrix] : [node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]];
  assert.ok(arrays.flat().every(Number.isFinite), `${node.name}: finite transform`);
  const matrix = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]), new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]));
  assert.ok(matrix.determinant() > 0, `${node.name}: positive, nonsingular transform`);
  return matrix;
});
const seen = new Set();
function walk(index, parent = new THREE.Matrix4(), ancestors = new Set(), unique = false) {
  indexIn(index, gltf.nodes, 'Scene node');
  assert.ok(!ancestors.has(index), 'Node graph is acyclic');
  if (unique) { assert.ok(!seen.has(index), 'Active scene nodes have one parent'); seen.add(index); }
  const node = gltf.nodes[index], world = parent.clone().multiply(matrices[index]);
  const bounds = new THREE.Box3(), next = new Set(ancestors).add(index);
  let triangles = 0, draws = 0, meshes = 0;
  if (node.mesh !== undefined) {
    indexIn(node.mesh, gltf.meshes, 'Mesh node'); meshes++;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      assert.equal(primitive.mode ?? 4, 4, 'Racer surfaces use triangles');
      indexIn(primitive.attributes?.POSITION, gltf.accessors, 'Position');
      const position = gltf.accessors[primitive.attributes.POSITION];
      assert.ok(position.type === 'VEC3' && position.min?.length === 3 && position.max?.length === 3, 'Position has 3D bounds');
      assert.ok(position.min.every((value, axis) => value <= position.max[axis]), 'Position bounds are ordered');
      bounds.union(new THREE.Box3(new THREE.Vector3().fromArray(position.min), new THREE.Vector3().fromArray(position.max)).applyMatrix4(world));
      const count = primitive.indices === undefined ? position.count : (indexIn(primitive.indices, gltf.accessors, 'Indices'), gltf.accessors[primitive.indices].count);
      assert.equal(count % 3, 0, 'Triangle index count'); triangles += count / 3; draws++;
      indexIn(primitive.material, gltf.materials, 'Primitive material');
      if (primitive.extensions?.KHR_draco_mesh_compression) indexIn(primitive.extensions.KHR_draco_mesh_compression.bufferView, gltf.bufferViews, 'Draco data');
    }
  }
  for (const child of node.children ?? []) {
    const nested = walk(child, world, next, unique);
    bounds.union(nested.bounds); triangles += nested.triangles; draws += nested.draws; meshes += nested.meshes;
  }
  return { bounds, triangles, draws, meshes };
}
const scene = gltf.scenes[gltf.scene ?? 0];
assert.ok(scene?.nodes?.length, 'Default scene exists');
const topLevel = scene.nodes.map(index => {
  const stats = walk(index, new THREE.Matrix4(), new Set(), true);
  assert.ok(!stats.bounds.isEmpty() && [...stats.bounds.min.toArray(), ...stats.bounds.max.toArray()].every(Number.isFinite), 'Root has finite nonempty bounds');
  return { name: gltf.nodes[index].name, ...stats, bounds: [stats.bounds.min.toArray(), stats.bounds.max.toArray()] };
});
const identities = ['dario', 'sam', 'elon', 'jensen'];
const required = ['Vehicle', 'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Steering', ...identities.flatMap(id => ['Standing_' + id, 'Seated_' + id])];
const contract = required.map(name => {
  const ids = gltf.nodes.flatMap((node, index) => node.name === name ? [index] : []);
  assert.equal(ids.length, 1, `${name} is one unambiguous runtime root`);
  const index = ids[0], node = gltf.nodes[index], stats = walk(index);
  assert.ok(seen.has(index) && node.children?.length && stats.meshes > 0, `${name} is visible in the active scene`);
  return { name, localMatrix: matrices[index].toArray(), triangles: stats.triangles, draws: stats.draws, meshes: stats.meshes, bounds: [stats.bounds.min.toArray(), stats.bounds.max.toArray()] };
});
// Runtime clones these objects without their ancestors and reparents the wheel
// pivots using local positions, so the hierarchy is part of the contract too.
const vehicleIndex = gltf.nodes.findIndex(node => node.name === 'Vehicle');
for (const name of ['Vehicle', ...identities.flatMap(id => ['Standing_' + id, 'Seated_' + id])]) {
  assert.ok(scene.nodes.includes(gltf.nodes.findIndex(node => node.name === name)), `${name}: independently cloneable scene root`);
}
for (const name of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Steering']) {
  assert.ok(gltf.nodes[vehicleIndex].children.includes(gltf.nodes.findIndex(node => node.name === name)), `${name}: direct child of Vehicle`);
}
for (const name of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) {
  const node = gltf.nodes.find(node => node.name === name), expected = [name.endsWith('L') ? -.9 : .9, .4, name.startsWith('Wheel_F') ? 1.22 : -1.27];
  expected.forEach((value, axis) => assert.ok(Math.abs((node.translation ?? [0, 0, 0])[axis] - value) < .001, `${name}: pivot axis ${axis}`));
}
const steering = gltf.nodes.find(node => node.name === 'Steering');
[-.35, .99, .04].forEach((value, axis) => assert.ok(Math.abs((steering.translation ?? [0, 0, 0])[axis] - value) < .001, 'Steering keeps its hub pivot'));
assert.equal(gltf.materials.find(material => material.name === 'Windscreen')?.alphaMode, 'BLEND', 'Windscreen remains transparent');
for (const material of gltf.materials) if (material.name !== 'Windscreen') {
  assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', `${material.name}: opaque surface preserves sorting and contact shading`);
}
assert.ok(gltf.materials.some(material => material.name === 'Coupe paint'), 'Runtime paint customization keeps its material name');
assert.ok(!gltf.nodes.some(node => ['Garage', 'Ivory roof', 'Cabin glass'].includes(node.name)), 'Kit excludes garage and obsolete opaque cockpit pieces');
const outerwearNames = ['dario / cotton jersey', 'sam / woven cotton poplin', 'elon / charcoal cotton twill', 'jensen / charcoal pebbled leather'];
const outerwear = outerwearNames.map((name, actor) => {
  const materialIndex = gltf.materials.findIndex(material => material.name === name);
  assert.ok(materialIndex >= 0, `${name}: exported outerwear material exists`);
  const material = gltf.materials[materialIndex], pbr = material.pbrMetallicRoughness;
  const images = {};
  for (const [channel, slot] of Object.entries({ normal: material.normalTexture, baseColor: pbr?.baseColorTexture, metallicRoughness: pbr?.metallicRoughnessTexture })) {
    assert.ok(slot, `${name}: ${channel} texture survives export`);
    assert.equal(slot.extensions?.KHR_texture_transform?.texCoord ?? slot.texCoord ?? 0, 0, `${name}: ${channel} uses TEXCOORD_0`);
    const texture = gltf.textures[slot.index];
    indexIn(texture.source, gltf.images ?? [], `${name}: ${channel} image`);
    images[channel] = texture.source;
  }
  let primitives = 0;
  const checkNode = index => {
    const node = gltf.nodes[index];
    let matches = 0;
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      if (primitive.material !== materialIndex) continue;
      indexIn(primitive.attributes.TEXCOORD_0, gltf.accessors, `${name}: textured primitive UVs`);
      const uv = gltf.accessors[primitive.attributes.TEXCOORD_0];
      assert.equal(uv.type, 'VEC2', `${name}: UVs have two coordinates`);
      assert.equal(uv.count, gltf.accessors[primitive.attributes.POSITION].count, `${name}: every vertex has UVs`);
      indexIn(primitive.attributes.NORMAL, gltf.accessors, `${name}: normal-mapped primitive normals`);
      const compressed = primitive.extensions?.KHR_draco_mesh_compression;
      if (compressed) assert.ok(Number.isInteger(compressed.attributes?.TEXCOORD_0), `${name}: Draco includes UVs`);
      matches++;
    }
    for (const child of node.children ?? []) matches += checkNode(child);
    return matches;
  };
  for (const pose of ['Standing_', 'Seated_']) {
    const count = checkNode(gltf.nodes.findIndex(node => node.name === pose + identities[actor]));
    assert.ok(count > 0, `${pose + identities[actor]} uses its textured outerwear`);
    primitives += count;
  }
  return { name, primitives, images };
});
const complexion = identities.flatMap(id => ['Standing_', 'Seated_'].map(pose => {
  const name = pose + id, materialName = new RegExp('^' + id + ' / skin with subtle complexion(?:\\.\\d+)?$');
  let primitives = 0;
  const checkNode = index => {
    const node = gltf.nodes[index];
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      if (!materialName.test(gltf.materials[primitive.material].name)) continue;
      indexIn(primitive.attributes.COLOR_0, gltf.accessors, `${name}: facial complexion colors`);
      const color = gltf.accessors[primitive.attributes.COLOR_0];
      assert.ok(['VEC3', 'VEC4'].includes(color.type), `${name}: complexion uses RGB or RGBA colors`);
      assert.equal(color.count, gltf.accessors[primitive.attributes.POSITION].count, `${name}: every face vertex has complexion color`);
      const compressed = primitive.extensions?.KHR_draco_mesh_compression;
      if (compressed) assert.ok(Number.isInteger(compressed.attributes?.COLOR_0) && compressed.attributes.COLOR_0 >= 0, `${name}: Draco includes complexion colors`);
      primitives++;
    }
    for (const child of node.children ?? []) checkNode(child);
  };
  checkNode(gltf.nodes.findIndex(node => node.name === name));
  assert.ok(primitives > 0, `${name}: exported facial complexion exists`);
  return { name, primitives };
}));
const garageBytes = fs.readFileSync(path.join(root, 'public/assets/models/racer-garage.glb'));
const garage = { bytes: garageBytes.length, sha256: createHash('sha256').update(garageBytes).digest('hex') };
if (garageSha256) assert.equal(garage.sha256, garageSha256, 'Garage export is unchanged');
const total = key => topLevel.reduce((sum, item) => sum + item[key], 0);
const report = { source, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), triangles: total('triangles'), draws: total('draws'), meshInstances: total('meshes'), nodes: gltf.nodes.length,
  materialCount: gltf.materials.length, imageCount: (gltf.images ?? []).length, extensions: gltf.extensionsUsed ?? [],
  transparentMaterials: gltf.materials.filter(material => material.alphaMode === 'BLEND').map(material => material.name),
  materials: gltf.materials.map(material => ({ name: material.name, alphaMode: material.alphaMode ?? 'OPAQUE', roughness: material.pbrMetallicRoughness?.roughnessFactor ?? 1, metallic: material.pbrMetallicRoughness?.metallicFactor ?? 1, normalMap: !!material.normalTexture, extensions: Object.keys(material.extensions ?? {}) })),
  roots: topLevel, runtimeContract: contract, outerwear, complexion, garage, warnings: [],
  measurement: 'Triangles and draw estimates sum active mesh primitives from accessor metadata. Actual frame draws depend on selected actors, passes, shadows, culling and runtime copies. Compressed geometry requires the normal loader/render smoke as well.' };
if (baselinePath) {
  const before = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  for (const node of contract) {
    const prior = before.runtimeContract.find(value => value.name === node.name);
    assert.ok(prior && prior.localMatrix.every((value, axis) => Math.abs(value - node.localMatrix[axis]) < 1e-6), `${node.name}: baseline runtime transform preserved`);
  }
  report.comparison = { baseline: baselinePath, bytesDelta: report.bytes - before.bytes, trianglesDelta: report.triangles - before.triangles, drawsDelta: report.draws - before.draws,
    roots: topLevel.map(item => { const prior = before.roots.find(value => value.name === item.name); assert.ok(prior, 'Baseline root exists'); return { name: item.name, trianglesDelta: item.triangles - prior.triangles, drawsDelta: item.draws - prior.draws }; }) };
  if (report.triangles > before.triangles * 1.2) report.warnings.push('Triangle count grew by more than 20%; review repeated multiplayer driver cost.');
  if (report.draws > before.draws) report.warnings.push('Material draw count increased; inspect whether new detail can share existing materials.');
}
if (reportPath) { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ ...report, materials: undefined, runtimeContract: undefined, report: reportPath }, null, 2));

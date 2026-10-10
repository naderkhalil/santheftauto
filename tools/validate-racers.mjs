/** Validate the racer runtime contract and compare exported cost/transforms.
 * node tools/validate-racers.mjs [kit.glb] [--baseline kit.glb|report.json] [--report report.json] [--garage-sha256 hash]
 * Counts use glTF accessor metadata, including Draco-compressed primitives;
 * character positions, normals and UVs are also decoded with the shipped decoder.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
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
assert.ok(bytes.length <= 16 * 1024 * 1024, 'The shared cartoon racer download stays within its 16 MiB quality budget');
let gltf, binaryLength = 0, binary;
for (let cursor = 12; cursor < bytes.length;) {
  assert.ok(cursor + 8 <= bytes.length, 'Chunk header fits');
  const length = bytes.readUInt32LE(cursor), type = bytes.readUInt32LE(cursor + 4);
  assert.ok(length % 4 === 0 && cursor + 8 + length <= bytes.length, 'Chunk is aligned and bounded');
  if (type === 0x4e4f534a) { assert.equal(gltf, undefined, 'One JSON chunk'); gltf = JSON.parse(bytes.subarray(cursor + 8, cursor + 8 + length).toString()); }
  else if (type === 0x004e4942) { binaryLength += length; binary = bytes.subarray(cursor + 8, cursor + 8 + length); }
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
const identities = ['dario', 'sam', 'elon', 'jensen', 'mira', 'feifei', 'mark'];
// Visual review may adjust the portrait LOD; race-driver cost remains bounded
// independently because many drivers can be visible in one multiplayer frame.
// Dario's glasses and curls need higher LODs; aggressive collapse loses his
// torso silhouette. The same strict framing/decode checks apply to every actor.
const characterBudgets = { portraitTriangles: 62000, portraitTriangleOverrides: { dario: 92000 }, seatedTriangles: 18000, seatedTriangleOverrides: { dario: 40000 }, portraitDraws: 1, seatedDraws: 3, textureDimensions: { baseColor: 2048, normal: 1024, metallicRoughness: 512 } };
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
// Portraits and race drivers share each character's authored PBR artwork. The
// only untextured character surfaces are the small cockpit sleeves and hands.
const decoderPath = path.join(root, 'public/assets/draco');
const decoderModule = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', fs.readFileSync(path.join(decoderPath, 'draco_wasm_wrapper.js'), 'utf8'))(
  decoderModule, decoderModule.exports, createRequire(import.meta.url), decoderPath, path.join(decoderPath, 'draco_wasm_wrapper.js'));
const draco = await decoderModule.exports({ wasmBinary: fs.readFileSync(path.join(decoderPath, 'draco_decoder.wasm')) });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const imageHash = image => {
  const view = gltf.bufferViews[gltf.images[image].bufferView];
  return digest(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
};
function characterTextureMemory(imageIndex) {
  const image = gltf.images[imageIndex], view = gltf.bufferViews[image.bufferView];
  const data = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  let width, height;
  if (image.mimeType === 'image/png' && data.length >= 24) {
    width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (image.mimeType === 'image/jpeg') {
    assert.equal(data.readUInt16BE(0), 0xffd8, `${image.name}: JPEG signature`);
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    for (let offset = 2; offset + 8 < data.length;) {
      if (data[offset++] !== 0xff) continue;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
      const length = data.readUInt16BE(offset);
      assert.ok(length >= 2 && offset + length <= data.length, `${image.name}: bounded JPEG segment`);
      if (frameMarkers.has(marker)) { height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5); break; }
      offset += length;
    }
  }
  assert.ok(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0, `${image.name}: readable character atlas dimensions`);
  let mipmappedRGBA8Bytes = 0;
  for (let w = width, h = height;; w = Math.max(1, Math.floor(w / 2)), h = Math.max(1, Math.floor(h / 2))) {
    mipmappedRGBA8Bytes += w * h * 4;
    if (w === 1 && h === 1) break;
  }
  return { image: imageIndex, name: image.name, width, height, encodedBytes: view.byteLength, decodedRGBA8Bytes: width * height * 4, mipmappedRGBA8Bytes };
}
function decodeSurface(primitive, name, textured) {
  const compressed = primitive.extensions?.KHR_draco_mesh_compression;
  assert.ok(compressed, `${name}: optimized character surface uses the shipped Draco pipeline`);
  const view = gltf.bufferViews[compressed.bufferView];
  const encoded = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const buffer = new draco.DecoderBuffer(), decoder = new draco.Decoder(), mesh = new draco.Mesh();
  try {
    buffer.Init(encoded, encoded.length);
    const status = decoder.DecodeBufferToMesh(buffer, mesh);
    assert.ok(status.ok(), `${name}: optimized mesh decodes`);
    const position = gltf.accessors[primitive.attributes.POSITION];
    assert.equal(mesh.num_points(), position.count, `${name}: decoded vertices match accessor metadata`);
    assert.equal(mesh.num_faces() * 3, gltf.accessors[primitive.indices].count, `${name}: decoded triangle count matches metadata`);
    for (const [semantic, components] of [['POSITION', 3], ['NORMAL', 3], ...(textured ? [['TEXCOORD_0', 2]] : [])]) {
      indexIn(primitive.attributes[semantic], gltf.accessors, `${name}: ${semantic}`);
      assert.ok(Number.isInteger(compressed.attributes?.[semantic]), `${name}: compression preserves ${semantic}`);
      const accessor = gltf.accessors[primitive.attributes[semantic]];
      assert.equal(accessor.count, position.count, `${name}: every vertex has ${semantic}`);
      assert.equal(accessor.type, 'VEC' + components, `${name}: ${semantic} component layout`);
      const attribute = decoder.GetAttributeByUniqueId(mesh, compressed.attributes[semantic]);
      assert.ok(attribute?.ptr, `${name}: decoded ${semantic} exists`);
      assert.equal(attribute.num_components(), components, `${name}: decoded ${semantic} component count`);
      const values = new draco.DracoFloat32Array();
      try {
        assert.ok(decoder.GetAttributeFloatForAllPoints(mesh, attribute, values), `${name}: ${semantic} decodes`);
        assert.equal(values.size(), position.count * components, `${name}: complete ${semantic} stream`);
        const low = Array(components).fill(Infinity), high = Array(components).fill(-Infinity);
        for (let index = 0; index < values.size(); index++) {
          const value = values.GetValue(index), axis = index % components;
          assert.ok(Number.isFinite(value), `${name}: finite decoded ${semantic}`);
          low[axis] = Math.min(low[axis], value); high[axis] = Math.max(high[axis], value);
          if (semantic === 'NORMAL') assert.ok(Math.abs(value) <= 1.005, `${name}: bounded shading normal`);
        }
        if (semantic === 'NORMAL') for (let index = 0; index < values.size(); index += 3) {
          const lengthSquared = values.GetValue(index) ** 2 + values.GetValue(index + 1) ** 2 + values.GetValue(index + 2) ** 2;
          assert.ok(lengthSquared > .98 && lengthSquared < 1.02, `${name}: shading normals are unit length, not zero vectors`);
        }
        if (semantic === 'POSITION') for (let axis = 0; axis < 3; axis++) {
          assert.ok(low[axis] >= position.min[axis] - .001 && high[axis] <= position.max[axis] + .001, `${name}: decoded position fits advertised bounds`);
        }
        if (semantic === 'TEXCOORD_0') {
          assert.ok(low.every(value => value >= -.005) && high.every(value => value <= 1.005), `${name}: UVs stay inside the baked atlas`);
          // Portrait and driving LODs can occupy different portions of one
          // shared atlas. Reject collapsed UVs without fixing their packing.
          assert.ok(low.every((value, axis) => high[axis] - value > .1), `${name}: UVs span a usable part of the baked artwork`);
        }
      } finally { draco.destroy(values); }
    }
  } finally { draco.destroy(mesh); draco.destroy(decoder); draco.destroy(buffer); }
}
function actorPrimitives(index, parent = new THREE.Matrix4()) {
  const node = gltf.nodes[index], world = parent.clone().multiply(matrices[index]);
  return [...(node.mesh === undefined ? [] : gltf.meshes[node.mesh].primitives.map(primitive => ({ primitive, world }))), ...(node.children ?? []).flatMap(child => actorPrimitives(child, world))];
}
const characterArt = identities.map(id => {
  const name = id + ' / approved cartoon';
  const materialIndex = gltf.materials.findIndex(material => material.name === name);
  assert.ok(materialIndex >= 0, `${id}: approved cartoon surface exists`);
  const material = gltf.materials[materialIndex], pbr = material.pbrMetallicRoughness;
  const images = {}, textureHashes = {};
  for (const [channel, slot] of Object.entries({ baseColor: pbr?.baseColorTexture, normal: material.normalTexture, metallicRoughness: pbr?.metallicRoughnessTexture })) {
    assert.ok(slot, `${id}: authored ${channel} map survives export`);
    assert.equal(slot.extensions?.KHR_texture_transform?.texCoord ?? slot.texCoord ?? 0, 0, `${id}: ${channel} uses TEXCOORD_0`);
    const texture = gltf.textures[slot.index];
    indexIn(texture.source, gltf.images ?? [], `${id}: ${channel} image`);
    const atlas = characterTextureMemory(texture.source), dimensionLimit = characterBudgets.textureDimensions[channel];
    assert.ok(atlas.width <= dimensionLimit && atlas.height <= dimensionLimit, `${id}: ${channel} atlas stays within its ${dimensionLimit}px texture-memory budget`);
    images[channel] = texture.source; textureHashes[channel] = imageHash(texture.source);
  }
  const poses = ['Standing_', 'Seated_'].map(pose => {
    const name = pose + id, portrait = pose === 'Standing_';
    const index = gltf.nodes.findIndex(node => node.name === name), stats = contract.find(node => node.name === name);
    const identity = new THREE.Matrix4().toArray();
    assert.ok(stats.localMatrix.every((value, axis) => Math.abs(value - identity[axis]) < 1e-6), `${name}: normalized actor root preserves the authored +Z facing direction`);
    const triangleLimit = portrait ? characterBudgets.portraitTriangleOverrides[id] ?? characterBudgets.portraitTriangles : characterBudgets.seatedTriangleOverrides[id] ?? characterBudgets.seatedTriangles;
    assert.ok(stats.triangles > 0 && stats.triangles <= triangleLimit, `${name}: stays within its ${portrait ? 'portrait' : 'multiplayer driver'} triangle budget`);
    assert.ok(stats.draws <= (portrait ? characterBudgets.portraitDraws : characterBudgets.seatedDraws), `${name}: bounded character material draws`);
    const [min, max] = stats.bounds, width = max[0] - min[0], depth = max[2] - min[2];
    assert.ok(min[1] >= (portrait ? .98 : .35) && max[1] <= (portrait ? 2.02 : 1.52), `${name}: all geometry fits the selection/cockpit vertical envelope`);
    assert.ok(width > .35 && width < 1.5 && depth > .15 && depth < 1.2, `${name}: plausible upright bust proportions`);
    assert.ok(Math.abs(min[0] + max[0]) < .08, `${name}: centered across the seat`);
    if (portrait) assert.ok(Math.abs(min[2] + max[2]) < .015, `${name}: portrait is centered in depth`);
    const primitives = actorPrimitives(index);
    let sculptures = 0;
    for (const { primitive, world } of primitives) {
      const textured = primitive.material === materialIndex;
      if (textured) {
        sculptures++;
        const position = gltf.accessors[primitive.attributes.POSITION];
        const bust = new THREE.Box3(new THREE.Vector3().fromArray(position.min), new THREE.Vector3().fromArray(position.max)).applyMatrix4(world);
        assert.ok(Math.abs(bust.min.y - (portrait ? 1 : .5)) < .015 && Math.abs(bust.max.y - (portrait ? 2 : 1.5)) < .015, `${name}: authored bust base and crown fit the selection/cockpit framing`);
      }
      else assert.ok(!portrait && [id + ' / driving sleeves', id + ' / driving hands'].includes(gltf.materials[primitive.material].name), `${name}: no discarded procedural face or unexpected material`);
      decodeSurface(primitive, name, textured);
    }
    assert.equal(sculptures, 1, `${name}: exactly one approved textured sculpture`);
    return { name, triangles: stats.triangles, draws: stats.draws, bounds: stats.bounds };
  });
  return { id, material: name, images, textureHashes, poses };
});
assert.equal(new Set(characterArt.map(actor => actor.textureHashes.baseColor)).size, identities.length, 'All seven characters retain their own distinct painted facial artwork');
const characterImages = [...new Set(characterArt.flatMap(actor => Object.values(actor.images)))].map(characterTextureMemory);
const characterTextureEstimate = {
  imageCount: characterImages.length,
  decodedRGBA8Bytes: characterImages.reduce((sum, image) => sum + image.decodedRGBA8Bytes, 0),
  mipmappedRGBA8Bytes: characterImages.reduce((sum, image) => sum + image.mipmappedRGBA8Bytes, 0),
  images: characterImages,
  assumptions: 'One RGBA8 allocation per unique character atlas, plus a complete mip chain for the GPU estimate. Both poses share the same maps. Excludes geometry, browser copies, render targets, and the city; actual residency depends on which characters have rendered.'
};
assert.deepEqual(new Set(scene.nodes.map(index => gltf.nodes[index].name)), new Set(['Vehicle', ...identities.flatMap(id => ['Standing_' + id, 'Seated_' + id])]), 'Only the car and optimized roster belong in the racing payload');
assert.equal(seen.size, gltf.nodes.length, 'No dormant high-poly source nodes are embedded in the runtime kit');
assert.equal(new Set([...seen].map(index => gltf.nodes[index].mesh).filter(index => index !== undefined)).size, gltf.meshes.length, 'No unused source meshes are embedded in the runtime kit');
const publicFiles = fs.readdirSync(path.join(root, 'public'), { recursive: true }).filter(file => fs.statSync(path.join(root, 'public', file)).isFile());
assert.ok(!publicFiles.some(file => /\.(blend(?:\d+)?|fbx|obj)$/i.test(file)), 'Editable/high-poly source art is kept outside public');
const sourceFiles = identities.map(id => path.join(root, id === 'mark' ? 'art/characters/meshy-mark/mark-meshy-v1.glb' : `art/characters/roster/${id}/${id}-meshy-v1.glb`));
const sourceHashes = new Set(sourceFiles.filter(file => fs.existsSync(file)).map(file => digest(fs.readFileSync(file))));
for (const file of publicFiles.filter(file => file.endsWith('.glb'))) assert.ok(!sourceHashes.has(digest(fs.readFileSync(path.join(root, 'public', file)))), `${file}: approved source sculpt must be optimized before publication`);

// Resolve resource indices before hashing: the assembly changes their numbers,
// but every vehicle pivot, paint/glass material and encoded surface must survive.
function vehicleFingerprint(doc, data) {
  const cache = new Map();
  const resolve = (kind, index) => {
    const key = `${kind}:${index}`;
    if (cache.has(key)) return cache.get(key);
    const value = structuredClone(doc[kind][index]);
    cache.set(key, value);
    if (kind === 'nodes') {
      if (value.mesh !== undefined) value.mesh = resolve('meshes', value.mesh);
      if (value.children) value.children = value.children.map(child => resolve('nodes', child));
    } else if (kind === 'meshes') {
      for (const primitive of value.primitives) {
        for (const attribute in primitive.attributes) primitive.attributes[attribute] = resolve('accessors', primitive.attributes[attribute]);
        if (primitive.indices !== undefined) primitive.indices = resolve('accessors', primitive.indices);
        if (primitive.material !== undefined) primitive.material = resolve('materials', primitive.material);
        const compressed = primitive.extensions?.KHR_draco_mesh_compression;
        if (compressed) compressed.bufferView = resolve('bufferViews', compressed.bufferView);
      }
    } else if (kind === 'accessors' || kind === 'images') {
      if (value.bufferView !== undefined) value.bufferView = resolve('bufferViews', value.bufferView);
    } else if (kind === 'bufferViews') {
      value.payloadSha256 = digest(data.subarray(value.byteOffset ?? 0, (value.byteOffset ?? 0) + value.byteLength));
      delete value.buffer; delete value.byteOffset;
    } else if (kind === 'materials') {
      const textures = object => {
        for (const [key, child] of Object.entries(object)) {
          if (key.endsWith('Texture') && child && typeof child === 'object' && child.index !== undefined) child.index = resolve('textures', child.index);
          else if (child && typeof child === 'object') textures(child);
        }
      };
      textures(value);
    } else if (kind === 'textures') {
      if (value.source !== undefined) value.source = resolve('images', value.source);
      if (value.sampler !== undefined) value.sampler = resolve('samplers', value.sampler);
    }
    return value;
  };
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return digest(JSON.stringify(stable(resolve('nodes', doc.nodes.findIndex(node => node.name === 'Vehicle')))));
}
function glbBaseline(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.readUInt32LE(0), 0x46546c67, 'Baseline GLB magic');
  assert.equal(data.readUInt32LE(4), 2, 'Baseline glTF 2');
  assert.equal(data.readUInt32LE(8), data.length, 'Baseline declared length');
  let doc, binary;
  for (let offset = 12; offset < data.length;) {
    const length = data.readUInt32LE(offset), type = data.readUInt32LE(offset + 4);
    assert.ok(offset + length + 8 <= data.length, 'Baseline chunk is bounded');
    if (type === 0x4e4f534a) doc = JSON.parse(data.subarray(offset + 8, offset + 8 + length).toString());
    else if (type === 0x004e4942) binary = data.subarray(offset + 8, offset + 8 + length);
    offset += length + 8;
  }
  assert.ok(doc?.nodes && binary, 'Baseline has nodes and encoded resources');
  const localMatrix = node => node.matrix ?? new THREE.Matrix4().compose(new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]), new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1])).toArray();
  const count = index => {
    const node = doc.nodes[index], result = { triangles: 0, draws: 0 };
    for (const primitive of node.mesh === undefined ? [] : doc.meshes[node.mesh].primitives) {
      result.triangles += doc.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3; result.draws++;
    }
    for (const child of node.children ?? []) { const nested = count(child); result.triangles += nested.triangles; result.draws += nested.draws; }
    return result;
  };
  const roots = doc.scenes[doc.scene ?? 0].nodes.map(index => ({ name: doc.nodes[index].name, ...count(index) }));
  return { bytes: data.length, roots, triangles: roots.reduce((sum, root) => sum + root.triangles, 0), draws: roots.reduce((sum, root) => sum + root.draws, 0),
    runtimeContract: doc.nodes.filter(node => required.includes(node.name)).map(node => ({ name: node.name, localMatrix: localMatrix(node) })),
    vehicleSha256: vehicleFingerprint(doc, binary) };
}
const garageBytes = fs.readFileSync(path.join(root, 'public/assets/models/racer-garage.glb'));
const garage = { bytes: garageBytes.length, sha256: createHash('sha256').update(garageBytes).digest('hex') };
if (garageSha256) assert.equal(garage.sha256, garageSha256, 'Garage export is unchanged');
const total = key => topLevel.reduce((sum, item) => sum + item[key], 0);
const report = { source, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), triangles: total('triangles'), draws: total('draws'), meshInstances: total('meshes'), nodes: gltf.nodes.length,
  materialCount: gltf.materials.length, imageCount: (gltf.images ?? []).length, extensions: gltf.extensionsUsed ?? [],
  transparentMaterials: gltf.materials.filter(material => material.alphaMode === 'BLEND').map(material => material.name),
  materials: gltf.materials.map(material => ({ name: material.name, alphaMode: material.alphaMode ?? 'OPAQUE', roughness: material.pbrMetallicRoughness?.roughnessFactor ?? 1, metallic: material.pbrMetallicRoughness?.metallicFactor ?? 1, normalMap: !!material.normalTexture, extensions: Object.keys(material.extensions ?? {}) })),
  roots: topLevel, runtimeContract: contract, characterBudgets, characterArt, characterTextureEstimate, vehicleSha256: vehicleFingerprint(gltf, binary), garage, warnings: [],
  measurement: 'Triangles and draw estimates sum active mesh primitives from accessor metadata. Actual frame draws depend on selected actors, passes, shadows, culling and runtime copies. Character streams also decode successfully with the shipped Draco decoder. Facial likeness, +Z facing and cockpit placement still require a browser render review.' };
if (baselinePath) {
  const before = baselinePath.endsWith('.glb') ? glbBaseline(baselinePath) : JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (before.vehicleSha256) assert.equal(report.vehicleSha256, before.vehicleSha256, 'Vehicle hierarchy, wheel pivots, sponsor paint, transparent glazing and encoded geometry are unchanged');
  // Portraits now use normalized bust roots; their bounds are checked above.
  // Vehicle and wheel/steering roots keep the original animation contract.
  for (const node of contract.filter(node => !/^(Standing_|Seated_)/.test(node.name))) {
    const prior = before.runtimeContract.find(value => value.name === node.name);
    assert.ok(prior, `${node.name}: runtime car part exists in the baseline`);
    assert.ok(prior.localMatrix.every((value, axis) => Math.abs(value - node.localMatrix[axis]) < 1e-6), `${node.name}: baseline runtime transform preserved`);
  }
  report.comparison = { baseline: baselinePath, bytesDelta: report.bytes - before.bytes, trianglesDelta: report.triangles - before.triangles, drawsDelta: report.draws - before.draws,
    roots: topLevel.map(item => { const prior = before.roots.find(value => value.name === item.name); return { name: item.name, added: !prior, trianglesDelta: item.triangles - (prior?.triangles ?? 0), drawsDelta: item.draws - (prior?.draws ?? 0) }; }) };
  if (report.triangles > before.triangles * 1.2) report.warnings.push('Triangle count grew by more than 20%; review repeated multiplayer driver cost.');
  if (report.draws > before.draws) report.warnings.push('Material draw count increased; inspect whether new detail can share existing materials.');
}
if (reportPath) { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ ...report, materials: undefined, runtimeContract: undefined, report: reportPath }, null, 2));

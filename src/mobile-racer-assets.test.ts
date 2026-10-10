import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { racerKitUrl } from './racer-assets.ts';

function glb(name: string) {
  const bytes = readFileSync(new URL('../public/assets/models/' + name, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12), document = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const binary = bytes.subarray(28 + length);
  const view = (index: number) => {
    const value = document.bufferViews[index];
    return binary.subarray(value.byteOffset ?? 0, (value.byteOffset ?? 0) + value.byteLength);
  };
  return { document, view };
}

function imageSize(bytes: Buffer): [number, number] {
  if (bytes.toString('ascii', 1, 4) === 'PNG') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'Embedded textures must use broadly supported JPEG or PNG.');
  for (let offset = 2; offset < bytes.length;) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
    const length = bytes.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    offset += length;
  }
  throw new Error('Texture dimensions are missing.');
}

test('mobile selects the small kit directly while desktop preserves its existing artwork', () => {
  assert.match(racerKitUrl(true), /^\/assets\/models\/racer-kit-mobile\.glb\?v=/);
  assert.match(racerKitUrl(false), /^\/assets\/models\/racer-kit\.glb\?v=/);
});

test('mobile racer textures stay at 512 pixels and reduce decoded memory by at least 80 percent', () => {
  const original = glb('racer-kit.glb'), mobile = glb('racer-kit-mobile.glb');
  let originalBytes = 0, mobileBytes = 0;
  assert.equal(mobile.document.images.length, original.document.images.length);
  for (const image of original.document.images) {
    const [width, height] = imageSize(original.view(image.bufferView));
    originalBytes += width * height * 4;
  }
  for (const image of mobile.document.images) {
    const [width, height] = imageSize(mobile.view(image.bufferView));
    assert.ok(width <= 512 && height <= 512, image.name);
    mobileBytes += width * height * 4;
  }
  assert.ok(mobileBytes <= 21 * 1024 * 1024, 'The entire seven-driver kit stays at 21 MiB decoded RGBA.');
  assert.ok(mobileBytes <= originalBytes * .2, 'Compressed download size alone does not bound decoded memory.');
});

test('mobile kit preserves every mesh, material, wheel, driver node and compressed geometry byte', () => {
  const original = glb('racer-kit.glb'), mobile = glb('racer-kit-mobile.glb');
  for (const key of ['scene', 'scenes', 'nodes', 'meshes', 'materials', 'accessors', 'textures', 'samplers', 'skins', 'animations', 'extensionsUsed', 'extensionsRequired']) {
    assert.deepEqual(mobile.document[key], original.document[key], key);
  }
  assert.deepEqual(mobile.document.images, original.document.images);
  const images = new Set(original.document.images.map((image: { bufferView: number }) => image.bufferView));
  assert.equal(mobile.document.bufferViews.length, original.document.bufferViews.length);
  original.document.bufferViews.forEach((_value: unknown, index: number) => {
    if (!images.has(index)) assert.deepEqual(mobile.view(index), original.view(index), `Geometry bufferView ${index}`);
  });
});

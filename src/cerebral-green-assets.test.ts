import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asset = (name: string) => new URL(`../public/assets/cerebral-valley/${name}`, import.meta.url);
const json = (name: string) => JSON.parse(readFileSync(asset(name), 'utf8'));
function glbNodes(name: string): { name?: string }[] {
  const buffer = readFileSync(asset(name));
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  return JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12))).nodes;
}

test('the dedicated Green preserves the geographic footprint and opens its Hayes edge', () => {
  const source = json('layout.json').parks.find((park: { id: string }) => park.id === '28015862');
  const green = json('patricias-green.meta.json');
  assert.deepEqual(green.footprint, source.polygon);
  assert.equal(green.mappedPathCount, source.paths.length);
  assert.equal(green.bytes, readFileSync(asset('patricias-green.glb')).length);
  assert.equal(green.treeAnchors.length, 6);
  for (const tree of green.treeAnchors) {
    assert.ok(tree.z < -14, 'the north plaza and Hayes approach must stay open');
    assert.ok(tree.height <= 6 && tree.canopyWidth <= 4.2, 'shade trees must fit the narrow park');
  }
});

test('both neighborhood levels relinquish Green and Anina while keeping their neighbors', () => {
  for (const name of ['neighborhood.glb', 'neighborhood-lod.glb']) {
    assert.ok(!glbNodes(name).some(node => node.name?.includes("Patricia")), `${name} duplicates the dedicated Green`);
  }
  assert.ok(!json('vegetation-anchors.json').anchors.some((anchor: { park?: string }) => anchor.park === "Patricia's Green"));
  const parcels: string[] = json('neighborhood-parcels.json');
  assert.ok(!parcels.includes('60824061'), 'the detailed Anina asset owns this building');
  assert.ok(parcels.includes('60824059'), 'retain the Octavia corner neighbor');
  assert.ok(parcels.includes('60824057'), 'retain the rear apartment neighbor');
});

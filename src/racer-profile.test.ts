import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIVERS, normalizeProfile } from './racer-profile.ts';

test('all founder choices survive server normalization and legacy saves migrate',()=>{
  assert.deepEqual(DRIVERS.map(driver=>driver.id),['dario','sam','elon','jensen','mira','feifei','mark']);
  for(const driver of DRIVERS)assert.equal(normalizeProfile({driver:driver.id}).driver,driver.id);
  for(const [old,current] of [['nova','dario'],['kai','sam'],['sunny','elon'],['remy','jensen']])assert.equal(normalizeProfile({driver:old}).driver,current);
  assert.equal(normalizeProfile({driver:'not-a-character'}).driver,'dario');
});

test('racer names remain bounded plain text for shared selection markers',()=>{
  assert.equal(normalizeProfile({name:'  <Nader>\n\u202E  '}).name,'Nader');
  assert.equal(normalizeProfile({name:'A'.repeat(100)}).name.length,24);
  assert.equal(normalizeProfile({name:'   '}).name,'Racer');
});

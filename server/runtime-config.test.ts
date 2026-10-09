import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { clientAddress, runtimeConfig, secretMatches } from './runtime-config.ts';

test('only configured proxy hops determine the client address', () => {
  const request = { socket: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': '1.2.3.4, 8.8.8.8' } } as IncomingMessage;
  assert.equal(clientAddress(request), '10.0.0.1');
  assert.equal(clientAddress(request, 1), '8.8.8.8');
  assert.equal(clientAddress(request, 2), '1.2.3.4');
  request.headers['x-forwarded-for'] = 'not-an-address';
  assert.equal(clientAddress(request, 1), '10.0.0.1');
});

test('production roles fail closed on invalid routing configuration', () => {
  assert.throws(() => runtimeConfig({ SERVER_ROLE: 'worker' }), /WORKER_SECRET/);
  assert.throws(() => runtimeConfig({ SERVER_ROLE: 'gateway', WORKER_SECRET: 'x'.repeat(32) }), /ROOM_WORKER/);
  assert.throws(() => runtimeConfig({ MAX_ROOMS: 'NaN' }), /numeric/);
  const config = runtimeConfig({ SERVER_ROLE: 'gateway', WORKER_SECRET: 'x'.repeat(32), ROOM_WORKER_AB: 'worker:10000' });
  assert.deepEqual(config.workers, [{ id: 'AB', url: 'http://worker:10000' }]);
  assert.equal(secretMatches('secret', 'secret'), true);
  assert.equal(secretMatches('', ''), false);
});

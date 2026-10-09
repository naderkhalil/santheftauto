import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { RoomService } from './rooms.ts';
import { attachInputChannel, type InputChannelOptions } from './input-channel.ts';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';

const input = { throttle: 1, brake: 0, steer: .5, drift: false, boost: false };
async function fixture(options: InputChannelOptions = {}) {
  const service = new RoomService(), host = service.create(DEFAULT_PROFILE), server = createServer((_req, res) => res.end());
  const channel = attachInputChannel(server, service, options), sockets: WebSocket[] = [];
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const authority = '127.0.0.1:' + (server.address() as { port: number }).port;
  return {
    service, host, channel, server,
    async connect(headers: Record<string, string> = {}, path = '/api/rooms/' + host.room.code + '/input') {
      const ws = new WebSocket('ws://' + authority + path, { headers: { Origin: 'http://' + authority, ...headers } });
      sockets.push(ws); await once(ws, 'open'); return ws;
    },
    async close() { for (const socket of sockets) socket.terminate(); channel.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
async function exchange(ws: WebSocket, message: unknown) {
  const reply = once(ws, 'message'); ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  return JSON.parse((await reply)[0].toString());
}
const pause = () => new Promise(resolve => setTimeout(resolve, 25));

test('input sockets authenticate before controls, preserve sequence/clamping and neutralize on close', async () => {
  const f = await fixture();
  try {
    const ws = await f.connect(), ready = await exchange(ws, { type: 'claim', token: f.host.token, generation: f.host.generation });
    assert.equal(ready.type, 'ready'); assert.ok(Number.isFinite(ready.serverNow));
    ws.send(JSON.stringify({ type: 'input', sequence: 2, input: { ...input, throttle: 9, steer: -9 } }));
    ws.send(JSON.stringify({ type: 'input', sequence: 1, input })); await pause();
    const player = f.service.auth(f.host.room.code, f.host.token).player;
    assert.equal(player.input.throttle, 1); assert.equal(player.input.steer, -1); assert.equal(player.sequence, 2);
    assert.equal(f.channel.getMetrics().acceptedInputs, 1);
    const closed = once(ws, 'close'); ws.close(); await closed; await pause();
    assert.equal(player.input.throttle, 0); assert.equal(player.connected, true);
    f.service.command(f.host.room.code, f.host.token, { type: 'input', sequence: 3, input }, Date.now(), f.host.generation);
    assert.equal(player.input.throttle, 1, 'HTTP controls remain usable after websocket closes');
  } finally { await f.close(); }
});

test('malformed, unauthenticated, foreign-origin and private-worker control requests are rejected', async () => {
  const f = await fixture({ workerSecret: 'worker-only-secret', authTimeoutMs: 80 });
  try {
    await assert.rejects(f.connect(), /403/);
    await assert.rejects(f.connect({ 'X-Worker-Secret': 'worker-only-secret', Origin: 'https://foreign.invalid' }), /403/);
    const headers = { 'X-Worker-Secret': 'worker-only-secret' };
    const unauthenticated = await f.connect(headers);
    assert.equal((await exchange(unauthenticated, { type: 'input', sequence: 1, input })).code, 'SESSION_CLAIM_REQUIRED');
    const invalid = await f.connect(headers);
    assert.equal((await exchange(invalid, '{invalid-json')).code, 'INVALID_MESSAGE');
    const fake = await f.connect(headers);
    assert.equal((await exchange(fake, { type: 'claim', token: 'fake', generation: 1 })).code, 'SESSION_EXPIRED');
    const silent = await f.connect(headers); const timeout = JSON.parse((await once(silent, 'message'))[0].toString());
    assert.equal(timeout.code, 'AUTH_TIMEOUT');
    assert.equal(f.service.auth(f.host.room.code, f.host.token).player.input.throttle, 0);
  } finally { await f.close(); }
});

test('new socket/session supersedes old controls without letting its close neutralize the new driver', async () => {
  const f = await fixture();
  try {
    const old = await f.connect(); await exchange(old, { type: 'claim', token: f.host.token, generation: f.host.generation });
    const oldError = once(old, 'message'), current = await f.connect();
    await exchange(current, { type: 'claim', token: f.host.token, generation: f.host.generation });
    assert.equal(JSON.parse((await oldError)[0].toString()).code, 'INPUT_CHANNEL_REPLACED');
    current.send(JSON.stringify({ type: 'input', sequence: 10, input })); await pause();
    assert.equal(f.service.auth(f.host.room.code, f.host.token).player.input.throttle, 1);
    const claimed = f.service.claim(f.host.room.code, f.host.token);
    const superseded = await exchange(current, { type: 'input', sequence: 11, input });
    assert.equal(superseded.code, 'SESSION_TAKEN_OVER');
    const fresh = await f.connect(); await exchange(fresh, { type: 'claim', token: f.host.token, generation: claimed.generation });
    fresh.send(JSON.stringify({ type: 'input', sequence: 12, input })); await pause();
    assert.equal(f.service.auth(f.host.room.code, f.host.token).player.sequence, 12);
    assert.equal(f.service.auth(f.host.room.code, f.host.token).player.input.throttle, 1);
  } finally { await f.close(); }
});

test('token input budget survives reconnects and rejects excessive or spoofed controls', async () => {
  const f = await fixture({ inputRatePerSecond: 2 });
  try {
    const ws = await f.connect(); await exchange(ws, { type: 'claim', token: f.host.token, generation: f.host.generation });
    const rejected = once(ws, 'message');
    for (let sequence = 1; sequence <= 5; sequence++) ws.send(JSON.stringify({ type: 'input', sequence, input }));
    assert.equal(JSON.parse((await rejected)[0].toString()).code, 'RATE_LIMITED');
    assert.equal(f.channel.getMetrics().acceptedInputs, 3); assert.equal(f.channel.getMetrics().rateLimited, 1);
    const retry = await f.connect(); await exchange(retry, { type: 'claim', token: f.host.token, generation: f.host.generation });
    assert.equal((await exchange(retry, { type: 'input', sequence: 6, input })).code, 'RATE_LIMITED');
    const spoof = await f.connect(); await exchange(spoof, { type: 'claim', token: f.host.token, generation: f.host.generation });
    assert.equal((await exchange(spoof, { type: 'finish', time: .001 })).code, 'INVALID_MESSAGE');
  } finally { await f.close(); }
});

test('unauthenticated socket capacity is bounded and is released on close', async () => {
  const f = await fixture({ maxPendingAuthentications: 1 });
  try {
    const pending = await f.connect();
    await assert.rejects(f.connect(), /503/);
    const closed = once(pending, 'close'); pending.close(); await closed; await pause();
    const admitted = await f.connect();
    assert.equal((await exchange(admitted, { type: 'claim', token: f.host.token, generation: f.host.generation })).type, 'ready');
    const nextPending = await f.connect();
    assert.equal(nextPending.readyState, WebSocket.OPEN, 'a claimed socket does not occupy a pending authentication slot');
    assert.equal(f.channel.getMetrics().rateLimited, 1);
  } finally { await f.close(); }
});

test('configured per-address upgrade limit rejects excess connections with 429', async () => {
  const f = await fixture({ maxUpgradesPerMinute: 2 });
  try {
    await f.connect(); await f.connect();
    await assert.rejects(f.connect(), /429/);
    assert.equal(f.channel.getMetrics().rateLimited, 1);
  } finally { await f.close(); }
});

test('valid token claim budget prevents repeated socket replacement', async () => {
  const f = await fixture();
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      const ws = await f.connect();
      assert.equal((await exchange(ws, { type: 'claim', token: f.host.token, generation: f.host.generation })).type, 'ready');
      const closed = once(ws, 'close'); ws.close(); await closed;
    }
    const excessive = await f.connect();
    assert.equal((await exchange(excessive, { type: 'claim', token: f.host.token, generation: f.host.generation })).code, 'RATE_LIMITED');
    assert.equal(f.channel.getMetrics().rateLimited, 1);
  } finally { await f.close(); }
});

test('unrelated websocket upgrades remain available for development hot reload', async () => {
  const f = await fixture();
  let handled = false;
  f.server.on('upgrade', (req, socket) => {
    if (req.url !== '/hmr') return;
    handled = true;
    socket.end('HTTP/1.1 418 Other upgrade handler\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  try {
    await assert.rejects(f.connect({}, '/hmr'), /418/);
    assert.equal(handled, true);
    assert.equal(f.channel.getMetrics().connections, 0);
  } finally { await f.close(); }
});

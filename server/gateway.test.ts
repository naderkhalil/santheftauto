import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect, type Socket } from 'node:net';
import { createRoomGateway } from './gateway.ts';

const secret = 'local-test-worker-secret-1234567890';
async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const sockets = new Set<Socket>(), server = createServer(handler);
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No test listener');
  return { server, url: `http://127.0.0.1:${address.port}`, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
async function worker(id: string, slots = 10) {
  const state = { accepting: true, slots, creates: 0, createRequests: 0, failCreate: false, headers: {} as IncomingMessage['headers'], path: '' };
  const admissions = new Map<string, unknown>();
  const node = await listen((req, res) => {
    state.headers = req.headers; state.path = req.url ?? '';
    if (req.headers['x-worker-secret'] !== secret) { res.writeHead(403); res.end(); return; }
    if (req.url === '/api/rooms/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ workerId: id, accepting: state.accepting, availableSlots: state.slots, activeRooms: state.creates, capacity: 100, activePlayers: state.creates })); return; }
    if (req.url?.includes('/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: first\n\n');
      const timer = setTimeout(() => res.end('data: second\n\n'), 150); res.on('close', () => clearTimeout(timer)); return;
    }
    if (req.url === '/api/rooms') {
      let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
        state.createRequests++;
        if (state.failCreate) { req.socket.destroy(); return; }
        const key = JSON.parse(body).idempotencyKey;
        if (!admissions.has(key)) {
          if (!state.accepting || state.slots <= 0) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'ROOM_CAPACITY', admitted: false })); return; }
          state.creates++; state.slots--; admissions.set(key, { id: `${id}-player`, token: 'private-token', room: { code: id + state.creates.toString(16).toUpperCase().padStart(6, '0') } });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(admissions.get(key)));
      }); return;
    }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ workerId: id, path: req.url }));
  });
  node.server.on('upgrade', (req, socket, head) => {
    state.headers = req.headers; state.path = req.url ?? '';
    const accept = createHash('sha1').update(String(req.headers['sec-websocket-key']) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    if (head.length) socket.write(head);
    socket.on('data', data => socket.write(data));
  });
  return { ...node, state, config: { id, url: node.url } };
}
async function gateway(workers: { id: string; url: string }[], extra = {}) {
  const api = createRoomGateway({ workers, workerSecret: secret, healthCacheMs: 0, ...extra });
  const node = await listen((req, res) => { void api.handler(req, res); });
  node.server.on('upgrade', api.handleUpgrade);
  return { ...node, api, close: async () => { api.close(); await node.close(); } };
}
const post = (base: string, path: string, body: unknown, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('fixed ownership keeps create retries and all room routes on their worker across replicas and pool growth', async () => {
  const a = await worker('AA', 20), b = await worker('BB', 2), c = await worker('CC', 100);
  const first = await gateway([a.config, b.config]), replica = await gateway([c.config, b.config, a.config]);
  try {
    const placement = await (await post(first.url, '/api/rooms/placement', {})).json();
    assert.equal(placement.workerId, 'AA'); assert.match(placement.idempotencyKey, /^AA_/);
    const original = await (await post(first.url, '/api/rooms', { idempotencyKey: placement.idempotencyKey })).json();
    const retried = await (await post(replica.url, '/api/rooms', { idempotencyKey: placement.idempotencyKey })).json();
    assert.deepEqual(retried, original); assert.equal(a.state.creates, 1); assert.equal(c.state.creates, 0);
    for (const action of ['join', 'command', 'claim']) {
      const response = await post(replica.url, `/api/rooms/${original.room.code}/${action}`, {});
      assert.equal((await response.json()).workerId, 'AA');
    }
    const next = await (await post(replica.url, '/api/rooms/placement', {})).json(); assert.equal(next.workerId, 'CC');
  } finally { await first.close(); await replica.close(); await a.close(); await b.close(); await c.close(); }
});

test('drain and capacity affect fresh placement, never owner routing or an existing idempotent retry', async () => {
  const a = await worker('AA', 20), b = await worker('BB', 3), g = await gateway([a.config, b.config]);
  try {
    const key = 'AA_0123456789abcdef';
    const original = await (await post(g.url, '/api/rooms', { idempotencyKey: key })).json();
    a.state.accepting = false;
    const placement = await (await post(g.url, '/api/rooms/placement', {})).json(); assert.equal(placement.workerId, 'BB');
    assert.deepEqual(await (await post(g.url, '/api/rooms', { idempotencyKey: key })).json(), original);
    const rejected = await post(g.url, '/api/rooms', { idempotencyKey: 'AA_a-new-attempt-key' });
    assert.equal(rejected.status, 503); assert.equal((await rejected.json()).admitted, false); assert.equal(b.state.creates, 0);
    b.state.slots = 0;
    const full = await post(g.url, '/api/rooms/placement', {}); assert.equal(full.status, 503); assert.equal((await full.json()).admitted, false);
    assert.equal((await post(g.url, `/api/rooms/${original.room.code}/command`, {})).status, 200);
  } finally { await g.close(); await a.close(); await b.close(); }
});

test('ambiguous create failure never falls back to a different worker and missing owners remain unavailable', async () => {
  const a = await worker('AA'), b = await worker('BB'), g = await gateway([a.config, b.config]);
  try {
    a.state.failCreate = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await post(g.url, '/api/rooms', { idempotencyKey: 'AA_stable-failed-attempt' });
      assert.equal(response.status, 503); const error = await response.json(); assert.equal(error.code, 'ROOM_WORKER_UNAVAILABLE'); assert.equal(error.admitted, null);
    }
    assert.equal(a.state.createRequests, 2); assert.equal(b.state.createRequests, 0);
    assert.equal((await post(g.url, '/api/rooms', { idempotencyKey: 'legacy-uuid-key' })).status, 409);
    const unknown = await post(g.url, '/api/rooms/CC000001/join', {}); assert.equal(unknown.status, 503); assert.equal((await unknown.json()).code, 'ROOM_OWNER_UNAVAILABLE');
  } finally { await g.close(); await a.close(); await b.close(); }
});

test('gateway validates browser origin and replaces spoofed routing, secret and client-address headers', async () => {
  const a = await worker('AA'), g = await gateway([a.config], { clientAddress: () => '203.0.113.9' });
  try {
    assert.equal((await post(g.url, '/api/rooms/AA000001/command', {}, { Origin: 'https://elsewhere.invalid' })).status, 403);
    const response = await post(g.url, '/api/rooms/AA000001/command', {}, { Origin: g.url, Authorization: 'Bearer racer', 'X-Room-Generation': '4', 'X-Worker-Secret': 'spoofed', 'X-Room-Client-IP': 'spoofed', Forwarded: 'for=spoofed', 'X-Forwarded-Host': 'evil.invalid' });
    assert.equal(response.status, 200);
    assert.equal(a.state.headers.origin, a.url); assert.equal(a.state.headers.host, new URL(a.url).host); assert.equal(a.state.headers['x-worker-secret'], secret);
    assert.equal(a.state.headers.authorization, 'Bearer racer'); assert.equal(a.state.headers['x-room-generation'], '4'); assert.equal(a.state.headers['x-room-client-ip'], '203.0.113.9');
    assert.equal(a.state.headers.forwarded, undefined); assert.equal(a.state.headers['x-forwarded-host'], undefined);
    assert.equal((await fetch(g.url + '/api/rooms/health')).status, 403);
    assert.equal((await fetch(g.url + '/api/rooms/health', { headers: { 'X-Worker-Secret': secret } })).status, 200);
  } finally { await g.close(); await a.close(); }
});

test('SSE bytes arrive before the upstream ends and wire query is preserved', async () => {
  const a = await worker('AA'), b = await worker('BB'), g = await gateway([a.config, b.config]);
  try {
    const response = await fetch(g.url + '/api/rooms/BB000001/events?wire=v2', { headers: { Authorization: 'Bearer guest', 'X-Room-Generation': '2' } });
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform');
    const reader = response.body!.getReader(), first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), 'data: first\n\n'); assert.equal(first.done, false);
    const second = await reader.read(); assert.equal(new TextDecoder().decode(second.value), 'data: second\n\n');
    assert.equal(b.state.path, '/api/rooms/BB000001/events?wire=v2'); assert.equal(b.state.headers.authorization, 'Bearer guest');
    await reader.cancel();
  } finally { await g.close(); await a.close(); await b.close(); }
});

test('WebSocket input tunnel preserves owner, handshake and bidirectional bytes', async () => {
  const a = await worker('AA'), b = await worker('BB'), g = await gateway([a.config, b.config]);
  try {
    const url = new URL(g.url);
    const result = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(url.port), url.hostname); let received = '', sent = false;
      const timer = setTimeout(() => { socket.destroy(); reject(Error('Upgrade test timed out')); }, 2000);
      socket.on('error', reject);
      socket.on('connect', () => socket.write(`GET /api/rooms/BB000001/input HTTP/1.1\r\nHost: ${url.host}\r\nOrigin: ${url.origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nX-Worker-Secret: attacker\r\n\r\n`));
      socket.on('data', data => {
        received += data.toString();
        if (!sent && received.includes('\r\n\r\n')) { sent = true; socket.write('transparent-test-bytes'); }
        if (received.includes('transparent-test-bytes')) { clearTimeout(timer); socket.destroy(); resolve(received); }
      });
    });
    assert.match(result, /101 Switching Protocols/); assert.match(result, /s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
    assert.equal(b.state.path, '/api/rooms/BB000001/input'); assert.equal(b.state.headers.origin, b.url); assert.equal(b.state.headers['x-worker-secret'], secret);
  } finally { await g.close(); await a.close(); await b.close(); }
});

test('unhealthy workers and explicit exclusions are skipped for fresh placement', async () => {
  const a = await worker('AA'), b = await worker('BB'), g = await gateway([a.config, b.config], { probeTimeoutMs: 50 });
  try {
    const excluded = await post(g.url, '/api/rooms/placement', { excludeWorkers: ['AA'] }); assert.equal((await excluded.json()).workerId, 'BB');
    await a.close();
    const healthy = await post(g.url, '/api/rooms/placement', {}); assert.equal((await healthy.json()).workerId, 'BB');
  } finally { await g.close(); if (a.server.listening) await a.close(); await b.close(); }
});

test('HTTP and WebSocket handshakes time out without migration; foreign upgrades are rejected', async () => {
  let upgrades=0;
  const stalled=await listen(req=>{req.resume();});
  stalled.server.on('upgrade',()=>{upgrades++;});
  const g=await gateway([{id:'AA',url:stalled.url}],{requestTimeoutMs:40});
  async function upgrade(origin:string){
    const url=new URL(g.url);
    return await new Promise<string>((resolve,reject)=>{
      const socket=connect(Number(url.port),url.hostname);let result='';
      const timer=setTimeout(()=>{socket.destroy();reject(Error('Expected bounded handshake'));},1000);
      socket.on('error',reject);
      socket.on('connect',()=>socket.write(`GET /api/rooms/AA000001/input HTTP/1.1\r\nHost: ${url.host}\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`));
      socket.on('data',chunk=>{result+=chunk.toString();});
      socket.on('end',()=>{clearTimeout(timer);socket.destroy();resolve(result);});
    });
  }
  try{
    const response=await post(g.url,'/api/rooms',{idempotencyKey:'AA_timeout-same-worker'});
    assert.equal(response.status,503);assert.equal((await response.json()).admitted,null);
    assert.match(await upgrade('https://attacker.invalid'),/403 Forbidden/);assert.equal(upgrades,0);
    assert.match(await upgrade(g.url),/503 Service Unavailable/);assert.equal(upgrades,1);
  }finally{await g.close();await stalled.close();}
});

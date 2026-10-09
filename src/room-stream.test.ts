import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStreamChannel, RoomStreamError, RoomStreamRetryPolicy, roomTransportFor } from './room-stream.ts';
import { RoomService } from '../server/rooms.ts';

class FakeWebSocket {
  static OPEN = 1;
  static sockets: FakeWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readonly url: URL;
  constructor(url: URL) { this.url = url; FakeWebSocket.sockets.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  send(data: string) { if (this.readyState !== 1) throw Error('Socket closed'); this.sent.push(JSON.parse(data)); }
  close(code = 1000, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
}
function fixture(t: TestContext) {
  const descriptors = ['WebSocket', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: FakeWebSocket });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://game.example/?room=AB123456') });
  FakeWebSocket.sockets = [];
  t.after(() => { for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const channel = new RoomStreamChannel(); t.after(() => channel.close());
  return channel;
}
const newest = () => FakeWebSocket.sockets.at(-1)!;

test('stalled handshakes reach fallback even when the watchdog recreates the listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const channel = fixture(t), retry = new RoomStreamRetryPolicy(), session = 'AB123456:1:private-claim';
  assert.equal(retry.useDuplex(session, 'duplex-v2'), true);
  const first = channel.listen('AB123456', 'private-claim', 1, new AbortController().signal, () => {});
  const rejected = assert.rejects(first, /timed out/);
  t.mock.timers.tick(5000); await rejected; retry.failed(session);

  // A fresh listen loop at the six-second watchdog keeps this session's failure.
  t.mock.timers.tick(1000);
  assert.equal(retry.useDuplex(session, 'duplex-v2'), true);
  const second = channel.listen('AB123456', 'private-claim', 1, new AbortController().signal, () => {});
  const secondRejected = assert.rejects(second, /timed out/);
  t.mock.timers.tick(5000); await secondRejected; retry.failed(session);
  assert.equal(retry.useDuplex(session, 'duplex-v2'), false, 'working HTTP/SSE must now be selected');
  assert.equal(retry.useDuplex(session, 'duplex-v2'), false, 'another watchdog restart cannot re-enable failed duplex');
  assert.equal(FakeWebSocket.sockets.length, 2);
});

test('authenticated sockets with no room frame also exhaust the watchdog retry budget', async t => {
  const channel = fixture(t), retry = new RoomStreamRetryPolicy(), session = 'room:1:claim';
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(retry.useDuplex(session, 'duplex-v2'), true);
    const controller = new AbortController(), waiting = channel.listen('AB123456', 'claim', 1, controller.signal, () => {});
    newest().open(); newest().message({ type: 'ready' });
    // Authentication alone is not a successful state connection.
    retry.failed(session); controller.abort(); await waiting;
  }
  assert.equal(retry.useDuplex(session, 'duplex-v2'), false);
});

test('new claims reset retry state and older-server admission chooses SSE immediately', () => {
  const retry = new RoomStreamRetryPolicy();
  assert.equal(retry.useDuplex('room:1:claim', roomTransportFor({ transport: 'duplex-v2' })), true);
  retry.failed('room:1:claim'); retry.failed('room:1:claim');
  assert.equal(retry.useDuplex('room:1:claim', 'duplex-v2'), false);
  assert.equal(retry.useDuplex('room:2:claim', 'duplex-v2'), true);
  retry.failed('room:1:claim');
  assert.equal(retry.useDuplex('room:2:claim', 'duplex-v2'), true, 'a stale generation cannot poison the new claim');
  assert.equal(retry.useDuplex('other-room:1:other-claim', roomTransportFor({})), false, 'legacy admission must not inherit an old duplex preference');
});

test('duplex claims privately, acknowledges snapshots immediately and batches later frames', async t => {
  const channel = fixture(t), controller = new AbortController(), service = new RoomService();
  const session = service.create({}, 1000), received: unknown[] = [];
  const waiting = channel.listen(session.room.code, session.token, session.generation, controller.signal, room => received.push(room));
  const socket = newest(); assert.equal(socket.url.protocol, 'wss:'); assert.equal(socket.url.href.includes(session.token), false);
  socket.open(); assert.deepEqual(socket.sent[0], { type: 'claim', token: session.token, generation: session.generation });
  socket.message({ type: 'ready' }); socket.message({ v: 2, type: 'snapshot', room: session.room, deliveryId: 1 });
  assert.deepEqual(socket.sent[1], { type: 'ack', deliveryId: 1 });
  for (let deliveryId = 2; deliveryId <= 6; deliveryId++) socket.message({ v: 2, type: 'heartbeat', code: session.room.code, roundId: null, serverNow: 1000 + deliveryId, deliveryId });
  assert.equal(received.length, 6); assert.deepEqual(socket.sent.at(-1), { type: 'ack', deliveryId: 6 });
  assert.ok(socket.sent.filter(message => message.type === 'ack').length < 6, 'ACKs do not mirror every racing update');
  socket.bufferedAmount = 16385;
  assert.equal(channel.send({ type: 'input', sequence: 1, input: { throttle: 1, brake: 0, steer: 0, boost: false, drift: false } }), false);
  controller.abort(); await waiting;
});

test('terminal claim errors preserve their code and aborting an old listener leaves a new one usable', async t => {
  const channel = fixture(t);
  const old = new AbortController(), waiting = channel.listen('AB123456', 'claim', 1, old.signal, () => {});
  newest().open(); newest().message({ type: 'ready' }); old.abort(); await waiting;
  const current = new AbortController(), active = channel.listen('AB123456', 'claim', 2, current.signal, () => {});
  newest().open(); newest().message({ type: 'ready' }); old.abort();
  assert.equal(channel.send({ type: 'input', sequence: 2, input: { throttle: 0, brake: 0, steer: 0, boost: false, drift: false } }), true);
  const rejected = assert.rejects(active, error => error instanceof RoomStreamError && error.code === 'SESSION_TAKEN_OVER');
  newest().message({ type: 'error', code: 'SESSION_TAKEN_OVER', error: 'Another tab owns this racer.' });
  await rejected;
});

test('diagnostics distinguish invalid frames from browser callback failures without exposing data', async t => {
  for (const operation of ['decode', 'receive'] as const) await t.test(operation, async t => {
    const channel = fixture(t), warning = t.mock.method(console, 'warn', () => {}), service = new RoomService();
    const session = service.create({ name: 'Private player' }, 1000);
    let received = false;
    const waiting = channel.listen(session.room.code, session.token, session.generation, new AbortController().signal, () => {
      received = true; throw new TypeError('Private profile or browser details');
    });
    const rejected = assert.rejects(waiting, error => error instanceof RoomStreamError && error.message === 'Invalid room update.');
    newest().open(); newest().message({ type: 'ready' });
    newest().message(operation === 'decode' ? { v: 2, type: 'tick', private: session.token } : { v: 2, type: 'snapshot', room: session.room });
    await rejected;
    assert.equal(received, operation === 'receive');
    assert.deepEqual(warning.mock.calls.map(call => call.arguments), [['Multiplayer stream diagnostic', { operation, errorName: operation === 'receive' ? 'TypeError' : 'Error' }]]);
  });
});

test('diagnostics allowlist error names and report socket close codes without close reasons', async t => {
  const channel = fixture(t), warning = t.mock.method(console, 'warn', () => {}), service = new RoomService();
  const session = service.create({}, 1000);
  const first = channel.listen(session.room.code, session.token, session.generation, new AbortController().signal, () => {
    const error = new Error('private message'); error.name = 'private-name'; throw error;
  });
  const firstRejected = assert.rejects(first, /Invalid room update/);
  newest().open(); newest().message({ type: 'ready' }); newest().message({ v: 2, type: 'snapshot', room: session.room });
  await firstRejected;
  const second = channel.listen(session.room.code, session.token, session.generation, new AbortController().signal, () => {});
  const secondRejected = assert.rejects(second, /interrupted/);
  newest().open(); newest().close(1013, 'private reason'); await secondRejected;
  assert.deepEqual(warning.mock.calls.map(call => call.arguments), [
    ['Multiplayer stream diagnostic', { operation: 'receive', errorName: 'UnknownError' }],
    ['Multiplayer stream diagnostic', { operation: 'socket-close', code: 1013 }],
  ]);
});

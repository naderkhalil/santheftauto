import type { RoomCommand, RoomSnapshot } from './multiplayer-protocol';
import { RoomWireDecoder } from './room-wire.ts';

export type RoomTransport = 'sse' | 'duplex-v2';
export const roomTransportFor = (admission: { transport?: unknown }): RoomTransport => admission.transport === 'duplex-v2' ? 'duplex-v2' : 'sse';

/** Watchdog restarts belong to the same session and must not erase failed attempts. */
export class RoomStreamRetryPolicy {
  private session = '';
  private failures = 0;
  useDuplex(session: string, transport: RoomTransport): boolean {
    if (session !== this.session) { this.session = session; this.failures = 0; }
    return transport === 'duplex-v2' && this.failures < 2;
  }
  failed(session: string): void { if (session === this.session) this.failures = Math.min(2, this.failures + 1); }
  received(session: string): void { if (session === this.session) this.failures = 0; }
}

export class RoomStreamError extends Error {
  code: string;
  constructor(message: string, code = '') { super(message); this.code = code; }
}

function diagnoseFrameFailure(operation: 'decode' | 'receive' | 'ack', error: unknown) {
  const name = error instanceof Error ? error.name : '';
  const errorName = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError'].includes(name) ? name : 'UnknownError';
  // Exception messages and frame contents can include private room/player data.
  console.warn('Multiplayer stream diagnostic', { operation, errorName });
}

/** One authenticated duplex connection; the room actor can sleep in idle lobbies. */
export class RoomStreamChannel {
  private socket: WebSocket | null = null;
  private ready = false;
  private stop: (() => void) | null = null;

  listen(code: string, token: string, generation: number, signal: AbortSignal, receive: (room: RoomSnapshot) => void): Promise<void> {
    this.close();
    return new Promise((resolve, reject) => {
      if (signal.aborted) { resolve(); return; }
      const url = new URL(`/api/rooms/${code}/socket?wire=v2`, location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url), decoder = new RoomWireDecoder();
      this.socket = socket;
      let settled = false, framesSinceAck = 0, lastAckAt = 0;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); signal.removeEventListener('abort', cancel);
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        if (this.socket === socket) { this.socket = null; this.ready = false; this.stop = null; }
        socket.close();
        if (error) reject(error); else resolve();
      };
      const cancel = () => finish();
      const timeout = setTimeout(() => finish(new RoomStreamError('The room connection timed out.')), 5000);
      this.stop = cancel;
      signal.addEventListener('abort', cancel, { once: true });
      socket.onopen = () => socket.send(JSON.stringify({ type: 'claim', token, generation }));
      socket.onmessage = event => {
        let operation: 'decode' | 'receive' | 'ack' = 'decode';
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'error' || message.event === 'room-error') {
            finish(new RoomStreamError(message.error || 'The room connection closed.', message.code || '')); return;
          }
          if (message.type === 'ready') { this.ready = true; clearTimeout(timeout); return; }
          if (!this.ready) throw new RoomStreamError('The room connection was not authenticated.');
          const room = decoder.apply(message);
          operation = 'receive'; receive(room);
          operation = 'ack';
          if (Number.isSafeInteger(message.deliveryId) && message.deliveryId > 0) {
            framesSinceAck++;
            if (message.type === 'snapshot' || framesSinceAck >= 5 || performance.now() - lastAckAt >= 500) {
              socket.send(JSON.stringify({ type: 'ack', deliveryId: message.deliveryId }));
              framesSinceAck = 0; lastAckAt = performance.now();
            }
          }
        } catch (error) {
          diagnoseFrameFailure(operation, error);
          finish(error instanceof RoomStreamError ? error : new RoomStreamError('Invalid room update.'));
        }
      };
      socket.onerror = () => finish(new RoomStreamError('The room connection was interrupted.'));
      socket.onclose = event => {
        console.warn('Multiplayer stream diagnostic', { operation: 'socket-close', code: event.code });
        finish(new RoomStreamError('The room connection was interrupted.'));
      };
    });
  }

  send(command: Extract<RoomCommand, { type: 'input' }>): boolean {
    if (!this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 16384) return false;
    try { this.socket.send(JSON.stringify(command)); return true; }
    catch { this.close(); return false; }
  }

  close() { this.stop?.(); }
}

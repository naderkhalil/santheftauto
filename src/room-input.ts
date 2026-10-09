import type { RoomCommand } from './multiplayer-protocol';

/** Fast controls with HTTP fallback; credentials never appear in a URL. */
export class RoomInputChannel {
  private socket: WebSocket | null = null;
  private session = '';
  private ready = false;
  private retryAt = 0;
  private failures = 0;
  constructor(private onTerminalError: (code: string, message: string) => void) {}
  send(code: string, token: string, generation: number, command: Extract<RoomCommand, { type: 'input' }>) {
    const session = `${code}:${generation}:${token}`;
    if (session !== this.session) { this.close(); this.session = session; }
    if (!this.socket && performance.now() >= this.retryAt) this.connect(code, token, generation, session);
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 16384) return false;
    try { this.socket.send(JSON.stringify(command)); return true; }
    catch { this.socket.close(); return false; }
  }
  private connect(code: string, token: string, generation: number, session: string) {
    try {
      const url = new URL(`/api/rooms/${code}/input`, location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url); this.socket = socket;
      const timeout = setTimeout(() => { if (!this.ready && this.socket === socket) socket.close(); }, 5000);
      socket.onopen = () => { if (this.socket === socket) socket.send(JSON.stringify({ type: 'claim', token, generation })); };
      socket.onmessage = event => {
        if (this.socket !== socket || session !== this.session) return;
        try {
          const data = JSON.parse(String(event.data));
          if (data.type === 'ready') { this.ready = true; this.failures = 0; clearTimeout(timeout); }
          if (data.type === 'error') {
            socket.close();
            if (['SESSION_TAKEN_OVER', 'REMOVED_FROM_ROOM', 'SESSION_EXPIRED', 'ROOM_EXPIRED'].includes(data.code)) this.onTerminalError(data.code, data.error);
          }
        } catch { socket.close(); }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        clearTimeout(timeout);
        if (this.socket !== socket) return;
        this.socket = null; this.ready = false;
        this.retryAt = performance.now() + Math.min(15000, 1000 * 2 ** Math.min(4, this.failures++)) + Math.random() * 500;
      };
    } catch { this.socket = null; this.retryAt = performance.now() + 15000; }
  }
  close() {
    const socket = this.socket; this.socket = null; this.session = ''; this.ready = false; this.failures = 0; this.retryAt = 0;
    if (socket) { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; socket.close(); }
  }
}

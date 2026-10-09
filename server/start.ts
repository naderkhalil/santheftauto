import { createGameServer } from './app.ts';
import { runtimeConfig } from './runtime-config.ts';

const config = runtimeConfig(), app = createGameServer(config);
app.server.listen(config.port, config.host, () => console.log(JSON.stringify({ event: 'room_server_started', role: config.role, port: config.port, version: config.version })));
let stopping = false, forced = false;
async function shutdown() {
  if (stopping) { forced = true; await app.close(); return; }
  stopping = true; app.drain();
  const deadline = Date.now() + config.drainTimeoutMs;
  console.log(JSON.stringify({ event: 'room_server_draining', role: config.role, timeoutMs: config.drainTimeoutMs }));
  // A gateway keeps forwarding existing room streams while its load balancer
  // removes it. A worker finishes active races before closing in-memory state.
  while (!forced && Date.now() < deadline && (config.role === 'gateway' || (app.service?.getHealth().activeRaces ?? 0) > 0)) await new Promise(resolve => setTimeout(resolve, Math.min(250, Math.max(1, deadline - Date.now()))));
  await app.close();
  console.log(JSON.stringify({ event: 'room_server_stopped', role: config.role }));
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void shutdown().catch(() => { process.exitCode = 1; void app.close(); }); });

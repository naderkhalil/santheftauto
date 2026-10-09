import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// A dedicated local cluster, separate from the normal development preview.
const secret = randomBytes(32).toString('hex');
const services = [
  { SERVER_ROLE: 'worker', ROOM_WORKER_ID: '00', PORT: '4101' },
  { SERVER_ROLE: 'worker', ROOM_WORKER_ID: '01', PORT: '4102' },
  { SERVER_ROLE: 'gateway', PORT: '4100', ROOM_WORKER_00: '127.0.0.1:4101', ROOM_WORKER_01: '127.0.0.1:4102' },
];
const children = services.map(env => spawn(process.execPath, ['--experimental-strip-types', 'server/start.ts'], {
  stdio: 'inherit', env: { ...process.env, ...env, HOST: '127.0.0.1', WORKER_SECRET: secret, DRAIN_TIMEOUT_MS: '1000' },
}));
let stopping = false;
function stop() { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => { if (!stopping) { process.exitCode = code || 1; stop(); } }));
console.log('Local cluster: http://127.0.0.1:4100 (workers 4101, 4102). Stop with Ctrl+C.');

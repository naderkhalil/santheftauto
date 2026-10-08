import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { COURSE_VERSION } from '../src/multiplayer-protocol.ts';
import { RoomService, RoomError } from './rooms.ts';
import { createRoomApi } from './http.ts';
import { DemoAutopilot } from '../src/autopilot.ts';
import { DEFAULT_PROFILE, normalizeProfile } from '../src/racer-profile.ts';
const setup=()=>{const service=new RoomService(),a=service.create(DEFAULT_PROFILE,1000),b=service.join(a.room.code,{...DEFAULT_PROFILE,name:'Guest'},1000);return {service,a,b,code:a.room.code};};
const ready=(service:RoomService,code:string,token:string,now=1000)=>{service.command(code,token,{type:'selection',status:'car',courseVersion:COURSE_VERSION},now);service.command(code,token,{type:'ready',ready:true,profileRevision:service.auth(code,token).player.profileRevision,courseVersion:COURSE_VERSION},now);};
const start=(s:ReturnType<typeof setup>)=>{for(const p of [s.a,s.b])ready(s.service,s.code,p.token);s.service.command(s.code,s.a.token,{type:'start'},1000);};
test('room authorization, readiness and cosmetic locking',()=>{
  const s=setup();assert.throws(()=>s.service.command(s.code,'bad',{type:'start'},1000),/session/);
  assert.throws(()=>s.service.command(s.code,s.b.token,{type:'start'},1000),/host/);
  assert.throws(()=>s.service.command(s.code,s.a.token,{type:'start'},1000),/ready/);
  start(s);assert.equal(s.service.room(s.code).startAt,6000);
  assert.throws(()=>s.service.join(s.code,DEFAULT_PROFILE,2000),/started/);
  assert.throws(()=>s.service.command(s.code,s.b.token,{type:'profile',profile:DEFAULT_PROFILE,revision:1},2000),/locked/);
  const serialized=JSON.stringify(s.service.snapshot(s.service.room(s.code),2000));assert.ok(!serialized.includes(s.a.token));
});
test('capacity, input validation and duplicate/out-of-order input protection',()=>{
  const s=setup();for(let i=0;i<6;i++)s.service.join(s.code,DEFAULT_PROFILE,1000);
  assert.throws(()=>s.service.join(s.code,DEFAULT_PROFILE,1000),/8 players/);
  const input={throttle:1,brake:0,steer:0,drift:false,boost:false};
  s.service.command(s.code,s.a.token,{type:'input',sequence:2,input},1000);
  s.service.command(s.code,s.a.token,{type:'input',sequence:1,input:{...input,throttle:0}},1000);
  assert.equal(s.service.auth(s.code,s.a.token).player.input.throttle,1);
  assert.throws(()=>s.service.command(s.code,s.a.token,{type:'input',sequence:3,input:{...input,steer:NaN}},1000),/Invalid/);
  assert.equal(normalizeProfile({name:'<bad>\n',car:'unknown'}).name,'bad');
  assert.equal(normalizeProfile({car:'unknown'}).car,'sundrop');
});
test('countdown is shared; clients cannot submit positions, checkpoints or results',()=>{
  const s=setup();start(s);s.service.tick(5900);assert.equal(s.service.room(s.code).phase,'countdown');
  const input={throttle:1,brake:0,steer:0,drift:false,boost:false};
  for(const p of [s.a,s.b])s.service.command(s.code,p.token,{type:'input',sequence:1,input},5990);
  s.service.tick(6050);const room=s.service.snapshot(s.service.room(s.code),6050);
  assert.equal(room.phase,'racing');assert.equal(room.players[0].state.elapsed,room.players[1].state.elapsed);
  assert.throws(()=>s.service.command(s.code,s.a.token,{type:'finish',time:1} as never,6100),/Unknown/);
  assert.equal(room.players[0].finishTime,null);
});
test('recovery preserves authoritative timing; stale inputs stop and host migrates',()=>{
  const s=setup();start(s);
  for(let now=6000;now<=8000;now+=50){for(const p of [s.a,s.b]){s.service.touch(s.code,p.token,now);s.service.command(s.code,p.token,{type:'input',sequence:now,input:{throttle:1,brake:0,steer:0,drift:false,boost:false}},now);}s.service.tick(now);}
  const player=s.service.auth(s.code,s.a.token).player,before=player.sim.state.elapsed;
  s.service.command(s.code,s.a.token,{type:'recover'},8001);assert.equal(player.sim.state.elapsed,before);
  s.service.touch(s.code,s.b.token,17000);s.service.tick(17000);assert.equal(s.service.room(s.code).host,s.b.id);assert.equal(player.connected,false);assert.equal(player.input.throttle,0);
});
test('two server-driven cars can finish a full race and rematch',()=>{
  const s=setup();start(s);const pilots=[new DemoAutopilot(),new DemoAutopilot()];
  for(let now=6000;now<150000&&s.service.room(s.code).phase!=='results';now+=50){
    [s.a,s.b].forEach((p,i)=>{s.service.touch(s.code,p.token,now);const player=s.service.auth(s.code,p.token).player;s.service.command(s.code,p.token,{type:'input',sequence:now,input:pilots[i].input(player.sim.state)},now);});s.service.tick(now);
  }
  const room=s.service.snapshot(s.service.room(s.code));assert.equal(room.phase,'results');
  for(const p of room.players){assert.ok(p.finishTime!==null);assert.equal(p.state.checkpoint,4);assert.equal(p.dnf,false);}
  assert.throws(()=>s.service.command(s.code,s.b.token,{type:'rematch'},s.service.room(s.code).lastTick+1),/host/);
  s.service.command(s.code,s.a.token,{type:'rematch'},s.service.room(s.code).lastTick+1);assert.equal(s.service.room(s.code).phase,'lobby');assert.ok([...s.service.room(s.code).players.values()].every(p=>!p.ready));
});
test('abandoned racers become DNF, room closes, and sessions can reconnect before grace expires',()=>{
  const s=setup();start(s);s.service.disconnect(s.code,s.a.token,6000);s.service.touch(s.code,s.a.token,7000);assert.equal(s.service.auth(s.code,s.a.token).player.connected,true);
  const room=s.service.room(s.code);s.service.tick(40000);assert.equal(room.phase,'results');assert.ok(room.results!.entries.every(p=>p.dnfReason==='disconnected'));assert.equal(s.service.rooms.size,0);
});
test('HTTP transport isolates room tokens, rejects foreign origins, and streams snapshots',async()=>{
  const api=createRoomApi(),server=createServer((req,res)=>void api.handler(req,res));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}`;
  const post=(path:string,body:unknown,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    const foreign=await post('/api/rooms',{}, {Origin:'https://evil.invalid'});assert.equal(foreign.status,403);
    const created=await (await post('/api/rooms',{profile:DEFAULT_PROFILE})).json();
    const unauthorized=await post(`/api/rooms/${created.room.code}/command`,{type:'start'});assert.equal(unauthorized.status,401);
    const abort=new AbortController();const stream=await fetch(`${base}/api/rooms/${created.room.code}/events`,{headers:{Authorization:'Bearer '+created.token,'X-Room-Generation':String(created.generation)},signal:abort.signal});
    assert.equal(stream.headers.get('content-type'),'text/event-stream');const chunk=await stream.body!.getReader().read();const text=new TextDecoder().decode(chunk.value);assert.ok(text.includes(created.id));assert.ok(!text.includes(created.token));abort.abort();
  }finally{api.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('eight racers have unique grid slots and all complete a server-simulated race',()=>{
  const s=setup(),racers=[s.a,s.b];for(let i=2;i<8;i++)racers.push(s.service.join(s.code,{...DEFAULT_PROFILE,name:`Racer ${i}`},1000));
  for(const p of racers)ready(s.service,s.code,p.token);s.service.command(s.code,s.a.token,{type:'start'},1000);
  const slots=s.service.snapshot(s.service.room(s.code),1000).players.map(p=>`${p.position.x},${p.position.z}`);assert.equal(new Set(slots).size,8);
  const pilots=racers.map(()=>new DemoAutopilot());
  for(let now=6000;now<150000&&s.service.room(s.code).phase!=='results';now+=50){racers.forEach((p,i)=>{s.service.touch(s.code,p.token,now);s.service.command(s.code,p.token,{type:'input',sequence:now,input:pilots[i].input(s.service.auth(s.code,p.token).player.sim.state)},now);});s.service.tick(now);}
  const room=s.service.snapshot(s.service.room(s.code));assert.equal(room.phase,'results');assert.ok(room.players.every(p=>p.finishTime!==null&&!p.dnf&&p.state.checkpoint===4));
});

test('live founder selections reach both racers and changing a pick clears readiness',()=>{
  const s=setup();ready(s.service,s.code,s.a.token,1200);
  s.service.command(s.code,s.a.token,{type:'profile',profile:{...DEFAULT_PROFILE,name:'Host',driver:'jensen'},revision:1},1250);
  s.service.command(s.code,s.b.token,{type:'profile',profile:{...DEFAULT_PROFILE,name:'Friend',driver:'dario'},revision:1},1300);
  const snapshot=s.service.snapshot(s.service.room(s.code),1400);
  assert.equal(snapshot.players.find(p=>p.id===s.a.id)?.profile.driver,'jensen');
  assert.equal(snapshot.players.find(p=>p.id===s.b.id)?.profile.driver,'dario');
  assert.equal(snapshot.players.find(p=>p.id===s.a.id)?.ready,false);
});

test('HTTP admission retries, controller takeover, heartbeats and removals have stable contracts', async () => {
  const api = createRoomApi(), server = createServer((req, res) => void api.handler(req, res));
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const post = (path: string, body: unknown, token = '', generation?: number) => fetch(base + '/api/rooms' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(generation ? { 'X-Room-Generation': String(generation) } : {}) }, body: JSON.stringify(body) });
  const controllers: AbortController[] = [];
  try {
    const host = await (await post('', { profile: DEFAULT_PROFILE, idempotencyKey: 'http-create-key' })).json();
    const retry = await (await post('', { profile: DEFAULT_PROFILE, idempotencyKey: 'http-create-key' })).json();
    assert.equal(retry.token, host.token); assert.equal(api.service.rooms.size, 1);
    const guest = await (await post('/' + host.room.code + '/join', { profile: DEFAULT_PROFILE, idempotencyKey: 'http-join-key' })).json();
    const guestRetry = await (await post('/' + host.room.code + '/join', { profile: DEFAULT_PROFILE, idempotencyKey: 'http-join-key' })).json();
    assert.equal(guest.id, guestRetry.id); assert.equal(api.service.room(host.room.code).players.size, 2);
    const commandPath = '/' + host.room.code + '/command';
    const missing = await post(commandPath, { type: 'heartbeat' }, host.token);
    assert.equal(missing.status, 401); assert.equal((await missing.json()).code, 'SESSION_CLAIM_REQUIRED');
    const controller = new AbortController(); controllers.push(controller);
    const stream = await fetch(base + '/api/rooms/' + host.room.code + '/events', { headers: { Authorization: 'Bearer ' + host.token, 'X-Room-Generation': String(host.generation) }, signal: controller.signal });
    const reader = stream.body!.getReader(); await reader.read();
    const claimed = await (await post('/' + host.room.code + '/claim', {}, host.token)).json();
    assert.equal(claimed.generation, host.generation + 1);
    const oldHeartbeat = await post(commandPath, { type: 'heartbeat' }, host.token, host.generation);
    assert.equal(oldHeartbeat.status, 409); assert.equal((await oldHeartbeat.json()).code, 'SESSION_TAKEN_OVER');
    const oldStream = await fetch(base + '/api/rooms/' + host.room.code + '/events', { headers: { Authorization: 'Bearer ' + host.token, 'X-Room-Generation': String(host.generation) } });
    assert.equal(oldStream.status, 409); assert.equal((await oldStream.json()).code, 'SESSION_TAKEN_OVER');
    const heartbeat = await post(commandPath, { type: 'heartbeat' }, host.token, claimed.generation);
    assert.equal(heartbeat.status, 200); assert.ok(Number.isFinite((await heartbeat.json()).serverNow));
    controller.abort();
    assert.equal(api.service.auth(host.room.code, host.token).player.connected, true);
    const removal = await post(commandPath, { type: 'remove', playerId: guest.id }, host.token, claimed.generation);
    assert.equal(removal.status, 200);
    const removed = await post(commandPath, { type: 'heartbeat' }, guest.token, guest.generation);
    assert.equal(removed.status, 401); assert.equal((await removed.json()).code, 'REMOVED_FROM_ROOM');
  } finally {
    for (const controller of controllers) controller.abort();
    api.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('streaming server output does not substitute for a client heartbeat', async () => {
  const api = createRoomApi(), server = createServer((req, res) => void api.handler(req, res));
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const host = api.service.create(DEFAULT_PROFILE), controller = new AbortController();
  try {
    const stream = await fetch(base + '/api/rooms/' + host.room.code + '/events', { headers: { Authorization: 'Bearer ' + host.token, 'X-Room-Generation': String(host.generation) }, signal: controller.signal });
    const reader = stream.body!.getReader(); await reader.read();
    api.service.auth(host.room.code, host.token).player.lastSeen = Date.now() - 9000;
    const chunk = await reader.read();
    assert.ok(new TextDecoder().decode(chunk.value).includes('"connected":false'));
    assert.equal(api.service.auth(host.room.code, host.token).player.ready, false);
  } finally {
    controller.abort(); api.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

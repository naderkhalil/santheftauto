import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RoomService } from './rooms.ts';
import { createRoomApi } from './http.ts';
import { DemoAutopilot } from '../src/autopilot.ts';
import { DEFAULT_PROFILE, normalizeProfile } from '../src/racer-profile.ts';
const setup=()=>{const service=new RoomService(),a=service.create(DEFAULT_PROFILE,1000),b=service.join(a.room.code,{...DEFAULT_PROFILE,name:'Guest'},1000);return {service,a,b,code:a.room.code};};
const start=(s:ReturnType<typeof setup>)=>{for(const p of [s.a,s.b])s.service.command(s.code,p.token,{type:'ready',ready:true},1000);s.service.command(s.code,s.a.token,{type:'start'},1000);};
test('room authorization, readiness and cosmetic locking',()=>{
  const s=setup();assert.throws(()=>s.service.command(s.code,'bad',{type:'start'}),/session/);
  assert.throws(()=>s.service.command(s.code,s.b.token,{type:'start'},1000),/host/);
  assert.throws(()=>s.service.command(s.code,s.a.token,{type:'start'},1000),/ready/);
  start(s);assert.equal(s.service.room(s.code).startAt,6000);
  assert.throws(()=>s.service.join(s.code,DEFAULT_PROFILE,2000),/started/);
  assert.throws(()=>s.service.command(s.code,s.b.token,{type:'profile',profile:DEFAULT_PROFILE},2000),/locked/);
  const serialized=JSON.stringify(s.service.snapshot(s.service.room(s.code),2000));assert.ok(!serialized.includes(s.a.token));
});
test('capacity, input validation and duplicate/out-of-order input protection',()=>{
  const s=setup();for(let i=0;i<6;i++)s.service.join(s.code,DEFAULT_PROFILE,1000);
  assert.throws(()=>s.service.join(s.code,DEFAULT_PROFILE,1000),/full/);
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
  assert.throws(()=>s.service.command(s.code,s.b.token,{type:'rematch'}),/host/);
  s.service.command(s.code,s.a.token,{type:'rematch'});assert.equal(s.service.room(s.code).phase,'lobby');assert.ok([...s.service.room(s.code).players.values()].every(p=>!p.ready));
});
test('abandoned racers become DNF, room closes, and sessions can reconnect before grace expires',()=>{
  const s=setup();start(s);s.service.disconnect(s.code,s.a.token);s.service.touch(s.code,s.a.token,7000);assert.equal(s.service.auth(s.code,s.a.token).player.connected,true);
  s.service.tick(40000);assert.equal(s.service.room(s.code).phase,'results');assert.ok([...s.service.room(s.code).players.values()].every(p=>p.dnf));
  s.service.tick(40001);assert.equal(s.service.rooms.size,0);
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
    const abort=new AbortController();const stream=await fetch(`${base}/api/rooms/${created.room.code}/events`,{headers:{Authorization:'Bearer '+created.token},signal:abort.signal});
    assert.equal(stream.headers.get('content-type'),'text/event-stream');const chunk=await stream.body!.getReader().read();const text=new TextDecoder().decode(chunk.value);assert.ok(text.includes(created.id));assert.ok(!text.includes(created.token));abort.abort();
  }finally{api.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('eight racers have unique grid slots and all complete a server-simulated race',()=>{
  const s=setup(),racers=[s.a,s.b];for(let i=2;i<8;i++)racers.push(s.service.join(s.code,{...DEFAULT_PROFILE,name:`Racer ${i}`},1000));
  for(const p of racers)s.service.command(s.code,p.token,{type:'ready',ready:true},1000);s.service.command(s.code,s.a.token,{type:'start'},1000);
  const slots=s.service.snapshot(s.service.room(s.code),1000).players.map(p=>`${p.position.x},${p.position.z}`);assert.equal(new Set(slots).size,8);
  const pilots=racers.map(()=>new DemoAutopilot());
  for(let now=6000;now<150000&&s.service.room(s.code).phase!=='results';now+=50){racers.forEach((p,i)=>{s.service.touch(s.code,p.token,now);s.service.command(s.code,p.token,{type:'input',sequence:now,input:pilots[i].input(s.service.auth(s.code,p.token).player.sim.state)},now);});s.service.tick(now);}
  const room=s.service.snapshot(s.service.room(s.code));assert.equal(room.phase,'results');assert.ok(room.players.every(p=>p.finishTime!==null&&!p.dnf&&p.state.checkpoint===4));
});

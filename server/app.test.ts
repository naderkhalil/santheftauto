import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from './app.ts';
import { runtimeConfig } from './runtime-config.ts';

const secret='app-integration-worker-secret-1234567890', ops='app-integration-operations-token';
type App=Awaited<ReturnType<typeof launch>>;
async function launch(env:Record<string,string>={}){
  const app=createGameServer(runtimeConfig({PORT:'0',HOST:'127.0.0.1',WORKER_SECRET:secret,OPS_TOKEN:ops,...env}));
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const address=app.server.address();if(!address||typeof address==='string')throw Error('No application listener');
  return {...app,url:`http://127.0.0.1:${address.port}`};
}
const post=(app:App,path:string,body:unknown,headers={})=>fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const auth=(session:{token:string;generation:number})=>({Authorization:'Bearer '+session.token,'X-Room-Generation':String(session.generation)});
async function jsonCreate(app:App,workerId?:string){
  const headers=workerId?{'X-Worker-Secret':secret}:{};
  const placement=await(await post(app,'/api/rooms/placement',{},headers)).json();
  const response=await post(app,'/api/rooms',{profile:{name:'Private test racer'},idempotencyKey:placement.idempotencyKey},headers);
  assert.equal(response.status,201);return await response.json();
}

test('single mode exposes only authenticated operations and optional loopback diagnostics',async()=>{
  const single=await launch(),local=await launch({WORKER_SECRET:'',OPS_TOKEN:''});
  try{
    assert.equal((await fetch(single.url+'/healthz')).status,200);
    assert.equal((await fetch(single.url+'/readyz')).status,200);
    assert.equal((await fetch(single.url+'/ops/metrics')).status,403);
    assert.equal((await post(single,'/ops/drain',{})).status,403);
    assert.equal((await fetch(single.url+'/api/rooms/health')).status,403);
    assert.equal((await fetch(local.url+'/api/rooms/health')).status,200);
    assert.equal((await fetch(local.url+'/ops/metrics')).status,403);
    const session=await jsonCreate(single);
    const report=await(await fetch(single.url+'/ops/metrics',{headers:{Authorization:'Bearer '+ops}})).json();
    assert.equal(report.health.activeRooms,1);assert.equal(report.health.activePlayers,1);
    for(const privateValue of [session.token,session.room.code,'Private test racer'])assert.equal(JSON.stringify(report).includes(privateValue),false);
    const drained=await post(single,'/ops/drain',{}, {Authorization:'Bearer '+ops});assert.equal(drained.status,200);
    assert.equal((await fetch(single.url+'/healthz')).status,200);assert.equal((await fetch(single.url+'/readyz')).status,503);
    const rejected=await post(single,'/api/rooms/placement',{});assert.equal(rejected.status,503);assert.equal((await rejected.json()).admitted,false);
    assert.equal((await post(single,`/api/rooms/${session.room.code}/command`,{type:'heartbeat'},auth(session))).status,200);
  }finally{await single.close();await local.close();}
});

test('private workers require gateway authentication and remain healthy when full',async()=>{
  const worker=await launch({SERVER_ROLE:'worker',ROOM_WORKER_ID:'AA',MAX_ROOMS:'1'});
  try{
    assert.equal((await fetch(worker.url+'/healthz')).status,200);
    assert.equal((await fetch(worker.url+'/api/rooms/health')).status,403);
    assert.equal((await post(worker,'/api/rooms/placement',{})).status,403);
    assert.equal((await fetch(worker.url+'/')).status,403);
    assert.equal((await fetch(worker.url+'/',{headers:{'X-Worker-Secret':secret}})).status,404);
    const session=await jsonCreate(worker,'AA');assert.match(session.room.code,/^AA/);
    const health=await(await fetch(worker.url+'/api/rooms/health',{headers:{'X-Worker-Secret':secret}})).json();
    assert.equal(health.accepting,false);assert.equal(health.availableSlots,0);assert.equal(health.activeRooms,1);assert.equal(health.workerId,'AA');
    assert.equal((await fetch(worker.url+'/readyz',{headers:{'X-Worker-Secret':secret}})).status,200);
    assert.equal((await fetch(worker.url+'/healthz')).status,200);
  }finally{await worker.close();}
});

test('two real workers and gateway share owner state and reject foreign origins',async()=>{
  const a=await launch({SERVER_ROLE:'worker',ROOM_WORKER_ID:'AA',MAX_ROOMS:'1'}),b=await launch({SERVER_ROLE:'worker',ROOM_WORKER_ID:'BB',MAX_ROOMS:'4'});
  const gateway=await launch({SERVER_ROLE:'gateway',ROOM_WORKER_AA:a.url,ROOM_WORKER_BB:b.url});
  try{
    assert.equal((await fetch(gateway.url+'/readyz')).status,200);
    assert.equal((await post(gateway,'/api/rooms/placement',{}, {Origin:'https://foreign.invalid'})).status,403);
    const host=await jsonCreate(gateway);assert.match(host.room.code,/^BB/);assert.equal(a.service!.rooms.size,0);assert.equal(b.service!.rooms.size,1);
    const joined=await post(gateway,`/api/rooms/${host.room.code}/join`,{profile:{name:'Guest'},idempotencyKey:'guest-retry-key'}, {Origin:gateway.url});
    assert.equal(joined.status,201);const guest=await joined.json();assert.equal(guest.room.players.length,2);
    const stream=await fetch(gateway.url+`/api/rooms/${host.room.code}/events?wire=v2`,{headers:auth(guest)});
    assert.equal(stream.status,200);const reader=stream.body!.getReader();const first=await reader.read();assert.ok(first.value!.length>0);await reader.cancel();
    assert.equal((await post(gateway,`/api/rooms/${host.room.code}/command`,{type:'heartbeat'}, {...auth(host),Origin:'https://foreign.invalid'})).status,403);
    const drained=await post(b,'/ops/drain',{}, {Authorization:'Bearer '+ops});assert.equal(drained.status,200);
    assert.equal((await post(gateway,`/api/rooms/${host.room.code}/command`,{type:'heartbeat'},auth(host))).status,200);
    gateway.drain();
    assert.equal((await fetch(gateway.url+'/readyz')).status,503);assert.equal((await fetch(gateway.url+'/healthz')).status,200);
    assert.equal((await post(gateway,'/api/rooms/placement',{})).status,503);
    assert.equal((await post(gateway,`/api/rooms/${host.room.code}/command`,{type:'heartbeat'},auth(host))).status,200);
  }finally{await gateway.close();await a.close();await b.close();}
});

test('real input WebSocket authenticates through the gateway and reaches the owning worker',async()=>{
  const worker=await launch({SERVER_ROLE:'worker',ROOM_WORKER_ID:'AA'}),gateway=await launch({SERVER_ROLE:'gateway',ROOM_WORKER_AA:worker.url});
  let socket:WebSocket|undefined;
  try{
    const host=await jsonCreate(gateway);
    socket=new WebSocket(gateway.url.replace('http:','ws:')+`/api/rooms/${host.room.code}/input`,{origin:gateway.url});
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Input authentication timed out')),2000);
      socket!.on('error',reject);
      socket!.on('open',()=>socket!.send(JSON.stringify({type:'claim',token:host.token,generation:host.generation})));
      socket!.on('message',data=>{const message=JSON.parse(data.toString());if(message.type==='ready'){clearTimeout(timeout);resolve();}else if(message.type==='error'){clearTimeout(timeout);reject(Error(message.error));}});
    });
    socket.send(JSON.stringify({type:'input',sequence:1,input:{throttle:1,brake:0,steer:.25,boost:false,drift:false}}));
    const deadline=Date.now()+1000;while(worker.input!.getMetrics().acceptedInputs<1&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(worker.input!.getMetrics().acceptedInputs,1);assert.equal(worker.service!.auth(host.room.code,host.token).player.input.steer,.25);
    assert.equal(gateway.input,null);assert.equal(gateway.service,null);
  }finally{socket?.terminate();await gateway.close();await worker.close();}
});

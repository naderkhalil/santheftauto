import type { IncomingMessage, ServerResponse } from 'node:http';
import { RoomService, RoomError } from './rooms.ts';
import type { RoomCommand } from '../src/multiplayer-protocol.ts';

/** Same-origin room API. Tokens travel in Authorization, never invite URLs. */
export function createRoomApi(service=new RoomService()) {
  const streams=new Set<{code:string;token:string;response:ServerResponse}>();
  const buckets=new Map<string,{count:number;until:number}>();
  const interval=setInterval(()=>{
    service.tick();
    for(const client of streams)try {
      service.touch(client.code,client.token);
      const data=JSON.stringify(service.snapshot(service.room(client.code)));
      if(client.response.writableLength>256000){client.response.destroy();streams.delete(client);continue;}
      client.response.write(`data: ${data}\n\n`);
    }catch {client.response.end();streams.delete(client);}
    const now=Date.now();for(const [key,bucket] of buckets)if(bucket.until<now)buckets.delete(key);
  },50);
  interval.unref();
  const json=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const handler=async(req:IncomingMessage,res:ServerResponse)=>{
    try {
      const path=(req.url??'').split('?')[0];
      if(!path.startsWith('/api/rooms'))return false;
      // Browsers may only write to the origin serving this game.
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new RoomError('Use the room link on this game’s own website.',403);
      const peer=req.socket.remoteAddress??'unknown';
      const key=peer+(path==='/api/rooms'||path.endsWith('/join')?':join':':play');
      const now=Date.now(),budget=buckets.get(key)??{count:0,until:now+60000};
      if(budget.until<now){budget.count=0;budget.until=now+60000;}buckets.set(key,budget);
      if(++budget.count>(key.endsWith(':join')?60:16000))throw new RoomError('Too many requests. Please wait a moment.',429);
      const match=path.match(/^\/api\/rooms\/([A-F0-9]{8})\/(join|events|command)$/);
      const token=(req.headers.authorization??'').replace(/^Bearer /,'');
      if(match&&match[2]==='events'&&req.method==='GET') {
        service.touch(match[1],token);
        for(const old of streams)if(old.code===match[1]&&old.token===token){old.response.end();streams.delete(old);}
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write(`data: ${JSON.stringify(service.snapshot(service.room(match[1])))}\n\n`);
        const client={code:match[1],token,response:res};streams.add(client);
        res.on('close',()=>{streams.delete(client);if(![...streams].some(c=>c.code===client.code&&c.token===token))service.disconnect(client.code,token);});
        return true;
      }
      if(req.method!=='POST')throw new RoomError('Room endpoint not found.',404);
      if(!(req.headers['content-type']??'').startsWith('application/json'))throw new RoomError('Expected JSON.',415);
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)throw new RoomError('Request too large.',413);}
      let data;try{data=JSON.parse(body||'{}');}catch{throw new RoomError('Invalid JSON.');}
      if(!data||typeof data!=='object')throw new RoomError('Invalid request.');
      if(path==='/api/rooms')json(res,201,service.create(data.profile??{}));
      else if(match&&match[2]==='join')json(res,201,service.join(match[1],data.profile??{}));
      else if(match&&match[2]==='command'){service.command(match[1],token,data as RoomCommand);json(res,200,{ok:true});}
      else throw new RoomError('Room endpoint not found.',404);
      return true;
    }catch(error){if(!res.headersSent)json(res,error instanceof RoomError?error.status:500,{error:error instanceof RoomError?error.message:'The room service had a problem. Try again.'});else res.end();return true;}
  };
  return {handler,service,close(){clearInterval(interval);for(const client of streams)client.response.end();streams.clear();}};
}

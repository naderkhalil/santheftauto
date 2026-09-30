import { randomBytes } from 'node:crypto';
import { DrivingSimulation, type DriveInput } from '../src/driving.ts';
import { routeProgressAt, START_PROGRESS } from '../src/route.ts';
import { normalizeProfile, type RacerProfile } from '../src/racer-profile.ts';
import { ROOM_CAPACITY, type RoomCommand, type RoomPhase, type RoomSnapshot } from '../src/multiplayer-protocol.ts';
const NEUTRAL: DriveInput = {throttle:0,brake:0,steer:0,drift:false,boost:false};
const obstacles = [
  {progress:routeProgressAt(-75,139), lateral:-3.4, width:2.25,length:7.2,kind:'cablecar' as const},
  ...[[175,385,4.6],[350,700,-4.7],[590,450,4.6]].map(([x,z,lateral])=>({progress:routeProgressAt(x,z),lateral,width:1.85,length:4.2,kind:'car' as const})),
];
type Player = {id:string;token:string;profile:RacerProfile;ready:boolean;connected:boolean;lastSeen:number;inputAt:number;input:DriveInput;sequence:number;recoverAt:number;sim:DrivingSimulation;finishTime:number|null;dnf:boolean};
type Room = {code:string;host:string;phase:RoomPhase;round:number;startAt:number;deadline:number;lastTick:number;created:number;players:Map<string,Player>};
export class RoomError extends Error { status:number; constructor(message:string,status=400){super(message);this.status=status;} }
export class RoomService {
  rooms = new Map<string,Room>();
  create(profile:Partial<RacerProfile>, now=Date.now()) {
    if(this.rooms.size>=200)throw new RoomError('All rooms are busy. Try again shortly.',503);
    let code:string;do {code=randomBytes(4).toString('hex').toUpperCase();}while(this.rooms.has(code));
    const room:Room={code,host:'',phase:'lobby',round:0,startAt:0,deadline:0,lastTick:now,created:now,players:new Map()};
    this.rooms.set(code,room);return this.join(code,profile,now);
  }
  room(code:string){const room=this.rooms.get(code);if(!room)throw new RoomError('This room has expired or does not exist.',404);return room;}
  join(code:string,profile:Partial<RacerProfile>,now=Date.now()) {
    const room=this.room(code);
    if(room.phase!=='lobby')throw new RoomError('This race has started. Ask your friend to return to the lobby.',409);
    if(room.players.size>=ROOM_CAPACITY)throw new RoomError('This room is full (8 racers).',409);
    const id=randomBytes(8).toString('hex'),token=randomBytes(24).toString('hex');
    const player:Player={id,token,profile:normalizeProfile(profile),ready:false,connected:true,lastSeen:now,inputAt:0,input:{...NEUTRAL},sequence:-1,recoverAt:0,sim:new DrivingSimulation(obstacles,{exploration:true}),finishTime:null,dnf:false};
    room.players.set(id,player);if(!room.host)room.host=id;
    return {id,token,room:this.snapshot(room,now)};
  }
  auth(code:string,token:string){const room=this.room(code),player=[...room.players.values()].find(p=>p.token===token);if(!player)throw new RoomError('Your room session has expired. Join again.',401);return {room,player};}
  touch(code:string,token:string,now=Date.now()){const {player}=this.auth(code,token);player.lastSeen=now;player.connected=true;}
  disconnect(code:string,token:string){try{const {player}=this.auth(code,token);player.connected=false;player.input={...NEUTRAL};}catch{}}
  command(code:string,token:string,command:RoomCommand,now=Date.now()) {
    const {room,player}=this.auth(code,token);player.lastSeen=now;
    if(command.type==='leave') {room.players.delete(player.id);if(room.host===player.id)room.host=[...room.players.keys()][0]??'';if(!room.players.size)this.rooms.delete(code);return;}
    if(command.type==='input') {
      if(!Number.isSafeInteger(command.sequence)||command.sequence<=player.sequence)return;
      const i=command.input;
      if(!i||![i.throttle,i.brake,i.steer].every(Number.isFinite))throw new RoomError('Invalid driving input.');
      player.sequence=command.sequence;player.inputAt=now;
      player.input={throttle:Math.max(0,Math.min(1,i.throttle)),brake:Math.max(0,Math.min(1,i.brake)),steer:Math.max(-1,Math.min(1,i.steer)),boost:i.boost===true,drift:i.drift===true};return;
    }
    if(command.type==='profile'||command.type==='ready') {
      if(room.phase!=='lobby')throw new RoomError('Driver choices are locked for this race.',409);
      if(command.type==='profile'){player.profile=normalizeProfile(command.profile);player.ready=false;}else player.ready=command.ready===true;
    } else if(command.type==='start') {
      if(room.host!==player.id)throw new RoomError('Only the host can start the race.',403);
      if(room.phase!=='lobby'||room.players.size<2||[...room.players.values()].some(p=>!p.ready||!p.connected))throw new RoomError('At least two connected racers must be ready.',409);
      room.phase='countdown';room.startAt=now+5000;room.lastTick=room.startAt;room.deadline=room.startAt+300000;room.round++;
      [...room.players.values()].forEach((p,index)=>{p.sim.reset();p.sim.seek(START_PROGRESS-Math.floor(index/3)*5,[-3,0,3][index%3]);p.finishTime=null;p.dnf=false;p.input={...NEUTRAL};});
    } else if(command.type==='recover') {
      if(room.phase==='racing'&&!player.dnf&&now-player.recoverAt>=1000){player.sim.recover();player.recoverAt=now;}
    } else if(command.type==='rematch') {
      if(room.host!==player.id)throw new RoomError('Only the host can open the next race.',403);
      if(room.phase!=='results')throw new RoomError('Wait for the race to finish.',409);
      room.phase='lobby';for(const p of room.players.values()){p.ready=false;p.finishTime=null;p.dnf=false;}
    } else throw new RoomError('Unknown room action.');
  }
  tick(now=Date.now()) {
    for(const room of this.rooms.values()) {
      for(const p of room.players.values()) {
        if(now-p.lastSeen>8000){p.connected=false;p.ready=false;p.input={...NEUTRAL};}
        if(now-p.lastSeen>30000){
          if(room.phase==='racing'||room.phase==='countdown')p.dnf=p.finishTime===null;
          else room.players.delete(p.id);
        }
      }
      if(!room.players.size||now-room.created>2*3600000){this.rooms.delete(room.code);continue;}
      if(!room.players.get(room.host)?.connected)room.host=[...room.players.values()].find(p=>p.connected)?.id??room.host;
      if(room.phase==='countdown'&&now>=room.startAt)room.phase='racing';
      if(room.phase==='racing') {
        const dt=Math.min(.25,Math.max(0,(now-room.lastTick)/1000));room.lastTick=now;
        for(const p of room.players.values()) {
          if(p.finishTime!==null||p.dnf)continue;
          p.sim.update(dt,p.connected&&now-p.inputAt<500?p.input:NEUTRAL);
          p.sim.state.elapsed=(now-room.startAt)/1000;
          if(p.sim.state.finished){p.finishTime=(now-room.startAt)/1000;room.deadline=Math.min(room.deadline,now+60000);}
          else if(now>=room.deadline)p.dnf=true;
        }
        if([...room.players.values()].every(p=>p.finishTime!==null||p.dnf))room.phase='results';
      }
    }
  }
  snapshot(room:Room,now=Date.now()):RoomSnapshot {return {code:room.code,host:room.host,phase:room.phase,round:room.round,startAt:room.startAt,deadline:room.deadline,serverNow:now,players:[...room.players.values()].map(p=>({id:p.id,profile:p.profile,ready:p.ready,connected:p.connected,state:{...p.sim.state},position:p.sim.position,exploring:p.sim.exploring,finishTime:p.finishTime,dnf:p.dnf}))};}
}

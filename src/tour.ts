import * as THREE from 'three';
import { LAUNCH_ZONES, sampleGlidePath, sampleRoute, routeSlope, routeYaw, TRACK_LENGTH, type Obstacle } from './route';
import { DrivingSimulation } from './driving';

/** A real run driven by an obstacle-aware autopilot, including all hover transitions. */
export class CityTour {
  paused=false;orbit=0;elapsed=0;
  private simulation:DrivingSimulation;
  private selectedLane=0;
  constructor(private obstacles:Obstacle[]){this.simulation=new DrivingSimulation(obstacles);this.jump(85);}
  get progress(){return this.simulation.state.progress;}
  get lateral(){return this.simulation.state.lateral;}
  get speed(){return this.simulation.state.speed;}
  get glide(){return this.simulation.state.glide;}
  get altitude(){return this.simulation.state.altitude;}
  get airborne(){return this.simulation.state.airborne;}
  get airTime(){return this.simulation.state.airTime;}
  jump(progress:number){
    this.simulation.reset();
    const zone=LAUNCH_ZONES.find(z=>progress>z.progress&&progress<z.end);
    const start=zone?zone.progress-.02:progress;
    Object.assign(this.simulation.state,{progress:start,y:sampleRoute(start).y,speed:zone?44:34});
    // Replaying from the crest uses the real transition and preserves hidden flight state.
    if(zone){for(let i=0;i<1800&&this.progress<progress;i++)this.simulation.update(1/120,{throttle:1,brake:0,steer:0,drift:false,boost:false});}
    this.selectedLane=0;this.orbit=0;
  }
  update(dt:number){
    if(this.paused)return;
    this.elapsed+=dt;
    if(this.progress>TRACK_LENGTH-2||this.simulation.state.finished){this.jump(85);return;}
    const candidates=this.obstacles.filter(o=>{
      if(o.progress+o.length/2+2.1<=this.progress||o.progress>=this.progress+75)return false;
      const zone=LAUNCH_ZONES.find(z=>o.progress>z.progress&&o.progress<z.end);
      return !zone||sampleGlidePath(o.progress,zone)-sampleRoute(o.progress).y<4.8;
    }).sort((a,b)=>a.progress-b.progress);
    const next=candidates.filter(o=>o.progress<(candidates[0]?.progress??0)+20);
    let bestLane=this.selectedLane,bestScore=-Infinity;
    for(const lane of [-3.9,-1.2,1.2,3.9]){
      let score=-Math.abs(lane-this.selectedLane)*.14-Math.abs(lane)*.04;
      for(const o of next){const clearance=Math.abs(lane-o.lateral)-(o.width/2+1.12);score+=clearance<0?-40+clearance*4:Math.min(clearance,2);}
      if(score>bestScore){bestScore=score;bestLane=lane;}
    }
    this.selectedLane=next.length?bestLane:0;
    this.simulation.update(dt,{throttle:1,brake:0,steer:THREE.MathUtils.clamp((this.selectedLane-this.lateral)*.13,-.6,.6),drift:false,boost:false});
  }
  getPose(){
    const s=this.simulation.state,p=sampleRoute(s.progress),ahead=sampleRoute(s.progress+24),back=sampleRoute(s.progress-10);
    const yaw=this.orbit+Math.sin(this.elapsed*.065)*.06,distance=10;
    const pitch=s.airborne?THREE.MathUtils.clamp(-Math.atan2(s.verticalVelocity,Math.max(s.speed,1)),-.18,.22):-Math.atan(routeSlope(p.z));
    return {
      car:new THREE.Vector3(p.x+s.lateral,s.y+.03,p.z),
      rotation:new THREE.Euler(pitch,routeYaw(p.z)+s.driftAngle,-s.driftAngle*.4),
      camera:new THREE.Vector3(p.x+s.lateral+Math.sin(yaw)*distance,Math.max(s.y+4.1,back.y+3.8),p.z-Math.cos(yaw)*distance),
      look:new THREE.Vector3(ahead.x+s.lateral-Math.sin(yaw)*15,s.airborne?s.y-1.8:s.y+THREE.MathUtils.clamp((ahead.y-s.y)*.3,-5,4)+1.2,p.z+Math.cos(yaw)*24),
    };
  }
}

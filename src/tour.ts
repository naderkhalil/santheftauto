import * as THREE from 'three';
import { LAUNCH_ZONES, sampleRoute, routePoint, routeFrame, routeSlope, routeYaw, TRACK_LENGTH, START_PROGRESS, type Obstacle } from './route.ts';
import { DrivingSimulation } from './driving.ts';
import { flightView } from './flight-view.ts';
import { DemoAutopilot } from './autopilot.ts';

/** A real run driven by an obstacle-aware autopilot, including all hover transitions. */
export class CityTour {
  paused=false;orbit=0;elapsed=0;
  private simulation:DrivingSimulation;
  private autopilot:DemoAutopilot;
  private lastSteer=0;
  constructor(obstacles:Obstacle[]){this.autopilot=new DemoAutopilot(obstacles);this.simulation=new DrivingSimulation(obstacles);this.jump(START_PROGRESS);}
  get progress(){return this.simulation.state.progress;}
  get lateral(){return this.simulation.state.lateral;}
  get speed(){return this.simulation.state.speed;}
  get steer(){return this.lastSteer;}
  get heading(){return this.simulation.state.heading;}
  get glide(){return this.simulation.state.glide;}
  get altitude(){return this.simulation.state.altitude;}
  get airborne(){return this.simulation.state.airborne;}
  get airTime(){return this.simulation.state.airTime;}
  jump(progress:number){
    this.simulation.reset();this.autopilot.reset();this.lastSteer=0;
    const zone=LAUNCH_ZONES.find(z=>progress>z.progress&&progress<z.end);
    const start=zone?zone.progress-.02:progress;
    Object.assign(this.simulation.state,{progress:start,heading:routeYaw(start),y:sampleRoute(start).y,speed:zone?44:34,verticalVelocity:routeSlope(start)*(zone?44:34)});
    // Replaying from the crest uses the real transition and preserves hidden flight state.
    if(zone){for(let i=0;i<1800&&this.progress<progress;i++)this.driveStep(1/120);}
    this.orbit=0;
  }
  update(dt:number){
    if(this.paused||!Number.isFinite(dt)||dt<=0)return;
    this.elapsed+=dt;
    if(this.progress>TRACK_LENGTH-2||this.simulation.state.finished){
      Object.assign(this.simulation.state,{progress:TRACK_LENGTH,y:sampleRoute(TRACK_LENGTH).y,speed:0,verticalVelocity:0,finished:true});this.paused=true;return;
    }
    // The demonstration turns the wheel and uses both pedals, on the same
    // manual simulation as a race. Sampling at a fixed cadence keeps corners
    // and avoidance consistent across display refresh rates.
    for(let remaining=Math.min(dt,60);remaining>1e-9&&!this.simulation.state.finished;){
      const step=Math.min(remaining,1/120);
      this.driveStep(step);
      remaining-=step;
    }
  }
  private driveStep(dt:number){
    const input=this.autopilot.input(this.simulation.state);
    this.lastSteer=input.steer;
    this.simulation.update(dt,input);
  }
  getPose(){
    const s=this.simulation.state,p=routePoint(s.progress,s.lateral),ahead=routePoint(s.progress+24,s.lateral),back=routePoint(s.progress-10,s.lateral);
    const frame=routeFrame(s.progress),yaw=frame.yaw+this.orbit+Math.sin(this.elapsed*.065)*.06,distance=10;
    const view=flightView(s,frame.slope,ahead.y);
    return {
      car:new THREE.Vector3(p.x,s.y+.03,p.z),
      rotation:new THREE.Euler(view.pitch,s.heading+s.driftAngle,view.bank,'YXZ'),
      camera:new THREE.Vector3(p.x-Math.sin(yaw)*distance,Math.max(s.y+4.1,back.y+3.8),p.z-Math.cos(yaw)*distance),
      look:new THREE.Vector3(ahead.x-frame.normal.x*Math.sin(this.orbit)*15,view.lookHeight,ahead.z-frame.normal.z*Math.sin(this.orbit)*15),
    };
  }
}

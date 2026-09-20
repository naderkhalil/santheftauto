import * as THREE from 'three';
import { sampleRoute, routeSlope, routeYaw, TRACK_LENGTH, type Obstacle } from './route';

export class CityTour {
  progress=38; paused=false; lateral=0; orbit=0; elapsed=0;
  private selectedLane=0;
  constructor(private obstacles:Obstacle[]){}
  jump(progress:number){this.progress=progress;this.lateral=0;this.selectedLane=0;this.orbit=0;}
  update(dt:number){
    if(this.paused)return;
    this.elapsed+=dt;this.progress+=dt*11;
    if(this.progress>TRACK_LENGTH+70)this.jump(38);
    const next=this.obstacles.filter(o=>o.progress>this.progress-8&&o.progress<this.progress+34);
    let bestLane=this.selectedLane,bestScore=-Infinity;
    for(const lane of [-3.8,-1.2,1.2,3.8]){
      let score=-Math.abs(lane-this.selectedLane)*.18;
      for(const o of next){const clearance=Math.abs(lane-o.lateral)-(o.width/2+1.08);score+=clearance<0?-40+clearance*4:Math.min(clearance,2);}
      if(score>bestScore){bestScore=score;bestLane=lane;}
    }
    this.selectedLane=next.length?bestLane:0;
    this.lateral=THREE.MathUtils.damp(this.lateral,this.selectedLane,1.6,dt);
  }
  getPose(){
    const p=sampleRoute(this.progress),ahead=sampleRoute(this.progress+20),back=sampleRoute(this.progress-12);
    const square=Math.max(0,Math.sin((this.progress-680)/280*Math.PI));
    const squareFocus=this.progress>680&&this.progress<960?square:0;
    const yaw=this.orbit+Math.sin(this.elapsed*.065)*.09;
    const distance=11.5;
    return {
      car:new THREE.Vector3(p.x+this.lateral,p.y+.03,p.z),
      rotation:new THREE.Euler(-Math.atan(routeSlope(p.z)),routeYaw(p.z),0),
      camera:new THREE.Vector3(p.x+this.lateral+Math.sin(yaw)*distance,Math.max(p.y+3.8,back.y+3.8),p.z-Math.cos(yaw)*distance),
      look:new THREE.Vector3(ahead.x+this.lateral+squareFocus*9-Math.sin(yaw)*12,ahead.y+2+squareFocus*2,p.z+Math.cos(yaw)*20),
    };
  }
}

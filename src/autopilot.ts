import { steeringCurvature, type DriveInput, type DriveState } from './driving.ts';
import { LAUNCH_ZONES, routeCurvature, routeYaw, sampleGlidePath, sampleRoute, type Obstacle } from './route.ts';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const angle=(value:number)=>Math.atan2(Math.sin(value),Math.cos(value));

/** Explicit demonstration driver. Racing never invokes these route-following controls. */
export class DemoAutopilot {
  private selectedLane=0;
  private obstacles:readonly Obstacle[];
  constructor(obstacles:readonly Obstacle[]=[]){this.obstacles=obstacles;}
  reset(){this.selectedLane=0;}

  input(state:DriveState):DriveInput {
    const {progress,speed,lateral,heading,airborne}=state;
    const candidates=this.obstacles.filter(obstacle=>{
      if(obstacle.progress+obstacle.length/2+2.1<=progress||obstacle.progress>=progress+75)return false;
      const zone=LAUNCH_ZONES.find(zone=>obstacle.progress>zone.progress&&obstacle.progress<zone.end);
      return !zone||sampleGlidePath(obstacle.progress,zone)-sampleRoute(obstacle.progress).y<4.8;
    }).sort((a,b)=>a.progress-b.progress);
    const next=candidates.filter(obstacle=>obstacle.progress<(candidates[0]?.progress??0)+20);
    let bestLane=this.selectedLane,bestScore=-Infinity;
    for(const lane of [-3.9,-1.2,1.2,3.9]){
      let score=-Math.abs(lane-this.selectedLane)*.14-Math.abs(lane)*.04;
      for(const obstacle of next){const clearance=Math.abs(lane-obstacle.lateral)-(obstacle.width/2+1.12);score+=clearance<0?-40+clearance*4:Math.min(clearance,2);}
      if(score>bestScore){bestScore=score;bestLane=lane;}
    }
    this.selectedLane=next.length?bestLane:0;

    // A speed envelope begins braking early enough to turn, rather than
    // applying steering after arriving at a corner at straight-line speed.
    let targetSpeed=44;
    for(let ahead=0;ahead<=90;ahead+=2){
      if(Math.abs(routeCurvature(progress+ahead))<.001)continue;
      targetSpeed=Math.min(targetSpeed,Math.sqrt(23*23+2*20*Math.max(0,ahead-7)));
    }
    const speedError=targetSpeed-speed;
    const throttle=clamp(.37+speedError*.32,0,1);
    const brake=clamp(-speedError*.17,0,1);
    const desiredHeading=routeYaw(progress)+clamp(Math.atan2((this.selectedLane-lateral)*2.5,Math.max(speed,8)),-.38,.38);
    const headingError=angle(desiredHeading-heading);
    const curvature=routeCurvature(progress+speed*.1);
    const forwardRatio=Math.max(.4,Math.cos(angle(heading-routeYaw(progress))))/Math.max(.4,1-curvature*lateral);
    const desiredCurvature=curvature*forwardRatio+headingError*4/Math.max(speed,5);
    const steer=airborne?clamp((this.selectedLane-lateral)*.13,-.6,.6):clamp(desiredCurvature/steeringCurvature(speed),-1,1);
    return {throttle,brake,steer,drift:false,boost:false};
  }
}

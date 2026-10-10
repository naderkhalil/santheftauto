import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation, type DriveInput } from './driving.ts';
import { DemoAutopilot } from './autopilot.ts';
import { CHECKPOINTS, LAUNCH_ZONES, ROAD_HALF_WIDTH, TRACK_LENGTH, routePoint, routeProgressAt, routeYaw } from './route.ts';
import { clearCityCamera } from './city-camera-clearance.ts';
import { CITY_BOUNDARY_SEGMENTS, CITY_CORRIDOR_START } from './city-boundaries.ts';
import { PLAYGROUND_BOUNDS, PLAYGROUND_COLLIDERS } from './playground.ts';

const gas: DriveInput = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };
const reverse = { ...gas, throttle: 0, brake: 1 };
function advance(sim: DrivingSimulation, seconds: number, input = gas, hz = 120) {
  const events: string[] = [];
  for (let i = 0; i < Math.round(seconds * hz); i++) events.push(...sim.update(1 / hz, input));
  return events;
}

test('a head-on road wall hit gently turns back into the street at all supported frame rates', () => {
  const progress = routeProgressAt(175, 385);
  const states = [];
  for (const hz of [30, 60, 120]) {
    const sim = new DrivingSimulation([], { exploration: true });
    sim.seek(progress); sim.state.heading += Math.PI / 2; sim.state.speed = 35;
    let feedback = 0, contact: number | undefined;
    for (let frame = 0; frame < 2 * hz; frame++) {
      const before = sim.position, heading = sim.state.heading;
      const events = sim.update(1 / hz, gas); feedback += events.filter(event => event === 'crash').length;
      if (contact === undefined && events.includes('crash')) contact = sim.state.lateral;
      const relative = sim.state.heading - routeYaw(sim.state.progress);
      const halfWidth = Math.abs(Math.cos(relative)) * .95 + Math.abs(Math.sin(relative)) * 2.1;
      assert.ok(Math.abs(sim.state.lateral) + halfWidth <= ROAD_HALF_WIDTH + 1e-8, 'the entire rotating footprint stays inside the visible wall');
      assert.ok(Math.hypot(sim.position.x - before.x, sim.position.z - before.z) < 43 / hz + .05, 'the rebound never teleports');
      assert.ok(Math.abs(sim.state.heading - heading) <= 3.3 / hz, 'the heading assist is continuous');
      assert.ok(sim.state.speed >= 0, 'automatic recoil never selects reverse gear');
    }
    assert.equal(feedback, 1);
    assert.equal(sim.state.collisions, 1);
    assert.ok(contact !== undefined && sim.state.lateral < contact - .05, 'held gas moves away from contact');
    const relative = sim.state.heading - routeYaw(sim.state.progress);
    const halfWidth = Math.abs(Math.cos(relative)) * .95 + Math.abs(Math.sin(relative)) * 2.1;
    assert.ok(ROAD_HALF_WIDTH - Math.abs(sim.state.lateral) - halfWidth > .5, 'the aligned car has room between its body and the wall');
    assert.ok(sim.state.progress > progress + 8 && sim.state.speed > 10, 'the car promptly travels down the street again');
    states.push(sim.exportState());
  }
  assert.deepEqual(states[1], states[0]); assert.deepEqual(states[2], states[0]);
});

test('a parked car is solid on a second approach and continuous contact counts only once', () => {
  const progress = routeProgressAt(175, 385);
  for (const hz of [30, 60, 120]) {
    const sim = new DrivingSimulation([{ progress: progress + 10, lateral: 0, width: 2, length: 4, kind: 'car' }]);
    sim.seek(progress); sim.state.speed = 30;
    for (let frame = 0; frame < hz && sim.state.collisions === 0; frame++) sim.update(1 / hz, gas);
    assert.equal(sim.state.collisions, 1); assert.ok(sim.state.speed < 6);
    const contact = sim.state.progress;
    advance(sim, 1.5, reverse, hz);
    assert.ok(sim.state.progress < contact - 8);
    assert.equal(sim.state.collisions, 1, 'the outward bounce and deliberate reverse are still one impact');
    for (let frame = 0; frame < 3 * hz && sim.state.collisions < 2; frame++) sim.update(1 / hz, gas);
    assert.equal(sim.state.collisions, 2);
    assert.ok(sim.state.speed < 6);
    const relative = sim.state.heading - routeYaw(sim.state.progress);
    const halfLength = Math.abs(Math.sin(relative)) * .95 + Math.abs(Math.cos(relative)) * 2.1;
    assert.ok(sim.state.progress + halfLength <= progress + 8, 'the second approach also stays behind the parked bumper');
  }
});

test('nearby recovery preserves race progress and chooses pavement clear of obstacles', () => {
  const sim = new DrivingSimulation([], { exploration: true }), driver = new DemoAutopilot();
  for (let i = 0; i < 120 * 90 && sim.state.progress < CHECKPOINTS[2] - 20; i++) sim.update(1/120,driver.input(sim.state));
  assert.equal(sim.state.checkpoint, 2);
  const before = { ...sim.state };
  sim.recover();
  assert.ok(sim.state.progress <= before.progress && sim.state.progress >= before.progress - 10);
  assert.equal(sim.state.elapsed, before.elapsed); assert.equal(sim.state.checkpoint, before.checkpoint);
  assert.equal(sim.state.collisions, before.collisions); assert.equal(sim.state.launches, before.launches);
  assert.equal(sim.state.heading, routeYaw(sim.state.progress)); assert.equal(sim.state.speed, 0);

  const p = CHECKPOINTS[2] + 60;
  const blocked = new DrivingSimulation([{progress:p-4,lateral:0,width:8,length:8,kind:'car'}]);
  blocked.seek(p); blocked.recover();
  assert.ok(Math.abs(blocked.state.progress-(p-4))>6, 'cannot respawn inside the parked car');
});

test('missing a later checkpoint recovers just before it, and a flight recovers before launch', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  sim.state.checkpoint = 2; sim.seek(TRACK_LENGTH - 4); sim.recover();
  assert.ok(sim.state.progress < CHECKPOINTS[2] && sim.state.progress >= CHECKPOINTS[2] - 20);
  assert.equal(sim.state.checkpoint, 2);
  sim.state.checkpoint = 3;
  const launch = LAUNCH_ZONES[2]; sim.seek((launch.progress+launch.end)/2); sim.recover();
  assert.ok(sim.state.progress < launch.progress);
});

test('City Loop with its parked traffic still completes through manual control inputs', () => {
  const obstacles = [
    { progress: routeProgressAt(-75,139), lateral:-3.4, width:2.25, length:7.2, kind:'cablecar' as const },
    ...[[175,385,4.6],[350,700,-4.7],[590,450,4.6]].map(([x,z,lateral]) => ({ progress:routeProgressAt(x,z), lateral, width:1.85, length:4.2, kind:'car' as const })),
  ];
  for (const hz of [30,60,120]) {
    const sim = new DrivingSimulation(obstacles,{exploration:true}), driver = new DemoAutopilot(obstacles);
    for(let i=0;i<hz*120&&!sim.state.finished;i++) sim.update(1/hz,driver.input(sim.state));
    assert.equal(sim.state.finished,true); assert.equal(sim.state.checkpoint,4);
    assert.equal(sim.state.collisions,0);
  }
});

test('chase-camera clearance protects road corners in forward and reverse views', () => {
  for(let s=CITY_CORRIDOR_START+20;s<TRACK_LENGTH-10;s+=8) for(const lateral of [-5,5]) for(const turn of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
    const car=routePoint(s,lateral), yaw=routeYaw(s)+turn;
    const origin={...car,y:car.y+1.6};
    const eye=clearCityCamera(origin,{x:car.x-Math.sin(yaw)*9.4,y:car.y+4.2,z:car.z-Math.cos(yaw)*9.4},false);
    const p=routeProgressAt(eye.x,eye.z), center=routePoint(p), angle=routeYaw(p);
    const offset=(eye.x-center.x)*Math.cos(angle)-(eye.z-center.z)*Math.sin(angle);
    assert.ok(Math.abs(offset)<=ROAD_HALF_WIDTH-.29, `camera clips road boundary at ${s}`);
    assert.ok(Object.values(eye).every(Number.isFinite));
  }
  const eye=clearCityCamera({x:-84,y:25,z:0},{x:-102,y:28,z:0},true);
  const westin=PLAYGROUND_COLLIDERS.find(b=>b.id.includes('westin'));
  assert.ok(westin);
  assert.ok(eye.x>westin.maxX, 'camera cannot enter the Westin when reversing beside it');
});

test('district barriers share the collision boundary and keep Powell open', () => {
  for(const [ax,az,bx,bz] of CITY_BOUNDARY_SEGMENTS) {
    assert.ok(ax===bx || az===bz);
    assert.ok([PLAYGROUND_BOUNDS.minX,PLAYGROUND_BOUNDS.maxX].includes(ax as never)
      || [PLAYGROUND_BOUNDS.minZ,PLAYGROUND_BOUNDS.maxZ].includes(az as never));
    if(az===PLAYGROUND_BOUNDS.maxZ && bz===az) assert.ok(bx<=-75-ROAD_HALF_WIDTH || ax>=-75+ROAD_HALF_WIDTH);
  }
});

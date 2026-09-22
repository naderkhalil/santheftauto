import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation } from './driving.ts';
import type { DriveInput, RaceEvent } from './driving.ts';
import { CHECKPOINTS, LAUNCH_ZONES, ROAD_HALF_WIDTH, START_PROGRESS, TRACK_LENGTH, glideSlope, routeSlope, sampleGlidePath, sampleRoute } from './route.ts';

const throttle: DriveInput = { throttle: 1, brake: 0, steer: 0, drift: false, boost: false };
const neutral: DriveInput = { ...throttle, throttle: 0 };
function drive(sim: DrivingSimulation, seconds: number, input: DriveInput = throttle, hz = 120) {
  const events: RaceEvent[] = [];
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) events.push(...sim.update(1 / hz, input));
  return events;
}

test('reset restores a fresh race, including hidden collision and boost state', () => {
  const sim = new DrivingSimulation([{ progress: 30, lateral: 0, width: 2, length: 4, kind: 'car' }]);
  const first = drive(sim, 5, { ...throttle, boost: true });
  assert.ok(first.includes('crash'));
  assert.ok(sim.state.progress > START_PROGRESS);
  sim.reset();
  assert.deepEqual(sim.state, new DrivingSimulation().state);
  assert.equal(sim.state.y, sampleRoute(START_PROGRESS).y);
  assert.ok(drive(sim, 5, { ...throttle, boost: true }).includes('crash'));
});

test('30, 60 and 120 Hz produce matching routes, handling and timers', () => {
  const states = [30, 60, 120].map(hz => {
    const sim = new DrivingSimulation();
    drive(sim, 3, throttle, hz);
    drive(sim, .5, { ...throttle, steer: .65, drift: true }, hz);
    drive(sim, 2, { ...throttle, boost: true }, hz);
    drive(sim, .5, { ...throttle, steer: -.65 }, hz);
    drive(sim, 5, throttle, hz);
    return sim.state;
  });
  for (const state of states.slice(1)) {
    for (const key of ['progress', 'lateral', 'speed', 'elapsed', 'boost', 'y', 'driftAngle', 'glide', 'altitude', 'airTime', 'totalAirTime'] as const) {
      assert.ok(Math.abs(state[key] - states[0][key]) < 1e-6, `${key} diverged: ${state[key]} vs ${states[0][key]}`);
    }
  }
});

test('boost is faster, depletes, recharges, and can be triggered again', () => {
  const fast = new DrivingSimulation();
  const normal = new DrivingSimulation();
  drive(fast, 3.9, { ...throttle, boost: true });
  drive(normal, 3.9);
  assert.ok(fast.state.speed > normal.state.speed + 8);
  assert.ok(fast.state.boost < .03);
  drive(fast, .1, { ...throttle, boost: true });
  assert.ok(fast.state.boost < .002);
  drive(fast, 3, throttle);
  assert.ok(fast.state.boost > .29);
  const previousBoost = fast.state.boost;
  drive(fast, .5, { ...throttle, boost: true });
  assert.ok(fast.state.boost < previousBoost);
  assert.ok(fast.state.boost >= 0 && fast.state.boost <= 1);
});

test('a long update crosses checkpoints in order and finishes exactly once', () => {
  const sim = new DrivingSimulation();
  const events = sim.update(60, throttle);
  assert.equal(sim.state.checkpoint, CHECKPOINTS.length);
  assert.equal(sim.state.finished, true);
  assert.equal(sim.state.progress, TRACK_LENGTH);
  assert.deepEqual(events.filter(event => event === 'checkpoint' || event === 'finish'), ['checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'finish']);
  assert.ok(sim.state.elapsed > 20 && sim.state.elapsed < 60);
  const finished = { ...sim.state };
  assert.deepEqual(sim.update(60, throttle), []);
  assert.deepEqual(sim.state, finished);
});

test('boost effects reflect actual power after depletion, release, braking, reset and finish', () => {
  const sim = new DrivingSimulation();
  const boost = { ...throttle, boost: true };
  assert.equal(sim.boosting, false);
  drive(sim, 1, boost);
  assert.equal(sim.boosting, true);
  drive(sim, 4, boost);
  assert.ok(sim.state.boost > .09, 'the gauge recharges while the held button remains locked');
  assert.equal(sim.boosting, false, 'recharging must not reactivate effects without releasing boost');
  sim.update(1 / 120, throttle);
  sim.update(1 / 120, boost);
  assert.equal(sim.boosting, true, 'release and repress should activate available boost');
  sim.update(1 / 120, { ...boost, brake: 1 });
  assert.equal(sim.boosting, false);
  sim.update(1 / 120, { ...boost, throttle: 0 });
  assert.equal(sim.boosting, false);
  sim.update(1 / 120, boost);
  sim.reset();
  assert.equal(sim.boosting, false);
  sim.state.progress = TRACK_LENGTH - .1;
  sim.state.speed = 40;
  sim.update(.1, boost);
  assert.equal(sim.state.finished, true);
  assert.equal(sim.boosting, false);
});

test('obstacle collision is swept, costs speed, and allows recovery', () => {
  const sim = new DrivingSimulation([{ progress: 35, lateral: 0, width: 2, length: .1, kind: 'barrier' }]);
  sim.state.speed = 58;
  const events = sim.update(.5, neutral);
  assert.ok(events.includes('crash'));
  assert.equal(sim.state.collisions, 1);
  assert.ok(sim.state.speed < 30);
  assert.ok(Math.abs(sim.state.lateral) > 1.9);
  drive(sim, 4);
  assert.ok(sim.state.progress > 100);
  assert.ok(sim.state.speed > 35);
  assert.equal(sim.state.collisions, 1);
});

test('passing an obstacle in an adjacent lane does not collide', () => {
  const sim = new DrivingSimulation([{ progress: 35, lateral: -5, width: 2, length: 4, kind: 'car' }]);
  assert.ok(!drive(sim, 5).includes('crash'));
  assert.equal(sim.state.collisions, 0);
});

test('grounded curb impacts stay inside the road and the driver can steer away', () => {
  const sim = new DrivingSimulation();
  drive(sim, 1);
  const events = drive(sim, 2, { ...throttle, steer: 1 });
  assert.ok(events.includes('crash'));
  assert.ok(Math.abs(sim.state.lateral) <= ROAD_HALF_WIDTH - .95);
  drive(sim, 1, { ...throttle, steer: -1 });
  assert.ok(sim.state.lateral < 7);
  assert.ok(sim.state.speed > 0);
});

test('brakes stop the car, and steering cannot move a stopped car sideways', () => {
  const sim = new DrivingSimulation();
  drive(sim, 4);
  assert.ok(sim.state.speed > 40);
  drive(sim, 2, { ...neutral, brake: 1 });
  assert.equal(sim.state.speed, 0);
  const progress = sim.state.progress;
  const lateral = sim.state.lateral;
  drive(sim, 2, { ...neutral, steer: 1, brake: 1 });
  assert.equal(sim.state.progress, progress);
  assert.equal(sim.state.lateral, lateral);
});

test('all three hills launch, sustain hover and land with wheels restored during a complete run', () => {
  for (const boosted of [false, true]) {
    const sim = new DrivingSimulation();
    const sequence: RaceEvent[] = [];
    let maximumAltitude = 0;
    let fullyDeployed = false;
    for (let i = 0; i < 7200 && !sim.state.finished; i++) {
      const events = sim.update(1 / 120, { ...throttle, boost: boosted && i < 480 });
      sequence.push(...events.filter(event => event === 'launch' || event === 'land'));
      maximumAltitude = Math.max(maximumAltitude, sim.state.altitude);
      fullyDeployed ||= sim.state.glide > .98;
      assert.ok(sim.state.y >= sampleRoute(sim.state.progress).y - 1e-6);
      assert.ok(sim.state.glide >= 0 && sim.state.glide <= 1);
      for (const value of Object.values(sim.state)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
      if (events.includes('land')) {
        assert.equal(sim.state.airborne, false);
        assert.equal(sim.state.glide, 0);
        assert.equal(sim.state.altitude, 0);
        assert.equal(sim.state.airTime, 0);
      }
    }
    assert.deepEqual(sequence, ['launch', 'land', 'launch', 'land', 'launch', 'land']);
    assert.equal(sim.state.launches, 3);
    assert.ok(sim.state.totalAirTime > 11, 'three flights should feel like sustained glides');
    assert.ok(maximumAltitude > 30, 'the glide should still clear the street by several storeys');
    assert.ok(fullyDeployed);
    assert.ok(sim.state.finished);
  }
});

test('hover retracts before landing and the flight corridor joins the road smoothly', () => {
  const sim = new DrivingSimulation();
  let nearLandingGlide = 1;
  while (sim.state.progress < LAUNCH_ZONES[0].end - 4) sim.update(1 / 120, throttle);
  nearLandingGlide = sim.state.glide;
  assert.ok(sim.state.airborne);
  assert.ok(nearLandingGlide < .2, `wheels are ${nearLandingGlide} deployed just before touchdown`);
  for (const zone of LAUNCH_ZONES) {
    assert.equal(sampleGlidePath(zone.progress, zone), sampleRoute(zone.progress).y);
    assert.ok(Math.abs(sampleGlidePath(zone.end, zone) - sampleRoute(zone.end).y) < 1e-9);
    const finalSlope = (sampleGlidePath(zone.end, zone) - sampleGlidePath(zone.end - .01, zone)) / .01;
    assert.ok(Math.abs(finalSlope) < .001, 'flight and level landing have matching vertical tangents');
  }
});

test('air steering is responsive, soft boundaries do not count as curb crashes, and braking cannot strand a glider', () => {
  const sim = new DrivingSimulation();
  sim.state.progress = LAUNCH_ZONES[2].progress - .02;
  sim.state.speed = 44;
  sim.state.y = sampleRoute(sim.state.progress).y;
  while (!sim.state.airborne) sim.update(1 / 120, throttle);
  const initialLateral = sim.state.lateral;
  drive(sim, .5, { ...throttle, steer: 1 });
  assert.ok(sim.state.lateral > initialLateral + 1);
  const events = drive(sim, 1.5, { ...throttle, steer: 1 });
  assert.ok(!events.includes('crash'));
  assert.ok(Math.abs(sim.state.lateral) <= ROAD_HALF_WIDTH - .95);
  drive(sim, .5, { ...throttle, steer: -1 });
  assert.ok(sim.state.lateral < ROAD_HALF_WIDTH - 1.5);
  const brakingEvents = drive(sim, 14, { ...neutral, brake: 1 });
  assert.ok(brakingEvents.includes('land'));
  assert.equal(sim.state.airborne, false);
  assert.equal(sim.state.speed, 0);
});

test('boost gains lift, braking dives, and both return smoothly to the same landing', () => {
  const modes = [throttle, { ...throttle, boost: true }, { ...throttle, brake: .7 }];
  const midflightOffsets: number[] = [];
  const first = LAUNCH_ZONES[0];
  for (const control of modes) {
    const sim = new DrivingSimulation();
    while (!sim.state.airborne) sim.update(1 / 120, throttle);
    while (sim.state.progress < (first.progress + first.end) / 2) sim.update(1 / 120, control);
    midflightOffsets.push(sim.state.y - sampleGlidePath(sim.state.progress, first));
    let landingEvents: RaceEvent[] = [];
    while (sim.state.airborne) {
      landingEvents = sim.update(1 / 120, control);
      assert.ok(sim.state.y >= sampleRoute(sim.state.progress).y);
      assert.ok(Number.isFinite(sim.state.verticalVelocity));
      if (sim.state.progress > first.end - .5) assert.ok(Math.abs(sim.state.verticalVelocity) < 1.5);
    }
    assert.ok(landingEvents.includes('land'));
    assert.ok(Math.abs(sim.state.y - sampleRoute(sim.state.progress).y) < 1e-9);
  }
  assert.ok(Math.abs(midflightOffsets[0]) < 1e-9);
  assert.ok(midflightOffsets[1] > 6, 'boost should add visible midflight lift');
  assert.ok(midflightOffsets[2] < -7, 'braking should produce a controllable dive');
});

test('slow driving stays grounded and gliders clear obstacles beneath their flight corridor', () => {
  const slow = new DrivingSimulation();
  slow.state.progress = LAUNCH_ZONES[0].progress - .05;
  slow.state.y = sampleRoute(slow.state.progress).y;
  slow.state.speed = 12;
  assert.ok(!slow.update(.2, neutral).includes('launch'));
  assert.equal(slow.state.airborne, false);
  assert.equal(slow.state.launches, 0);
  const first = LAUNCH_ZONES[0];
  const flight = new DrivingSimulation([{ progress: (first.progress + first.end) / 2, lateral: 0, width: 6, length: 8, kind: 'cablecar' }]);
  flight.state.progress = first.progress - 30;
  flight.state.speed = 44;
  flight.state.y = sampleRoute(flight.state.progress).y;
  const flightEvents = drive(flight, 10);
  assert.ok(flightEvents.includes('launch'));
  assert.ok(flightEvents.includes('land'));
  assert.ok(!flightEvents.includes('crash'));
});

test('invalid time and controls cannot poison the simulation', () => {
  const sim = new DrivingSimulation();
  const original = { ...sim.state };
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(sim.update(dt, throttle), []);
  assert.deepEqual(sim.state, original);
  sim.update(.5, { ...throttle, throttle: NaN, steer: Infinity, brake: -100 });
  for (const value of Object.values(sim.state)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  assert.equal(sim.state.speed, 0);
});


test('all takeoffs preserve uphill momentum instead of adding a vertical kick', () => {
  for(const zone of LAUNCH_ZONES)for(const speed of [25,44,58]){
    const sim=new DrivingSimulation();
    sim.state.progress=zone.progress-3;sim.state.speed=speed;
    sim.state.y=sampleRoute(sim.state.progress).y;
    sim.state.verticalVelocity=routeSlope(sim.state.progress)*speed;
    let launched=false;
    for(let i=0;i<120&&!launched;i++){
      const before={...sim.state},dt=1/120;
      const events=sim.update(dt,{...throttle,boost:speed>50});
      if(events.includes('launch')){
        launched=true;
        assert.ok(before.verticalVelocity>0,'release should carry the uphill climb');
        assert.ok(Math.abs(sim.state.verticalVelocity-before.verticalVelocity)<.6,
          `vertical velocity kicked at ${zone.label}: ${before.verticalVelocity}→${sim.state.verticalVelocity}`);
        const expected=before.y+before.verticalVelocity*dt;
        assert.ok(Math.abs(sim.state.y-expected)<.008,'position must continue through the release smoothly');
        assert.ok(sim.state.glide<.005,'wheels should still be upright as they first leave the surface');
      }
    }
    assert.ok(launched);
  }
});

test('every flight clears the crest and has matching entry and exit tangents', () => {
  for(const zone of LAUNCH_ZONES){
    const step=.001;
    const entry=(sampleGlidePath(zone.progress+step,zone)-sampleGlidePath(zone.progress,zone))/step;
    const exit=(sampleGlidePath(zone.end,zone)-sampleGlidePath(zone.end-step,zone))/step;
    assert.ok(Math.abs(entry-routeSlope(zone.progress))<.0001,'road and air must share a takeoff tangent');
    assert.ok(Math.abs(exit-routeSlope(zone.end))<.0001,'landing must join the road tangent');
    assert.ok(Math.abs(glideSlope(zone.progress,zone)-routeSlope(zone.progress))<1e-9);
    for(let i=0;i<=1000;i++){
      const progress=zone.progress+(zone.end-zone.progress)*i/1000;
      assert.ok(sampleGlidePath(progress,zone)>=sampleRoute(progress).y-1e-8,
        'a flight must not be clipped back onto the crest by the ground clamp');
    }
  }
});

test('wheel unfolding follows road clearance and eases into sustained glide', () => {
  const sim=new DrivingSimulation();
  while(!sim.state.airborne)sim.update(1/120,throttle);
  drive(sim,.1);
  assert.ok(sim.state.glide<.025,'keep the wheels upright for the initial weightless release');
  drive(sim,.35);
  assert.ok(sim.state.glide>.1&&sim.state.glide<.85,'unfold progressively instead of switching modes at the crest');
  drive(sim,.55);
  assert.ok(sim.state.glide>.95,'reach full hover once clearly above the road');
});

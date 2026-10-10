import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation, type DriveInput } from './driving.ts';
import { RoomService } from '../server/rooms.ts';
import { COURSE_VERSION, type RoomSnapshot } from './multiplayer-protocol.ts';
import { RacerSnapshotBuffer } from './room-interpolation.ts';
import { CHECKPOINTS, routeProgressAt, routeYaw } from './route.ts';

const neutral = { throttle: 0, brake: 0, steer: 0, boost: false, drift: false };

test('network playback keeps its interpolated world position on the road and across the plaza boundary', () => {
  const sim = new DrivingSimulation([], { exploration: true });
  const state = { ...sim.state, collisions: 2, checkpoint: 1 };
  for (const exploring of [true, false, true, false]) {
    const pose = { x: 12.375, z: 204.625 };
    sim.applyNetworkState(state, pose, exploring);
    assert.deepEqual(sim.position, { ...pose, y: state.y });
    assert.equal(sim.exploring, exploring);
    assert.equal(sim.state.progress, state.progress);
    assert.equal(sim.state.collisions, 2);
    assert.equal(sim.state.checkpoint, 1);
  }
});

test('network render positions never leak into a subsequent local simulation or restored checkpoint', () => {
  for (const operation of ['reset', 'seek', 'update', 'restore'] as const) {
    const sim = new DrivingSimulation();
    const checkpoint = sim.exportState();
    const expected = sim.position;
    sim.applyNetworkState({ ...sim.state }, { x: 9999, z: -9999 }, false);
    if (operation === 'reset') sim.reset();
    if (operation === 'seek') sim.seek(checkpoint.state.progress);
    if (operation === 'update') sim.update(1 / 60, neutral);
    if (operation === 'restore') sim.restoreState(checkpoint);
    assert.ok(Math.hypot(sim.position.x - expected.x, sim.position.z - expected.z) < .001, operation);
  }
});

test('real parked-car impacts, reverse and recovery stay coherent through multiplayer playback', context => {
  const service = new RoomService(), host = service.create({}, 1000), guest = service.join(host.room.code, {}, 1000);
  const code = host.room.code;
  for (const player of [host, guest]) {
    service.command(code, player.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, 1000);
    service.command(code, player.token, { type: 'ready', ready: true, profileRevision: 0, courseVersion: COURSE_VERSION }, 1000);
  }
  service.command(code, host.token, { type: 'start' }, 1000); service.tick(6000);
  const authoritative = service.auth(code, host.token).player.sim;
  // This is the actual Grant Avenue parked car configured by RoomService.
  // Position only the fixture; every impact and recovery comes from production physics.
  const obstacleProgress = routeProgressAt(175, 385), lane = 4.6;
  authoritative.seek(obstacleProgress - 10, lane); authoritative.state.speed = 30;
  authoritative.state.checkpoint = CHECKPOINTS.filter(progress => progress <= authoritative.state.progress).length;
  const packets: { room: RoomSnapshot; arrival: number }[] = [];
  let now = 6000, sequence = 0;
  const capture = (clock = now) => {
    const relative = authoritative.state.heading - routeYaw(authoritative.state.progress);
    const halfWidth = Math.abs(Math.cos(relative)) * .95 + Math.abs(Math.sin(relative)) * 2.1;
    const halfLength = Math.abs(Math.sin(relative)) * .95 + Math.abs(Math.cos(relative)) * 2.1;
    assert.ok(Math.abs(authoritative.state.lateral - lane) >= .925 + halfWidth - 1e-8
      || Math.abs(authoritative.state.progress - obstacleProgress) >= 2.1 + halfLength - 1e-8,
    'the authoritative car must remain strictly outside the parked car');
    packets.push({ room: service.snapshot(service.room(code), clock), arrival: clock + [40, 80, 55, 70][packets.length % 4] });
  };
  const advance = (milliseconds: number, input: DriveInput) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
      now += 50;
      service.command(code, host.token, { type: 'input', sequence: ++sequence, input }, now);
      service.touch(code, guest.token, now); service.tick(now); capture();
      if (sequence % 7 === 0) {
        service.command(code, host.token, { type: 'heartbeat' }, now + 15); capture(now + 15);
      }
    }
  };
  const gas = { ...neutral, throttle: 1 }, reverse = { ...neutral, brake: 1 };
  capture();
  for (let frame = 0; frame < 20 && authoritative.state.collisions === 0; frame++) advance(50, gas);
  assert.equal(authoritative.state.collisions, 1); assert.ok(authoritative.state.speed < 6);
  const contact = authoritative.state.progress;
  assert.ok(contact <= obstacleProgress - 4.2, 'the production parked car stops the approaching bumper');
  advance(1500, reverse); assert.ok(authoritative.state.progress < contact - 8);
  assert.equal(authoritative.state.collisions, 1);
  for (let frame = 0; frame < 60 && authoritative.state.collisions < 2; frame++) advance(50, gas);
  assert.equal(authoritative.state.collisions, 2);
  const reboundAt = now;
  advance(2000, gas);
  assert.equal(authoritative.state.collisions, 2, 'held gas exits the second impact without repeating the feedback');
  assert.ok(authoritative.state.speed > 10 && authoritative.state.progress > obstacleProgress, 'the automatic bounce returns the player to the race');
  const beforeRecovery = { ...authoritative.state };
  now += 25; service.command(code, host.token, { type: 'recover' }, now); capture();
  assert.equal(authoritative.state.collisions, 2); assert.equal(authoritative.state.checkpoint, beforeRecovery.checkpoint);
  assert.equal(authoritative.state.elapsed, (now - 6000) / 1000);
  assert.equal(authoritative.state.speed, 0); assert.ok(Math.abs(authoritative.state.lateral - lane) > 1.875);
  advance(2000, gas);
  assert.equal(authoritative.state.collisions, 2); assert.ok(authoritative.state.progress > obstacleProgress);

  packets.sort((a, b) => a.arrival - b.arrival);
  const buffer = new RacerSnapshotBuffer(), rendered = new DrivingSimulation([], { exploration: true });
  let cursor = 0, latest = packets[0].room, feedback = 0, previousCollisions = 0, previousElapsed = 0;
  let previousPose: { x: number; y: number; z: number } | undefined;
  let maximumRenderOverlap = 0;
  for (let frame = packets[0].arrival; frame <= packets.at(-1)!.arrival + 200; frame += 1000 / 60) {
    while (cursor < packets.length && packets[cursor].arrival <= frame) {
      const packet = packets[cursor++]; buffer.push(packet.room, packet.arrival);
      if ((packet.room.simulationAt ?? 0) >= (latest.simulationAt ?? 0)) latest = packet.room;
    }
    const player = buffer.sample(frame).find(player => player.id === host.id)!;
    rendered.applyNetworkState(player.state, player.position, player.exploring);
    assert.deepEqual(rendered.position, player.position, 'world-space playback reaches the actual car unchanged');
    assert.equal(rendered.exploring, false);
    assert.ok(rendered.state.elapsed >= previousElapsed); previousElapsed = rendered.state.elapsed;
    assert.ok(rendered.state.collisions >= previousCollisions, 'old frames cannot rewind collision feedback');
    if (rendered.state.collisions > previousCollisions) feedback += rendered.state.collisions - previousCollisions;
    previousCollisions = rendered.state.collisions;
    assert.equal(rendered.state.collisions, latest.players.find(player => player.id === host.id)!.state.collisions);
    // The car rotates while it recoils, so use its actual footprint rather than
    // the old fixed dimensions of a stopped, route-aligned car.
    const relative = rendered.state.heading - routeYaw(rendered.state.progress);
    const halfWidth = Math.abs(Math.cos(relative)) * .95 + Math.abs(Math.sin(relative)) * 2.1;
    const halfLength = Math.abs(Math.sin(relative)) * .95 + Math.abs(Math.cos(relative)) * 2.1;
    const overlap = Math.min(.925 + halfWidth - Math.abs(rendered.state.lateral - lane),
      2.1 + halfLength - Math.abs(rendered.state.progress - obstacleProgress));
    maximumRenderOverlap = Math.max(maximumRenderOverlap, overlap);
    // A 50ms linear pose blend approximates a curved corner sweep. Allow only
    // 2cm of visual overlap; authoritative physics above is checked exactly.
    assert.ok(overlap <= .02, `rendered footprint overlaps the parked car by ${overlap}m`);
    // Inspect the fully automatic second rebound, after the deliberate reverse
    // and before the explicit recover command which intentionally relocates it.
    if (frame >= reboundAt + 150 && frame <= reboundAt + 1950) {
      assert.ok(rendered.state.speed >= 0, 'the automatic bounce cannot flip the chase camera into reverse');
      if (previousPose) assert.ok(Math.hypot(rendered.position.x - previousPose.x, rendered.position.z - previousPose.z) < 1,
        'delayed or out-of-order snapshots cannot cause a backward camera snap');
    }
    previousPose = rendered.position;
  }
  assert.equal(feedback, 2, 'each real impact produces collision feedback once');
  context.diagnostic(`Maximum interpolated footprint overlap: ${(maximumRenderOverlap * 1000).toFixed(3)}mm`);
  assert.equal(rendered.state.collisions, 2); assert.equal(rendered.state.checkpoint, beforeRecovery.checkpoint);
  assert.deepEqual(rendered.position, authoritative.position);
  // Delayed pre-impact delivery also cannot replay a hit after recovery.
  buffer.push(packets[0].room, packets.at(-1)!.arrival + 250);
  const final = buffer.sample(packets.at(-1)!.arrival + 300).find(player => player.id === host.id)!;
  assert.equal(final.state.collisions, 2); assert.deepEqual(final.position, authoritative.position);
});

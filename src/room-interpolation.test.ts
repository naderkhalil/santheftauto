import test from 'node:test';
import assert from 'node:assert/strict';
import { RacerSnapshotBuffer } from './room-interpolation.ts';
import { RoomService } from '../server/rooms.ts';
import type { RacerSnapshot, RoomSnapshot } from './multiplayer-protocol.ts';

const initial = new RoomService().create({}, 0).room;
const racer = initial.players[0];
function room(at: number, x = at * .02, change: (player: RacerSnapshot) => void = () => {}): RoomSnapshot {
  const player = structuredClone(racer);
  player.position = { x, y: 5, z: 10 };
  Object.assign(player.state, { progress: x, lateral: x * .1, speed: 20, heading: Math.PI / 2, y: 5, elapsed: at / 1000 });
  change(player);
  return { ...initial, phase: 'racing', round: 1, roundId: 'round-one', serverNow: at, simulationAt: at, players: [player], entrants: [player] };
}
const near = (actual: number, expected: number, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not near ${expected}`);
const deviation = (values: number[]) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};

test('constant-speed motion stays smooth under jitter instead of chasing each arriving packet', t => {
  const buffer = new RacerSnapshotBuffer(), latency = [40, 85, 50, 70, 45, 90, 55, 65];
  const packets = Array.from({ length: 161 }, (_, index) => ({ at: index * 50, arrival: index * 50 + latency[index % latency.length] })).sort((a, b) => a.arrival - b.arrival);
  const bufferedSteps: number[] = [], chaseSteps: number[] = [];
  let packet = 0, target = 0, chase = 0, previousChase = 0, previousBuffered = 0;
  for (let frame = 0; frame < 480; frame++) {
    const now = frame * 1000 / 60;
    while (packet < packets.length && packets[packet].arrival <= now) {
      const next = packets[packet++]; buffer.push(room(next.at), next.arrival); target = next.at * .02;
    }
    const sampled = buffer.sample(now)[0];
    if (!sampled) continue;
    chase += (target - chase) * (1 - Math.exp(-24 / 60));
    if (now > 1500) { bufferedSteps.push(sampled.position.x - previousBuffered); chaseSteps.push(chase - previousChase); }
    previousBuffered = sampled.position.x; previousChase = chase;
    near(sampled.position.x, sampled.state.progress);
    near(sampled.position.y, sampled.state.y);
  }
  const bufferedJitter = deviation(bufferedSteps), chaseJitter = deviation(chaseSteps);
  t.diagnostic(`Per-frame motion deviation: ${bufferedJitter.toFixed(5)} m buffered, ${chaseJitter.toFixed(5)} m old chase (${(100 * (1 - bufferedJitter / chaseJitter)).toFixed(1)}% reduction).`);
  assert.ok(bufferedSteps.every(step => step >= 0), 'playback never moves backwards');
  assert.ok(bufferedJitter < chaseJitter * .2, `buffer deviation ${bufferedJitter}, old chase deviation ${chaseJitter}`);
  assert.ok(Math.max(...bufferedSteps) < .38, 'clock correction never creates a large forward jump at 20 m/s');
});

test('heading crosses the angle boundary the short way and the world pose stays coherent at road/plaza handoff', () => {
  const buffer = new RacerSnapshotBuffer({ delayMs: 50 });
  buffer.push(room(0, 0, player => { player.state.heading = Math.PI - .1; player.exploring = false; }), 40);
  buffer.push(room(100, 2, player => { player.state.heading = -Math.PI + .1; player.exploring = true; player.position.y = player.state.y = 7; }), 140);
  const sample = buffer.sample(140)[0];
  near(sample.position.x, 1); near(sample.position.y, 6); near(sample.state.y, 6);
  near(sample.state.progress, 1); near(sample.state.lateral, .1); near(sample.state.heading, Math.PI);
  assert.equal(sample.exploring, true, 'the authoritative mode is not reversed by old snapshots');
});

test('collision poses stop at the contact and authoritative counters cannot be replayed or rewound', () => {
  const buffer = new RacerSnapshotBuffer();
  for (let at = 0; at <= 500; at += 50) buffer.push(room(at, Math.min(at, 300) * .02, player => {
    if (at >= 300) { player.state.speed = 0; player.state.collisions = 1; player.state.checkpoint = 2; }
  }), at + 40);
  for (let now = 440; now < 1600; now += 1000 / 60) {
    const sample = buffer.sample(now)[0];
    assert.ok(sample.position.x <= 6, 'no extrapolation through the collision');
    assert.equal(sample.state.collisions, 1); assert.equal(sample.state.checkpoint, 2);
    assert.equal(sample.state.elapsed, .5);
  }
  near(buffer.sample(1800)[0].position.x, 6);
  buffer.push(room(250, 5), 1900);
  assert.equal(buffer.sample(1900)[0].state.collisions, 1, 'a delayed pre-collision packet is ignored');
});

test('recovery cuts the visual path instead of driving backwards through buildings, including same-step correction', () => {
  const buffer = new RacerSnapshotBuffer();
  buffer.push(room(0, 100), 40); buffer.push(room(50, 101), 90);
  buffer.sample(90);
  buffer.push(room(50, 30, player => { player.state.speed = 0; player.state.collisions = 2; }), 95);
  near(buffer.sample(100)[0].position.x, 30);
  near(buffer.sample(110)[0].position.x, 30);
  buffer.push(room(100, 31), 140);
  assert.ok(buffer.sample(140)[0].position.x >= 30);
});

test('same-physics heartbeats replace metadata without filling or moving the motion timeline', () => {
  const buffer = new RacerSnapshotBuffer({ delayMs: 50 });
  buffer.push(room(0, 0), 40); buffer.push(room(100, 2), 140);
  for (let index = 0; index < 100; index++) {
    const heartbeat = room(100, 2, player => { player.profile.name = 'Current racer'; });
    heartbeat.serverNow = 10000 + index;
    buffer.push(heartbeat, 141 + index / 10);
  }
  assert.equal(buffer.size, 2);
  const sample = buffer.sample(140)[0]; near(sample.position.x, 1);
  assert.equal(sample.profile.name, 'Current racer');
});

test('stalls and new rounds reset promptly, while completed results stay exact', () => {
  const buffer = new RacerSnapshotBuffer();
  buffer.push(room(0, 0), 40); buffer.push(room(50, 1), 90); buffer.sample(90);
  buffer.push(room(5000, 100), 5100);
  assert.equal(buffer.size, 1); near(buffer.sample(5100)[0].position.x, 100);
  const result = room(5050, 101, player => { player.finishTime = 5.05; player.rank = 1; player.state.finished = true; });
  buffer.push(result, 5150);
  const finished = buffer.sample(5150)[0]; near(finished.position.x, 101); assert.equal(finished.finishTime, 5.05); assert.equal(finished.rank, 1);
  const nextRound = room(6000, 0); nextRound.roundId = 'round-two'; nextRound.round = 2;
  buffer.push(nextRound, 6050);
  assert.equal(buffer.size, 1); near(buffer.sample(6050)[0].position.x, 0); assert.equal(buffer.sample(6050)[0].finishTime, null);
  buffer.reset(); assert.deepEqual(buffer.sample(7000), []);
});

test('a fifteen-minute stream retains bounded memory and no growing playback delay', () => {
  const buffer = new RacerSnapshotBuffer();
  let lastX = 0;
  for (let at = 0; at <= 900000; at += 50) {
    buffer.push(room(at), at + 40);
    const sample = buffer.sample(at + 40)[0];
    assert.ok(sample.position.x >= lastX); lastX = sample.position.x;
    assert.ok(buffer.size <= 32);
  }
  assert.ok(Math.abs(lastX - (900000 - 100) * .02) < .05, 'delay does not accumulate over a long race');
});

test('repeated 650ms packet stalls and bursts keep catch-up bounded without forward jumps', t => {
  const buffer = new RacerSnapshotBuffer();
  const packets = Array.from({ length: 1801 }, (_, index) => {
    const at = index * 50, cycle = Math.floor(at / 2000) * 2000;
    return { at, arrival: Math.max(at, cycle + 650) + 40 };
  });
  let cursor = 0, newest = 0, previous = 0, maxStep = 0, maxLag = 0;
  for (let frame = 0; frame < 5400; frame++) {
    const now = frame * 1000 / 60;
    while (cursor < packets.length && packets[cursor].arrival <= now) {
      const packet = packets[cursor++]; buffer.push(room(packet.at), packet.arrival); newest = packet.at;
    }
    const sampled = buffer.sample(now)[0]; if (!sampled) continue;
    if (now > 1500) {
      const step = sampled.position.x - previous;
      assert.ok(step >= -1e-9, 'a burst must never rewind playback');
      maxStep = Math.max(maxStep, step); maxLag = Math.max(maxLag, newest - sampled.state.progress / .02);
      assert.ok(sampled.position.x <= newest * .02 + 1e-9, 'nothing extrapolates beyond the newest pose');
    }
    previous = sampled.position.x;
  }
  t.diagnostic(`Repeated-stall maximum movement ${maxStep.toFixed(4)} m/frame; maximum buffered lag ${maxLag.toFixed(1)} ms.`);
  assert.ok(maxStep < .368, 'catch-up stays within 110% of ordinary 60fps movement');
  assert.ok(maxLag < 800, 'repeated stalls do not accumulate an ever-growing chase delay');
});

test('repeated collision stops never cross the latest contact or replay collision feedback', () => {
  const buffer = new RacerSnapshotBuffer(), packets: { at: number; arrival: number; room: RoomSnapshot }[] = [];
  for (let at = 0; at < 10000; at += 50) {
    const cycle = Math.floor(at / 1000), into = at % 1000;
    const state = room(at, cycle * 12 + Math.min(into, 600) * .02, player => {
      player.state.collisions = cycle + Number(into >= 600); player.state.speed = into < 600 ? 20 : 0;
    });
    packets.push({ at, arrival: at + (at % 200 === 0 ? 85 : 40), room: state });
  }
  packets.sort((a, b) => a.arrival - b.arrival);
  let cursor = 0, collisions = 0, latest = packets[0].room;
  for (let now = 100; now < 9900; now += 1000 / 60) {
    while (cursor < packets.length && packets[cursor].arrival <= now) { const next = packets[cursor++]; buffer.push(next.room, next.arrival); latest = next.room; }
    const sample = buffer.sample(now)[0];
    assert.ok(sample.state.collisions >= collisions); collisions = sample.state.collisions;
    assert.ok(sample.position.x <= latest.entrants[0].position.x + 1e-9);
  }
  assert.equal(collisions, 10);
});

test('countdown clock samples hand off to the racing physics clock without a pose jump', () => {
  const buffer = new RacerSnapshotBuffer();
  for (let at = 0; at < 5000; at += 50) {
    const countdown = room(at, 0); countdown.phase = 'countdown'; delete countdown.simulationAt;
    buffer.push(countdown, at + 40); near(buffer.sample(at + 40)[0].position.x, 0);
  }
  let previous = 0;
  for (let at = 5000; at <= 6000; at += 50) {
    const racing = room(at, (at - 5000) * .02); racing.serverNow = at + 30;
    buffer.push(racing, at + 40);
    const sample = buffer.sample(at + 40)[0];
    assert.ok(sample.position.x >= previous);
    assert.ok(sample.position.x - previous <= 1.1 + 1e-9); previous = sample.position.x;
  }
  near(previous, 18);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { GameAnalytics, type GameEvent } from '../src/game-analytics.ts';
import { COURSE_VERSION, type RoomSnapshot } from '../src/multiplayer-protocol.ts';
import { DEFAULT_PROFILE } from '../src/racer-profile.ts';
import { CHECKPOINTS, TRACK_LENGTH } from '../src/route.ts';
import { RoomService } from './rooms.ts';

type Captured = { event: GameEvent; properties: Record<string, unknown> };
const setup = (names: string[]) => {
  const service = new RoomService();
  const host = service.create({ ...DEFAULT_PROFILE, name: names[0] }, 1000);
  const racers = [host, ...names.slice(1).map(name => service.join(host.room.code, { ...DEFAULT_PROFILE, name }, 1000))];
  const browsers = racers.map(racer => {
    const events: Captured[] = [];
    return { id: racer.id, events, analytics: new GameAnalytics((event, properties) => events.push({ event, properties }), { storage: null }) };
  });
  return { service, code: host.room.code, host, racers, browsers };
};
type Fixture = ReturnType<typeof setup>;

function start(s: Fixture, now: number) {
  const room = s.service.room(s.code);
  for (const racer of s.racers.filter(racer => room.players.has(racer.id))) {
    const revision = s.service.auth(s.code, racer.token).player.profileRevision;
    s.service.command(s.code, racer.token, { type: 'selection', status: 'car', courseVersion: COURSE_VERSION }, now);
    s.service.command(s.code, racer.token, { type: 'ready', ready: true, profileRevision: revision, courseVersion: COURSE_VERSION }, now);
  }
  const host = s.racers.find(racer => racer.id === room.host)!;
  s.service.command(s.code, host.token, { type: 'start' }, now);
}

function observe(s: Fixture, now: number): RoomSnapshot {
  const snapshot = s.service.snapshot(s.service.room(s.code), now);
  // Match the browser: departed clients stop receiving room snapshots.
  for (const browser of s.browsers) {
    if (snapshot.players.some(player => player.id === browser.id)) browser.analytics.observeMultiplayer(snapshot, browser.id);
  }
  return snapshot;
}

function nearFinish(s: Fixture, index: number, distance = .1) {
  const player = s.service.auth(s.code, s.racers[index].token).player;
  player.sim.seek(TRACK_LENGTH - distance, 0);
  player.sim.state.checkpoint = CHECKPOINTS.length;
  player.sim.state.speed = 10;
}

function assertNoInvitations(s: Fixture) {
  const allEvents = s.browsers.flatMap(browser => browser.events);
  const serialized = JSON.stringify(allEvents);
  assert.ok(!serialized.includes(s.code), 'Analytics must not include the invitation code');
  for (const racer of s.racers) assert.ok(!serialized.includes(racer.token), 'Analytics must not include authentication tokens');
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert.doesNotMatch(key, /(?:^|_)(?:code|token)(?:$|_)/i);
      visit(item);
    }
  };
  visit(allEvents);
}

test('real race snapshots count each finisher once, retain departed friends, and distinguish rematches', () => {
  const names = ['Alex', 'Sam', 'Jo'];
  const s = setup(names);
  observe(s, 1000);
  assert.ok(s.browsers.every(browser => browser.events.length === 0));
  start(s, 1000);
  const initial = observe(s, 1000);
  observe(s, 1010);
  assert.equal(initial.phase, 'countdown');
  assert.match(initial.roundId!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.ok(s.browsers.every(browser => browser.events.length === 1 && browser.events[0].event === 'game_started'));

  s.service.command(s.code, s.racers[2].token, { type: 'leave' }, 6010);
  const afterDeparture = observe(s, 6010);
  assert.equal(afterDeparture.players.length, 2);
  assert.equal(afterDeparture.entrants.length, 3);
  assert.equal(afterDeparture.entrants.find(player => player.id === s.racers[2].id)?.dnfReason, 'left-race');

  nearFinish(s, 0);
  s.service.tick(6050);
  const firstFinish = observe(s, 6050);
  observe(s, 6050);
  assert.equal(firstFinish.phase, 'racing');
  assert.equal(s.browsers[0].events.filter(event => event.event === 'game_finished').length, 1);
  assert.equal(s.browsers[1].events.filter(event => event.event === 'game_finished').length, 0);

  nearFinish(s, 1);
  s.service.tick(6100);
  const result = observe(s, 6100);
  observe(s, 6100);
  assert.equal(result.phase, 'results');
  assert.equal(result.results!.entries.filter(entry => entry.finishTime !== null).length, 2);
  for (const [index, browser] of s.browsers.entries()) {
    const finishes = browser.events.filter(event => event.event === 'game_finished');
    assert.equal(finishes.length, index < 2 ? 1 : 0);
    for (const { properties } of browser.events) {
      assert.equal(properties.game_id, initial.roundId);
      assert.equal(properties.player_id, browser.id);
      assert.equal(properties.player_name, names[index]);
      assert.equal(properties.player_count, 3);
      assert.equal(properties.friends_count, 2);
      assert.deepEqual([...(properties.participant_names as string[])].sort(), [...names].sort());
      assert.deepEqual([...(properties.friend_names as string[])].sort(), names.filter((_, peer) => peer !== index).sort());
    }
    if (finishes.length) assert.equal(finishes[0].properties.finish_seconds, result.entrants.find(player => player.id === browser.id)!.finishTime);
  }

  s.service.command(s.code, s.host.token, { type: 'rematch' }, 6200);
  s.service.command(s.code, s.host.token, { type: 'profile', profile: { ...DEFAULT_PROFILE, name: 'Alex next race' }, revision: 1 }, 6250);
  observe(s, 6250);
  start(s, 6500);
  const rematch = observe(s, 6500);
  assert.notEqual(rematch.roundId, initial.roundId);
  assert.equal(rematch.entrants.length, 2);
  assert.equal(rematch.lastResults!.roundId, initial.roundId);
  for (const racer of s.racers.slice(0, 2)) s.service.touch(s.code, racer.token, 11500);
  nearFinish(s, 0); nearFinish(s, 1, .35);
  s.service.tick(11550);
  assert.equal(observe(s, 11550).phase, 'results');
  observe(s, 11560);

  for (const browser of s.browsers.slice(0, 2)) {
    assert.deepEqual(browser.events.map(event => event.event), ['game_started', 'game_finished', 'game_started', 'game_finished']);
    const finish = browser.events[3].properties;
    assert.equal(finish.game_id, rematch.roundId);
    assert.equal(finish.player_count, 2);
    assert.equal(finish.friends_count, 1);
    assert.deepEqual([...(finish.participant_names as string[])].sort(), ['Alex next race', 'Sam']);
    assert.deepEqual([...(browser.events[1].properties.participant_names as string[])].sort(), [...names].sort());
  }
  assert.equal(s.browsers[2].events.length, 1);
  assertNoInvitations(s);
});

test('an authoritative time-limit DNF is separate from the other browser finishing', () => {
  const s = setup(['Winner', 'Still racing']);
  start(s, 1000);
  observe(s, 1000);
  nearFinish(s, 0);
  s.service.tick(6050);
  observe(s, 6050);
  s.service.room(s.code).deadline = 6100;
  s.service.tick(6100);
  const results = observe(s, 6100);
  observe(s, 6100);
  assert.equal(results.phase, 'results');
  assert.deepEqual(s.browsers[0].events.map(event => event.event), ['game_started', 'game_finished']);
  assert.deepEqual(s.browsers[1].events.map(event => event.event), ['game_started', 'game_dnf']);
  const dnf = s.browsers[1].events[1].properties;
  assert.equal(dnf.dnf_reason, 'time-limit');
  assert.equal(dnf.player_name, 'Still racing');
  assert.equal(dnf.player_count, 2);
  assert.deepEqual(dnf.friend_names, ['Winner']);
  assert.ok(!('finish_seconds' in dnf));
  assertNoInvitations(s);
});

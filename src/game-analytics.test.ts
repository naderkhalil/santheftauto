import assert from 'node:assert/strict';
import test from 'node:test';
import { GameAnalytics, type GameEvent } from './game-analytics.ts';
import { DEFAULT_PROFILE } from './racer-profile.ts';
import type { RacerSnapshot, RoomSnapshot } from './multiplayer-protocol.ts';

const FIRST_GAME = 'd6fa0a41-b031-46bb-86ba-78c3e024ecfb';
const SECOND_GAME = '119b1d9b-ef58-4fce-b2f4-455239dcb83b';
type Captured = { event: GameEvent; properties: Record<string, unknown> };
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
};
const racer = (id: string, name: string): RacerSnapshot => ({
  id, profile: { ...DEFAULT_PROFILE, name }, finishTime: null, dnf: false, dnfReason: null,
} as RacerSnapshot);
const room = (): RoomSnapshot => ({
  code: 'PRIVATE1', round: 1, roundId: FIRST_GAME, phase: 'countdown',
  entrants: [racer('b', 'Sam'), racer('a', 'Alex'), racer('c', 'Alex')],
  players: [racer('a', 'A changed lobby nickname')],
} as RoomSnapshot);
const recorder = () => {
  const events: Captured[] = [];
  return { events, capture: (event: GameEvent, properties: Record<string, unknown>) => { events.push({ event, properties }); } };
};

test('solo snapshots the nickname, finishes once, and restarts as a fresh game', () => {
  const recorded = recorder(), ids = [FIRST_GAME, SECOND_GAME];
  const analytics = new GameAnalytics(recorded.capture, { storage: null, createId: () => ids.shift()! });
  const profile = { ...DEFAULT_PROFILE, name: 'My nickname' };
  analytics.finishSolo(1);
  analytics.startSolo(profile);
  profile.name = 'Changed later';
  analytics.finishSolo(65.2);
  analytics.finishSolo(65.2);
  analytics.startSolo(profile);
  analytics.finishSolo(62);
  assert.deepEqual(recorded.events.map(event => event.event), ['game_started', 'game_finished', 'game_started', 'game_finished']);
  const first = recorded.events[1].properties;
  assert.equal(first.player_name, 'My nickname');
  assert.equal(first.game_id, FIRST_GAME);
  assert.equal(first.mode, 'solo');
  assert.equal(first.player_count, 1);
  assert.equal(first.friends_count, 0);
  assert.deepEqual(first.participant_names, ['My nickname']);
  assert.deepEqual(first.friend_names, []);
  assert.equal(first.finish_seconds, 65.2);
  assert.equal(recorded.events[3].properties.game_id, SECOND_GAME);
  assert.equal(recorded.events[3].properties.player_name, 'Changed later');
});

test('clearing a solo race prevents a later free-drive finish from counting', () => {
  const recorded = recorder(), analytics = new GameAnalytics(recorded.capture, { storage: null });
  analytics.startSolo(DEFAULT_PROFILE);
  analytics.finishSolo(NaN); analytics.finishSolo(-1);
  analytics.clearSolo(); analytics.finishSolo(100);
  assert.deepEqual(recorded.events.map(event => event.event), ['game_started']);
});

test('multiplayer uses the frozen full lineup, retaining departed racers and duplicate nicknames', () => {
  const recorded = recorder(), analytics = new GameAnalytics(recorded.capture, { storage: null });
  const snapshot = room();
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.phase = 'racing'; snapshot.entrants[1].finishTime = 73.15;
  analytics.observeMultiplayer(snapshot, 'a');
  const finished = recorded.events[1].properties;
  assert.equal(finished.player_name, 'Alex');
  assert.equal(finished.player_count, 3);
  assert.equal(finished.friends_count, 2);
  assert.deepEqual(finished.participant_names, ['Alex', 'Sam', 'Alex']);
  assert.deepEqual(finished.friend_names, ['Sam', 'Alex']);
  assert.deepEqual(finished.participants, [
    { player_id: 'a', player_name: 'Alex' }, { player_id: 'b', player_name: 'Sam' }, { player_id: 'c', player_name: 'Alex' },
  ]);
  assert.equal(finished.finish_seconds, 73.15);
  assert.doesNotMatch(JSON.stringify(recorded.events), /PRIVATE1|changed lobby|dario/i);
});

test('repeated snapshots, reordered entrants, and reloads are deduplicated while rematches count', () => {
  const recorded = recorder(), persisted = storage();
  let analytics = new GameAnalytics(recorded.capture, { storage: persisted });
  const snapshot = room();
  analytics.observeMultiplayer(snapshot, 'a');
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.entrants.reverse();
  analytics = new GameAnalytics(recorded.capture, { storage: persisted });
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.phase = 'racing'; snapshot.entrants.find(player => player.id === 'a')!.finishTime = 80;
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.phase = 'results';
  analytics = new GameAnalytics(recorded.capture, { storage: persisted });
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.roundId = SECOND_GAME; snapshot.round++; snapshot.phase = 'countdown';
  snapshot.entrants.find(player => player.id === 'a')!.finishTime = null;
  analytics.observeMultiplayer(snapshot, 'a');
  assert.deepEqual(recorded.events.map(event => event.event), ['game_started', 'game_finished', 'game_started']);
  assert.equal(recorded.events[2].properties.game_id, SECOND_GAME);
});

test('restoring terminal snapshots records the outcome without inventing a start', () => {
  const recorded = recorder(), analytics = new GameAnalytics(recorded.capture, { storage: null });
  const snapshot = room(); snapshot.phase = 'results'; snapshot.entrants[0].finishTime = 99;
  analytics.observeMultiplayer(snapshot, 'b');
  analytics.observeMultiplayer(snapshot, 'b');
  analytics.observeMultiplayer(snapshot, 'a');
  assert.deepEqual(recorded.events.map(event => event.event), ['game_finished']);
  assert.equal(recorded.events[0].properties.player_id, 'b');
});

test('DNF is a separate outcome and another player finishing never counts for the local player', () => {
  const recorded = recorder(), analytics = new GameAnalytics(recorded.capture, { storage: null });
  const snapshot = room(); snapshot.phase = 'racing';
  snapshot.entrants[0].finishTime = 55;
  snapshot.entrants[1].dnf = true; snapshot.entrants[1].dnfReason = 'time-limit';
  analytics.observeMultiplayer(snapshot, 'a');
  analytics.observeMultiplayer(snapshot, 'a');
  assert.deepEqual(recorded.events.map(event => event.event), ['game_dnf']);
  assert.equal(recorded.events[0].properties.dnf_reason, 'time-limit');
  assert.ok(!('finish_seconds' in recorded.events[0].properties));
});

test('lobby, countdown outcomes, missing participants, and legacy invitation IDs are not captured', () => {
  const recorded = recorder(), analytics = new GameAnalytics(recorded.capture, { storage: null });
  const snapshot = room(); snapshot.phase = 'lobby';
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.phase = 'countdown'; snapshot.entrants[1].dnf = true;
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.entrants[1].dnf = false;
  analytics.observeMultiplayer(snapshot, 'missing');
  snapshot.roundId = 'PRIVATE1:1';
  analytics.observeMultiplayer(snapshot, 'a');
  snapshot.phase = 'results'; snapshot.entrants[1].finishTime = 88;
  analytics.observeMultiplayer(snapshot, 'a');
  assert.deepEqual(recorded.events, []);
});

test('blocked storage keeps in-memory deduplication and failed capture can retry safely', () => {
  const recorded = recorder(); let blocked = true;
  const analytics = new GameAnalytics((event, properties) => {
    if (blocked) throw new Error('SDK unavailable');
    recorded.capture(event, properties);
  }, { storage: { getItem: () => { throw new Error('Storage blocked'); }, setItem: () => { throw new Error('Storage blocked'); } } });
  const snapshot = room();
  assert.doesNotThrow(() => analytics.observeMultiplayer(snapshot, 'a'));
  blocked = false;
  analytics.observeMultiplayer(snapshot, 'a'); analytics.observeMultiplayer(snapshot, 'a');
  assert.equal(recorded.events.length, 1);
});

test('the stored event ledger stays bounded', () => {
  const persisted = storage(), analytics = new GameAnalytics(() => {}, { storage: persisted });
  for (let index = 0; index < 200; index++) { analytics.startSolo(DEFAULT_PROFILE); analytics.finishSolo(60); }
  const keys: string[] = JSON.parse([...persisted.values.values()][0]);
  assert.equal(keys.length, 256);
  assert.equal(new Set(keys).size, 256);
});

test('solo tracking works on HTTP without randomUUID and when crypto is restricted', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const recorded = recorder();
  try {
    let randomValuesCalled = false;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
      getRandomValues: (bytes: Uint8Array) => { randomValuesCalled = true; bytes.fill(12); return bytes; },
    } });
    const analytics = new GameAnalytics(recorded.capture, { storage: null });
    analytics.startSolo(DEFAULT_PROFILE);
    assert.equal(randomValuesCalled, true);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, get: () => { throw new Error('Crypto restricted'); } });
    assert.doesNotThrow(() => analytics.startSolo(DEFAULT_PROFILE));
    assert.equal(recorded.events.length, 2);
    for (const event of recorded.events) assert.match(String(event.properties.game_id), /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});

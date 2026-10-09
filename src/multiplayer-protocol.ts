import type { DriveInput, DriveState } from './driving.ts';
import type { RacerProfile } from './racer-profile.ts';

export const ROOM_CAPACITY = 8;
export const COURSE_VERSION = 'city-loop-v1';
export const RECONNECT_GRACE_MS = 30_000;
export type RoomPhase = 'lobby' | 'countdown' | 'racing' | 'results';
export type SelectionStatus = 'driver' | 'car' | 'loading' | 'load-failed' | 'ready';
export type DnfReason = 'time-limit' | 'disconnected' | 'left-race';
export type RacerSnapshot = {
  id: string;
  profile: RacerProfile;
  profileRevision: number;
  readyRevision: number | null;
  ready: boolean;
  connected: boolean;
  reconnectUntil: number | null;
  selectionStatus: SelectionStatus;
  loadedCourseVersion: string | null;
  state: DriveState;
  position: { x: number; y: number; z: number };
  exploring: boolean;
  finishTime: number | null;
  dnf: boolean;
  dnfReason: DnfReason | null;
  rank: number | null;
};
export type ResultEntry = {
  id: string;
  profile: RacerProfile;
  place: number | null;
  finishTime: number | null;
  gap: number | null;
  tied: boolean;
  dnfReason: DnfReason | null;
  checkpoint: number;
  progress: number;
};
export type RoundResult = {
  roundId: string;
  round: number;
  courseVersion: string;
  completedAt: number;
  entries: ResultEntry[];
};
export type RoomSnapshot = {
  code: string;
  host: string;
  phase: RoomPhase;
  round: number;
  roundId: string | null;
  courseVersion: string;
  startAt: number;
  serverNow: number;
  /** Time represented by racing positions; independent of later clock/metadata replies. */
  simulationAt?: number;
  deadline: number;
  players: RacerSnapshot[];
  entrants: RacerSnapshot[];
  results: RoundResult | null;
  lastResults: RoundResult | null;
};
export type RoomCommand =
  | { type: 'profile'; profile: RacerProfile; revision: number }
  | { type: 'selection'; status: Exclude<SelectionStatus, 'ready'>; courseVersion?: string | null }
  | { type: 'ready'; ready: boolean; profileRevision?: number; courseVersion?: string }
  | { type: 'remove'; playerId: string }
  | { type: 'start' | 'rematch' | 'recover' | 'leave' | 'heartbeat' }
  | { type: 'input'; sequence: number; input: DriveInput };

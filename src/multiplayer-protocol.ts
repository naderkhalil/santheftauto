import type { DriveInput, DriveState } from './driving.ts';
import type { RacerProfile } from './racer-profile.ts';
export type RoomPhase = 'lobby' | 'countdown' | 'racing' | 'results';
export type RacerSnapshot = { id: string; profile: RacerProfile; ready: boolean; connected: boolean; state: DriveState; position: {x:number;y:number;z:number}; exploring: boolean; finishTime: number | null; dnf: boolean };
export type RoomSnapshot = { code: string; host: string; phase: RoomPhase; round: number; startAt: number; serverNow: number; deadline: number; players: RacerSnapshot[] };
export type RoomCommand = { type: 'profile'; profile: RacerProfile } | { type: 'ready'; ready: boolean } | { type: 'start' | 'rematch' | 'recover' | 'leave' } | { type: 'input'; sequence: number; input: DriveInput };
export const ROOM_CAPACITY = 8;

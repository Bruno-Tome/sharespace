import { Redis } from "@upstash/redis";
import type { Room, Signal } from "./types";

const TTL = 60 * 60 * 8;
type State = Room & { signals: Signal[] };
const globalState = globalThis as typeof globalThis & { __sharespaceRooms?: Map<string, State> };
const memory = globalState.__sharespaceRooms ?? (globalState.__sharespaceRooms = new Map<string, State>());
const key = (id: string) => `sharespace:room:${id}`;
const redisConfig = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
};
export function newRoom(hostId: string): Room { const now = Date.now(); return { id: crypto.randomUUID().replaceAll("-", "").slice(0, 10), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL * 1000).toISOString(), hostId, participants: [] }; }
export async function getRoom(id: string) { const redis = redisConfig(); const room = redis ? await redis.get<State>(key(id)) : memory.get(id); if (!room || Date.parse(room.expiresAt) < Date.now()) return null; return room; }
export async function saveRoom(room: Room, signals?: Signal[]) { const previous = "signals" in room ? (room as State).signals : []; const state = { ...room, signals: signals ?? previous }; const redis = redisConfig(); if (redis) await redis.set(key(room.id), state, { ex: TTL }); else memory.set(room.id, state); return room; }
export async function addSignal(id: string, signal: Signal) { const room = await getRoom(id); if (!room) return null; const state = { ...room, signals: [...("signals" in room ? (room as State).signals : []), signal].slice(-100) }; await saveRoom(state, state.signals); return state; }
export async function consumeSignals(id: string, participantId: string) { const room = await getRoom(id) as State | null; if (!room) return null; const signals = room.signals.filter((s) => s.to === participantId || (!s.to && s.from !== participantId)); await saveRoom(room, room.signals.filter((s) => !signals.includes(s))); return { room, signals }; }
export interface RoomStore { get(id: string): Promise<Room | null>; }
export function getRoomStore(): RoomStore { return { get: getRoom }; }

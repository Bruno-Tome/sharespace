import { Redis } from "@upstash/redis";
import type { Room, Signal } from "./types";

const TTL = 60 * 60 * 8;
export const PRESENCE_TTL = 60_000;
type State = Room & { signals: Signal[] };
const globalState = globalThis as typeof globalThis & { __sharespaceRooms?: Map<string, State> };
const memory = globalState.__sharespaceRooms ?? (globalState.__sharespaceRooms = new Map<string, State>());
const key = (id: string) => `sharespace:room:${id}`;
const redisConfig = () => {
  const url = process.env.UPSTASH_REDIS_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
  const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
};
export function newRoom(hostId: string): Room { const now = Date.now(); return { id: crypto.randomUUID().replaceAll("-", "").slice(0, 10), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL * 1000).toISOString(), hostId, participants: [] }; }
const atomicMutation = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local state = cjson.decode(raw)
local op = ARGV[1]
local data = cjson.decode(ARGV[2])
if op == 'join' then
  table.insert(state.participants, data)
elseif op == 'heartbeat' then
  for _, p in ipairs(state.participants) do if p.id == data.id then p.lastSeen = data.lastSeen end end
elseif op == 'leave' then
  local kept = {}; for _, p in ipairs(state.participants) do if p.id ~= data.id then table.insert(kept, p) end end; state.participants = kept
elseif op == 'share' then
  for _, p in ipairs(state.participants) do if p.id == data.id then p.sharing = data.value end end
elseif op == 'prune' then
  local kept = {}; for _, p in ipairs(state.participants) do if not p.lastSeen or p.lastSeen >= data.cutoff then table.insert(kept, p) end end; state.participants = kept
elseif op == 'signal_add' then
  state.signals = state.signals or {}; table.insert(state.signals, data); while #state.signals > 100 do table.remove(state.signals, 1) end
elseif op == 'signal_consume' then
  local kept = {}; local found = {}; for _, s in ipairs(state.signals or {}) do if s.to == data.id or (not s.to and s.from ~= data.id) then table.insert(found, s) else table.insert(kept, s) end end; state.signals = kept
  redis.call('SET', KEYS[1], cjson.encode(state), 'EX', ARGV[3]); return cjson.encode({ room = state, signals = found })
end
redis.call('SET', KEYS[1], cjson.encode(state), 'EX', ARGV[3]); return cjson.encode(state)
`;
async function atomicUpdate(id: string, operation: string, data: unknown) { const redis = redisConfig(); if (!redis) return null; const result = await redis.eval(atomicMutation, [key(id)], [operation, JSON.stringify(data), String(TTL)]); if (!result) return null; return typeof result === "string" ? JSON.parse(result) : result; }
export async function getRoom(id: string) { const redis = redisConfig(); const room = redis ? await redis.get<State>(key(id)) : memory.get(id); if (!room || Date.parse(room.expiresAt) < Date.now()) return null; return room; }
export async function pruneStaleParticipants(room: Room) { const cutoff = new Date(Date.now() - PRESENCE_TTL).toISOString(); const updated = await atomicUpdate(room.id, "prune", { cutoff }); if (updated) return updated as Room; const active = room.participants.filter((p) => Date.parse(p.lastSeen ?? p.joinedAt) >= Date.parse(cutoff)); if (active.length !== room.participants.length) { room.participants = active; await saveRoom(room); } return room; }
export async function mutateRoom(id: string, operation: string, data: any) { const updated = await atomicUpdate(id, operation, data); if (updated) return updated; const room = await getRoom(id) as State | null; if (!room) return null; if (operation === "join") room.participants.push(data); if (operation === "heartbeat") { const p = room.participants.find((x) => x.id === data.id); if (p) p.lastSeen = data.lastSeen; } if (operation === "leave") room.participants = room.participants.filter((p) => p.id !== data.id); if (operation === "share") { const p = room.participants.find((x) => x.id === data.id); if (p) p.sharing = data.value; } await saveRoom(room, room.signals); return room; }
export async function saveRoom(room: Room, signals?: Signal[]) { const previous = "signals" in room ? (room as State).signals : []; const state = { ...room, signals: signals ?? previous }; const redis = redisConfig(); if (redis) await redis.set(key(room.id), state, { ex: TTL }); else memory.set(room.id, state); return room; }
export async function addSignal(id: string, signal: Signal) { const updated = await atomicUpdate(id, "signal_add", signal); if (updated) return updated; const room = await getRoom(id); if (!room) return null; const state = { ...room, signals: [...("signals" in room ? (room as State).signals : []), signal].slice(-100) }; await saveRoom(state, state.signals); return state; }
export async function consumeSignals(id: string, participantId: string) { const updated = await atomicUpdate(id, "signal_consume", { id: participantId }); if (updated) return updated; const room = await getRoom(id) as State | null; if (!room) return null; const signals = room.signals.filter((s) => s.to === participantId || (!s.to && s.from !== participantId)); if (signals.length) await saveRoom(room, room.signals.filter((s) => !signals.includes(s))); return { room, signals }; }
export interface RoomStore { get(id: string): Promise<Room | null>; }
export function getRoomStore(): RoomStore { return { get: getRoom }; }

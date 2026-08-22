import { describe, expect, it } from "vitest";
import { RoomStore } from "@/lib/room-store";
import { roomInputSchema } from "@/lib/validation";

class TestStore implements RoomStore { private data = new Map<string, any>(); async list() { return [...this.data.values()]; } async get(id: string) { return this.data.get(id) ?? null; } async create(input: any) { const room = { ...input, id: "test", participants: 0, createdAt: "now", updatedAt: "now" }; this.data.set(room.id, room); return room; } async update(id: string, input: any) { const old = this.data.get(id); if (!old) return null; const room = { ...old, ...input }; this.data.set(id, room); return room; } async remove(id: string) { return this.data.delete(id); } }
describe("room store contract", () => { it("supports create, update and remove", async () => { const store = new TestStore(); const input = roomInputSchema.parse({ name: "Pairing" }); await store.create(input); expect((await store.get("test"))?.name).toBe("Pairing"); await store.update("test", { ...input, name: "Deep work" }); expect((await store.get("test"))?.name).toBe("Deep work"); expect(await store.remove("test")).toBe(true); }); });

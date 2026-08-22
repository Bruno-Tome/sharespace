import { NextResponse } from "next/server";
import { newRoom, saveRoom } from "@/lib/room-store";
export const runtime = "nodejs";
export async function POST() { const hostId = crypto.randomUUID(); const room = newRoom(hostId); room.participants = [{ id: hostId, name: "Host", host: true, sharing: false, joinedAt: new Date().toISOString() }]; await saveRoom(room); return NextResponse.json({ roomId: room.id, participantId: hostId }); }

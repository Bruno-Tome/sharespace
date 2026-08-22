import { NextResponse } from "next/server";
import { newRoom, saveRoom } from "@/lib/room-store";
export const runtime = "nodejs";
export async function POST() { try { const hostId = crypto.randomUUID(); const room = newRoom(hostId); const now = new Date().toISOString(); room.participants = [{ id: hostId, name: "Host", host: true, sharing: false, joinedAt: now, lastSeen: now }]; await saveRoom(room); return NextResponse.json({ roomId: room.id, participantId: hostId }); } catch (error) { console.error("room creation failed", error); return NextResponse.json({ error: "Não foi possível criar a sala agora." }, { status: 503 }); } }

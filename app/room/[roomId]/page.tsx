import { notFound } from "next/navigation";
import { getRoom } from "@/lib/room-store";
import { RoomView } from "@/components/room-view";

export const dynamic = "force-dynamic";
export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) { const { roomId } = await params; const room = await getRoom(roomId); if (!room) notFound(); return <RoomView room={room} />; }

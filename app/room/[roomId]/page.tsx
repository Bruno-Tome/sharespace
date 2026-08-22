"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RoomView } from "@/components/room-view";
import type { Room } from "@/lib/types";
import Link from "next/link";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/rooms/${roomId}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setRoom(data);
      })
      .catch((e: Error) => setError(e.message));
  }, [roomId]);
  if (error)
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Sala indisponível</h1>
          <p className="mt-2 text-zinc-400">{error}</p>
          <Link href="/" className="mt-6 inline-block text-violet-300">
            Voltar ao início
          </Link>
        </div>
      </main>
    );
  if (!room)
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-400">
        Carregando sala…
      </main>
    );
  return <RoomView room={room} />;
}

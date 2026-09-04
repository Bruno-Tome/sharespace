"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
type S = { type: "offer" | "answer" | "ice"; payload: any; from: string; to?: string };

export function getIceServers(env: Partial<Record<string, string | undefined>>) {
  return [
    { urls: env.NEXT_PUBLIC_STUN_SERVER_URL || "stun:stun.l.google.com:19302" },
    ...(env.NEXT_PUBLIC_TURN_SERVER_URL
      ? [{
          urls: env.NEXT_PUBLIC_TURN_SERVER_URL,
          username: env.NEXT_PUBLIC_TURN_USERNAME,
          credential: env.NEXT_PUBLIC_TURN_PASSWORD,
        }]
      : []),
  ];
}

export function useWebRTC(roomId: string, participantId: string, participantIds: string[]) {
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState("Conectando");
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const stream = useRef<MediaStream | null>(null);
  const iceServers = useMemo(() => getIceServers(process.env), []);
  const send = useCallback((s: S) => fetch(`/api/signal?roomId=${roomId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }), [roomId]);
  const connectPeer = useCallback(async (id: string, initiator: boolean) => {
    if (id === participantId || peers.current.has(id)) return;
    const pc = new RTCPeerConnection({ iceServers });
    peers.current.set(id, pc);
    stream.current?.getTracks().forEach((t) => pc.addTrack(t, stream.current!));
    pc.ontrack = (e) => setRemote(e.streams[0] ?? null);
    pc.onicecandidate = (e) => e.candidate && void send({ type: "ice", payload: e.candidate.toJSON(), from: participantId, to: id });
    pc.onconnectionstatechange = () => { if (pc.connectionState === "connected") setStatus("Conectado"); if (["failed", "disconnected"].includes(pc.connectionState)) setStatus("Conexão instável"); };
    if (initiator) { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await send({ type: "offer", payload: offer, from: participantId, to: id }); }
  }, [participantId, send, iceServers]);
  const idsKey = participantIds.join(",");
  useEffect(() => { if (participantId) for (const id of participantIds) if (participantId < id) void connectPeer(id, true); }, [connectPeer, participantId, idsKey]);
  useEffect(() => {
    let alive = true; let polling = false; const pending = new Map<string, RTCIceCandidateInit[]>();
    const poll = async () => { if (!alive || !participantId || polling) return; polling = true; try { const r = await fetch(`/api/signal?roomId=${roomId}&participantId=${participantId}`, { cache: "no-store" }).catch(() => null); if (!r?.ok) return; const d = await r.json(); for (const s of d.signals as S[]) { await connectPeer(s.from, false); const pc = peers.current.get(s.from); if (!pc || pc.connectionState === "closed") continue; try { if (s.type === "offer") { if (pc.signalingState !== "stable") continue; await pc.setRemoteDescription(s.payload); for (const c of pending.get(s.from) ?? []) await pc.addIceCandidate(c); pending.delete(s.from); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await send({ type: "answer", payload: answer, from: participantId, to: s.from }); } else if (s.type === "answer") { if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription(s.payload); } else if (pc.remoteDescription) await pc.addIceCandidate(s.payload); else pending.set(s.from, [...(pending.get(s.from) ?? []), s.payload]); } catch { /* Ignore stale or incompatible signaling messages. */ } } } finally { polling = false; } };
    const timer = window.setInterval(() => void poll(), 1500); void poll(); return () => { alive = false; window.clearInterval(timer); peers.current.forEach((p) => p.close()); peers.current.clear(); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setRemote(null); };
  }, [connectPeer, participantId, roomId, send]);
  const setStream = useCallback((next: MediaStream | null) => { stream.current = next; peers.current.forEach((pc, id) => { if (!next || pc.signalingState !== "stable") return; next.getTracks().forEach((t) => pc.addTrack(t, next)); void (async () => { try { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await send({ type: "offer", payload: offer, from: participantId, to: id }); } catch { /* Ignore a peer that is already negotiating or closed. */ } })(); }); }, [participantId, send]);
  return { remote, status, setStream };
}

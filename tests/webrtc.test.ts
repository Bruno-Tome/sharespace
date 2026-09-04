import { describe, expect, it } from "vitest";
import { getIceServers } from "@/lib/webrtc";

describe("WebRTC ICE configuration", () => {
  it("includes the configured TURN server and credentials", () => {
    expect(getIceServers({
      NEXT_PUBLIC_STUN_SERVER_URL: "stun:stun.example.com:3478",
      NEXT_PUBLIC_TURN_SERVER_URL: "turn:turn.example.com:3478",
      NEXT_PUBLIC_TURN_USERNAME: "sharespace",
      NEXT_PUBLIC_TURN_PASSWORD: "secret",
    })).toEqual([
      { urls: "stun:stun.example.com:3478" },
      { urls: "turn:turn.example.com:3478", username: "sharespace", credential: "secret" },
    ]);
  });

  it("keeps the public STUN fallback when TURN is not configured", () => {
    expect(getIceServers({})).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
    ]);
  });
});
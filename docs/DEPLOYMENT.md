# Production setup

ShareSpace uses an adapter boundary in `lib/room-store.ts`. With no environment variables it uses an in-memory store, which is ideal for local development but resets when the process restarts and is not shared between server instances.

For Vercel, create an Upstash Redis database and add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the project environment. The Redis adapter then stores rooms under `sharespace:room:*` and maintains a `sharespace:rooms` set.

## Signaling limitations

The WebRTC client in `lib/webrtc.ts` is intentionally a small hook that creates a peer connection and connects to `/api/signal`. The route detects the runtime's `experimental_upgradeWebSocket` capability and returns a clear `426` fallback when it is unavailable. WebSocket support is deployment/runtime-dependent; Vercel deployments should follow the current WebSocket/Fluid compute guidance or use a dedicated signaling service (for example, a small stateful WebSocket server). The current route does not provide durable room membership, authentication, TURN credentials, or message fan-out by itself.

Before production, add authentication, authorization, rate limiting, a TURN server for restrictive networks, and a signaling implementation that broadcasts offers, answers, and ICE candidates to peers sharing a room ID.

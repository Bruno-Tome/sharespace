# Production setup

ShareSpace uses an adapter boundary in `lib/room-store.ts`. With no environment variables it uses an in-memory store, which is ideal for local development but resets when the process restarts and is not shared between server instances.

For Vercel, configure the Upstash/Vercel KV variables `UPSTASH_REDIS_KV_REST_API_URL` and `UPSTASH_REDIS_KV_REST_API_TOKEN`. The read-only token is intentionally not used because room creation, presence, locks, and signaling require writes. `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` and `REDIS_URL`/`REDIS_TOKEN` remain supported as fallbacks. Redis is required in production: without it, the app uses process-local memory and rooms can disappear when a serverless instance changes or the development server restarts.

## Signaling limitations

The WebRTC client in `lib/webrtc.ts` is intentionally a small hook that creates a peer connection and connects to `/api/signal`. The route detects the runtime's `experimental_upgradeWebSocket` capability and returns a clear `426` fallback when it is unavailable. WebSocket support is deployment/runtime-dependent; Vercel deployments should follow the current WebSocket/Fluid compute guidance or use a dedicated signaling service (for example, a small stateful WebSocket server). The current route does not provide durable room membership, authentication, TURN credentials, or message fan-out by itself.

Before production, add authentication, authorization, rate limiting, a TURN server for restrictive networks, and a signaling implementation that broadcasts offers, answers, and ICE candidates to peers sharing a room ID.

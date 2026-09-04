# ShareSpace

ShareSpace is an account-free, browser-based screen-sharing MVP. A host creates a temporary room, shares its URL or 10-character code, and streams a captured screen to as many as seven guests over WebRTC.

The current interface is in Brazilian Portuguese. The repository is a single Next.js application containing the UI, room API, ephemeral state adapter, and polling-based WebRTC signaling API.

> [!IMPORTANT]
> A ShareSpace room is **unlisted**, not access-controlled. Anyone with its URL can join, and the application currently has no authentication, authorization, rate limiting, or abuse controls. Read [Security and privacy](#security-and-privacy) and [Known limitations](#known-limitations) before deploying it publicly.

## Current capabilities

- Create a room without an account.
- Join by invite URL or room code with a display name.
- Accommodate up to eight listed participants, including the host.
- Capture a screen through the browser's `getDisplayMedia` API.
- Send screen media directly between browsers through WebRTC.
- Allow one participant at a time to claim the presenter state.
- Copy a clean invite URL without participant credentials.
- Track presence with client polling and prune stale participants.
- Expire room records eight hours after creation.
- Keep state in memory for local work or in Upstash Redis for shared deployments.
- Collect Vercel Analytics and Speed Insights when supported by the deployment.

## Product flow

1. The host selects **Criar sala privada** on `/`.
2. `POST /api/rooms` creates a room and a host participant named `Host`.
3. The host is redirected to `/room/{roomId}?host={participantId}`.
4. A guest opens `/room/{roomId}`, chooses a unique display name, and joins.
5. Joined clients refresh room state every three seconds. Those requests also update their presence timestamps.
6. A presenter grants browser screen-capture permission. The app marks that participant as sharing and negotiates one WebRTC peer connection per other participant.
7. Clients exchange offers, answers, and ICE candidates through `/api/signal`, polling every 1.5 seconds.
8. A participant can leave explicitly. Otherwise, a participant whose presence is older than 60 seconds is removed during a later room read or join.

Rooms receive a fixed `expiresAt` timestamp at creation. Once it passes, reads treat the room as expired even if its backing Redis key still exists.

## Architecture

```text
Browser A                                   Browser B
┌─────────────────────┐                   ┌─────────────────────┐
│ Next.js client UI   │◄── WebRTC media ─►│ Next.js client UI   │
│ room + signal polls │                   │ room + signal polls │
└──────────┬──────────┘                   └──────────┬──────────┘
           │ HTTP room state + signaling messages   │
           └──────────────────┬──────────────────────┘
                              ▼
                    ┌───────────────────┐
                    │ Next.js route API │
                    └─────────┬─────────┘
                              ▼
                 ┌────────────────────────┐
                 │ Room store abstraction │
                 └────────────┬───────────┘
                         local│or configured
                    ┌─────────┴─────────┐
                    ▼                   ▼
             in-memory Map       Upstash Redis
```

### Application layers

| Area | Responsibility |
| --- | --- |
| `app/page.tsx` | Landing page, room creation, and room-code navigation |
| `app/room/[roomId]/page.tsx` | Initial room lookup plus loading and unavailable states |
| `components/room-view.tsx` | Join flow, presence refresh, participant UI, capture controls, and video elements |
| `lib/webrtc.ts` | Peer connection lifecycle, ICE configuration, negotiation, and signal polling |
| `app/api/rooms/**` | Room creation, reads, joins, presence, sharing, and leave operations |
| `app/api/signal/route.ts` | Store-and-consume signaling transport for offers, answers, and ICE candidates |
| `lib/room-store.ts` | Memory/Redis selection, room lifetime, presence pruning, atomic Redis mutations, and signal queues |
| `lib/validation.ts` | Zod schemas for joining, signaling, and the currently unused room metadata input |
| `lib/types.ts` | Shared `Room`, `Participant`, and `Signal` shapes |

All API routes use the Node.js runtime. There is no separate backend service, database schema, migration system, or WebSocket server in this repository.

## Domain model and invariants

### Room

```ts
type Room = {
  id: string;
  createdAt: string;
  expiresAt: string;
  hostId: string;
  participants: Participant[];
  name?: string;
  description?: string;
  color?: "violet" | "cyan" | "amber" | "rose";
};
```

- `id` is the first 10 hexadecimal characters of a UUID without hyphens.
- `createdAt` and `expiresAt` are ISO timestamps.
- Room lifetime is eight hours (`TTL = 60 * 60 * 8`).
- The public creation flow does not currently set `name`, `description`, or `color`.
- The persistence layer adds an internal `signals` array to the stored room record.

### Participant

```ts
type Participant = {
  id: string;
  name: string;
  host: boolean;
  sharing: boolean;
  joinedAt: string;
  lastSeen?: string;
};
```

- Host and participant IDs are UUIDs generated by the server unless a guest presents an existing ID when joining.
- Guest names are trimmed, must contain 1–40 characters, and must be unique within the room ignoring case.
- A room rejects a join when it already contains eight participants.
- Presence is considered stale after 60 seconds.
- The API rejects a request to begin sharing when another participant is already marked as sharing.

### Signal

Signals have an ID, sender ID, optional recipient ID, type (`offer`, `answer`, or `ice`), and an unstructured payload. Each room retains at most the latest 100 signals. Consuming signals removes messages addressed to that participant, plus untargeted messages from other participants.

## State and persistence

`lib/room-store.ts` chooses its adapter at runtime:

1. Use Redis when a supported URL and token are both present.
2. Otherwise, use a `globalThis` in-memory `Map`.

The in-memory adapter is useful for development and automated tests, but:

- state disappears when the process restarts;
- state is not shared across processes or server instances;
- serverless requests may reach different instances and see different rooms.

The Redis adapter stores each room at `sharespace:room:{roomId}`. Join, heartbeat, leave, sharing, pruning, signal append, and signal consumption use a Lua script so each mutation is atomic inside Redis. Mutations refresh the Redis key TTL, while the room's fixed `expiresAt` still determines application-level expiry.

### Redis configuration precedence

The first truthy URL and token in these independent precedence lists are paired:

```text
URL:   UPSTASH_REDIS_KV_REST_API_URL
       → UPSTASH_REDIS_REST_URL
       → REDIS_URL

Token: UPSTASH_REDIS_KV_REST_API_TOKEN
       → UPSTASH_REDIS_REST_TOKEN
       → REDIS_TOKEN
```

For predictable behavior, configure both variables from the same pair.

## WebRTC and signaling

Media and signaling take different paths:

- **Media:** browser to browser through `RTCPeerConnection`; it does not pass through the Next.js API.
- **Signaling:** JSON messages sent to and polled from the Next.js API, then retained briefly in room state.

For each other participant, the client with the lexicographically smaller participant ID initiates the connection. The presenter adds captured video tracks to every peer connection. ICE candidates that arrive before a remote description are queued in that browser until the offer is applied.

The UI holds one remote `MediaStream`, which matches the current one-presenter product rule. Audio capture is explicitly disabled.

### ICE server configuration

| Variable | Required | Behavior |
| --- | --- | --- |
| `NEXT_PUBLIC_STUN_SERVER_URL` | No | Defaults to `stun:stun.l.google.com:19302` |
| `NEXT_PUBLIC_TURN_SERVER_URL` | No | Adds a TURN server when present |
| `NEXT_PUBLIC_TURN_USERNAME` | With authenticated TURN | Passed to `RTCPeerConnection` |
| `NEXT_PUBLIC_TURN_PASSWORD` | With authenticated TURN | Passed as the TURN credential |

Because these variables are prefixed with `NEXT_PUBLIC_`, their values are included in client-side code. Do not use a long-lived privileged secret as a TURN credential; production systems should issue short-lived credentials.

## HTTP API

### Create a room

```http
POST /api/rooms
```

No request body is used.

```json
{
  "roomId": "0123abcdef",
  "participantId": "uuid"
}
```

Returns `503` when room persistence fails.

### Read a room and refresh presence

```http
GET /api/rooms/{roomId}?participantId={participantId}
```

The participant query parameter is optional. When it matches a participant, the server updates `lastSeen`. The response is the room object. Returns `404` for a missing or expired room.

### Join a room

```http
POST /api/rooms/{roomId}
Content-Type: application/json

{
  "name": "Bruno",
  "participantId": "optional-existing-id"
}
```

Successful response:

```json
{
  "room": { "id": "0123abcdef", "participants": [] },
  "participantId": "uuid"
}
```

Returns `400` for an invalid name, `404` for a missing/expired room, or `409` for a full room or duplicate display name.

### Update participant state

```http
PATCH /api/rooms/{roomId}
Content-Type: application/json
```

Supported bodies:

```json
{ "participantId": "uuid", "action": "heartbeat" }
{ "participantId": "uuid", "action": "leave" }
{ "participantId": "uuid", "action": "share", "value": true }
```

Returns `403` when the participant ID is not in the room and `409` when somebody else is already presenting. Unknown actions currently return the unchanged room.

### Publish a signal

```http
POST /api/signal?roomId={roomId}
Content-Type: application/json

{
  "from": "sender-participant-id",
  "to": "optional-recipient-participant-id",
  "type": "offer | answer | ice",
  "payload": {}
}
```

The sender must be listed in the room. Successful requests return `{ "ok": true }`.

### Consume signals

```http
GET /api/signal?roomId={roomId}&participantId={participantId}
```

Successful requests return the room plus the consumed `signals` array. Fetching is destructive for matching messages. The endpoint currently verifies that the room exists but does not verify that the consuming participant ID belongs to it.

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm (the repository includes `package-lock.json`)
- A current browser with WebRTC and `getDisplayMedia` support

Screen capture generally requires a secure context in production. `localhost` is treated as trustworthy by modern browsers.

### Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

The environment file is optional for local development. With the blank example values, the application uses its in-memory adapter.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_KV_REST_API_URL` | Preferred Upstash/Vercel KV REST URL |
| `UPSTASH_REDIS_KV_REST_API_TOKEN` | Preferred Upstash/Vercel KV write token |
| `UPSTASH_REDIS_KV_REST_API_READ_ONLY_TOKEN` | May be provided by the platform but is not used because the app writes state |
| `UPSTASH_REDIS_REST_URL` | Alternate Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Alternate Upstash REST token |
| `REDIS_URL` | Generic fallback URL passed to the Upstash REST client |
| `REDIS_TOKEN` | Generic fallback token |
| `UPSTASH_REDIS_KV_URL` | Present in `.env.example` but not read by the current code |
| `UPSTASH_REDIS_REDIS_URL` | Present in `.env.example` but not read by the current code |
| `NEXT_PUBLIC_STUN_SERVER_URL` | Optional STUN URL |
| `NEXT_PUBLIC_TURN_SERVER_URL` | Optional TURN URL |
| `NEXT_PUBLIC_TURN_USERNAME` | Optional TURN username |
| `NEXT_PUBLIC_TURN_PASSWORD` | Optional TURN credential |

Local environment files are ignored by Git; `.env.example` remains tracked as the safe template.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create an optimized production build |
| `npm start` | Serve a completed production build |
| `npm run lint` | Run ESLint with Next.js Core Web Vitals rules |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |

Playwright uses Desktop Chrome settings, starts `npm run dev` automatically on port 3000, and reuses an existing server. Install its browser binary when needed:

```bash
npx playwright install chromium
```

## Tests

The current suite covers:

- defaults, trimming, and rejection in the room metadata Zod schema;
- a minimal `RoomStore` contract exercised through a test-only implementation;
- creating a room through the browser;
- joining from a second browser and observing the participant in both clients.

The suite does **not** currently exercise the production memory/Redis store, Redis Lua behavior, API error cases, presence expiry, signaling exchange, real WebRTC negotiation, screen-capture permission, or multi-instance behavior.

## Project structure

```text
.
├── app/
│   ├── api/
│   │   ├── rooms/
│   │   │   ├── [roomId]/route.ts
│   │   │   └── route.ts
│   │   └── signal/route.ts
│   ├── room/[roomId]/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── room-view.tsx
├── docs/
│   └── DEPLOYMENT.md
├── lib/
│   ├── room-store.ts
│   ├── types.ts
│   ├── validation.ts
│   └── webrtc.ts
├── tests/
│   ├── e2e/home.spec.ts
│   ├── store.test.ts
│   └── validation.test.ts
├── .env.example
├── next.config.ts
├── playwright.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

## Security and privacy

What the implementation currently provides:

- Screen media uses WebRTC rather than being uploaded to or recorded by this app.
- Browsers encrypt WebRTC transport in transit.
- Invite copying strips the participant query parameter.
- Server-side joins and signal submissions receive basic Zod validation.
- Room and signal records expire rather than being intentionally retained forever.

What it does not provide:

- User authentication or verified identity
- Room passwords, access approval, or authorization roles
- Cryptographic protection for signaling data from the application server
- Rate limiting, bot mitigation, audit trails, or moderation
- Strong participant-session credentials or cookie-based sessions
- Validation that every signaling recipient/consumer belongs to the room
- A managed TURN service for networks where direct connectivity fails

Participant IDs appear in the host/participant URL query string and act as bearer-like identifiers for room mutations. Treat invite links and participant URLs accordingly, and do not describe the current system as suitable for sensitive or regulated material.

## Known limitations

- Room privacy depends only on an unlisted room ID.
- The app has no reconnection identity stored outside the URL.
- Closing a tab does not send an explicit leave request; stale cleanup handles it later.
- Presence and signaling use polling, which adds latency and repeated server requests.
- The in-memory store is unsuitable for horizontally scaled or serverless production deployments.
- Redis join admission checks and the subsequent append are separate operations, so simultaneous joins can race around capacity or name uniqueness checks.
- The one-presenter rule is checked before the atomic sharing mutation, so simultaneous claims can race.
- The client renders only one remote stream and does not support multiple simultaneous presenters.
- Stopping capture ends local tracks but does not explicitly remove RTCRtpSenders or renegotiate every peer.
- Signal payloads are intentionally unstructured beyond their signal type.
- The host is automatically named `Host`; there is no host rename flow or host-only control surface.
- Optional room metadata fields and `roomInputSchema` are not wired into the current creation UI/API.
- There is no room deletion endpoint despite older documentation referring to room CRUD.
- `docs/DEPLOYMENT.md` mentions an experimental WebSocket upgrade path, but the current signaling route is implemented with HTTP polling only.

## Production checklist

Before a public deployment:

1. Configure a writable Upstash Redis REST URL and token.
2. Provide HTTPS and verify screen capture in supported browsers.
3. Add authentication, room authorization, and stronger participant sessions.
4. Add request validation consistently to every mutation and signaling operation.
5. Add rate limits and abuse protection to room and signal endpoints.
6. Configure a TURN service with short-lived credentials.
7. Replace or deliberately capacity-plan the polling-based signaling transport.
8. Test WebRTC across NAT, corporate firewall, mobile, and multi-instance scenarios.
9. Add observability for room creation, signaling failures, Redis errors, and peer connectivity without logging sensitive payloads.
10. Review Vercel Analytics and Speed Insights against the deployment's privacy requirements.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the existing deployment notes, while treating the implementation described in this README as authoritative where the two differ.

## Contributing

Keep behavior changes aligned across the client, route handlers, shared types, store mutations, and documentation. Before handing off a change, run the checks appropriate to it:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

When changing persistence, verify both the memory fallback and Redis atomic path. When changing participant or signaling behavior, add route/store tests in addition to browser coverage; the existing test-only store does not prove the production adapter.

# ShareSpace TURN server

This directory builds a [coturn](https://github.com/coturn/coturn) TURN server for WebRTC fallback connections. The root `Dockerfile` builds the ShareSpace app; `docker-compose.turn.yml` runs both services.

## Run on a Linux host

1. Copy the example variables:

   ```sh
   cp turn/.env.turn.example .env.turn
   ```

2. Set `TURN_EXTERNAL_IP` to the server's public IPv4 address, and use a real DNS name for `TURN_REALM` and `NEXT_PUBLIC_TURN_SERVER_URL`.

3. Start the server:

   ```sh
   docker compose --env-file .env.turn -f docker-compose.turn.yml up -d --build
   ```

4. Open these firewall ports:

   - UDP/TCP `3478`
   - UDP `49152-49252`

5. Set the `NEXT_PUBLIC_TURN_*` variables in the ShareSpace deployment. Rebuild the Next.js app after changing them because these values are embedded in the browser bundle.

The app is available on `APP_PORT` (default `3000`). Its `NEXT_PUBLIC_TURN_*` values are passed at compose build time and embedded in the browser bundle. The compose service uses host networking so coturn can advertise and relay through the host's public IP. The configuration intentionally disables TLS/DTLS; add a certificate and `turns:` configuration separately if TURN over TLS is required.

Do not commit `.env.turn` or real credentials.

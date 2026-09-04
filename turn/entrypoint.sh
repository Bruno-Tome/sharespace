#!/bin/sh
set -eu

: "${TURN_REALM:?TURN_REALM is required}"
: "${TURN_USERNAME:?TURN_USERNAME is required}"
: "${TURN_PASSWORD:?TURN_PASSWORD is required}"
: "${TURN_EXTERNAL_IP:?TURN_EXTERNAL_IP is required}"

CONFIG_FILE=/tmp/turnserver.conf

cat > "$CONFIG_FILE" <<EOF
listening-port=3478
listening-ip=0.0.0.0
relay-ip=0.0.0.0
fingerprint
lt-cred-mech
realm=${TURN_REALM}
user=${TURN_USERNAME}:${TURN_PASSWORD}
external-ip=${TURN_EXTERNAL_IP}
min-port=49152
max-port=49252
no-cli
no-multicast-peers
no-tls
no-dtls
EOF

exec turnserver -c "$CONFIG_FILE" --log-file=stdout

FROM coturn/coturn:4.6.3

COPY  entrypoint.sh /entrypoint.sh

EXPOSE 3478/tcp 3478/udp
EXPOSE 49152-49252/udp

ENTRYPOINT ["/entrypoint.sh"]

ShareSpace is a browser-based video room for real-time communication.

The idea is:

- A user creates a room and receives a link.
- Other people join through that link.
- Participants share their cameras and microphones.
- Communication happens in real time using WebRTC.
- The server only maintains the room state, participants, and connection signaling.
- No account or app installation is required.

In short, ShareSpace is a lightweight alternative to tools like Google Meet for quick, private conversations. The main current challenge is making WebRTC connections reliable across different networks and devices, which requires a TURN server fallback.

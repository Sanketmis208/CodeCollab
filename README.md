# CodeCollab (Node + React JS)

A JavaScript reimplementation of the CodeCollab app using Node/Express + Socket.IO for the backend and React + Vite for the frontend. It mirrors the UI/UX: file explorer, Monaco editor, whiteboard, chat, and video calling.

## Structure

- `node-stack/server` — Express + Socket.IO. In-memory store (rooms, files/folders, messages, presence). Not persistent.
- `node-stack/client` — Vite + React JS, Tailwind-like utility classes in `styles.css`.

## Prerequisites

- Node.js 18+

## Run locally

Open two terminals:

Terminal 1 (server):

```powershell
cd node-stack/server
npm i
npm run dev
```

Server will listen on http://localhost:4000.

Terminal 2 (client):

```powershell
cd node-stack/client
npm i
# Optionally set the server URL (defaults to http://localhost:4000)
# echo "VITE_SERVER_URL=http://localhost:4000" > .env.local
npm run dev
```

Client will run on http://localhost:5174.

## Notes

- This demo uses an in-memory backend. Restarting the server clears rooms, files, and messages. Replace with a database for persistence.
- WebRTC uses STUN only. In some networks, calls may fail. For production, configure a TURN server.
- The editor auto-saves after a short debounce and broadcasts changes to others in the same room.
- Whiteboard syncs primitive strokes via Socket.IO broadcast.

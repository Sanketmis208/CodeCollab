// load environment variables from .env (if present)
import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { connectDB } from './db.js';
import User from './models/User.js';
import RoomModel from './models/Room.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// In-memory store (cache). Primary persistence for users/sessions/rooms is
// handled in MongoDB when MONGO_URL is provided. Keeping a memory cache for
// fast lookups and compatibility with existing logic.
const rooms = new Map(); // roomId -> { id, name, createdBy, createdAt, lastActivity, participants: Set<userId>, files, folders, messages }
const users = new Map(); // socket.id -> { userId, username, roomId }

// Helper: emit presence list for a room with usernames when possible
async function emitPresenceToRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    io.to(roomId).emit('presence:update', { participants: [] });
    return;
  }
  const ids = Array.from(room.participants);
  try {
    const usersDocs = await User.find({ userId: { $in: ids } }).lean();
    const map = new Map((usersDocs || []).map(u => [u.userId, u.username]));
    io.to(roomId).emit('presence:update', { participants: ids.map(id => ({ userId: id, username: map.get(id) || id })) });
  } catch (err) {
    // Fallback: emit raw ids
    io.to(roomId).emit('presence:update', { participants: ids });
  }
}

async function getOrCreateRoom(roomId, name = 'Untitled Room', createdBy = 'system') {
  if (rooms.has(roomId)) return rooms.get(roomId);
  // Try to load from DB first
  try {
    const persisted = await RoomModel.findOne({ id: roomId }).lean();
    if (persisted) {
      const r = {
        id: persisted.id,
        name: persisted.name,
        createdBy: persisted.createdBy,
        createdAt: persisted.createdAt,
        lastActivity: persisted.lastActivity,
        participants: new Set(persisted.participants || []),
        files: new Map((persisted.files || []).map(f => [f.id, f])),
        folders: new Map((persisted.folders || []).map(f => [f.id, f])),
        messages: persisted.messages || []
      };
      rooms.set(roomId, r);
      return r;
    }
  } catch (err) {
    console.warn('Error loading room from DB', err);
  }

  // Create new in-memory room and persist
  const newRoom = {
    id: roomId,
    name,
    createdBy,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    participants: new Set(),
    files: new Map(),
    folders: new Map(),
    messages: []
  };
  rooms.set(roomId, newRoom);
  try {
    await RoomModel.create({ id: roomId, name, createdBy, createdAt: newRoom.createdAt, lastActivity: newRoom.lastActivity });
  } catch (err) {
    // ignore duplicate or persistence errors for now
    console.warn('Could not persist new room', err?.message || err);
  }
  return newRoom;
}

// REST endpoints (lightweight)
app.get('/api/rooms', async (_req, res) => {
  // Prefer the persisted RoomModel when available so recent rooms reflect DB state.
  try {
    const docs = await RoomModel.find().sort({ lastActivity: -1 }).limit(20).lean();
    // Resolve creator username where possible to help client-side filtering by display name
    const list = await Promise.all(docs.map(async (r) => {
      let createdByName = null;
      try {
        if (r.createdBy) {
          const u = await User.findOne({ userId: r.createdBy }).lean();
          if (u) createdByName = u.username;
        }
      } catch (err) {
        // ignore lookup errors
      }
      return { id: r.id, name: r.name, createdBy: r.createdBy || null, createdByName, createdAt: r.createdAt, lastActivity: r.lastActivity };
    }));
    return res.json(list);
  } catch (err) {
    // Fallback to in-memory cache
    const list = Array.from(rooms.values())
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
      .slice(0, 20)
      .map(r => ({ id: r.id, name: r.name, createdBy: r.createdBy || null, createdByName: null, createdAt: r.createdAt, lastActivity: r.lastActivity }));
    return res.json(list);
  }
});

app.post('/api/rooms', async (req, res) => {
  const { name, createdBy } = req.body || {};
  const id = nanoid(12);
  try {
    const room = await getOrCreateRoom(id, name || 'New Room', createdBy || 'user');
    return res.json({ id: room.id, name: room.name });
  } catch (err) {
    console.error('Error creating room', err);
    return res.status(500).json({ error: 'Could not create room' });
  }
});

// User signup (username + password). Ensures username uniqueness.
app.post('/api/auth/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  try {
    // Check if username already exists
    const exists = await User.findOne({ username }).lean();
    if (exists) return res.status(409).json({ error: 'UsernameTaken' });

    const userId = nanoid(10);
    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({ userId, username, passwordHash, createdAt: new Date(), lastActive: new Date() });

    return res.json({ userId, username });
  } catch (err) {
    console.error('signup failed', err);
    return res.status(500).json({ error: 'signup_failed' });
  }
});

// User login (username + password)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  try {
    const user = await User.findOne({ username }).lean();
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'InvalidCredentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'InvalidCredentials' });
    return res.json({ userId: user.userId, username: user.username });
  } catch (err) {
    console.error('login failed', err);
    return res.status(500).json({ error: 'login_failed' });
  }
});

io.on('connection', (socket) => {
  // Auth (demo): client sends username; assign userId and persist to MongoDB
  socket.on('auth:login', async ({ username, userId: providedUserId }, cb) => {
    // Accept an optional userId to allow clients with a persisted userId to
    // reattach their session after reconnecting. If none provided, generate one.
    const userId = providedUserId || nanoid(10);
    const uname = username || 'guest';
    try {
      // Upsert the user record so reconnects/duplicate creates are safe.
      await User.findOneAndUpdate(
        { userId },
        { username: uname, socketId: socket.id, lastActive: new Date(), createdAt: new Date() },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      console.error('User create/update failed', err);
    }
    // Keep an in-memory map for the live socket session as before.
    users.set(socket.id, { userId, username: uname, roomId: null });
    cb?.({ userId, username: uname });
  });

  socket.on('room:create', async ({ name, createdBy }, cb) => {
    const id = nanoid(12);
    const room = await getOrCreateRoom(id, name || 'New Room', createdBy || 'user');
    cb?.({ id: room.id, name: room.name });
  });

  socket.on('room:join', async ({ roomId }, cb) => {
    const session = users.get(socket.id);
    if (!session) return cb?.({ error: 'Not authenticated' });
    const room = await getOrCreateRoom(roomId);

    session.roomId = roomId;
    room.participants.add(session.userId);

    socket.join(roomId);

    // Persist participant in room model and update user session
    try {
      await RoomModel.findOneAndUpdate({ id: roomId }, { $addToSet: { participants: session.userId }, $set: { lastActivity: new Date() } }, { upsert: true });
      await User.findOneAndUpdate({ userId: session.userId }, { socketId: socket.id, roomId, lastActive: new Date() }, { upsert: true });
    } catch (err) {
      console.warn('Error persisting room join', err?.message || err);
    }

    // Presence update (emit username+userId when possible)
    await emitPresenceToRoom(roomId);

    cb?.({ ok: true, room: { id: room.id, name: room.name } });
  });

  socket.on('room:leave', async (_payload, cb) => {
    const session = users.get(socket.id);
    if (session?.roomId) {
      const room = rooms.get(session.roomId);
        if (room) {
        room.participants.delete(session.userId);
        await emitPresenceToRoom(session.roomId);
      }
      socket.leave(session.roomId);
      try {
        await RoomModel.findOneAndUpdate({ id: session.roomId }, { $pull: { participants: session.userId } });
        await User.findOneAndUpdate({ userId: session.userId }, { roomId: null });
      } catch (err) {
        console.warn('Error persisting room leave', err?.message || err);
      }
      session.roomId = null;
    }
    cb?.({ ok: true });
  });

  // Chat
  socket.on('chat:history', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    cb?.(room ? room.messages : []);
  });

  socket.on('chat:send', async ({ roomId, message }, cb) => {
    const session = users.get(socket.id);
    if (!session) return cb?.({ error: 'Not authenticated' });
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });

    const msg = {
      id: nanoid(12),
      userId: session.userId,
      username: session.username,
      message: (message || '').toString().slice(0, 4000),
      createdAt: new Date().toISOString()
    };
    room.messages.push(msg);
    room.lastActivity = new Date().toISOString();

    // persist to DB messages array
    try {
      await RoomModel.findOneAndUpdate({ id: roomId }, { $push: { messages: msg }, $set: { lastActivity: new Date() } }, { upsert: true });
    } catch (err) {
      console.warn('Could not persist chat message', err?.message || err);
    }

    io.to(roomId).emit('chat:new', msg);
    cb?.({ ok: true });
  });

  // Files & folders
  socket.on('folders:list', async ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.([]);
    cb?.(Array.from(room.folders.values()));
  });

  socket.on('files:list', async ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.([]);
    cb?.(Array.from(room.files.values()));
  });

  socket.on('folder:create', async ({ roomId, name, parentId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });
    const folder = { id: nanoid(10), name: name || 'Folder', parentId: parentId || null, roomId };
    room.folders.set(folder.id, folder);
    try {
      await RoomModel.findOneAndUpdate({ id: roomId }, { $push: { folders: folder } }, { upsert: true });
    } catch (err) {
      console.warn('Could not persist folder', err?.message || err);
    }
    io.to(roomId).emit('folders:updated');
    cb?.({ ok: true, folder });
  });

  socket.on('file:create', async ({ roomId, name, folderId, language }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });
    const file = { id: nanoid(10), name: name || 'file.js', content: '', language: language || inferLang(name), folderId: folderId || null, roomId, updatedAt: new Date().toISOString() };
    room.files.set(file.id, file);
    try {
      await RoomModel.findOneAndUpdate({ id: roomId }, { $push: { files: file } }, { upsert: true });
    } catch (err) {
      console.warn('Could not persist file', err?.message || err);
    }
    io.to(roomId).emit('files:updated');
    cb?.({ ok: true, file });
  });

  socket.on('file:update', async ({ roomId, fileId, content }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });
    const file = room.files.get(fileId);
    if (!file) return cb?.({ error: 'File not found' });
    file.content = content ?? '';
    file.updatedAt = new Date().toISOString();
    try {
      await RoomModel.findOneAndUpdate({ id: roomId, 'files.id': fileId }, { $set: { 'files.$.content': file.content, 'files.$.updatedAt': file.updatedAt } });
    } catch (err) {
      console.warn('Could not persist file update', err?.message || err);
    }
    io.to(roomId).emit('file:changed', { fileId, content: file.content, updatedAt: file.updatedAt });
    cb?.({ ok: true });
  });

  // Lightweight live-edit broadcast (do not persist).
  // Clients emit 'file:editing' frequently while typing; the server relays
  // those edits to other sockets in the same room so collaborators see
  // changes in near real-time. This is intentionally non-persistent to
  // avoid DB churn; explicit saves should call 'file:update'.
  socket.on('file:editing', ({ roomId, fileId, content } = {}) => {
    try {
      // basic validation: ensure room exists and fileId is provided
      const room = rooms.get(roomId);
      if (!room || !fileId) return;
      // Broadcast to everyone else in the room (exclude sender)
      socket.to(roomId).emit('file:changed', { fileId, content });
    } catch (err) {
      console.warn('file:editing handler error', err);
    }
  });

  socket.on('file:delete', async ({ roomId, fileId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });
    room.files.delete(fileId);
    try {
      await RoomModel.findOneAndUpdate({ id: roomId }, { $pull: { files: { id: fileId } } });
    } catch (err) {
      console.warn('Could not persist file delete', err?.message || err);
    }
    io.to(roomId).emit('files:updated');
    cb?.({ ok: true });
  });

  socket.on('file:rename', async ({ roomId, fileId, name } = {}, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });
    if (!fileId || !name) return cb?.({ error: 'Missing fileId or name' });

    const file = room.files.get(fileId);
    if (!file) return cb?.({ error: 'File not found' });

    try {
      file.name = name;
      file.language = inferLang(name);
      file.updatedAt = new Date().toISOString();
      // persist the full arrays for simplicity
      try {
        await RoomModel.findOneAndUpdate({ id: roomId }, { $set: { files: Array.from(room.files.values()), lastActivity: new Date() } }, { upsert: true });
      } catch (err) {
        console.warn('Could not persist file rename', err?.message || err);
      }
      io.to(roomId).emit('files:updated');
      cb?.({ ok: true, file });
    } catch (err) {
      console.error('file:rename failed', err);
      cb?.({ error: err?.message || 'rename failed' });
    }
  });

  socket.on('folder:delete', async ({ roomId, folderId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });
    if (!folderId) return cb?.({ error: 'Missing folderId' });

    try {
      // collect folder ids to delete (folderId + nested)
      const toDelete = new Set([folderId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of room.folders.values()) {
          if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
            toDelete.add(f.id);
            changed = true;
          }
        }
      }

      // remove folders
      for (const id of Array.from(toDelete)) room.folders.delete(id);

      // remove files belonging to deleted folders
      for (const [fid, file] of Array.from(room.files.entries())) {
        if (file.folderId && toDelete.has(file.folderId)) {
          room.files.delete(fid);
        }
      }

      // persist changes
      try {
        await RoomModel.findOneAndUpdate({ id: roomId }, { $set: { files: Array.from(room.files.values()), folders: Array.from(room.folders.values()), lastActivity: new Date() } });
      } catch (err) {
        console.warn('Could not persist folder delete', err?.message || err);
      }

      io.to(roomId).emit('files:updated');
      io.to(roomId).emit('folders:updated');
      cb?.({ ok: true });
    } catch (err) {
      console.error('folder:delete failed', err);
      cb?.({ error: err?.message || 'folder delete failed' });
    }
  });

  // Batch project upload: clients send an array of { path, content } entries.
  // The server applies them as add/update operations (creating folders as needed)
  socket.on('project:batchUpdate', async ({ roomId, files: batch } = {}, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: 'Room not found' });
    if (!Array.isArray(batch)) return cb?.({ error: 'Invalid payload' });

    try {
      // helper to find or create folder by name+parentId
      const findOrCreateFolder = (name, parentId = null) => {
        // try to find existing folder with same name and parent
        for (const f of room.folders.values()) {
          if (f.name === name && (f.parentId || null) === (parentId || null)) return f;
        }
        const newF = { id: nanoid(10), name, parentId: parentId || null, roomId };
        room.folders.set(newF.id, newF);
        return newF;
      };

      for (const entry of batch) {
        if (!entry || typeof entry.path !== 'string') continue;
        const normalized = entry.path.replace(/\\\\+/g, '/');
        const parts = normalized.split('/').filter(Boolean);
        if (parts.length === 0) continue;
        const fileName = parts.pop();
        // walk/create folders
        let parentId = null;
        for (const part of parts) {
          const folder = findOrCreateFolder(part, parentId);
          parentId = folder.id;
        }

        // find existing file in same folder
        let existing = null;
        for (const f of room.files.values()) {
          if (f.name === fileName && (f.folderId || null) === (parentId || null)) { existing = f; break; }
        }
        if (existing) {
          existing.content = entry.content ?? '';
          existing.updatedAt = new Date().toISOString();
        } else {
          const file = { id: nanoid(10), name: fileName, content: entry.content ?? '', language: inferLang(fileName), folderId: parentId, roomId, updatedAt: new Date().toISOString() };
          room.files.set(file.id, file);
        }
      }

      // persist full files/folders arrays to DB for simplicity
      try {
        await RoomModel.findOneAndUpdate({ id: roomId }, { $set: { files: Array.from(room.files.values()), folders: Array.from(room.folders.values()), lastActivity: new Date() } }, { upsert: true });
      } catch (err) {
        console.warn('Could not persist batch update', err?.message || err);
      }

      // Notify clients to refresh
      io.to(roomId).emit('files:updated');
      io.to(roomId).emit('folders:updated');
      cb?.({ ok: true });
    } catch (err) {
      console.error('project:batchUpdate failed', err);
      cb?.({ error: err?.message || 'batch failed' });
    }
  });

  // Whiteboard (broadcast primitive events; client should interpret)
  socket.on('whiteboard:event', ({ roomId, event }) => {
    socket.to(roomId).emit('whiteboard:event', event);
  });

  // WebRTC signaling
  socket.on('webrtc:signal', ({ roomId, toUserId, data }) => {
    // naive broadcast: deliver to everyone in room with the target userId in their session
    for (const [sid, sess] of users.entries()) {
      if (sess.roomId === roomId && sess.userId === toUserId) {
        io.to(sid).emit('webrtc:signal', { fromUserId: users.get(socket.id)?.userId, data });
      }
    }
  });

  // Cursor position updates from clients (relay to others in the same room)
  socket.on('cursor:update', ({ roomId, fileId, selection } = {}) => {
    try {
      const sess = users.get(socket.id);
      const userId = sess?.userId;
      const username = sess?.username;
      if (!roomId || !userId) return;
      // Broadcast to others in the room
      socket.to(roomId).emit('cursor:update', { userId, username, fileId, selection });
    } catch (err) {
      console.warn('cursor:update handler error', err);
    }
  });

  socket.on('disconnect', async () => {
    const session = users.get(socket.id);
    if (session) {
      if (session.roomId) {
        const room = rooms.get(session.roomId);
        if (room) {
          room.participants.delete(session.userId);
          await emitPresenceToRoom(session.roomId);
        }
        try {
          await RoomModel.findOneAndUpdate({ id: session.roomId }, { $pull: { participants: session.userId } });
        } catch (err) {
          console.warn('Could not persist participant removal on disconnect', err?.message || err);
        }
      }
      try {
        await User.findOneAndUpdate({ userId: session.userId }, { socketId: null, roomId: null });
      } catch (err) {
        console.warn('Could not clear user session on disconnect', err?.message || err);
      }
      users.delete(socket.id);
    }
  });
});

function inferLang(name = '') {
  const ext = name.split('.').pop();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'py':
      return 'python';
    case 'java':
      return 'java';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    default:
      return 'javascript';
  }
}

const PORT = process.env.PORT || 4000;
(async () => {
  // Try to connect to DB if URL provided. This will not block server startup
  // on DB error but will print a warning; persistence features require MONGO_URL.
  try {
    await connectDB(process.env.MONGO_URL);
  } catch (err) {
    console.warn('Continuing without MongoDB persistence. Set MONGO_URL to enable.');
  }

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
})();

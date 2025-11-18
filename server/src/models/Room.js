import mongoose from '../db.js';

const { Schema } = mongoose;

const FileSchema = new Schema({
  id: String,
  name: String,
  content: String,
  language: String,
  folderId: String,
  updatedAt: Date
}, { _id: false });

const FolderSchema = new Schema({ id: String, name: String, parentId: String }, { _id: false });

const MessageSchema = new Schema({ id: String, userId: String, username: String, message: String, createdAt: Date }, { _id: false });

const RoomSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: 'Untitled Room' },
  createdBy: { type: String },
  createdAt: { type: Date, default: () => new Date() },
  lastActivity: { type: Date, default: () => new Date() },
  participants: { type: [String], default: [] },
  files: { type: [FileSchema], default: [] },
  folders: { type: [FolderSchema], default: [] },
  messages: { type: [MessageSchema], default: [] }
  ,
  // Whiteboards: array of per-file whiteboard snapshots. Each entry holds
  // the fileId and an objects array representing shapes/text placed on the board.
  whiteboards: { type: [{ fileId: String, objects: { type: Array, default: [] }, meta: { type: Object, default: {} } }], default: [] }
});

export default mongoose.model('Room', RoomSchema);

import mongoose from '../db.js';

const { Schema } = mongoose;

const UserSchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true },
  // Optional hashed password (bcrypt). May be null for legacy/demo users.
  passwordHash: { type: String, default: null },
  socketId: { type: String, default: null },
  roomId: { type: String, default: null },
  createdAt: { type: Date, default: () => new Date() },
  lastActive: { type: Date, default: () => new Date() }
});

export default mongoose.model('User', UserSchema);

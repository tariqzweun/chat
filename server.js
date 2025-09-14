require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGODB_URI || '';

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
let InMemoryStore = { users: [], messages: [], rooms: ['General'] };

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify(InMemoryStore, null, 2));
}

let MessageModel = null;
let UserModel = null;

async function connectDB() {
  if (!DB_URI) return false;
  try {
    await mongoose.connect(DB_URI, { dbName: 'chatly' });
    const messageSchema = new mongoose.Schema({
      room: String,
      username: String,
      content: Object, // { type, text, dataUrl }
      timestamp: { type: Date, default: Date.now }
    });
    const userSchema = new mongoose.Schema({
      username: String,
      avatar: String,
      lastSeen: Date
    });
    MessageModel = mongoose.model('Message', messageSchema);
    UserModel = mongoose.model('User', userSchema);
    console.log('✅ MongoDB connected');
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    return false;
  }
}

(async () => {
  const dbOK = await connectDB();
  if (!dbOK) {
    ensureDataDir();
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      InMemoryStore = JSON.parse(raw);
    } catch (e) {
      InMemoryStore = { users: [], messages: [], rooms: ['General'] };
      fs.writeFileSync(STORE_FILE, JSON.stringify(InMemoryStore, null, 2));
    }
  }
})();

// API
app.get('/api/rooms', (req, res) => {
  if (MessageModel) {
    MessageModel.distinct('room').then(rooms => res.json({ rooms: rooms.length ? rooms : ['General'] }))
      .catch(()=>res.json({ rooms: ['General'] }));
  } else {
    res.json({ rooms: InMemoryStore.rooms });
  }
});

app.get('/api/messages', async (req, res) => {
  const room = req.query.room || 'General';
  if (MessageModel) {
    const messages = await MessageModel.find({ room }).sort({ timestamp: 1 }).limit(500).lean();
    return res.json({ messages });
  }
  const messages = InMemoryStore.messages.filter(m => m.room === room).slice(-500);
  res.json({ messages });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('🟢 Socket connected', socket.id);
  socket.data.username = null;
  socket.data.room = 'General';

  socket.on('join', async ({ username, room }) => {
    username = String(username || 'Anonymous').substring(0, 60);
    room = room || 'General';
    socket.data.username = username;
    socket.data.room = room;
    socket.join(room);

    // persist user
    if (UserModel) {
      await UserModel.updateOne({ username }, { username, lastSeen: new Date() }, { upsert: true });
    } else {
      if (!InMemoryStore.users.find(u => u.username === username)) {
        InMemoryStore.users.push({ username, lastSeen: new Date() });
        fs.writeFileSync(STORE_FILE, JSON.stringify(InMemoryStore, null, 2));
      }
    }

    // send history
    let recent = [];
    if (MessageModel) {
      recent = await MessageModel.find({ room }).sort({ timestamp: 1 }).limit(200).lean();
    } else {
      recent = InMemoryStore.messages.filter(m => m.room === room).slice(-200);
    }
    socket.emit('history', recent);

    io.to(room).emit('system', { text: `${username} joined ${room}`, timestamp: new Date() });

    const clients = await io.in(room).fetchSockets();
    const users = clients.map(s => ({ id: s.id, username: s.data.username }));
    io.to(room).emit('users', users);
  });

  socket.on('typing', (isTyping) => {
    const room = socket.data.room || 'General';
    socket.to(room).emit('typing', { username: socket.data.username, isTyping });
  });

  socket.on('message', async (msg) => {
    const room = msg.room || socket.data.room || 'General';
    const message = {
      room,
      username: socket.data.username || 'Anonymous',
      content: { type: msg.type || 'text', text: msg.text || '', dataUrl: msg.dataUrl || null },
      timestamp: new Date()
    };

    // save
    if (MessageModel) {
      try { await MessageModel.create(message); } catch (e) { console.error('Save message error', e.message); }
    } else {
      InMemoryStore.messages.push(message);
      fs.writeFileSync(STORE_FILE, JSON.stringify(InMemoryStore, null, 2));
    }

    io.to(room).emit('message', message);
  });

  socket.on('create-room', (roomName) => {
    if (!roomName) return;
    if (!InMemoryStore.rooms.includes(roomName)) {
      InMemoryStore.rooms.push(roomName);
      fs.writeFileSync(STORE_FILE, JSON.stringify(InMemoryStore, null, 2));
    }
    io.emit('rooms', InMemoryStore.rooms);
  });

  socket.on('disconnect', async () => {
    console.log('🔴 Socket disconnected', socket.id, socket.data.username);
    const room = socket.data.room || 'General';
    const username = socket.data.username || 'Anonymous';
    io.to(room).emit('system', { text: `${username} left`, timestamp: new Date() });
    const clients = await io.in(room).fetchSockets();
    const users = clients.map(s => ({ id: s.id, username: s.data.username }));
    io.to(room).emit('users', users);
  });
});

server.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

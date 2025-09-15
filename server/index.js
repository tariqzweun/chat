require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const prisma = require('./prismaClient');

const app = express();
app.use(cors());
app.use(express.json());

// Simple health route
app.get('/', (req, res) => {
  res.send('🚀 API server is running on Railway!');
});

/**
 * AUTH (simple email/password + JWT) - starter implementation
 * In production use better flows (email verification, refresh tokens)
 */

// Create user (signup) - simple
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { username, email, password: hashed }
    });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
    res.json({ user: { id: user.id, username: user.username }, token });
  } catch (err) {
    res.status(400).json({ error: 'User already exists or invalid data', details: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { emailOrUsername, password } = req.body;
  if (!emailOrUsername || !password) return res.status(400).json({ error: 'credentials required' });
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: emailOrUsername },
        { username: emailOrUsername }
      ]
    }
  });
  if (!user || !user.password) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET);
  res.json({ user: { id: user.id, username: user.username }, token });
});

// Protected route example
app.get('/api/me', async (req, res) => {
  const auth = req.headers.authorization?.split(' ')[1];
  if (!auth) return res.status(401).json({ error: 'unauth' });
  try {
    const payload = jwt.verify(auth, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    res.status(401).json({ error: 'invalid token' });
  }
});

/**
 * Socket.io real-time chat with basic room join/leave/message.
 */
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] }
});

// Socket auth middleware using JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized: no token'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload;
    return next();
  } catch (err) {
    return next(new Error('Unauthorized: invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.user?.username);

  socket.on('joinRoom', async ({ roomId }) => {
    if (!roomId) return socket.emit('error', { message: 'roomId required' });
    // basic ban check (DB)
    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: socket.user.id, roomId } }
    });
    if (member?.banned) return socket.emit('joinError', { reason: 'banned' });
    socket.join(roomId);
    io.to(roomId).emit('systemMessage', { text: `${socket.user.username} joined` });
  });

  socket.on('leaveRoom', ({ roomId }) => {
    socket.leave(roomId);
    io.to(roomId).emit('systemMessage', { text: `${socket.user.username} left` });
  });

  socket.on('message', async ({ roomId, content }) => {
    if (!content || !content.trim()) return;
    // Save message
    const message = await prisma.message.create({
      data: {
        content,
        authorId: socket.user.id,
        roomId
      }
    });
    io.to(roomId).emit('message', {
      id: message.id,
      content: message.content,
      author: { id: socket.user.id, username: socket.user.username },
      createdAt: message.createdAt
    });
  });

  // moderation: kick (only room moderator or admin/owner)
  socket.on('moderation:kick', async ({ roomId, targetUserId }) => {
    // check caller role in room
    const caller = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: socket.user.id, roomId } }
    });
    if (!caller || (caller.role !== 'MODERATOR' && socket.user.role !== 'ADMIN' && socket.user.role !== 'OWNER')) {
      return socket.emit('modError', { reason: 'no-permission' });
    }
    // send kicked message (client should disconnect that user's sockets from the room)
    io.to(roomId).emit('userKicked', { userId: targetUserId });
    // optional: mark banned in DB
    await prisma.roomMember.updateMany({
      where: { userId: targetUserId, roomId },
      data: { banned: true }
    });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.user?.username);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
});

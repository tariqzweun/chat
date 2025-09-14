require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';
const DB_URI = process.env.MONGODB_URI || '';
const ADMIN_USERS = (process.env.ADMIN_USERS||'').split(',').map(s=>s.trim()).filter(Boolean);

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
let Store = { users: [], rooms: ['General'], messages: [], bans: [] };

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify(Store, null, 2));
}

let UserModel=null, MessageModel=null, RoomModel=null;

async function connectDB(){
  if(!DB_URI) return false;
  try{
    await mongoose.connect(DB_URI, { dbName: 'chatly' });
    const userSchema = new mongoose.Schema({
      username: String, email: String, passwordHash: String,
      avatar: String, bio: String, xp: { type: Number, default: 1000 },
      friends: [String], isAdmin: { type: Boolean, default: false }, banned: { type: Boolean, default: false }
    });
    const messageSchema = new mongoose.Schema({
      room: String, from: String, to: String, content: Object, timestamp: { type: Date, default: Date.now }
    });
    UserModel = mongoose.model('User', userSchema);
    MessageModel = mongoose.model('Message', messageSchema);
    console.log('✅ MongoDB connected');
    return true;
  }catch(e){ console.error('MongoDB failed', e.message); return false; }
}

(async ()=>{
  const ok = await connectDB();
  if(!ok){
    ensureData();
    try{ Store = JSON.parse(fs.readFileSync(STORE_FILE,'utf8')); }catch(e){ fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  }
})();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function sign(user){ return jwt.sign({ username: user }, JWT_SECRET, { expiresIn: '7d' }); }
function authMiddleware(req,res,next){
  const h = req.headers.authorization; if(!h) return res.status(401).json({error:'No token'});
  const token = h.split(' ')[1]; try{ const data = jwt.verify(token, JWT_SECRET); req.user = data; next(); }catch(e){ return res.status(401).json({error:'Invalid token'}); }
}
function isAdminUser(username){
  if(ADMIN_USERS.includes(username)) return true;
  if(UserModel) return UserModel.findOne({ username }).then(u=>!!(u && u.isAdmin));
  const u = Store.users.find(x=>x.username===username); return !!(u && u.isAdmin);
}

// Auth
app.post('/api/register', async (req,res)=>{
  const { username, email, password } = req.body;
  if(!username || !password) return res.status(400).json({error:'Missing'});
  const existing = UserModel ? await UserModel.findOne({ username }) : Store.users.find(u=>u.username===username);
  if(existing) return res.status(400).json({error:'User exists'});
  const hash = await bcrypt.hash(password, 10);
  const isAdmin = ADMIN_USERS.includes(username);
  const user = { username, email: email||'', passwordHash: hash, avatar:'', bio:'', xp:1000, friends:[], isAdmin, banned:false };
  if(UserModel){ await UserModel.create(user); } else { Store.users.push(user); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  const token = sign(username);
  res.json({ token, username, xp: user.xp, isAdmin });
});

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({error:'Missing'});
  const u = UserModel ? await UserModel.findOne({ username }).lean() : Store.users.find(x=>x.username===username);
  if(!u) return res.status(400).json({error:'Not found'});
  if(u.banned) return res.status(403).json({ error: 'Banned' });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if(!ok) return res.status(400).json({error:'Bad creds'});
  const token = sign(username);
  res.json({ token, username, xp: u.xp||1000, isAdmin: !!u.isAdmin });
});

app.post('/api/avatar', authMiddleware, upload.single('avatar'), async (req,res)=>{
  const username = req.user.username;
  if(!req.file) return res.status(400).json({ error: 'No file' });
  const url = '/uploads/' + req.file.filename;
  if(UserModel){ await UserModel.updateOne({ username }, { avatar: url }); } else { const u = Store.users.find(x=>x.username===username); if(u){ u.avatar = url; fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); } }
  res.json({ ok:true, url });
});

app.get('/api/me', authMiddleware, async (req,res)=>{
  const username = req.user.username;
  const u = UserModel ? await UserModel.findOne({ username }).lean() : Store.users.find(x=>x.username===username);
  if(!u) return res.status(404).json({error:'No user'});
  res.json({ username: u.username, avatar: u.avatar, bio: u.bio, xp: u.xp||1000, level: Math.floor((u.xp||1000)/10), friends: u.friends||[], isAdmin: !!u.isAdmin });
});

// Admin routes
app.post('/api/admin/create-room', authMiddleware, async (req,res)=>{
  const username = req.user.username;
  const { name } = req.body;
  const admin = await isAdminUser(username);
  if(!admin) return res.status(403).json({ error:'Not admin' });
  if(!name) return res.status(400).json({ error:'Missing name' });
  if(!Store.rooms.includes(name)) { Store.rooms.push(name); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  res.json({ ok:true, rooms: Store.rooms });
});

app.post('/api/admin/ban', authMiddleware, async (req,res)=>{
  const username = req.user.username;
  const { target } = req.body;
  const admin = await isAdminUser(username);
  if(!admin) return res.status(403).json({ error:'Not admin' });
  if(!target) return res.status(400).json({ error:'Missing target' });
  const u = Store.users.find(x=>x.username===target);
  if(u){ u.banned = true; fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  const sockets = await io.fetchSockets();
  sockets.filter(s => s.data.username === target).forEach(s => s.disconnect(true));
  res.json({ ok:true });
});

app.post('/api/admin/promote', authMiddleware, async (req,res)=>{
  const username = req.user.username;
  const { target } = req.body;
  const admin = await isAdminUser(username);
  if(!admin) return res.status(403).json({ error:'Not admin' });
  if(!target) return res.status(400).json({ error:'Missing target' });
  const u = Store.users.find(x=>x.username===target);
  if(u){ u.isAdmin = true; fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  res.json({ ok:true });
});

app.get('/api/rooms', (req,res)=>{ res.json({ rooms: Store.rooms }); });

app.get('/api/messages', async (req,res)=>{
  const room = req.query.room || 'General';
  const msgs = Store.messages.filter(m=>m.room===room).slice(-500);
  res.json({ messages: msgs });
});

app.post('/api/delete-message', authMiddleware, async (req,res)=>{
  const { timestamp, room } = req.body;
  const username = req.user.username;
  const idx = Store.messages.findIndex(m=>m.room===room && m.timestamp===timestamp && m.from===username);
  if(idx>-1){ Store.messages.splice(idx,1); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); return res.json({ ok:true }); }
  return res.status(403).json({ error: 'Not allowed' });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if(token){
    try{ const data = jwt.verify(token, JWT_SECRET); socket.data.username = data.username; }catch(e){}
  }
  next();
});

io.on('connection', (socket)=>{
  const user = socket.data.username || 'Anonymous-'+socket.id.slice(0,4);
  console.log('connected', user);
  const bannedUser = Store.users.find(u=>u.username===user && u.banned);
  if(bannedUser){ socket.disconnect(true); return; }

  socket.on('join', async ({ room })=>{
    const r = room || 'General';
    socket.join(r);
    let recent = Store.messages.filter(m=>m.room===r).slice(-200);
    socket.emit('history', recent);
    socket.emit('system', { text: `أهلاً ${socket.data.username||user}! مرحباً بك في ${r}`, timestamp: new Date() });
    io.to(r).emit('system', { text: (socket.data.username||user)+' joined '+r, timestamp: new Date() });
    const clients = await io.in(r).fetchSockets();
    const users = clients.map(s=>({ id: s.id, username: s.data.username||('Anon') }));
    io.to(r).emit('users', users);
  });

  socket.on('message', async (msg)=>{
    const payload = { room: msg.room||'General', from: socket.data.username||user, to: msg.to||null, content: { type: msg.type||'text', text: msg.text||'', dataUrl: msg.dataUrl||null }, timestamp: new Date().toISOString() };
    Store.messages.push(payload); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2));
    const u = Store.users.find(x=>x.username===socket.data.username);
    if(u){ u.xp = (u.xp||1000)+2; fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
    io.to(payload.room).emit('message', payload);
    if(payload.to){
      const sockets = await io.fetchSockets();
      sockets.filter(s=>s.data.username===payload.to).forEach(s=>s.emit('pm', payload));
    }
  });

  socket.on('create-room', (name)=>{
    if(!name) return;
    if(!Store.rooms.includes(name)) { Store.rooms.push(name); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
    io.emit('rooms', Store.rooms);
  });

  socket.on('disconnect', async ()=>{
    console.log('disconnect', socket.id);
  });
});

server.listen(PORT, ()=> console.log('Server started on', PORT));

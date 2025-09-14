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

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
let Store = { users: [], friends: [], rooms: ['General'], messages: [] };

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify(Store, null, 2));
}

let UserModel=null, MessageModel=null;

async function connectDB(){
  if(!DB_URI) return false;
  try{
    await mongoose.connect(DB_URI, { dbName: 'chatly' });
    const userSchema = new mongoose.Schema({
      username: String, email: String, passwordHash: String,
      avatar: String, bio: String, xp: { type: Number, default: 1000 },
      friends: [String]
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

// Multer for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Helpers
function sign(user){ return jwt.sign({ username: user }, JWT_SECRET, { expiresIn: '7d' }); }
function authMiddleware(req,res,next){
  const h = req.headers.authorization; if(!h) return res.status(401).json({error:'No token'});
  const token = h.split(' ')[1]; try{ const data = jwt.verify(token, JWT_SECRET); req.user = data; next(); }catch(e){ return res.status(401).json({error:'Invalid token'}); }
}
function levelFromXp(xp){ return Math.floor((xp||0)/10); }

// Auth routes
app.post('/api/register', async (req,res)=>{
  const { username, email, password } = req.body;
  if(!username || !password) return res.status(400).json({error:'Missing'});
  const existing = UserModel ? await UserModel.findOne({ username }) : Store.users.find(u=>u.username===username);
  if(existing) return res.status(400).json({error:'User exists'});
  const hash = await bcrypt.hash(password, 10);
  // initial xp = 1000
  const user = { username, email: email||'', passwordHash: hash, avatar:'', bio:'', xp:1000, friends:[] };
  if(UserModel){ await UserModel.create(user); }
  else{ Store.users.push(user); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  const token = sign(username);
  res.json({ token, username, xp: user.xp });
});

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({error:'Missing'});
  const u = UserModel ? await UserModel.findOne({ username }).lean() : Store.users.find(x=>x.username===username);
  if(!u) return res.status(400).json({error:'Not found'});
  const ok = await bcrypt.compare(password, u.passwordHash);
  if(!ok) return res.status(400).json({error:'Bad creds'});
  const token = sign(username);
  res.json({ token, username, xp: u.xp||1000 });
});

// Upload avatar
app.post('/api/avatar', authMiddleware, upload.single('avatar'), async (req,res)=>{
  const username = req.user.username;
  if(!req.file) return res.status(400).json({ error: 'No file' });
  const url = '/uploads/' + req.file.filename;
  if(UserModel){
    await UserModel.updateOne({ username }, { avatar: url });
  } else {
    const u = Store.users.find(x=>x.username===username);
    if(u){ u.avatar = url; fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  }
  res.json({ ok:true, url });
});

// Profile and friends
app.get('/api/me', authMiddleware, async (req,res)=>{
  const username = req.user.username;
  const u = UserModel ? await UserModel.findOne({ username }).lean() : Store.users.find(x=>x.username===username);
  if(!u) return res.status(404).json({error:'No user'});
  res.json({ username: u.username, avatar: u.avatar, bio: u.bio, xp: u.xp||1000, level: levelFromXp(u.xp||1000), friends: u.friends||[] });
});

app.post('/api/add-friend', authMiddleware, async (req,res)=>{
  const { to } = req.body; const from = req.user.username;
  if(!to) return res.status(400).json({error:'No to'});
  if(UserModel){
    await UserModel.updateOne({ username: from }, { $addToSet: { friends: to } });
    await UserModel.updateOne({ username: to }, { $addToSet: { friends: from } });
  } else {
    const fu = Store.users.find(u=>u.username===from);
    const tu = Store.users.find(u=>u.username===to);
    if(fu && tu){ fu.friends = fu.friends||[]; tu.friends = tu.friends||[]; if(!fu.friends.includes(to)) fu.friends.push(to); if(!tu.friends.includes(from)) tu.friends.push(from); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
  }
  res.json({ ok:true });
});

// Rooms & messages endpoints
app.get('/api/rooms', (req,res)=>{
  if(MessageModel) MessageModel.distinct('room').then(r=>res.json({ rooms: r.length?r:['General'] }));
  else res.json({ rooms: Store.rooms });
});

app.get('/api/messages', async (req,res)=>{
  const room = req.query.room || 'General';
  if(MessageModel){ const msgs = await MessageModel.find({ room }).sort({ timestamp: 1 }).limit(500).lean(); return res.json({ messages: msgs }); }
  const msgs = Store.messages.filter(m=>m.room===room).slice(-500); res.json({ messages: msgs });
});

// Delete message (only sender)
app.post('/api/delete-message', authMiddleware, async (req,res)=>{
  const { timestamp, room } = req.body;
  const username = req.user.username;
  if(!timestamp || !room) return res.status(400).json({ error: 'Missing' });
  if(MessageModel){
    const msg = await MessageModel.findOne({ room, timestamp: new Date(timestamp), from: username });
    if(msg){ await MessageModel.deleteOne({ _id: msg._id }); return res.json({ ok:true }); }
    return res.status(403).json({ error: 'Not allowed' });
  } else {
    const idx = Store.messages.findIndex(m=>m.room===room && m.timestamp===timestamp && m.from===username);
    if(idx>-1){ Store.messages.splice(idx,1); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); return res.json({ ok:true }); }
    return res.status(403).json({ error: 'Not allowed' });
  }
});

// Socket.io realtime with auth token (simple)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if(!token) return next();
  try{ const data = jwt.verify(token, JWT_SECRET); socket.data.username = data.username; }catch(e){ }
  next();
});

io.on('connection', (socket)=>{
  const user = socket.data.username || 'Anonymous-'+socket.id.slice(0,4);
  console.log('connected', user);

  socket.on('join', async ({ room })=>{
    const r = room || 'General';
    socket.join(r);
    // send last messages
    let recent = [];
    if(MessageModel) recent = await MessageModel.find({ room: r }).sort({ timestamp: 1 }).limit(200).lean();
    else recent = Store.messages.filter(m=>m.room===r).slice(-200);
    socket.emit('history', recent);
    // welcome message to the joining user
    socket.emit('system', { text: `أهلاً ${socket.data.username||user}! مرحباً بك في ${r} — لديك 1000 نقطة XP كمستخدم جديد.`, timestamp: new Date() });
    io.to(r).emit('system', { text: (socket.data.username||user)+' joined '+r, timestamp: new Date() });
    const clients = await io.in(r).fetchSockets();
    const users = clients.map(s=>({ id: s.id, username: s.data.username||('Anon') }));
    io.to(r).emit('users', users);
  });

  socket.on('message', async (msg)=>{
    // msg: { room, type, text, dataUrl, to }
    const payload = { room: msg.room||'General', from: socket.data.username||user, to: msg.to||null, content: { type: msg.type||'text', text: msg.text||'', dataUrl: msg.dataUrl||null }, timestamp: new Date().toISOString() };
    // persist
    if(MessageModel){ try{ await MessageModel.create(payload); }catch(e){ console.error(e.message); } }
    else { Store.messages.push(payload); fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
    // award xp for activity (simple)
    try{
      if(UserModel && socket.data.username) await UserModel.updateOne({ username: socket.data.username }, { $inc: { xp: 2 } });
      else{
        const u = Store.users.find(x=>x.username===socket.data.username);
        if(u){ u.xp = (u.xp||0)+2; fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
      }
    }catch(e){}
    // emit to room and if private send to target sockets
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

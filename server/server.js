require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const mongoose = require('mongoose');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e7 });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';
const ADMIN_USERS = (process.env.ADMIN_USERS||'').split(',').map(s=>s.trim()).filter(Boolean);
const MONGO = process.env.MONGODB_URI || '';

let useMongo = false;
if(MONGO){
  console.log('MongoDB URI found, attempting to connect...');
  mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true }).then(()=>{
    console.log('Connected to MongoDB');
  }).catch(err=>{ console.error('MongoDB connect failed:', err.message); });
  useMongo = true;
}

// fallback JSON store
const DATA_DIR = path.join(__dirname,'data');
const STORE_FILE = path.join(DATA_DIR,'store.json');
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if(!fs.existsSync(STORE_FILE)){
  fs.writeFileSync(STORE_FILE, JSON.stringify({ users:[], rooms:[], messages:[], online:{} }, null,2));
}
function readStore(){ try{ return JSON.parse(fs.readFileSync(STORE_FILE,'utf8')); }catch(e){ return { users:[], rooms:[], messages:[], online:{} }; } }
function saveStore(s){ fs.writeFileSync(STORE_FILE, JSON.stringify(s,null,2)); }

// multer for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname,'uploads')),
  filename: (req,file,cb) => cb(null, Date.now()+'-'+file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

function sign(username){ return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' }); }
function authMiddleware(req,res,next){ const h = req.headers.authorization; if(!h) return res.status(401).json({ error:'No token' }); const token = h.split(' ')[1]; try{ const data = jwt.verify(token, JWT_SECRET); req.user = data; next(); }catch(e){ return res.status(401).json({ error:'Invalid token' }); } }
function isAdminName(n){ return ADMIN_USERS.includes(n) || n==='admin'; }
function sanitize(s){ return String(s||'').replace(/[<>]/g,''); }

// simple models (only if mongo available)
let UserModel=null, RoomModel=null, MessageModel=null;
if(useMongo){
  const userSchema = new mongoose.Schema({ username:String, passwordHash:String, avatar:String, xp:Number, isAdmin:Boolean, banned:Boolean, status:String });
  const roomSchema = new mongoose.Schema({ name:String, featured:Boolean });
  const messageSchema = new mongoose.Schema({ room:String, from:String, content:Object, timestamp:Date });
  UserModel = mongoose.model('User', userSchema);
  RoomModel = mongoose.model('Room', roomSchema);
  MessageModel = mongoose.model('Message', messageSchema);
}

// APIs
app.post('/api/register', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({ error:'Missing' });
  if(useMongo){
    if(await UserModel.findOne({ username })) return res.status(400).json({ error:'Exists' });
    const hash = await bcrypt.hash(password,10);
    const isAdmin = ADMIN_USERS.includes(username) || username==='admin';
    await UserModel.create({ username, passwordHash:hash, avatar:'/uploads/default-avatar.png', xp:1000, isAdmin, banned:false, status:'online' });
    return res.json({ token: sign(username), username });
  } else {
    const store = readStore();
    if(store.users.find(u=>u.username===username)) return res.status(400).json({ error:'Exists' });
    const hash = await bcrypt.hash(password,10);
    const isAdmin = ADMIN_USERS.includes(username) || username==='admin';
    store.users.push({ username, passwordHash:hash, avatar:'/uploads/default-avatar.png', xp:1000, isAdmin, banned:false, status:'online' });
    saveStore(store);
    return res.json({ token: sign(username), username });
  }
});

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({ error:'Missing' });
  if(useMongo){
    const u = await UserModel.findOne({ username });
    if(!u) return res.status(400).json({ error:'Not found' });
    if(u.banned) return res.status(403).json({ error:'Banned' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if(!ok) return res.status(400).json({ error:'Bad creds' });
    return res.json({ token: sign(username), username, isAdmin: !!u.isAdmin });
  } else {
    const store = readStore();
    const u = store.users.find(x=>x.username===username);
    if(!u) return res.status(400).json({ error:'Not found' });
    if(u.banned) return res.status(403).json({ error:'Banned' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if(!ok) return res.status(400).json({ error:'Bad creds' });
    return res.json({ token: sign(username), username, isAdmin: !!u.isAdmin });
  }
});

app.get('/api/me', authMiddleware, async (req,res)=>{
  const username = req.user.username;
  if(useMongo){
    const u = await UserModel.findOne({ username });
    if(!u) return res.status(404).json({ error:'No user' });
    return res.json({ username: u.username, avatar: u.avatar, xp: u.xp, isAdmin: !!u.isAdmin, status: u.status||'online' });
  } else {
    const store = readStore();
    const u = store.users.find(x=>x.username===username);
    if(!u) return res.status(404).json({ error:'No user' });
    return res.json({ username: u.username, avatar: u.avatar, xp: u.xp, isAdmin: !!u.isAdmin, status: u.status||'online' });
  }
});

app.post('/api/avatar', authMiddleware, upload.single('avatar'), async (req,res)=>{
  if(!req.file) return res.status(400).json({ error:'No file' });
  const url = '/uploads/'+req.file.filename;
  const username = req.user.username;
  if(useMongo){ await UserModel.updateOne({ username }, { $set:{ avatar:url } }); } else { const store = readStore(); const u = store.users.find(x=>x.username===username); if(u){ u.avatar = url; saveStore(store); } }
  res.json({ ok:true, url });
});

app.get('/api/rooms', async (req,res)=>{
  if(useMongo){ const rooms = await RoomModel.find({}); return res.json({ rooms }); } else { const store = readStore(); return res.json({ rooms: store.rooms }); }
});

app.post('/api/admin/create-room', authMiddleware, async (req,res)=>{
  const { name } = req.body; if(!isAdminName(req.user.username)) return res.status(403).json({ error:'Not admin' }); if(!name) return res.status(400).json({ error:'Missing' });
  if(useMongo){ if(!(await RoomModel.findOne({ name }))) await RoomModel.create({ name, featured:false }); const rooms = await RoomModel.find({}); return res.json({ ok:true, rooms }); }
  else { const store = readStore(); if(!store.rooms.find(r=>r.name===name)) store.rooms.push({ name, featured:false }); saveStore(store); return res.json({ ok:true, rooms: store.rooms }); }
});

app.post('/api/admin/delete-room', authMiddleware, async (req,res)=>{
  const { name } = req.body; if(!isAdminName(req.user.username)) return res.status(403).json({ error:'Not admin' });
  if(useMongo){ await RoomModel.deleteOne({ name }); const rooms = await RoomModel.find({}); return res.json({ ok:true, rooms }); }
  else { const store = readStore(); store.rooms = store.rooms.filter(r=>r.name!==name); saveStore(store); return res.json({ ok:true, rooms: store.rooms }); }
});

app.post('/api/admin/ban', authMiddleware, async (req,res)=>{
  const { target } = req.body; if(!isAdminName(req.user.username)) return res.status(403).json({ error:'Not admin' });
  if(useMongo){ await UserModel.updateOne({ username: target }, { $set:{ banned:true } }); const sockets = Array.from(io.sockets.sockets.values()); sockets.forEach(s=>{ if(s.data.username===target) s.disconnect(true); }); return res.json({ ok:true }); }
  else { const store = readStore(); const u = store.users.find(x=>x.username===target); if(u){ u.banned = true; saveStore(store); const sockets = Array.from(io.sockets.sockets.values()); sockets.forEach(s=>{ if(s.data.username===target) s.disconnect(true); }); return res.json({ ok:true }); } return res.status(404).json({ error:'User not found' }); }
});

app.get('/api/messages', async (req,res)=>{
  const room = req.query.room || 'General';
  if(useMongo){ const msgs = await MessageModel.find({ room }).sort({ timestamp:1 }).limit(100); return res.json({ messages: msgs }); } else { const store = readStore(); const msgs = store.messages.filter(m=>m.room===room).slice(-500); return res.json({ messages: msgs }); }
});

// Socket.IO handling
io.use((socket,next)=>{
  const token = socket.handshake.auth?.token;
  if(token){ try{ const data = jwt.verify(token, JWT_SECRET); socket.data.username = data.username; }catch(e){} }
  next();
});

io.on('connection', socket=>{
  const user = socket.data.username || ('Guest-'+socket.id.slice(0,4));
  // add user to store if not exist
  if(useMongo){
    UserModel.findOne({ username:user }).then(u=>{ if(!u) UserModel.create({ username:user, xp:1000, avatar:'/uploads/default-avatar.png', isAdmin:false, banned:false }); });
  } else {
    const store = readStore();
    if(!store.users.find(x=>x.username===user)) { store.users.push({ username:user, xp:1000, avatar:'/uploads/default-avatar.png', isAdmin:false, banned:false }); saveStore(store); }
  }

  // presence
  if(useMongo){ /* skip heavy presence storage for mongo demo */ } else { const store = readStore(); store.online[user] = { at: new Date().toISOString(), avatar:'/uploads/default-avatar.png' }; saveStore(store); io.emit('presence', store.online); }

  socket.on('join', async ({ room })=>{
    const r = room || 'General'; socket.join(r);
    if(useMongo){ const recent = await MessageModel.find({ room:r }).sort({ timestamp:1 }).limit(200); socket.emit('history', recent); } else { const store = readStore(); const recent = store.messages.filter(m=>m.room===r).slice(-200); socket.emit('history', recent); }
    io.to(r).emit('system', { text:`${user} joined ${r}`, timestamp: new Date().toISOString() });
  });

  socket.on('message', async msg=>{
    const payload = { room: msg.room||'General', from: user, content: { type: msg.type||'text', text: sanitize(msg.text||''), dataUrl: msg.dataUrl||null }, timestamp: new Date().toISOString() };
    if(useMongo){ await MessageModel.create({ room:payload.room, from:payload.from, content:payload.content, timestamp:payload.timestamp }); } else { const store = readStore(); store.messages.push(payload); if(store.messages.length>2000) store.messages.shift(); saveStore(store); }
    io.to(payload.room).emit('message', payload);
  });

  socket.on('disconnect', ()=>{
    if(!useMongo){ const store = readStore(); delete store.online[user]; saveStore(store); io.emit('presence', store.online); }
  });
});

// serve client SPA
app.use(express.static(path.join(__dirname, '../client')));
app.get('*', (req,res) => res.sendFile(path.join(__dirname, '../client/index.html')));

// start
server.listen(PORT, ()=> console.log('Server listening on', PORT));

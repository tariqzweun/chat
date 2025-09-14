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
const ADMIN_USERS = (process.env.ADMIN_USERS||'').split(',').map(s=>s.trim()).filter(Boolean);

const DATA_DIR = path.join(__dirname,'data');
const STORE_FILE = path.join(DATA_DIR,'store.json');
let Store = { users:[], rooms:['Home','General'], messages:[], bans:[] };

if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if(!fs.existsSync(STORE_FILE)){
  fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2));
} else {
  try{ Store = JSON.parse(fs.readFileSync(STORE_FILE,'utf8')); }catch(e){ console.error('store read fail',e.message); }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req,file,cb) => cb(null, Date.now()+'-'+file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage, limits: { fileSize: 6 * 1024 * 1024 } });

function saveStore(){ fs.writeFileSync(STORE_FILE, JSON.stringify(Store,null,2)); }
function sign(username){ return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' }); }

function authMiddleware(req,res,next){
  const h = req.headers.authorization;
  if(!h) return res.status(401).json({ error:'No token' });
  const token = h.split(' ')[1];
  try{ const data = jwt.verify(token, JWT_SECRET); req.user = data; next(); }catch(e){ return res.status(401).json({ error:'Invalid token' }); }
}

function isAdminName(n){ return ADMIN_USERS.includes(n) || (Store.users.find(u=>u.username===n) && Store.users.find(u=>u.username===n).isAdmin); }

app.post('/api/register', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({ error:'Missing' });
  if(Store.users.find(u=>u.username===username)) return res.status(400).json({ error:'Exists' });
  const hash = await bcrypt.hash(password,10);
  const isAdmin = ADMIN_USERS.includes(username);
  const u = { username, passwordHash:hash, avatar:'/default-avatar.png', xp:1000, isAdmin, banned:false };
  Store.users.push(u); saveStore();
  const token = sign(username);
  res.json({ token, username, isAdmin });
});

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({ error:'Missing' });
  const u = Store.users.find(x=>x.username===username);
  if(!u) return res.status(400).json({ error:'Not found' });
  if(u.banned) return res.status(403).json({ error:'Banned' });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if(!ok) return res.status(400).json({ error:'Bad creds' });
  const token = sign(username);
  res.json({ token, username, isAdmin: !!u.isAdmin });
});

app.get('/api/me', authMiddleware, (req,res)=>{
  const u = Store.users.find(x=>x.username===req.user.username);
  if(!u) return res.status(404).json({ error:'No user' });
  res.json({ username: u.username, avatar: u.avatar, xp: u.xp, isAdmin: !!u.isAdmin });
});

app.post('/api/avatar', authMiddleware, upload.single('avatar'), (req,res)=>{
  if(!req.file) return res.status(400).json({ error:'No file' });
  const url = '/uploads/'+req.file.filename;
  const u = Store.users.find(x=>x.username===req.user.username); if(u){ u.avatar = url; saveStore(); }
  res.json({ ok:true, url });
});

app.get('/api/rooms', (req,res)=>{
  res.json({ rooms: Store.rooms });
});

app.post('/api/admin/create-room', authMiddleware, (req,res)=>{
  const { name } = req.body;
  if(!isAdminName(req.user.username)) return res.status(403).json({ error:'Not admin' });
  if(!name) return res.status(400).json({ error:'Missing' });
  if(!Store.rooms.includes(name)) { Store.rooms.push(name); saveStore(); }
  res.json({ ok:true, rooms: Store.rooms });
});

app.post('/api/admin/ban', authMiddleware, (req,res)=>{
  const { target } = req.body;
  if(!isAdminName(req.user.username)) return res.status(403).json({ error:'Not admin' });
  const u = Store.users.find(x=>x.username===target); if(u){ u.banned = true; saveStore(); }
  const sockets = Array.from(io.sockets.sockets.values());
  sockets.forEach(s=>{ if(s.data.username===target) s.disconnect(true); });
  res.json({ ok:true });
});

app.get('/api/messages', (req,res)=>{
  const room = req.query.room || 'General';
  const msgs = Store.messages.filter(m=>m.room===room).slice(-500);
  res.json({ messages: msgs });
});

io.use((socket,next)=>{
  const token = socket.handshake.auth?.token;
  if(token){ try{ const data = jwt.verify(token, JWT_SECRET); socket.data.username = data.username; }catch(e){} }
  next();
});

io.on('connection', socket=>{
  const user = socket.data.username || ('Guest-'+socket.id.slice(0,4));
  const banned = Store.users.find(u=>u.username===user && u.banned);
  if(banned){ socket.disconnect(true); return; }
  socket.on('join', ({ room })=>{
    const r = room||'General'; socket.join(r);
    const recent = Store.messages.filter(m=>m.room===r).slice(-200);
    socket.emit('history', recent);
    io.to(r).emit('system', { text:`${user} joined ${r}`, timestamp: new Date().toISOString() });
  });
  socket.on('message', msg=>{
    const payload = { room: msg.room||'General', from: socket.data.username||user, content: { type: msg.type||'text', text: msg.text||'', dataUrl: msg.dataUrl||null }, timestamp: new Date().toISOString() };
    Store.messages.push(payload); saveStore();
    const u = Store.users.find(x=>x.username===socket.data.username); if(u) { u.xp = (u.xp||1000)+2; saveStore(); }
    io.to(payload.room).emit('message', payload);
  });
  socket.on('disconnect', ()=>{});
});

// serve index.html for any other path (SPA)
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

server.listen(PORT, ()=>console.log('Server listening on',PORT));

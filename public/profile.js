let token = localStorage.getItem('token')||null;
let username = localStorage.getItem('username')||null;
if(!username) location = '/'; // ensure came from login
const meName = document.getElementById('meName'), meXp = document.getElementById('meXp'), meLevel = document.getElementById('meLevel'), meAvatar = document.getElementById('meAvatar');
const avatarInput = document.getElementById('avatarInput'), logoutBtn = document.getElementById('logoutBtn');
const roomsList = document.getElementById('roomsList'), createRoomBtn = document.getElementById('createRoomBtn');
const messagesEl = document.getElementById('messages'), messageInput = document.getElementById('messageInput'), sendBtn = document.getElementById('sendBtn'), fileInput = document.getElementById('fileInput');
const currentRoomEl = document.getElementById('currentRoom'), roomInfo = document.getElementById('roomInfo'), chatArea = document.getElementById('chatArea');
let socket = null; let currentRoom = 'Home';

async function api(path, method='GET', body=null){
  const headers = { 'Content-Type':'application/json' }; if(token) headers['Authorization']='Bearer '+token;
  const res = await fetch('/api'+path, { method, headers, body: body?JSON.stringify(body):null });
  return res.json();
}

async function init(){
  if(token){ const me = await api('/me'); if(!me.error){ meName.textContent = me.username; meXp.textContent = me.xp||1000; meLevel.textContent = me.level||Math.floor((me.xp||1000)/10); if(me.avatar) meAvatar.src = me.avatar; } }
  loadRooms();
  makeSocket();
}

async function loadRooms(){
  const r = await api('/rooms'); roomsList.innerHTML='';
  (r.rooms||[]).forEach(room=>{
    const name = typeof room === 'string' ? room : room.name;
    const card = document.createElement('div'); card.className='room-card'; card.innerHTML = `<div class="icon">${(name[0]||'R').toUpperCase()}</div><div><strong>${name}</strong><div class="small muted">انقر للدخول</div></div>`;
    card.onclick = ()=> joinRoom(name);
    roomsList.appendChild(card);
  });
}

function makeSocket(){
  socket = io({ auth: { token } });
  socket.on('connect', ()=>{ if(currentRoom) socket.emit('join',{ room: currentRoom }); });
  socket.on('history',(msgs)=>{ messagesEl.innerHTML=''; msgs.forEach(m=> renderMessage(m)); if(msgs.length) { chatArea.classList.remove('empty'); } messagesEl.scrollTop = messagesEl.scrollHeight; });
  socket.on('message',(m)=>{ renderMessage(m); chatArea.classList.remove('empty'); });
  socket.on('system',(s)=>{ const el=document.createElement('div'); el.className='muted small'; el.textContent = s.text; messagesEl.appendChild(el); messagesEl.scrollTop = messagesEl.scrollHeight; });
}

function renderMessage(m){
  const c = document.createElement('div'); c.className='message';
  const bubble = document.createElement('div'); bubble.className='bubble' + (m.from===username ? ' own' : '');
  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = (m.from||'') + ' • ' + new Date(m.timestamp).toLocaleTimeString();
  const content = document.createElement('div');
  if(m.content && m.content.type==='image'){ const im = document.createElement('img'); im.src = m.content.dataUrl; im.style.maxWidth='320px'; im.style.borderRadius='8px'; content.appendChild(im); }
  else content.textContent = m.content?.text || '';
  bubble.appendChild(meta); bubble.appendChild(content); c.appendChild(bubble); messagesEl.appendChild(c); messagesEl.scrollTop = messagesEl.scrollHeight;
}

function joinRoom(name){
  currentRoom = name; currentRoomEl.textContent = name; roomInfo.textContent = 'التواصل في الغرفة ' + name;
  if(socket) socket.emit('join',{ room: name });
  messagesEl.innerHTML=''; chatArea.classList.add('empty');
}

sendBtn.onclick = ()=>{
  const txt = messageInput.value.trim(); if(!txt) return;
  socket.emit('message',{ room: currentRoom, type:'text', text: txt });
  messageInput.value='';
}

fileInput.addEventListener('change', (ev)=>{
  const f = ev.target.files[0]; if(!f) return;
  const r = new FileReader(); r.onload = ()=>{ socket.emit('message',{ room: currentRoom, type:'image', dataUrl: r.result }); }
  r.readAsDataURL(f); fileInput.value='';
});

avatarInput.addEventListener('change', async (ev)=>{
  const f = ev.target.files[0]; if(!f) return;
  const fd = new FormData(); fd.append('avatar', f);
  const res = await fetch('/api/avatar', { method:'POST', headers: { 'Authorization': token?('Bearer '+token):'' }, body: fd });
  const data = await res.json(); if(data.ok && data.url){ meAvatar.src = data.url; }
});

createRoomBtn.onclick = async ()=>{
  const name = prompt('اسم الغرفة الجديدة'); if(!name) return;
  const res = await api('/admin/create-room','POST',{ name }); if(res.ok) loadRooms(); else alert(res.error||'خطأ');
}

logoutBtn.onclick = ()=>{ localStorage.removeItem('token'); localStorage.removeItem('username'); location='/'; }

init();

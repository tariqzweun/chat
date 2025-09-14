let token = localStorage.getItem('token')||null;
let username = localStorage.getItem('username')||null;
if(!username){ location = '/'; }
const meName = document.getElementById('meName'), meXp = document.getElementById('meXp'), meLevel = document.getElementById('meLevel'), meAvatar = document.getElementById('meAvatar');
const avatarInput = document.getElementById('avatarInput'), logoutBtn = document.getElementById('logoutBtn');
const roomsListEl = document.getElementById('roomsList'), roomsFeaturedEl = document.getElementById('roomsFeatured');
const chatModal = document.getElementById('chatModal'), messagesEl = document.getElementById('messages'), messageInput = document.getElementById('messageInput'), sendBtn = document.getElementById('sendBtn'), fileInput = document.getElementById('fileInput');
const roomTitle = document.getElementById('roomTitle'), closeChat = document.getElementById('closeChat');
let socket = null; let currentRoom = null;

async function api(path, method='GET', body=null){
  const headers = { 'Content-Type':'application/json' }; if(token) headers['Authorization']='Bearer '+token;
  const res = await fetch('/api'+path, { method, headers, body: body?JSON.stringify(body):null });
  return res.json();
}

async function init(){
  if(token){ const me = await api('/me'); if(!me.error){ meName.textContent = me.username; meXp.textContent = me.xp||1000; meLevel.textContent = me.level||Math.floor((me.xp||1000)/10); if(me.avatar) meAvatar.src = me.avatar; if(me.isAdmin) document.getElementById('btnAdmin').style.display='inline-block'; } }
  loadRooms();
  setupUI();
}

async function loadRooms(){
  const r = await api('/rooms');
  roomsListEl.innerHTML=''; roomsFeaturedEl.innerHTML='';
  (r.rooms||[]).forEach(room=>{
    const name = typeof room === 'string' ? room : room.name;
    const featured = typeof room === 'object' && room.featured;
    const card = document.createElement('div'); card.className='room-card';
    card.innerHTML = `<div class="title">${name}</div><div class="meta">${featured? 'مميزة':''}</div>`;
    card.onclick = ()=> openRoom(name);
    if(featured) roomsFeaturedEl.appendChild(card); else roomsListEl.appendChild(card);
  });
}

function setupUI(){
  document.getElementById('btnNewRoom').onclick = async ()=>{
    const name = prompt('اسم الغرفة'); if(!name) return; const res = await api('/admin/create-room','POST',{ name }); if(res.ok) loadRooms(); else alert(res.error||'خطأ');
  };
  document.getElementById('btnAdmin').onclick = ()=> { location = '/admin.html'; };
  logoutBtn.onclick = ()=>{ localStorage.removeItem('token'); localStorage.removeItem('username'); location='/'; };
  avatarInput.addEventListener('change', async (ev)=>{
    const f = ev.target.files[0]; if(!f) return; const fd = new FormData(); fd.append('avatar', f);
    const res = await fetch('/api/avatar',{ method:'POST', headers: { 'Authorization': token?('Bearer '+token):'' }, body: fd }); const j = await res.json(); if(j.ok) meAvatar.src = j.url;
  });
}

function makeSocket(){
  socket = io({ auth: { token } });
  socket.on('connect', ()=>{ if(currentRoom) socket.emit('join',{ room: currentRoom }); });
  socket.on('history',(msgs)=>{ messagesEl.innerHTML=''; msgs.forEach(m=> renderMessage(m)); messagesEl.scrollTop = messagesEl.scrollHeight; });
  socket.on('message',(m)=>{ renderMessage(m); });
  socket.on('system',(s)=>{ const el=document.createElement('div'); el.className='meta'; el.textContent = s.text; messagesEl.appendChild(el); messagesEl.scrollTop = messagesEl.scrollHeight; });
}

function openRoom(name){
  currentRoom = name; roomTitle.textContent = name; chatModal.style.display = 'flex'; messagesEl.innerHTML = ''; if(socket) socket.emit('join',{ room: name }); else { makeSocket(); socket.emit('join',{ room: name }); }
}

closeChat.onclick = ()=>{ chatModal.style.display='none'; currentRoom=null; if(socket) socket.emit('leave',{ room: currentRoom }); }

function renderMessage(m){
  const el = document.createElement('div'); el.className='message';
  const bubble = document.createElement('div'); bubble.className='bubble'+(m.from===username? ' own':''); const meta = document.createElement('div'); meta.className='meta'; meta.textContent = (m.from||'')+' • '+ new Date(m.timestamp).toLocaleTimeString();
  const content = document.createElement('div'); if(m.content && m.content.type==='image'){ const im=document.createElement('img'); im.src=m.content.dataUrl; im.style.maxWidth='260px'; im.style.borderRadius='8px'; content.appendChild(im); } else { content.textContent = m.content?.text || ''; }
  bubble.appendChild(meta); bubble.appendChild(content); el.appendChild(bubble); messagesEl.appendChild(el); messagesEl.scrollTop = messagesEl.scrollHeight;
}

sendBtn.onclick = ()=>{
  const txt = messageInput.value.trim(); if(!txt || !currentRoom) return;
  socket.emit('message',{ room: currentRoom, type:'text', text: txt }); messageInput.value='';
}

fileInput.addEventListener('change', (ev)=>{
  const f = ev.target.files[0]; if(!f || !currentRoom) return;
  const r = new FileReader(); r.onload = ()=>{ socket.emit('message',{ room: currentRoom, type:'image', dataUrl: r.result }); }
  r.readAsDataURL(f); fileInput.value='';
});

init();

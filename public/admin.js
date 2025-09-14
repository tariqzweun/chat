// admin.js - simple admin UI
const token = localStorage.getItem('token')||null;
const adminName = document.getElementById('adminName');
const roomName = document.getElementById('roomName'), createRoomBtn = document.getElementById('createRoom');
const banUser = document.getElementById('banUser'), banBtn = document.getElementById('banBtn');
const promoteUser = document.getElementById('promoteUser'), promoteBtn = document.getElementById('promoteBtn');
const usersList = document.getElementById('usersList'), log = document.getElementById('log');

if(!token){ alert('يجب تسجيل الدخول بالمدير'); location = '/'; }

async function api(path, body){
  const res = await fetch('/api'+path, { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer '+token }, body: JSON.stringify(body) });
  return res.json();
}

async function init(){
  const r = await fetch('/api/me', { headers: { 'Authorization': 'Bearer '+token } });
  const me = await r.json();
  if(me && me.username){ adminName.textContent = me.username; if(!me.isAdmin){ alert('ليس لديك صلاحية مدير'); location = '/'; } }
  loadUsers();
}

createRoomBtn.onclick = async ()=>{
  const name = roomName.value.trim(); if(!name) return alert('اكتب اسم'); const res = await api('/admin/create-room', { name }); log.textContent = JSON.stringify(res); loadRooms(); }

banBtn.onclick = async ()=>{ const t = banUser.value.trim(); if(!t) return; const res = await api('/admin/ban', { target: t }); log.textContent = JSON.stringify(res); loadUsers(); }

promoteBtn.onclick = async ()=>{ const t = promoteUser.value.trim(); if(!t) return; const res = await api('/admin/promote', { target: t }); log.textContent = JSON.stringify(res); loadUsers(); }

async function loadUsers(){
  const res = await fetch('/data/store.json'); const data = await res.json(); usersList.innerHTML='';
  (data.users||[]).forEach(u=>{ const li=document.createElement('li'); li.textContent = u.username + (u.isAdmin? ' (admin)':'') + (u.banned? ' (banned)':''); usersList.appendChild(li); });
}

async function loadRooms(){ const r = await fetch('/api/rooms'); const j = await r.json(); console.log(j); }
init();

const token = localStorage.getItem('token')||null;
if(!token) { alert('تسجيل الدخول مطلوب'); location='/'; }
const logEl = document.getElementById('log'), usersList = document.getElementById('usersList');
async function api(path, body){ const res = await fetch('/api'+path, { method:'POST', headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer '+token }, body: JSON.stringify(body) }); return res.json(); }
document.getElementById('createRoom').onclick = async ()=>{ const name = document.getElementById('roomName').value.trim(); if(!name) return alert('اكتب'); const r = await api('/admin/create-room',{ name }); logEl.textContent = JSON.stringify(r); loadUsers(); }
document.getElementById('banBtn').onclick = async ()=>{ const t = document.getElementById('banUser').value.trim(); if(!t) return; const r = await api('/admin/ban',{ target: t }); logEl.textContent = JSON.stringify(r); loadUsers(); }
document.getElementById('promoteBtn').onclick = async ()=>{ const t = document.getElementById('promoteUser').value.trim(); if(!t) return; const r = await api('/admin/promote',{ target: t }); logEl.textContent = JSON.stringify(r); loadUsers(); }
async function loadUsers(){ const res = await fetch('/data/store.json'); const data = await res.json(); usersList.innerHTML=''; (data.users||[]).forEach(u=>{ const li = document.createElement('li'); li.textContent = u.username + (u.isAdmin? ' (admin)':'') + (u.banned? ' (banned)':''); usersList.appendChild(li); }); }
loadUsers();

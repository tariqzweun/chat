let token = localStorage.getItem('token')||null;
let username = localStorage.getItem('username')||null;
let socket = null;

function makeSocket(){
  socket = io({ auth: { token } });
  socket.on('connect', ()=>{ console.log('socket connected'); socket.emit('join',{ room: currentRoom }); });
  socket.on('history',(msgs)=>{ messagesEl.innerHTML=''; msgs.forEach(m=> renderMessage(m)); messagesEl.scrollTop = messagesEl.scrollHeight; });
  socket.on('message',(m)=>{ renderMessage(m); });
  socket.on('system',(s)=>{ const el=document.createElement('div'); el.className='system'; el.textContent=s.text; messagesEl.appendChild(el); });
}

const loginModal = document.getElementById('loginModal'), regModal = document.getElementById('regModal');
const showLogin = document.getElementById('showLogin'), showRegister = document.getElementById('showRegister');
const loginBtn = document.getElementById('loginBtn'), regBtn = document.getElementById('regBtn');
const loginUser = document.getElementById('loginUser'), loginPass = document.getElementById('loginPass');
const regUser = document.getElementById('regUser'), regPass = document.getElementById('regPass');
const profileBlock = document.getElementById('profile'), meName = document.getElementById('meName'), meXp = document.getElementById('meXp'), meLevel = document.getElementById('meLevel'), meAvatar = document.getElementById('meAvatar'), avatarInput = document.getElementById('avatarInput');
const logoutBtn = document.getElementById('logoutBtn');
const roomsList = document.getElementById('roomsList'), createRoomBtn = document.getElementById('createRoomBtn'), newRoom = document.getElementById('newRoom');
const messagesEl = document.getElementById('messages'), messageInput = document.getElementById('messageInput'), sendBtn = document.getElementById('sendBtn');
const friendsList = document.getElementById('friendsList'), friendName = document.getElementById('friendName'), addFriendBtn = document.getElementById('addFriendBtn');
const fileInput = document.getElementById('fileInput');
let currentRoom = 'General';

showLogin.onclick = ()=> loginModal.style.display='block';
showRegister.onclick = ()=> regModal.style.display='block';

async function api(path, method='GET', body=null){
  const headers = { 'Content-Type':'application/json' };
  if(token) headers['Authorization']='Bearer '+token;
  const res = await fetch('/api'+path, { method, headers, body: body?JSON.stringify(body):null });
  return res.json();
}

regBtn.onclick = async ()=>{
  const u = regUser.value.trim(), p = regPass.value.trim(); if(!u||!p) return alert('اكتب');
  const r = await api('/register','POST',{ username:u, password:p }); if(r.token){ token=r.token; username=r.username; localStorage.setItem('token', token); localStorage.setItem('username', username); initAfterAuth(); regModal.style.display='none'; }
  else alert(r.error||'خطأ');
};

loginBtn.onclick = async ()=>{
  const u = loginUser.value.trim(), p = loginPass.value.trim(); if(!u||!p) return alert('اكتب');
  const r = await api('/login','POST',{ username:u, password:p }); if(r.token){ token=r.token; username=r.username; localStorage.setItem('token', token); localStorage.setItem('username', username); initAfterAuth(); loginModal.style.display='none'; }
  else alert(r.error||'خطأ');
};

logoutBtn.onclick = ()=>{ token=null; username=null; localStorage.removeItem('token'); localStorage.removeItem('username'); location.reload(); };

async function initAfterAuth(){
  profileBlock.style.display='flex';
  const me = await api('/me'); if(!me.error){ meName.textContent=me.username; meXp.textContent=me.xp||0; meLevel.textContent=me.level||0; if(me.avatar) meAvatar.src=me.avatar; }
  if(socket) socket.disconnect();
  makeSocket();
  loadRooms();
}

addFriendBtn.onclick = async ()=>{
  const to = friendName.value.trim(); if(!to) return; const r = await api('/add-friend','POST',{ to }); if(r.ok){ friendName.value=''; const me = await api('/me'); buildFriends(me.friends||[]); }
};

createRoomBtn.onclick = ()=>{ const name=newRoom.value.trim(); if(!name) return; socket.emit('create-room', name); newRoom.value=''; loadRooms(); };

async function loadRooms(){ const r = await api('/rooms'); roomsList.innerHTML=''; (r.rooms||[]).forEach(room=>{ const li=document.createElement('li'); li.textContent=room; li.onclick=()=> changeRoom(room); roomsList.appendChild(li); }); }

sendBtn.onclick = ()=>{ const txt=messageInput.value.trim(); if(!txt) return; socket.emit('message',{ room: currentRoom, type:'text', text: txt }); messageInput.value=''; }

fileInput.addEventListener('change', (ev)=>{
  const f = ev.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{ socket.emit('message',{ room: currentRoom, type:'image', dataUrl: reader.result }); }
  reader.readAsDataURL(f); fileInput.value='';
});

avatarInput.addEventListener('change', async (ev)=>{
  const f = ev.target.files[0]; if(!f) return;
  const fd = new FormData(); fd.append('avatar', f);
  const res = await fetch('/api/avatar', { method:'POST', headers: { 'Authorization': token?('Bearer '+token):'' }, body: fd });
  const data = await res.json(); if(data.ok && data.url){ meAvatar.src = data.url; }
});

function renderMessage(m){
  const container = document.createElement('div'); container.className='message';
  const img = document.createElement('img'); img.className='avatar'; img.src = m.fromAvatar || '/default-avatar.png';
  const bubble = document.createElement('div'); bubble.className='bubble';
  if(m.from===username) bubble.classList.add('own');
  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = (m.from||'') + ' • ' + new Date(m.timestamp).toLocaleTimeString();
  const content = document.createElement('div');
  if(m.content && m.content.type==='image'){ const im = document.createElement('img'); im.src = m.content.dataUrl; im.style.maxWidth='260px'; im.style.borderRadius='8px'; content.appendChild(im); }
  else content.textContent = m.content?.text || '';
  bubble.appendChild(meta); bubble.appendChild(content);
  container.appendChild(img); container.appendChild(bubble);

  // delete button for own messages
  if(m.from===username){
    const del = document.createElement('button'); del.className='delete-btn'; del.textContent='حذف'; del.onclick = async ()=>{
      const res = await api('/delete-message','POST',{ timestamp: m.timestamp, room: m.room }); const j = await res.json(); if(j.ok){ container.remove(); }
    };
    bubble.appendChild(del);
  }

  messagesEl.appendChild(container);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function changeRoom(room){ currentRoom=room; document.getElementById('currentRoom').textContent=room; if(socket) socket.emit('join',{ room }); }

function buildFriends(list){ friendsList.innerHTML=''; list.forEach(f=>{ const li=document.createElement('li'); li.textContent=f; friendsList.appendChild(li); }); }

function escape(s){ return String(s||'').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// init
loadRooms();
if(token){ initAfterAuth(); }

let token = localStorage.getItem('token')||null;
let username = localStorage.getItem('username')||null;
const socket = io({ auth: { token } });

// UI refs
const loginModal = document.getElementById('loginModal'), regModal = document.getElementById('regModal');
const showLogin = document.getElementById('showLogin'), showRegister = document.getElementById('showRegister');
const loginBtn = document.getElementById('loginBtn'), regBtn = document.getElementById('regBtn');
const loginUser = document.getElementById('loginUser'), loginPass = document.getElementById('loginPass');
const regUser = document.getElementById('regUser'), regPass = document.getElementById('regPass');
const profileBlock = document.getElementById('profile'), meName = document.getElementById('meName'), meXp = document.getElementById('meXp');
const logoutBtn = document.getElementById('logoutBtn');
const roomsList = document.getElementById('roomsList'), createRoomBtn = document.getElementById('createRoomBtn'), newRoom = document.getElementById('newRoom');
const messagesEl = document.getElementById('messages'), messageInput = document.getElementById('messageInput'), sendBtn = document.getElementById('sendBtn');
const friendsList = document.getElementById('friendsList'), friendName = document.getElementById('friendName'), addFriendBtn = document.getElementById('addFriendBtn');

let currentRoom = 'General';

// show modals
showLogin.onclick = ()=> loginModal.style.display='block';
showRegister.onclick = ()=> regModal.style.display='block';

// auth functions
async function api(path, method='GET', body=null){
  const headers = { 'Content-Type':'application/json' };
  if(token) headers['Authorization']='Bearer '+token;
  const res = await fetch('/api'+path, { method, headers, body: body?JSON.stringify(body):null });
  return res.json();
}

regBtn.onclick = async ()=>{
  const u = regUser.value.trim(), p = regPass.value.trim(); if(!u||!p) return alert('اكتب');
  const r = await api('/register','POST',{ username:u, password:p }); if(r.token){ token=r.token; username=r.username; localStorage.setItem('token', token); localStorage.setItem('username', username); attachSocket(); afterLogin(); regModal.style.display='none'; }
  else alert(r.error||'خطأ');
};

loginBtn.onclick = async ()=>{
  const u = loginUser.value.trim(), p = loginPass.value.trim(); if(!u||!p) return alert('اكتب');
  const r = await api('/login','POST',{ username:u, password:p }); if(r.token){ token=r.token; username=r.username; localStorage.setItem('token', token); localStorage.setItem('username', username); attachSocket(); afterLogin(); loginModal.style.display='none'; }
  else alert(r.error||'خطأ');
};

logoutBtn.onclick = ()=>{ token=null; username=null; localStorage.removeItem('token'); localStorage.removeItem('username'); profileBlock.style.display='none'; location.reload(); };

async function afterLogin(){
  profileBlock.style.display='block'; 
  const me = await api('/me'); if(!me.error){ meName.textContent = me.username; meXp.textContent = me.xp||0; buildFriends(me.friends||[]); }
  loadRooms();
}

function buildFriends(list){ friendsList.innerHTML=''; list.forEach(f=>{ const li=document.createElement('li'); li.textContent=f; friendsList.appendChild(li); }); }

addFriendBtn.onclick = async ()=>{
  const to = friendName.value.trim(); if(!to) return; const r = await api('/add-friend','POST',{ to }); if(r.ok) { alert('تم الاضافة'); friendName.value=''; const me = await api('/me'); buildFriends(me.friends||[]); }
};

createRoomBtn.onclick = ()=>{ const name=newRoom.value.trim(); if(!name) return; socket.emit('create-room', name); newRoom.value=''; loadRooms(); };

async function loadRooms(){ const r = await api('/rooms'); roomsList.innerHTML=''; (r.rooms||[]).forEach(room=>{ const li=document.createElement('li'); li.textContent=room; li.onclick=()=> changeRoom(room); roomsList.appendChild(li); }); }

function attachSocket(){
  socket.auth = { token }; socket.connect();
  socket.on('connect', ()=>{ console.log('sock connected'); socket.emit('join',{ room: currentRoom }); });
  socket.on('history',(msgs)=>{ messagesEl.innerHTML=''; msgs.forEach(m=> renderMessage(m)); messagesEl.scrollTop = messagesEl.scrollHeight; });
  socket.on('message', (m)=>{ renderMessage(m); });
  socket.on('system', (s)=>{ const el=document.createElement('div'); el.className='system'; el.textContent=s.text; messagesEl.appendChild(el); });
}

sendBtn.onclick = ()=>{ const txt=messageInput.value.trim(); if(!txt) return; socket.emit('message',{ room: currentRoom, type:'text', text: txt }); messageInput.value=''; }

function renderMessage(m){ const el=document.createElement('div'); el.className='message'; el.innerHTML='<strong>'+escape(m.from||m.username||'')+'</strong><div>'+escape(m.content?.text||m.text||'')+'</div><div class="time">'+new Date(m.timestamp).toLocaleTimeString()+'</div>'; messagesEl.appendChild(el); messagesEl.scrollTop = messagesEl.scrollHeight; }

function changeRoom(room){ currentRoom=room; document.getElementById('currentRoom').textContent=room; socket.emit('join',{ room }); }

function escape(s){ return String(s||'').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// init
if(token){ attachSocket(); afterLogin(); }
loadRooms();

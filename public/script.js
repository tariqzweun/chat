const socket = io();

// UI refs
const loginModal = document.getElementById('loginModal');
const usernameInput = document.getElementById('usernameInput');
const enterBtn = document.getElementById('enterBtn');
const roomSelect = document.getElementById('roomSelect');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const usersList = document.getElementById('usersList');
const roomsList = document.getElementById('roomsList');
const createRoomBtn = document.getElementById('createRoomBtn');
const newRoom = document.getElementById('newRoom');
const fileInput = document.getElementById('fileInput');

let myName = null;
let currentRoom = 'General';

// fetch rooms from server
fetch('/api/rooms').then(r => r.json()).then(data => {
  const rooms = data.rooms || ['General'];
  rooms.forEach(rn => addRoomToList(rn));
  fillRoomSelect(rooms);
});

function fillRoomSelect(rooms) {
  roomSelect.innerHTML = '';
  rooms.forEach(r => {
    const opt = document.createElement('option'); opt.value = r; opt.textContent = r; roomSelect.appendChild(opt);
  });
}

function addRoomToList(room) {
  const li = document.createElement('li'); li.textContent = room; li.onclick = () => changeRoom(room); roomsList.appendChild(li);
}

createRoomBtn.onclick = () => {
  const name = newRoom.value.trim(); if (!name) return; socket.emit('create-room', name); addRoomToList(name); newRoom.value = '';
};

enterBtn.onclick = () => {
  const name = usernameInput.value.trim();
  const room = roomSelect.value || 'General';
  if (!name) return alert('اكتب اسمك');
  myName = name; currentRoom = room;
  document.getElementById('me').textContent = name;
  loginModal.style.display = 'none';
  socket.emit('join', { username: name, room });
};

socket.on('history', (messages) => {
  messagesEl.innerHTML = '';
  messages.forEach(m => renderMessage(m));
  scrollToBottom();
});

socket.on('message', (m) => { renderMessage(m); scrollToBottom(); });
socket.on('system', (s) => { const p = document.createElement('div'); p.className = 'system'; p.textContent = `${s.text}`; messagesEl.appendChild(p); scrollToBottom(); });
socket.on('users', (users) => { usersList.innerHTML = ''; users.forEach(u => { const li = document.createElement('li'); li.textContent = u.username; usersList.appendChild(li); }); });
socket.on('rooms', (rooms) => { roomsList.innerHTML = ''; rooms.forEach(r => addRoomToList(r)); });

sendBtn.onclick = sendMessage;
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

fileInput.addEventListener('change', async (ev) => {
  const file = ev.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const msg = { type: 'image', dataUrl, room: currentRoom };
    socket.emit('message', msg);
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  const msg = { type: 'text', text, room: currentRoom };
  socket.emit('message', msg);
  messageInput.value = '';
}

function renderMessage(m) {
  const el = document.createElement('div');
  el.className = 'message';
  if (m.username === myName) el.classList.add('own'); else el.classList.add('other');
  const time = new Date(m.timestamp).toLocaleTimeString();
  if (m.content.type === 'text') {
    el.innerHTML = `<strong>${escapeHtml(m.username)}</strong><div>${escapeHtml(m.content.text)}</div><div class="time">${time}</div>`;
  } else if (m.content.type === 'image') {
    el.innerHTML = `<strong>${escapeHtml(m.username)}</strong><div><img class="message-img" src="${m.content.dataUrl}" /></div><div class="time">${time}</div>`;
  } else {
    el.innerHTML = `<strong>${escapeHtml(m.username)}</strong><div>Unsupported message</div><div class="time">${time}</div>`;
  }
  messagesEl.appendChild(el);
}

function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
function changeRoom(room) { currentRoom = room; document.getElementById('currentRoom').textContent = room; socket.emit('join', { username: myName, room }); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const regModal = document.getElementById('regModal');
const showRegister = document.getElementById('showRegister');
const regClose = document.getElementById('regClose');
const regBtn = document.getElementById('regBtn');
const regUser = document.getElementById('regUser');
const regPass = document.getElementById('regPass');
const loginBtn = document.getElementById('loginBtn');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const guestBtn = document.getElementById('guestBtn');

showRegister.onclick = ()=> regModal.style.display='flex';
regClose.onclick = ()=> regModal.style.display='none';

async function api(path, method='POST', body=null){
  const res = await fetch('/api'+path, { method, headers: { 'Content-Type':'application/json' }, body: body?JSON.stringify(body):null });
  return res.json();
}

regBtn.onclick = async ()=>{
  const u = regUser.value.trim(), p = regPass.value.trim(); if(!u||!p) return alert('اكتب');
  const r = await api('/register','POST',{ username:u, password:p });
  if(r.token){ localStorage.setItem('token', r.token); localStorage.setItem('username', r.username); location='/profile.html'; } else alert(r.error||'خطأ');
};

loginBtn.onclick = async ()=>{
  const u = loginUser.value.trim(), p = loginPass.value.trim(); if(!u||!p) return alert('اكتب');
  const r = await api('/login','POST',{ username:u, password:p });
  if(r.token){ localStorage.setItem('token', r.token); localStorage.setItem('username', r.username); location='/profile.html'; } else alert(r.error||'خطأ');
};

guestBtn.onclick = ()=>{ localStorage.removeItem('token'); localStorage.setItem('username','Guest'+Math.floor(Math.random()*9000)); location='/profile.html'; };

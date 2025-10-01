
const API = '';
let token = localStorage.getItem('exnebula_token') || null;
const socket = io(); // connects to same origin

// DOM helpers
const $ = (id) => document.getElementById(id);

function showModal(){ $('modal').classList.remove('hidden'); }
function hideModal(){ $('modal').classList.add('hidden'); }

// Auth handlers
$('btn-login').addEventListener('click', showModal);
$('btn-get-started').addEventListener('click', showModal);
$('btn-close').addEventListener('click', hideModal);

$('btn-register').addEventListener('click', async ()=>{
  const payload = {
    name: $('name').value,
    email: $('email').value,
    password: $('password').value,
    educationLevel: $('education-level').value,
    careerGoal: $('career-goal').value,
    learningStyle: $('learning-style').value
  };
  const res = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const j = await res.json();
  if(res.ok){ localStorage.setItem('exnebula_token', j.token); token = j.token; hideModal(); alert('Registered and logged in!'); loadCourses(); } else { alert(j.error || 'Error'); }
});

$('btn-login-modal').addEventListener('click', async ()=>{
  const payload = { email: $('email').value, password: $('password').value };
  const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const j = await res.json();
  if(res.ok){ localStorage.setItem('exnebula_token', j.token); token = j.token; hideModal(); alert('Logged in!'); loadCourses(); } else { alert(j.error || 'Login failed'); }
});

// Load courses
async function loadCourses(){
  const res = await fetch('/api/courses');
  const cs = await res.json();
  const container = $('courses-list');
  container.innerHTML = '';
  cs.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>${c.title}</h3><p>${c.description || ''}</p><div>Level: ${c.level}</div><div>NSQF: ${c.nsqf_level || '-'}</div>`;
    container.appendChild(card);
  });
}

// Generate learning path
$('btn-generate').addEventListener('click', async ()=>{
  const goal = $('goal-select').value;
  const hours = parseInt($('weekly-hours').value||6);
  if(!token){ alert('Please login first'); showModal(); return; }
  const res = await fetch('/api/recommend-path', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({ goal, constraints:{ weekly_hours: hours } }) });
  const j = await res.json();
  if(res.ok){
    const el = $('path-result');
    el.innerHTML = `<h4>Generated Path: ${j.name || ''}</h4>` + j.path.map(p=>`<div>${p.week}. ${p.title}</div>`).join('');
  } else { alert(j.error || 'Could not generate'); }
});

// Mentor chat
$('btn-mentor-send').addEventListener('click', async ()=>{
  const msg = $('mentor-msg').value;
  if(!token) { alert('Login first'); showModal(); return; }
  const res = await fetch('/api/mentor/query', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({ message: msg }) });
  const j = await res.json();
  const hist = $('mentor-history');
  hist.innerHTML += `<div><b>You:</b> ${msg}</div><div><b>Mentor:</b> ${j.reply}</div>`;
  $('mentor-msg').value = '';
});

// Community chat (simple)
// join 'global' channel
socket.on('connect', ()=>{
  socket.emit('join','global');
});
socket.on('message', (m)=>{
  const h = $('chat-history');
  h.innerHTML += `<div><b>${m.sender_name}:</b> ${m.message}</div>`;
});
$('btn-chat-send').addEventListener('click', async ()=>{
  const text = $('chat-msg').value;
  if(!token){ alert('Login first'); showModal(); return; }
  const res = await fetch('/api/chat/global', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({ message: text }) });
  const j = await res.json();
  $('chat-msg').value = '';
});

// initial load
loadCourses();

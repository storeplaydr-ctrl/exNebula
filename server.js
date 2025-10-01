
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// In-memory demo DB (for ease of running without Postgres)
let users = [];
let courses = [];
let learning_paths = [];
let chats = [];

// Seed data (if not exists)
function seed(){
  if(courses.length === 0){
    courses.push({
      id: 'c1',
      title: 'Intro to Python',
      category: 'AI',
      level: 'Beginner',
      nsqf_level: 4,
      duration_estimate: 10,
      description: 'Python basics for AI and data.'
    });
    courses.push({
      id: 'c2',
      title: 'Linear Algebra for ML',
      category: 'AI',
      level: 'Beginner',
      nsqf_level: 5,
      duration_estimate: 12,
      description: 'Vectors, matrices and more.'
    });
    courses.push({
      id: 'c3',
      title: 'Intro to Machine Learning',
      category: 'AI',
      level: 'Intermediate',
      nsqf_level: 6,
      duration_estimate: 30,
      description: 'Supervised and unsupervised learning.'
    });
  }
}
seed();

// Helpers
function generateToken(user){
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next){
  const header = req.headers.authorization;
  if(!header) return res.status(401).json({ error: 'Missing token' });
  const token = header.split(' ')[1];
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch(e){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Routes
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, educationLevel, careerGoal, learningStyle } = req.body;
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if(users.find(u=>u.email===email)) return res.status(400).json({ error: 'Email already exists' });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), name: name||'', email, password_hash: hash, role: 'student', education_level: educationLevel||'', career_goal: careerGoal||'', learning_style: learningStyle||'', created_at: new Date() };
  users.push(user);
  const token = generateToken(user);
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u=>u.email===email);
  if(!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if(!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = generateToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  const user = users.find(u=>u.id===req.user.userId);
  if(!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user.id, name: user.name, email: user.email, education_level: user.education_level, career_goal: user.career_goal, learning_style: user.learning_style, created_at: user.created_at });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const user = users.find(u=>u.id===req.user.userId);
  if(!user) return res.status(404).json({ error: 'Not found' });
  const { educationLevel, careerGoal, learningStyle, name } = req.body;
  if(name) user.name = name;
  if(educationLevel) user.education_level = educationLevel;
  if(careerGoal) user.career_goal = careerGoal;
  if(learningStyle) user.learning_style = learningStyle;
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/courses', (req, res) => {
  const { category, level } = req.query;
  let out = courses;
  if(category) out = out.filter(c=>c.category.toLowerCase()===category.toLowerCase());
  if(level) out = out.filter(c=>c.level.toLowerCase()===level.toLowerCase());
  res.json(out);
});

app.get('/api/courses/:id', (req, res) => {
  const c = courses.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

app.get('/api/progress', authMiddleware, (req, res) => {
  // minimal progress demo
  res.json([]);
});

app.post('/api/recommend-path', authMiddleware, (req, res) => {
  const { goal, constraints } = req.body;
  // Simple rules-based path generator stub
  const path = [
    { course_id: 'c1', week: 1, title: 'Intro to Python' },
    { course_id: 'c2', week: 2, title: 'Linear Algebra for ML' },
    { course_id: 'c3', week: 3, title: 'Intro to Machine Learning' }
  ];
  const lp = { id: uuidv4(), user_id: req.user.userId, name: goal||'Learning Path', path, generated_by: 'rules', created_at: new Date() };
  learning_paths.push(lp);
  res.json(lp);
});

app.get('/api/recommend-path/:userId', authMiddleware, (req, res) => {
  const list = learning_paths.filter(p=>p.user_id===req.params.userId || p.user_id===req.user.userId);
  res.json(list);
});

app.post('/api/mentor/query', authMiddleware, (req, res) => {
  const { message } = req.body;
  // Simple rule-based replies
  let reply = "That's a great question! A good start is 'Intro to Python' followed by 'Intro to Machine Learning'.";
  if(message && message.toLowerCase().includes('python')) reply = "Start with Python basics: variables, loops, functions. Then try small projects.";
  res.json({ reply, source: 'rules' });
});

// Chat via socket.io + persist to in-memory list and provide history
app.get('/api/chat/:channel', authMiddleware, (req, res) => {
  const channel = req.params.channel;
  const msgs = chats.filter(m=>m.channel_id===channel).slice(-100);
  res.json(msgs);
});

app.post('/api/chat/:channel', authMiddleware, (req, res) => {
  const channel = req.params.channel;
  const { message } = req.body;
  const sender = users.find(u=>u.id===req.user.userId);
  const msg = { id: uuidv4(), channel_id: channel, sender_id: sender.id, sender_name: sender.name||sender.email, message, created_at: new Date() };
  chats.push(msg);
  // broadcast via io
  io.to(channel).emit('message', msg);
  res.json(msg);
});

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  socket.on('join', (channel) => {
    socket.join(channel);
    console.log('joined', channel);
  });
  socket.on('leave', (channel) => {
    socket.leave(channel);
  });
  socket.on('send_message', (data) => {
    // data: { channel, message, sender }
    const msg = { id: uuidv4(), channel_id: data.channel, sender_id: data.sender_id||null, sender_name: data.sender_name||'Anonymous', message: data.message, created_at: new Date() };
    chats.push(msg);
    io.to(data.channel).emit('message', msg);
  });
});

// Serve frontend static (we will copy frontend files to backend/public)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Server running on port', PORT));

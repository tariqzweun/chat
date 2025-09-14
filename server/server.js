// ---------------------
// Imports & setup
// ---------------------
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const path = require("path"); // ⬅️ مهم فقط مرة واحدة

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// ---------------------
// تخزين مؤقت (بدل قاعدة بيانات)
// ---------------------
const Store = {
  users: [],
  rooms: [{ name: "General", featured: true }],
  messages: [],
  online: {},
};

// سر التشفير
const JWT_SECRET = "supersecret";
const PORT = process.env.PORT || 3000;

// ---------------------
// Middlewares
// ---------------------
function sign(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function isAdmin(username) {
  return username === "admin"; // ⚡️ خلي اسم المدير "admin"
}

// ---------------------
// Routes
// ---------------------

// تسجيل
app.post("/api/register", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Missing username" });

  if (Store.users.find((u) => u.username === username)) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const user = {
    username,
    xp: 0,
    avatar: "/default-avatar.png",
    banned: false,
  };

  Store.users.push(user);
  res.json({ token: sign(username), username });
});

// بياناتي
app.get("/api/me", authMiddleware, (req, res) => {
  const u = Store.users.find((x) => x.username === req.user.username);
  if (!u) return res.status(404).json({ error: "No user" });
  res.json({
    username: u.username,
    avatar: u.avatar,
    xp: u.xp,
    isAdmin: isAdmin(u.username),
    status: Store.online[u.username] ? "online" : "offline",
  });
});

// رفع صورة شخصية
app.post(
  "/api/avatar",
  authMiddleware,
  upload.single("avatar"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const url = "/uploads/" + req.file.filename;
    const u = Store.users.find((x) => x.username === req.user.username);
    if (u) {
      u.avatar = url;
    }
    res.json({ avatar: url });
  }
);

// قائمة الغرف
app.get("/api/rooms", (req, res) => {
  res.json({ rooms: Store.rooms });
});

// إنشاء غرفة (مدير فقط)
app.post("/api/admin/create-room", authMiddleware, (req, res) => {
  if (!isAdmin(req.user.username))
    return res.status(403).json({ error: "Not admin" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Missing name" });

  Store.rooms.push({ name, featured: false });
  res.json({ ok: true, rooms: Store.rooms });
});

// مسح غرفة
app.post("/api/admin/delete-room", authMiddleware, (req, res) => {
  if (!isAdmin(req.user.username))
    return res.status(403).json({ error: "Not admin" });

  const { name } = req.body;
  Store.rooms = Store.rooms.filter((r) => r.name !== name);
  res.json({ ok: true, rooms: Store.rooms });
});

// باند
app.post("/api/admin/ban", authMiddleware, (req, res) => {
  if (!isAdmin(req.user.username))
    return res.status(403).json({ error: "Not admin" });

  const { target } = req.body;
  const u = Store.users.find((x) => x.username === target);
  if (u) {
    u.banned = true;
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

// استرجاع رسائل
app.get("/api/messages", (req, res) => {
  const room = req.query.room || "General";
  const msgs = Store.messages.filter((m) => m.room === room).slice(-100);
  res.json({ messages: msgs });
});

// ---------------------
// Socket.IO Events
// ---------------------
io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  let username = "Guest" + socket.id.slice(0, 4);

  if (token) {
    try {
      const data = jwt.verify(token, JWT_SECRET);
      username = data.username;
    } catch {}
  }

  if (!Store.users.find((u) => u.username === username)) {
    Store.users.push({ username, xp: 0, avatar: "/default-avatar.png" });
  }

  Store.online[username] = { at: new Date().toISOString() };
  io.emit("presence", Store.online);

  socket.on("join", ({ room }) => {
    socket.join(room);
    socket.emit("history", Store.messages.filter((m) => m.room === room));
  });

  socket.on("message", (msg) => {
    const payload = {
      room: msg.room || "General",
      from: username,
      content: msg.content,
      type: "text",
      timestamp: new Date().toISOString(),
    };
    Store.messages.push(payload);
    io.to(payload.room).emit("message", payload);

    const u = Store.users.find((x) => x.username === username);
    if (u) u.xp += 2;
  });

  socket.on("disconnect", () => {
    delete Store.online[username];
    io.emit("presence", Store.online);
  });
});

// ---------------------
// Serve Client
// ---------------------
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// ---------------------
// Start Server
// ---------------------
server.listen(PORT, () => {
  console.log("Server started on", PORT);
});

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

// أنشئ سيرفر HTTP
const server = http.createServer(app);

// اربط Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // غيّرها لاحقاً لرابط الفرونت إند تبعك
    methods: ["GET", "POST"]
  }
});

// Event بسيط للتجربة
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

// جملة ترحيب أساسية
app.get("/", (req, res) => {
  res.send("🚀 Chat backend is running!");
});

// أهم شي: استخدم PORT من Railway
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

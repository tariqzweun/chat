const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ==================
// Socket.io events
// ==================
io.on("connection", (socket) => {
  console.log("🟢 New user connected");

  socket.on("chatMessage", (msg) => {
    io.emit("chatMessage", msg); // يرسل الرسالة للجميع
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected");
  });
});

// ==================
// Serve frontend build
// ==================
app.use(express.static(path.join(__dirname, "../../frontend/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/build", "index.html"));
});

// ==================
// Start server
// ==================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Chat app running on port ${PORT}`);
});

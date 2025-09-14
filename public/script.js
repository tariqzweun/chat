const socket = io();

const chat = document.getElementById("chat");
const msg = document.getElementById("msg");

function sendMsg() {
  if (msg.value.trim() !== "") {
    socket.emit("chat message", msg.value);
    msg.value = "";
  }
}

socket.on("chat message", (message) => {
  const p = document.createElement("p");
  p.textContent = message;
  chat.appendChild(p);
  chat.scrollTop = chat.scrollHeight; // ينزل لآخر رسالة
});

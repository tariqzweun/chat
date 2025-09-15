const socket = io();

// استقبال الرسائل من السيرفر
socket.on("message", (msg) => {
  const messages = document.getElementById("messages");
  const div = document.createElement("div");
  div.classList.add("message");
  div.textContent = msg;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
});

// إرسال رسالة
function sendMessage() {
  const input = document.getElementById("msg");
  const msg = input.value;
  if (msg.trim() !== "") {
    socket.emit("message", {
      username: username,
      room: room,
      msg: msg
    });
    input.value = "";
  }
}

// إرسال عند ضغط Enter
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("msg");
  input.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
});

const username = document.querySelector("h1").innerText.replace("مرحباً ", "");
const socket = io();

socket.on("connect", () => {
  console.log("✅ Connected");
  socket.emit("register", { name: username, status: "✅ متصل" });
});

socket.on("new_message", (msg) => {
  const messages = document.getElementById("messages");
  const div = document.createElement("div");
  div.textContent = `${msg.from}: ${msg.text}`;
  messages.appendChild(div);
  document.getElementById("notifSound").play();
});

socket.on("user_list", (list) => {
  const usersDiv = document.getElementById("users");
  usersDiv.innerHTML = "";
  list.forEach(u => {
    const div = document.createElement("div");
    div.textContent = `${u.name} ${u.status}`;
    usersDiv.appendChild(div);
  });
});

function sendMessage() {
  const input = document.getElementById("msgInput");
  socket.emit("send_message", { text: input.value });
  input.value = "";
}

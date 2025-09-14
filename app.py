import os
from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO, emit
from flask_cors import CORS

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)
app.secret_key = os.getenv("SECRET_KEY", "starchat-secret")
socketio = SocketIO(app, cors_allowed_origins="*")

users = {}  # { sid: {"name": "محمد", "status": "✅ متصل", "last_message": ""} }

@app.route("/")
def index():
    if "username" not in session:
        return redirect(url_for("login"))
    return render_template("index.html", username=session["username"])

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        if username:
            session["username"] = username
            return redirect(url_for("index"))
    return render_template("login.html")

@app.route("/admin")
def admin():
    return render_template("admin.html", users=list(users.values()))

@socketio.on("connect")
def handle_connect():
    print(f"🔌 Client connected: {request.sid}")

@socketio.on("disconnect")
def handle_disconnect():
    user = users.pop(request.sid, None)
    if user:
        emit("user_left", user, broadcast=True)
        print(f"❌ {user['name']} disconnected")

@socketio.on("register")
def handle_register(data):
    name = data.get("name", f"مجهول-{request.sid[:4]}")
    status = data.get("status", "✅ متصل")
    users[request.sid] = {"name": name, "status": status, "last_message": ""}
    emit("user_joined", users[request.sid], broadcast=True)
    emit("user_list", list(users.values()), room=request.sid)

@socketio.on("set_status")
def handle_status(data):
    if request.sid in users:
        users[request.sid]["status"] = data.get("status", "✅ متصل")
        emit("status_updated", users[request.sid], broadcast=True)

@socketio.on("send_message")
def handle_message(data):
    if request.sid not in users:
        return
    text = data.get("text", "")
    users[request.sid]["last_message"] = text
    msg = {
        "from": users[request.sid]["name"],
        "status": users[request.sid]["status"],
        "text": text,
    }
    emit("new_message", msg, broadcast=True)

@socketio.on("private_message")
def handle_private(data):
    if request.sid not in users:
        return
    target_name = data.get("to")
    text = data.get("text", "")
    sender = users[request.sid]["name"]
    msg = {"from": sender, "to": target_name, "text": text}
    for sid, u in users.items():
        if u["name"] == target_name:
            emit("private_message", msg, room=sid)
            emit("private_message", msg, room=request.sid)
            break

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port)

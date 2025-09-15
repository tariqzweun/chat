from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO, join_room, leave_room, send
import secrets

app = Flask(__name__)
app.config["SECRET_KEY"] = secrets.token_hex(16)
socketio = SocketIO(app, cors_allowed_origins="*")

# بيانات مؤقتة (ممكن تطويرها لاحقاً بقاعدة بيانات)
users = {}
rooms = {"العام": []}
admin_username = "admin"
admin_password = "1234"

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        username = request.form.get("username")
        room = request.form.get("room")
        if username and room:
            session["username"] = username
            session["room"] = room
            if room not in rooms:
                rooms[room] = []
            return redirect(url_for("chat"))
    return render_template("index.html", rooms=rooms.keys())

@app.route("/chat")
def chat():
    if "username" not in session or "room" not in session:
        return redirect(url_for("index"))
    return render_template("chat.html", username=session["username"], room=session["room"])

@app.route("/admin", methods=["GET", "POST"])
def admin():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        if username == admin_username and password == admin_password:
            session["is_admin"] = True
            return redirect(url_for("admin_panel"))
    return render_template("admin.html")

@app.route("/admin/panel", methods=["GET", "POST"])
def admin_panel():
    if not session.get("is_admin"):
        return redirect(url_for("admin"))
    if request.method == "POST":
        action = request.form.get("action")
        room_name = request.form.get("room")
        if action == "add" and room_name:
            rooms[room_name] = []
        elif action == "delete" and room_name in rooms:
            del rooms[room_name]
    return render_template("admin_panel.html", rooms=rooms.keys())

@socketio.on("join")
def on_join(data):
    username = data["username"]
    room = data["room"]
    join_room(room)
    send(f"✅ {username} انضم للغرفة", to=room)

@socketio.on("leave")
def on_leave(data):
    username = data["username"]
    room = data["room"]
    leave_room(room)
    send(f"❌ {username} غادر الغرفة", to=room)

@socketio.on("message")
def handle_message(data):
    room = data["room"]
    msg = f"{data['username']}: {data['msg']}"
    send(msg, to=room)

# مافي if __name__ == "__main__" لأننا رح نشغل باستخدام gunicorn
